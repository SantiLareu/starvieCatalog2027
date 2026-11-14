/**
 * Persistencia minimal de intento de pedido — v2 (final):
 *
 * localStorage (sin PII, sin fingerprint):
 *   key: "starvie-order-attempt-v2"
 *   value: { version, idempotencyKey, orderId?, lines, createdAt, completedAt? }
 *
 * sessionStorage (misma pestaña, contacto exacto):
 *   key: "starvie-order-attempt-v2-session"
 *   value: full OrderPayload + lines snapshot + createdAt anchor
 *
 * El canal DISTRIBUIDOR tiene su propio compartmento (claves
 * "starvie-order-attempt-v2-distributor" y
 * "starvie-order-attempt-v2-distributor-session"): un intento pendiente de
 * un canal nunca bloquea al otro ni se borra desde el otro.
 *
 * Retención: ≤23h desde createdAt. Nunca se borra el marcador al expirar.
 *
 * prepareAttempt: gate principal. Verifica marcador existente antes de escribir.
 * Si existe válido → solo permite reuse exacto (key+lines+contact match).
 * Si no existe → escribe atomicamente session (SS) + marker (LS); rollback SS si LS falla.
 * Si existente es malformed/expired → fail closed (no se recrea automáticamente).
 *
 * Never auto-posts. Never auto-resubmits. No browser extension tokens.
 *
 * Cross-browser-tab atomicity is best-effort only: the Web Storage API has no
 * cross-tab transactions.  Each tab writes its own session; the localStorage
 * marker is the coordination point for the UI (blocking duplicate submits).
 */
import { newIdempotencyKey, type CheckoutContact } from "./orders";
import {
  forgetAttemptContext,
  type OrderAttemptChannel,
} from "./orderAttemptContext";

/* ── version / retention ─────────────────────────────────────────── */
const ATTEMPT_STORAGE_VERSION = "v2";
const RETENTION_MS = 23 * 3600 * 1000; // 23h

/* ── keys ─────────────────────────────────────────────────────────── */
/*
 * Cada canal tiene su PROPIO compartmento de almacenamiento:
 *
 *   público      → "starvie-order-attempt-v2" / "…-v2-session"
 *   distribuidor → "starvie-order-attempt-v2-distributor" /
 *                  "starvie-order-attempt-v2-distributor-session"
 *
 * El canal público conserva las claves históricas de origin/main. La
 * separación evita que un intento pendiente del canal distribuidor bloquee
 * la compra pública del mismo navegador (y al revés) y que una clave de
 * idempotencia viaje de un canal al otro.
 */
const LOCAL_KEY = `starvie-order-attempt-${ATTEMPT_STORAGE_VERSION}`;
const SESSION_KEY = `starvie-order-attempt-${ATTEMPT_STORAGE_VERSION}-session`;
const DISTRIBUTOR_LOCAL_KEY = `starvie-order-attempt-${ATTEMPT_STORAGE_VERSION}-distributor`;
const DISTRIBUTOR_SESSION_KEY = `starvie-order-attempt-${ATTEMPT_STORAGE_VERSION}-distributor-session`;

/** Claves del compartmento de un canal. */
export type AttemptStorageKeys = {
  localKey: string;
  sessionKey: string;
};

/**
 * Claves de almacenamiento del canal. El canal público es el defecto y
 * conserva las claves históricas; el canal distribuidor usa su propio
 * compartmento.
 */
export function attemptStorageKeys(
  channel: OrderAttemptChannel = "public",
): AttemptStorageKeys {
  return channel === "distributor"
    ? { localKey: DISTRIBUTOR_LOCAL_KEY, sessionKey: DISTRIBUTOR_SESSION_KEY }
    : { localKey: LOCAL_KEY, sessionKey: SESSION_KEY };
}

/* ── types ────────────────────────────────────────────────────────── */

/**
 * Minimal localStorage snapshot: version + key + optional orderId +
 * line IDs + timestamps. NO contact/PII, NO fingerprint.
 */
export type OrderAttemptSnapshot = {
  version: typeof ATTEMPT_STORAGE_VERSION;
  idempotencyKey: string;
  orderId: string | null;
  lines: { productId: string; qty: number }[];
  createdAt: string; // ISO
  completedAt?: string; // ISO — set when backend returns 201 with completed status
  status?: "accepted" | "processing" | "completed" | "failed" | "conflict" | "validation";
  /**
   * Canal original del intento (público o distribuidor). Inmutable.
   * Ausente en los registros heredados creados antes de esta atributación:
   * se conservan y se leen, pero NO se reenvían por ningún canal.
   */
  channel?: OrderAttemptChannel;
};

/**
 * Full OrderPayload stored in sessionStorage for same-tab reload + retry.
 * Includes all optional contact fields plus the order ID once known.
 */
export type OrderAttemptSession = {
  version: typeof ATTEMPT_STORAGE_VERSION;
  idempotencyKey: string;
  orderId: string | null;
  contact: CheckoutContact;
  lines: { productId: string; qty: number }[];
  createdAt: string; // ISO — immutable anchor, never refreshed
  /**
   * Canal original del intento (público o distribuidor). Inmutable: debe
   * coincidir con el del marcador; nunca se reescribe.
   */
  channel?: OrderAttemptChannel;
};

/**
 * Discriminated union for storage status — invalid and unavailable are
 * distinct so the UI can decide whether to show an error or recover.
 *
 * Invalid: the key exists in storage but the payload fails validation.
 * Unavailable: the storage API itself threw (SecurityError, permission denied).
 * Missing: the key does not exist.
 * Expired: the key exists, is valid, but past retention.
 * Valid: the key exists, is valid, and within retention.
 */
export type OrderAttemptStatus =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "unavailable" }
  | { kind: "expired"; snapshot: OrderAttemptSnapshot }
  | { kind: "valid"; snapshot: OrderAttemptSnapshot };

/**
 * Normalized payload returned by prepareAttempt.
 * Contains the created idempotency key and anchor timestamp so callers
 * know exactly what was persisted without reading storage.
 */
export type PreparedAttemptPayload = {
  idempotencyKey: string;
  contact: CheckoutContact;
  lines: { productId: string; qty: number }[];
  createdAt: string; // ISO — same timestamp used for both sessionStorage and localStorage
};

/* ── helpers de storage seguro ────────────────────────────────────── */

/**
 * Access a storage object safely.
 * Resolves to the provided instance, or to globalThis, or direct globals.
 * The global access itself can throw (SecurityError) — swallow and return null.
 */
function safeGetGlobalStorage(
  kind: "localStorage" | "sessionStorage",
): Storage | null {
  try {
    const g = globalThis[kind] as Storage | undefined;
    if (g) return g;
    /* Fall back to direct globals (jsdom compatibility). */
    if (kind === "localStorage" && typeof localStorage !== "undefined") {
      return localStorage;
    }
    if (kind === "sessionStorage" && typeof sessionStorage !== "undefined") {
      return sessionStorage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a storage argument to a full Storage interface.
 * Accepts any object with getItem (narrow), or a full Storage (wide).
 */
function resolveStorage(
  provided: Storage | { getItem: Storage["getItem"] } | undefined,
  fallback: Storage | null,
): Storage | null {
  if (provided) {
    /* If it has all three storage methods, use it directly. */
    if (
      typeof provided.getItem === "function" &&
      typeof (provided as Storage).setItem === "function" &&
      typeof (provided as Storage).removeItem === "function"
    ) {
      return provided as Storage;
    }
    /* Preserve methods supplied by a partial storage. Missing write methods
       must fail rather than report a successful persistence operation. */
    const getItemFn = provided.getItem;
    const setItemFn = (provided as Partial<Storage>).setItem;
    const removeItemFn = (provided as Partial<Storage>).removeItem;
    return {
      getItem: getItemFn.bind(provided),
      setItem: setItemFn ? setItemFn.bind(provided) : () => { throw new Error("Storage is read-only"); },
      removeItem: removeItemFn ? removeItemFn.bind(provided) : () => { throw new Error("Storage is read-only"); },
    } as Storage;
  }
  return fallback;
}

function readJsonLocal(
  storage: Storage | null,
  localKey: string,
): OrderAttemptSnapshot | null {
  try {
    const raw = storage?.getItem(localKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !isValidAttempt(parsed)) {
      return null;
    }
    return parsed as OrderAttemptSnapshot;
  } catch {
    return null;
  }
}

function writeJsonLocal(
  storage: Storage,
  data: OrderAttemptSnapshot,
  localKey: string,
): boolean {
  try {
    storage.setItem(localKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function removeJsonLocal(storage: Storage, localKey: string): void {
  try {
    storage.removeItem(localKey);
  } catch {
    // no-op
  }
}

function readJsonSession(
  storage: Storage | null,
  sessionKey: string,
): OrderAttemptSession | null {
  try {
    const raw = storage?.getItem(sessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !isValidSession(parsed)) {
      return null;
    }
    return parsed as OrderAttemptSession;
  } catch {
    return null;
  }
}

function writeJsonSession(
  storage: Storage,
  data: OrderAttemptSession,
  sessionKey: string,
): boolean {
  try {
    storage.setItem(sessionKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function removeJsonSession(storage: Storage, sessionKey: string): void {
  try {
    storage.removeItem(sessionKey);
  } catch {
    // no-op
  }
}

/* ── validación estricta ──────────────────────────────────────────── */

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Canal válido: presente y conocido, o ausente (registro heredado). Un canal
 * desconocido invalida el registro (fail closed) en vez de adivinarse.
 */
function isValidChannel(value: unknown): boolean {
  return value === undefined || value === "public" || value === "distributor";
}

function isValidAttempt(
  obj: Record<string, unknown>,
): obj is OrderAttemptSnapshot {
  if (obj.version !== ATTEMPT_STORAGE_VERSION) return false;
  if (!isValidChannel(obj.channel)) return false;
  if (
    typeof obj.idempotencyKey !== "string" ||
    obj.idempotencyKey.trim() === "" ||
    !UUID_V4_PATTERN.test(obj.idempotencyKey)
  ) {
    return false;
  }
  if (
    !("orderId" in obj) ||
    (obj.orderId !== null && typeof obj.orderId !== "string")
  ) {
    return false;
  }
  if (!Array.isArray(obj.lines) || obj.lines.length === 0) return false;
  for (const line of obj.lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) return false;
    if (typeof (line as Record<string, unknown>).productId !== "string")
      return false;
    if (typeof (line as Record<string, unknown>).qty !== "number") return false;
  }
  if (typeof obj.createdAt !== "string") return false;
  if (Number.isNaN(Date.parse(obj.createdAt))) return false;
  if (obj.completedAt !== undefined && typeof obj.completedAt !== "string") {
    return false;
  }
  if (obj.completedAt && Number.isNaN(Date.parse(obj.completedAt)))
    return false;
  if (
    obj.status !== undefined &&
    !["accepted", "processing", "completed", "failed", "conflict", "validation"].includes(
      obj.status as string,
    )
  ) {
    return false;
  }
  return true;
}

function isValidSession(
  obj: Record<string, unknown>,
): obj is OrderAttemptSession {
  if (obj.version !== ATTEMPT_STORAGE_VERSION) return false;
  if (!isValidChannel(obj.channel)) return false;
  if (
    typeof obj.idempotencyKey !== "string" ||
    obj.idempotencyKey.trim() === "" ||
    !UUID_V4_PATTERN.test(obj.idempotencyKey)
  ) {
    return false;
  }
  if (
    !("orderId" in obj) ||
    (obj.orderId !== null && typeof obj.orderId !== "string")
  ) {
    return false;
  }
  if (!isValidContactObj(obj.contact)) return false;
  if (!Array.isArray(obj.lines) || obj.lines.length === 0) return false;
  for (const line of obj.lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) return false;
    if (typeof (line as Record<string, unknown>).productId !== "string")
      return false;
    if (typeof (line as Record<string, unknown>).qty !== "number") return false;
  }
  if (typeof obj.createdAt !== "string") return false;
  if (Number.isNaN(Date.parse(obj.createdAt))) return false;
  return true;
}

function isValidContactObj(contact: unknown): boolean {
  if (!contact || typeof contact !== "object" || Array.isArray(contact))
    return false;
  const c = contact as Record<string, unknown>;
  if (typeof c.name !== "string" || c.name.trim() === "") return false;
  if (typeof c.legalName !== "string" || c.legalName.trim() === "")
    return false;
  if (typeof c.email !== "string" || c.email.trim() === "") return false;
  return true;
}

/** Deep-equals two line arrays (order-dependent). */
function linesEqual(
  a: { productId: string; qty: number }[],
  b: { productId: string; qty: number }[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].productId !== b[i].productId || a[i].qty !== b[i].qty)
      return false;
  }
  return true;
}

/** Retries must preserve every optional field in the backend SHA-256 fingerprint. */
function contactEqual(a: CheckoutContact, b: CheckoutContact): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ── expiración ───────────────────────────────────────────────────── */
function isAttemptExpired(snapshot: OrderAttemptSnapshot): boolean {
  const now = Date.now();
  const created = Date.parse(snapshot.createdAt);
  if (!Number.isFinite(created)) return true;
  return now - created >= RETENTION_MS;
}

/* ── status helpers ───────────────────────────────────────────────── */

/**
 * Returns a discriminated union that distinguishes every storage state.
 *
 * "invalid" — key exists but payload fails validation → MUST block retry.
 * "unavailable" — storage API threw (permission denied, etc.).
 * "missing" — key does not exist (no prior attempt).
 * "expired" — key exists, is valid, but past retention.
 * "valid" — key exists, valid, within retention.
 */
export function getStoredAttemptStatus(options?: {
  storage?: Pick<Storage, "getItem">;
  /** Canal cuyo compartmento se consulta. Defecto: público. */
  channel?: OrderAttemptChannel;
}): OrderAttemptStatus {
  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  const { localKey } = attemptStorageKeys(options?.channel);

  /* Unavailable: storage itself unavailable. */
  if (!storageItem) {
    return { kind: "unavailable" };
  }

  let raw: string | null;
  try {
    raw = storageItem.getItem(localKey);
  } catch {
    return { kind: "unavailable" };
  }

  /* Missing: key does not exist. */
  if (!raw) {
    return { kind: "missing" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* Invalid: key exists but JSON parse failed. */
    return { kind: "invalid" };
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !isValidAttempt(parsed as Record<string, unknown>)
  ) {
    /* Invalid: key exists but payload fails validation. */
    return { kind: "invalid" };
  }

  const snapshot = parsed as OrderAttemptSnapshot;

  /* Expired: valid marker but past retention. */
  if (isAttemptExpired(snapshot)) {
    return { kind: "expired", snapshot };
  }

  return { kind: "valid", snapshot };
}

/* ── API pública ──────────────────────────────────────────────────── */

/**
 * Atomic two-step preparation of a purchase attempt.
 *
 * Cada canal tiene su PROPIO compartmento de almacenamiento (claves
 * distintas en localStorage y sessionStorage): el registro que se lee y se
 * escribe es SIEMPRE el del canal pedido, así que una clave de idempotencia
 * nunca viaja de un canal al otro y un intento pendiente de un canal nunca
 * bloquea al otro.
 *
 * The channel (public / distributor) is also part of the attempt: it is
 * written in BOTH records (session + marker) and it is immutable.
 *
 * El canal es la atribución del canal DISTRIBUIDOR: la regla de reutilizar
 * un registro exige el MISMO canal sólo en ese canal (un registro heredado o
 * público nunca se adopta). El canal público conserva las reglas de
 * origin/main (sin atribución, un registro heredado se reenvía como antes).
 *
 * When NO existing valid marker exists:
 *  1. Saves full payload to sessionStorage (contact snapshot).
 *  2. Saves minimal marker to localStorage (no PII).
 *  3. If step 2 fails, removes step 1's session (rollback).
 *  Returns the normalized payload with created key and anchor timestamp.
 *
 * When a valid existing marker exists:
 *  - Validates the marker and same-tab session key, original timestamp,
 *    exact lines and ALL contact fields. A missing session blocks retry.
 *  - On exact match: returns the immutable session payload without rewriting it.
 *  - On mismatch: fail-closed, returns false. No overwrite.
 *
 * When marker exists but is malformed/expired/invalid:
 *  - Fail-closed (returns false). No automatic recreation.
 *  User must explicitly clear first (human action after completion).
 *
 * This is the gatekeeper — saveAttempt/updateAttempt should not be called
 * directly for new attempts. prepareAttempt enforces the immutable contract.
 *
 * Note: cross-browser-tab atomicity is best-effort only — there is no
 * cross-tab transactional guarantee in the Web Storage API.  Each tab
 * writes its own session; the localStorage marker is the coordination
 * point for the UI (blocking duplicate submits).
 */
export function prepareAttempt(
  contact: CheckoutContact,
  cartLines: { productId: string; qty: number }[],
  options: {
    /** Canal del intento. Explícito: nunca se deduce del contexto. */
    channel?: OrderAttemptChannel;
    storage?: Storage;
    sessionStorage?: Storage;
  },
): PreparedAttemptPayload | false {
  if (cartLines.length === 0) return false;

  const channel: OrderAttemptChannel = options?.channel ?? "public";
  const { localKey, sessionKey } = attemptStorageKeys(channel);

  const localStorageItem = resolveStorage(
    options?.storage,
    safeGetGlobalStorage("localStorage"),
  );
  const sessionStorageItem = resolveStorage(
    options?.sessionStorage,
    safeGetGlobalStorage("sessionStorage"),
  );

  /* Both storages must be available for atomic operation. */
  if (!localStorageItem || !sessionStorageItem) return false;

  /* Check existing marker status (compartimento del canal). */
  const status = getStoredAttemptStatus({
    storage: localStorageItem,
    channel,
  });

  /*
   * Case: existing valid marker.
   * Enforce immutable contract — key+lines+contact must match.
   */
  if (status.kind === "valid") {
    const existingSession = readJsonSession(sessionStorageItem, sessionKey);
    const newLines = [...cartLines].map((l) => ({
      productId: l.productId,
      qty: l.qty,
    }));

    if (
      !existingSession ||
      status.snapshot.status === "completed" ||
      status.snapshot.status === "failed" ||
      status.snapshot.status === "conflict" ||
      status.snapshot.status === "validation" ||
      existingSession.idempotencyKey !== status.snapshot.idempotencyKey ||
      existingSession.createdAt !== status.snapshot.createdAt ||
      (existingSession.orderId !== null &&
        existingSession.orderId !== status.snapshot.orderId) ||
      !linesEqual(status.snapshot.lines, existingSession.lines) ||
      !linesEqual(existingSession.lines, newLines) ||
      !contactEqual(existingSession.contact, contact) ||
      /* Canal inmutable: la clave nunca viaja de un canal a otro. Cada canal
         tiene su propio compartmento, así que el registro leído ya es del
         canal pedido; el canal DISTRIBUIDOR exige además que el registro
         esté atribuido a él (un registro heredado o público no se adopta).
         El canal público conserva el comportamiento de origin/main con los
         registros heredados (sin atribución), pero NUNCA adopta un registro
         atribuido al DISTRIBUIDOR: esa clave y ese pedido pertenecen al otro
         canal y reenviarlos aquí los duplicaría. */
      (channel === "distributor"
        ? status.snapshot.channel !== channel || existingSession.channel !== channel
        : status.snapshot.channel === "distributor" ||
          existingSession.channel === "distributor")
    ) {
      return false;
    }
    return {
      idempotencyKey: existingSession.idempotencyKey,
      contact: { ...existingSession.contact },
      lines: existingSession.lines.map((line) => ({ ...line })),
      createdAt: existingSession.createdAt,
    };
  }

  /*
   * Case: unavailable, invalid, or expired marker.
   * Fail closed — no automatic recreation.
   */
  if (status.kind !== "missing") return false;

  // A leftover session may represent an interrupted write: do not replace it
  // with another key or silently discard contact from an uncertain attempt.
  try {
    if (sessionStorageItem.getItem(sessionKey) !== null) return false;
  } catch {
    return false;
  }

  /*
   * Case: no existing marker (missing).
   * Two-step best-effort: session first, then marker. Rollback session on failure.
   */
  const newKey = newIdempotencyKey();
  const now = new Date().toISOString();
  const newLines = [...cartLines].map((l) => ({
    productId: l.productId,
    qty: l.qty,
  }));

  const session: OrderAttemptSession = {
    version: ATTEMPT_STORAGE_VERSION,
    idempotencyKey: newKey,
    orderId: null,
    contact: { ...contact },
    lines: newLines,
    createdAt: now,
    channel,
  };

  if (!writeJsonSession(sessionStorageItem, session, sessionKey)) return false;

  const marker: OrderAttemptSnapshot = {
    version: ATTEMPT_STORAGE_VERSION,
    idempotencyKey: newKey,
    orderId: null,
    lines: newLines,
    createdAt: now,
    channel,
  };

  if (!writeJsonLocal(localStorageItem, marker, localKey)) {
    removeJsonSession(sessionStorageItem, sessionKey);
    return false;
  }

  return {
    idempotencyKey: newKey,
    contact: { ...contact },
    lines: newLines,
    createdAt: now,
  };
}

/**
 * Guardar el snapshot v2 en localStorage (sin PII).
 *
 * ⚠️  DEPRECATED: use prepareAttempt for new attempts.
 * This function is kept for backward compatibility.
 */
export function saveAttempt(
  idempotencyKey: string,
  cartLines: { productId: string; qty: number }[],
  contact: CheckoutContact,
  options?: {
    orderId?: string | null;
    status?: "accepted" | "processing" | "completed" | "failed" | "conflict" | "validation";
    completed?: boolean;
    storage?: Pick<Storage, "getItem" | "setItem">;
    /**
     * Canal del intento: elige el compartmento de almacenamiento. Si se
     * omite, el registro queda SIN atribución (equivalente a un registro
     * heredado): se conserva pero no se reenvía por el canal distribuidor.
     */
    channel?: OrderAttemptChannel;
  },
): boolean {
  if (cartLines.length === 0) return false;
  const now = new Date().toISOString();
  const lines = [...cartLines].map((l) => ({
    productId: l.productId,
    qty: l.qty,
  }));

  const snapshot: OrderAttemptSnapshot = {
    version: ATTEMPT_STORAGE_VERSION,
    idempotencyKey,
    orderId: options?.orderId ?? null,
    lines,
    createdAt: now,
    completedAt: options?.completed ? now : undefined,
    status: options?.status,
    channel: options?.channel,
  };

  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  if (!storageItem) return false;
  const { localKey, sessionKey } = attemptStorageKeys(options?.channel);
  try {
    // Deprecated entry point: creation only. Never replace even an invalid or
    // expired marker; the explicit resolution flow owns removal.
    if (storageItem.getItem(localKey) !== null) return false;
    if (getStoredSessionPresence({ channel: options?.channel }) !== "missing") return false;
  } catch {
    return false;
  }
  return writeJsonLocal(storageItem, snapshot, localKey);
}

/**
 * Guardar la sesión de OrderPayload en sessionStorage (solo misma pestaña).
 *
 * ⚠️  DEPRECATED: use prepareAttempt which handles both storages atomically.
 */
export function saveAttemptSession(
  contact: CheckoutContact,
  cartLines: { productId: string; qty: number }[],
  idempotencyKey: string,
  orderId?: string | null,
  options?: {
    storage?: Pick<Storage, "getItem" | "setItem">;
    /** Canal del intento (inmutable) y compartmento de almacenamiento. */
    channel?: OrderAttemptChannel;
  },
): boolean {
  if (cartLines.length === 0) return false;
  const now = new Date().toISOString();
  const lines = [...cartLines].map((l) => ({
    productId: l.productId,
    qty: l.qty,
  }));

  const session: OrderAttemptSession = {
    version: ATTEMPT_STORAGE_VERSION,
    idempotencyKey,
    orderId: orderId ?? null,
    contact: { ...contact },
    lines,
    createdAt: now,
    channel: options?.channel,
  };

  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("sessionStorage"),
  );
  if (!storageItem) return false;
  const { localKey, sessionKey } = attemptStorageKeys(options?.channel);
  try {
    if (storageItem.getItem(sessionKey) !== null) return false;
    if (getStoredAttemptStatus({ channel: options?.channel }).kind !== "missing") return false;
  } catch {
    return false;
  }
  return writeJsonSession(storageItem, session, sessionKey);
}

/**
 * Actualizar solo orderId y status sin alterar createdAt ni lines originales.
 *
 * Immutable contract (enforced):
 *  - lines: must match existing snapshot (rejects change).
 *  - orderId: preserve previous if not provided (fix defect where omitted → null).
 *  - terminal states (completed/failed): never cleared or overwritten.
 *  - createdAt anchor: never refreshed.
 */
export function updateAttempt(
  cartLines: { productId: string; qty: number }[],
  options?: {
    orderId?: string | null;
    status?: "accepted" | "processing" | "completed" | "failed" | "conflict" | "validation";
    completed?: boolean;
    storage?: Pick<Storage, "getItem" | "setItem">;
    /** Canal cuyo compartmento se actualiza. Defecto: público. */
    channel?: OrderAttemptChannel;
  },
): boolean {
  const snapshot = getAttempt(options);
  if (!snapshot) return false;

  const newLines = [...cartLines].map((l) => ({
    productId: l.productId,
    qty: l.qty,
  }));

  /*
   * Immutable: reject if lines changed from original.
   * This prevents the defect where updateAttempt freely replaced lines.
   */
  if (!linesEqual(snapshot.lines, newLines)) return false;

  /*
   * Terminal states: never clear or overwrite.
   * If the order is already completed or failed, reject any update.
   */
  if (["completed", "failed", "conflict", "validation"].includes(snapshot.status ?? "")) {
    return false;
  }

  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  if (!storageItem) return false;

  /*
   * Preserve existing orderId if not provided — fix defect where
   * options?.orderId ?? null defaulted to null.
   */
  const newOrderId =
    options?.orderId !== undefined ? options.orderId : snapshot.orderId;
  if (snapshot.orderId !== null && newOrderId !== snapshot.orderId)
    return false;
  if (options?.completed && options?.status !== "completed") return false;
  if (options?.status === "completed" && !newOrderId) return false;

  const updated: OrderAttemptSnapshot = {
    ...snapshot,
    orderId: newOrderId,
    lines: newLines,
    completedAt: options?.completed
      ? new Date().toISOString()
      : snapshot.completedAt,
    status: options?.status ?? snapshot.status,
  };

  return writeJsonLocal(storageItem, updated, attemptStorageKeys(options?.channel).localKey);
}

/**
 * Actualizar la sesión con un nuevo orderId (sin alterar el resto).
 * El createdAt del sessionStorage es siempre el original.
 *
 * Immutable contract (enforced):
 *  - terminal states: never cleared or overwritten.
 *  - createdAt anchor: never refreshed.
 */
export function updateAttemptSession(
  orderId: string | null,
  options?: {
    storage?: Pick<Storage, "getItem" | "setItem">;
    /** Canal cuyo compartmento se actualiza. Defecto: público. */
    channel?: OrderAttemptChannel;
  },
): boolean {
  const session = getAttemptSession(options);
  if (!session) return false;

  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("sessionStorage"),
  );
  if (!storageItem) return false;

  const updated: OrderAttemptSession = {
    ...session,
    orderId: orderId ?? null,
  };

  return writeJsonSession(storageItem, updated, attemptStorageKeys(options?.channel).sessionKey);
}

/**
 * Leer el snapshot del intento desde localStorage. Retorna null si expiró
 * o no existe. NO lo borra; solo lo lee.
 *
 * Usa globalThis.localStorage como defecto.
 */
export function getAttempt(options?: {
  storage?: Pick<Storage, "getItem">;
  /** Canal cuyo compartmento se lee. Defecto: público. */
  channel?: OrderAttemptChannel;
}): OrderAttemptSnapshot | null {
  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  const snapshot = readJsonLocal(storageItem, attemptStorageKeys(options?.channel).localKey);
  if (!snapshot) return null;
  if (isAttemptExpired(snapshot)) {
    return null;
  }
  return snapshot;
}

/**
 * Leer la sesión desde sessionStorage (solo misma pestaña).
 *
 * Usa globalThis.sessionStorage como defecto.
 */
export function getAttemptSession(options?: {
  storage?: Pick<Storage, "getItem">;
  /** Canal cuyo compartmento se lee. Defecto: público. */
  channel?: OrderAttemptChannel;
}): OrderAttemptSession | null {
  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("sessionStorage"),
  );
  return readJsonSession(storageItem, attemptStorageKeys(options?.channel).sessionKey);
}

/** Detect an orphaned session without exposing its contact data. */
export function getStoredSessionPresence(options?: {
  storage?: Pick<Storage, "getItem">;
  /** Canal cuyo compartmento se lee. Defecto: público. */
  channel?: OrderAttemptChannel;
}): "missing" | "present" | "unavailable" {
  const storage = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("sessionStorage"),
  );
  if (!storage) return "unavailable";
  try {
    return storage.getItem(attemptStorageKeys(options?.channel).sessionKey) === null
      ? "missing"
      : "present";
  } catch {
    return "unavailable";
  }
}

/**
 * Limpiar el intento (localStorage + sessionStorage) una vez completado
 * o cuando se abandona el checkout exitosamente.
 *
 * Solo se llama de forma explícita por el UI tras completar o fallar,
 * NUNCA automáticamente en errores o expiración.
 *
 * Usa globalThis.localStorage / sessionStorage como defecto.
 */
export function clearAttempt(options?: {
  storage?: Pick<Storage, "getItem" | "removeItem">;
  sessionStorage?: Pick<Storage, "getItem" | "removeItem">;
  /** Canal cuyo compartmento se limpia. Defecto: público. */
  channel?: OrderAttemptChannel;
}): void {
  const localStorageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  const { localKey, sessionKey } = attemptStorageKeys(options?.channel);
  /* El contexto vivo en memoria se olvida con el registro: nunca queda una
     prueba huérfana que autorice un reenvío posterior. */
  let clearedKey: string | null = null;
  if (localStorageItem) {
    try {
      const raw = localStorageItem.getItem(localKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.idempotencyKey === "string") clearedKey = parsed.idempotencyKey;
      }
    } catch {
      clearedKey = null;
    }
    removeJsonLocal(localStorageItem, localKey);
  }
  if (clearedKey) forgetAttemptContext(clearedKey);
  const sessionStorageItem = resolveStorage(
    options?.sessionStorage as Storage | undefined,
    safeGetGlobalStorage("sessionStorage"),
  );
  if (sessionStorageItem) {
    removeJsonSession(sessionStorageItem, sessionKey);
  }
}

/**
 * Close only the attempt confirmed by the API (or a historical completed
 * marker). Persist completion before removal so a failed cleanup cannot
 * turn a confirmed order into a retry. Storage comparisons are best-effort:
 * Web Storage provides no cross-tab compare-and-swap transaction.
 */
export function finalizeCompletedAttempt(
  idempotencyKey: string,
  orderId: string,
  options?: {
    storage?: Storage;
    sessionStorage?: Storage;
    /** Canal cuyo compartmento se cierra. Defecto: público. */
    channel?: OrderAttemptChannel;
  },
): boolean {
  if (!orderId.trim()) return false;
  const local = resolveStorage(options?.storage, safeGetGlobalStorage("localStorage"));
  const session = resolveStorage(options?.sessionStorage, safeGetGlobalStorage("sessionStorage"));
  if (!local || !session) return false;
  const { localKey, sessionKey } = attemptStorageKeys(options?.channel);

  try {
    const originalRaw = local.getItem(localKey);
    const current = getStoredAttemptStatus({ storage: local, channel: options?.channel });
    if (current.kind !== "valid" && current.kind !== "expired") return false;
    const snapshot = current.snapshot;
    if (snapshot.idempotencyKey !== idempotencyKey ||
        (snapshot.orderId !== null && snapshot.orderId !== orderId) ||
        ["failed", "conflict", "validation"].includes(snapshot.status ?? "")) return false;

    const sessionRaw = session.getItem(sessionKey);
    if (sessionRaw !== null) {
      const stored = JSON.parse(sessionRaw);
      if (!stored || typeof stored !== "object" || !isValidSession(stored) ||
          stored.idempotencyKey !== idempotencyKey || stored.createdAt !== snapshot.createdAt ||
          !linesEqual(stored.lines, snapshot.lines) ||
          stored.channel !== snapshot.channel ||
          (stored.orderId !== null && stored.orderId !== orderId)) return false;
    }
    if (local.getItem(localKey) !== originalRaw) return false;

    let completedRaw = originalRaw;
    if (snapshot.status !== "completed") {
      completedRaw = JSON.stringify({
        ...snapshot, orderId, status: "completed", completedAt: new Date().toISOString(),
      });
      local.setItem(localKey, completedRaw);
    }
    if (local.getItem(localKey) !== completedRaw || session.getItem(sessionKey) !== sessionRaw) return false;

    // Keep the completed marker if session removal fails. Check again before
    // removing the marker so a different attempt is never intentionally cleared.
    session.removeItem(sessionKey);
    if (session.getItem(sessionKey) !== null || local.getItem(localKey) !== completedRaw) return false;
    local.removeItem(localKey);
    /* Pedido confirmado: la prueba viva de ese intento deja de existir. */
    forgetAttemptContext(idempotencyKey);
    return local.getItem(localKey) === null && session.getItem(sessionKey) === null;
  } catch {
    return false;
  }
}

/** Estados LIBERABLES localmente: existe evidencia de que NO queda un pedido
 *  pendiente en el servidor.
 *
 *  - `completed`: el pedido está confirmado y se resuelve solo.
 *  - `validation` (400/403): el servidor rechaza ANTES de crear el pedido, así
 *    que no hay nada que reconciliar.
 *
 *  `failed` (502 con orderId) y `conflict` (409) NO son liberables en ningún
 *  canal: el servidor conserva el pedido (o la respuesta no permite probar
 *  que no exista) y, en el caso de `failed`, el cliente puede haber recibido
 *  ya el correo de aviso. Liberarlos borraría la única traza local de un
 *  pedido que puede existir.
 *
 *  Anything else (accepted/processing/undefined) is an UNCERTAIN outcome. */
const RELEASABLE_ATTEMPT_STATUSES = ["completed", "validation"];

/** La liberación local exige un resultado DEFINITIVO *y* que el servidor no
 *  conserve un pedido pendiente.
 *
 * Sólo se concede cuando el registro persistido prueba que no hay pedido en
 * el servidor: un pedido ya confirmado (completed) o un rechazo anterior a
 * cualquier creación (validation). NO se concede para un pedido que el
 * servidor conservó (failed) ni para un 409 cuyo resultado no se puede
 * verificar desde el catálogo (conflict), ni para un resultado incierto
 * (accepted/processing), ni para un registro inválido o una sesión huérfana,
 * en NINGÚN canal (público o distribuidor). El vencimiento por sí solo no
 * libera nada: un registro vencido sólo se libera si su resultado ya era
 * liberable.
 *
 * Razón: la expiración de un marcador local NO demuestra que el servidor no
 * recibiera el pedido, y la idempotencia vencida del backend NO autoriza un
 * envío nuevo. Sin una conciliación verificable desde el frontend, el
 * registro se conserva: se muestra la referencia original y el contacto de
 * RealStep, pero no se genera una clave nueva.
 *
 * Es una compuerta de seguridad local, nunca autorización de cuenta ni de
 * precio.
 */
export function canResolveAttemptLocally(
  status: OrderAttemptStatus,
  session: OrderAttemptSession | null = null,
): boolean {
  if (status.kind !== "valid" && status.kind !== "expired") return false;
  if (session &&
      (session.idempotencyKey !== status.snapshot.idempotencyKey || session.channel !== status.snapshot.channel)) return false;
  return RELEASABLE_ATTEMPT_STATUSES.includes(status.snapshot.status ?? "");
}

/**
 * Explicit local resolution before a separate purchase. An uncertain dealer
 * or unattributable record requires proof this frontend cannot supply yet.
 * A changed marker is never cleared: another tab may have updated it.
 */
export function resolveAttemptForNewPurchase(
  expected: OrderAttemptStatus,
  confirmedUncertain: boolean,
  options?: {
    storage?: Storage;
    sessionStorage?: Storage;
    /**
     * Canal del intento: elige el compartmento de almacenamiento (cada
     * canal tiene el suyo). `public` conserva exactamente las reglas de
     * origin/main. Cualquier otro valor (o su ausencia) aplica la compuerta
     * de liberación local (`canResolveAttemptLocally`): por omisión, el
     * comportamiento es estricto (fail closed).
     */
    channel?: OrderAttemptChannel;
  },
): boolean {
  if (expected.kind === "unavailable") return false;
  const local = resolveStorage(options?.storage, safeGetGlobalStorage("localStorage"));
  const session = resolveStorage(options?.sessionStorage, safeGetGlobalStorage("sessionStorage"));
  if (!local || !session) return false;
  const channel: OrderAttemptChannel = options?.channel ?? "public";
  const { localKey, sessionKey } = attemptStorageKeys(channel);

  let originalRaw: string | null;
  let originalSessionRaw: string | null;
  try {
    originalRaw = local.getItem(localKey);
    originalSessionRaw = session.getItem(sessionKey);
  } catch {
    return false;
  }

  const current = getStoredAttemptStatus({ storage: local, channel });
  if (current.kind !== expected.kind) return false;
  /* La compuerta de liberación local es una protección del canal
     DISTRIBUIDOR: sólo se exige que el resultado sea definitivo y que el
     servidor no conserve un pedido pendiente. El default es estricto
     (fail closed). El canal público la desactiva explícitamente y conserva
     las reglas de origin/main (resultado terminal, o incierto con la
     confirmación del cliente). Cada canal tiene su propio compartmento: el
     registro que se toca es SIEMPRE el de su canal. */
  const storedSession = getAttemptSession({ storage: session, channel });
  /* Un registro atribuido al DISTRIBUIDOR no se libera desde el canal
     PÚBLICO: es el pedido del otro canal y liberarlo desde aquí lo borraría
     sin que su propia conciliación lo hubiera cerrado. El canal distribuidor
     sí lo libera por su propia vía (con la compuerta local). */
  const ownedByDistributor =
    (current.kind === "valid" || current.kind === "expired"
      ? current.snapshot.channel
      : storedSession?.channel) === "distributor";
  if (ownedByDistributor && channel !== "distributor") return false;
  if (options?.channel !== "public" && !canResolveAttemptLocally(current, storedSession)) return false;
  if (current.kind === "missing") {
    if (!confirmedUncertain || getStoredSessionPresence({ storage: session, channel }) !== "present") return false;
  } else if (current.kind === "valid" || current.kind === "expired") {
    if (expected.kind !== current.kind) return false;
    const a = current.snapshot;
    const b = expected.snapshot;
    if (a.idempotencyKey !== b.idempotencyKey || a.createdAt !== b.createdAt ||
        a.orderId !== b.orderId || a.status !== b.status ||
        a.channel !== b.channel ||
        !linesEqual(a.lines, b.lines)) return false;
    const terminal = current.kind === "valid" &&
      ["completed", "failed", "conflict", "validation"].includes(a.status ?? "");
    if (!terminal && !confirmedUncertain) return false;
  } else if (current.kind === "invalid" && !confirmedUncertain) {
    return false;
  }

  try {
    // Leave the marker in place if the session cannot be removed. If removing
    // the marker then fails, the remaining marker still blocks a new POST.
    if (local.getItem(localKey) !== originalRaw || session.getItem(sessionKey) !== originalSessionRaw) return false;
    session.removeItem(sessionKey);
    if (session.getItem(sessionKey) !== null) return false;
    if (local.getItem(localKey) !== originalRaw) return false;
    local.removeItem(localKey);
    /* Resolución explícita: la prueba viva de ese intento deja de existir. */
    if (current.kind === "valid" || current.kind === "expired") {
      forgetAttemptContext(current.snapshot.idempotencyKey);
    }
    return local.getItem(localKey) === null;
  } catch {
    return false;
  }
}

/**
 * Decisión administrativa del backend que puede cerrar un intento.
 *
 * - `RECEIVED`: RealStep confirmó que el pedido FUE RECIBIDO. El resultado
 *   del intento está cerrado: no queda nada pendiente en el servidor que
 *   pueda duplicarse. Es la única decisión que habilita cerrar también los
 *   estados que el servidor conservó (`failed`) o que no se podían verificar
 *   (`conflict`), porque el frontend no los libera por confianza propia
 *   sino por una decisión del servidor, obtenida con la sesión del
 *   distribuidor y atada a la referencia exacta.
 * - `NOT_RECEIVED`: RealStep registró que el pedido no fue recibido. No
 *   amplía ningún permiso: los bloqueos de `failed`, `conflict`,
 *   `validation` y `completed` siguen vigentes.
 */
export type ReconciliationDecision = "RECEIVED" | "NOT_RECEIVED";

/**
 * ¿Puede cerrarse este intento con ESTA decisión?
 *
 * Reglas (fail closed):
 *  - la referencia debe ser EXACTAMENTE la del marcador persistido;
 *  - el canal persistido debe ser `distributor` (el checkout público nunca
 *    se cierra por esta vía y un registro heredado tampoco);
 *  - con `RECEIVED` cualquier estado cerrable (el pedido fue recibido: no
 *    queda nada pendiente por duplicar);
 *  - con `NOT_RECEIVED` sólo los estados INCIERTOS: `failed`, `conflict`,
 *    `validation` y `completed` siguen bloqueados.
 */
export function canCloseAttemptByReconciliation(
  reference: string,
  decision: ReconciliationDecision,
  options?: { storage?: Pick<Storage, "getItem"> },
): boolean {
  const key = typeof reference === "string" ? reference.trim() : "";
  if (!key) return false;
  const local = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  if (!local) return false;
  /* La conciliación es EXCLUSIVA del canal distribuidor: se consulta su
     compartmento. El checkout público nunca se cierra por esta vía. */
  const current = getStoredAttemptStatus({ storage: local, channel: "distributor" });
  if (current.kind !== "valid" && current.kind !== "expired") return false;
  const snapshot = current.snapshot;
  if (snapshot.idempotencyKey !== key) return false;
  if (snapshot.channel !== "distributor") return false;
  if (decision === "RECEIVED") return true;
  /* NOT_RECEIVED no amplía permisos: los estados que el servidor conservó o
     que no se pueden verificar siguen bloqueados. */
  return !["failed", "conflict", "validation", "completed"].includes(snapshot.status ?? "");
}

/**
 * Cierre explícito de un intento DISTRIBUIDOR cuando el servidor confirma su
 * estado administrativo.
 *
 * Es la única vía por la que la conciliación del backend (RECEIVED /
 * NOT_RECEIVED) puede liberar un intento. No es una liberación "local": la
 * decisión la tomó el servidor, autenticado con la sesión del distribuidor.
 *
 * Reglas (todas fail closed):
 *  - el registro persistido debe ser EXACTAMENTE el de la referencia
 *    consultada (misma clave): un marcador distinto no se toca;
 *  - el canal persistido debe ser `distributor`: el checkout público no se
 *    toca nunca por esta vía, y un registro heredado (sin canal) tampoco;
 *  - la decisión habilita el cierre según `canCloseAttemptByReconciliation`:
 *    `RECEIVED` cierra cualquier estado (el pedido fue recibido: no queda
 *    nada pendiente por duplicar) y `NOT_RECEIVED` sólo cierra intentos
 *    inciertos;
 *  - no se borra nada si el registro cambió entre la consulta y el clic
 *    (otra pestaña): la comparación es byte a byte sobre el contenido vivo;
 *  - la prueba viva de ese intento se olvida: no queda habilitando un
 *    reenvío posterior.
 *
 * No genera claves, no reescribe el historial y no borra el carrito: sólo
 * cierra el registro del intento ya resuelto.
 */
export function closeAttemptByReconciliation(
  reference: string,
  decision: ReconciliationDecision,
  options?: { storage?: Storage; sessionStorage?: Storage },
): boolean {
  const key = typeof reference === "string" ? reference.trim() : "";
  if (!key) return false;
  const local = resolveStorage(options?.storage, safeGetGlobalStorage("localStorage"));
  const session = resolveStorage(options?.sessionStorage, safeGetGlobalStorage("sessionStorage"));
  if (!local || !session) return false;
  /* Compartmento del canal distribuidor: la conciliación nunca toca el
     registro del canal público. */
  const { localKey, sessionKey } = attemptStorageKeys("distributor");

  let originalRaw: string | null;
  let originalSessionRaw: string | null;
  try {
    originalRaw = local.getItem(localKey);
    originalSessionRaw = session.getItem(sessionKey);
  } catch {
    return false;
  }
  if (originalRaw === null) return false;

  if (!canCloseAttemptByReconciliation(key, decision, { storage: local })) return false;
  const current = getStoredAttemptStatus({ storage: local, channel: "distributor" });
  if (current.kind !== "valid" && current.kind !== "expired") return false;
  const snapshot = current.snapshot;

  try {
    /* El marcador no cambió desde la consulta: si otra pestaña lo movió, no
       se borra nada. */
    if (local.getItem(localKey) !== originalRaw) return false;
    if (session.getItem(sessionKey) !== originalSessionRaw) return false;
    session.removeItem(sessionKey);
    if (session.getItem(sessionKey) !== null) return false;
    if (local.getItem(localKey) !== originalRaw) return false;
    local.removeItem(localKey);
    /* La resolución es explícita: la prueba viva de ese intento deja de
       existir y no habilita ningún reenvío posterior. */
    forgetAttemptContext(snapshot.idempotencyKey);
    return local.getItem(localKey) === null;
  } catch {
    return false;
  }
}

/**
 * Verificar si existe un intento en curso (localStorage con orderId).
 * Útil para mostrar UI de "ya estás enviando un pedido".
 */
export function hasPendingAttempt(options?: {
  storage?: Pick<Storage, "getItem">;
  /** Canal cuyo compartmento se consulta. Defecto: público. */
  channel?: OrderAttemptChannel;
}): boolean {
  const snapshot = getAttempt(options);
  return snapshot !== null && !snapshot.completedAt &&
    !["failed", "conflict", "validation"].includes(snapshot.status ?? "");
}

/**
 * Verificar si existe un marcador sin expirar (para UI "ya envía").
 * No verifica si está completado — eso es para la UI decidir.
 *
 * Usa globalThis.localStorage como defecto.
 */
export function hasStoredAttempt(options?: {
  storage?: Pick<Storage, "getItem">;
  /** Canal cuyo compartmento se consulta. Defecto: público. */
  channel?: OrderAttemptChannel;
}): boolean {
  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  if (!storageItem) return false;
  try {
    const raw = storageItem.getItem(attemptStorageKeys(options?.channel).localKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && isValidAttempt(parsed);
  } catch {
    return false;
  }
}

/**
 * Verificar si el marcador expiró. No borra nada; solo verifica.
 *
 * DEPRECATED: use getStoredAttemptStatus for discriminated union.
 * Kept for backward compatibility.
 */
export function isStoredAttemptExpired(options?: {
  storage?: Pick<Storage, "getItem">;
}): "missing" | "expired" | "valid" {
  const status = getStoredAttemptStatus(options);
  if (status.kind === "expired") return "expired";
  if (status.kind === "valid") return "valid";
  return "missing";
}

/**
 * Verificar si un retry es posible (dentro de las 23h de retención).
 * Usa globalThis.localStorage como defecto.
 */
export function canRetryAttempt(options?: {
  storage?: Pick<Storage, "getItem">;
}): boolean {
  return getAttempt(options) !== null;
}
