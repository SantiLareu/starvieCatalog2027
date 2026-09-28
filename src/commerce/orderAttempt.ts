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

/* ── version / retention ─────────────────────────────────────────── */
const ATTEMPT_STORAGE_VERSION = "v2";
const RETENTION_MS = 23 * 3600 * 1000; // 23h

/* ── keys ─────────────────────────────────────────────────────────── */
const LOCAL_KEY = `starvie-order-attempt-${ATTEMPT_STORAGE_VERSION}`;
const SESSION_KEY = `starvie-order-attempt-${ATTEMPT_STORAGE_VERSION}-session`;

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

function readJsonLocal(storage: Storage | null): OrderAttemptSnapshot | null {
  try {
    const raw = storage?.getItem(LOCAL_KEY);
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

function writeJsonLocal(storage: Storage, data: OrderAttemptSnapshot): boolean {
  try {
    storage.setItem(LOCAL_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function removeJsonLocal(storage: Storage): void {
  try {
    storage.removeItem(LOCAL_KEY);
  } catch {
    // no-op
  }
}

function readJsonSession(storage: Storage | null): OrderAttemptSession | null {
  try {
    const raw = storage?.getItem(SESSION_KEY);
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
): boolean {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function removeJsonSession(storage: Storage): void {
  try {
    storage.removeItem(SESSION_KEY);
  } catch {
    // no-op
  }
}

/* ── validación estricta ──────────────────────────────────────────── */

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidAttempt(
  obj: Record<string, unknown>,
): obj is OrderAttemptSnapshot {
  if (obj.version !== ATTEMPT_STORAGE_VERSION) return false;
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
}): OrderAttemptStatus {
  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );

  /* Unavailable: storage itself unavailable. */
  if (!storageItem) {
    return { kind: "unavailable" };
  }

  let raw: string | null;
  try {
    raw = storageItem.getItem(LOCAL_KEY);
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
  options?: {
    storage?: Storage;
    sessionStorage?: Storage;
  },
): PreparedAttemptPayload | false {
  if (cartLines.length === 0) return false;

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

  /* Check existing marker status. */
  const status = getStoredAttemptStatus({
    storage: localStorageItem,
  });

  /*
   * Case: existing valid marker.
   * Enforce immutable contract — key+lines+contact must match.
   */
  if (status.kind === "valid") {
    const existingSession = readJsonSession(sessionStorageItem);
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
      !contactEqual(existingSession.contact, contact)
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
    if (sessionStorageItem.getItem(SESSION_KEY) !== null) return false;
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
  };

  if (!writeJsonSession(sessionStorageItem, session)) return false;

  const marker: OrderAttemptSnapshot = {
    version: ATTEMPT_STORAGE_VERSION,
    idempotencyKey: newKey,
    orderId: null,
    lines: newLines,
    createdAt: now,
  };

  if (!writeJsonLocal(localStorageItem, marker)) {
    removeJsonSession(sessionStorageItem);
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
  };

  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  if (!storageItem) return false;
  try {
    // Deprecated entry point: creation only. Never replace even an invalid or
    // expired marker; the explicit resolution flow owns removal.
    if (storageItem.getItem(LOCAL_KEY) !== null) return false;
    if (getStoredSessionPresence() !== "missing") return false;
  } catch {
    return false;
  }
  return writeJsonLocal(storageItem, snapshot);
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
  options?: { storage?: Pick<Storage, "getItem" | "setItem"> },
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
  };

  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("sessionStorage"),
  );
  if (!storageItem) return false;
  try {
    if (storageItem.getItem(SESSION_KEY) !== null) return false;
    if (getStoredAttemptStatus().kind !== "missing") return false;
  } catch {
    return false;
  }
  return writeJsonSession(storageItem, session);
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

  return writeJsonLocal(storageItem, updated);
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

  return writeJsonSession(storageItem, updated);
}

/**
 * Leer el snapshot del intento desde localStorage. Retorna null si expiró
 * o no existe. NO lo borra; solo lo lee.
 *
 * Usa globalThis.localStorage como defecto.
 */
export function getAttempt(options?: {
  storage?: Pick<Storage, "getItem">;
}): OrderAttemptSnapshot | null {
  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  const snapshot = readJsonLocal(storageItem);
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
}): OrderAttemptSession | null {
  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("sessionStorage"),
  );
  return readJsonSession(storageItem);
}

/** Detect an orphaned session without exposing its contact data. */
export function getStoredSessionPresence(options?: {
  storage?: Pick<Storage, "getItem">;
}): "missing" | "present" | "unavailable" {
  const storage = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("sessionStorage"),
  );
  if (!storage) return "unavailable";
  try {
    return storage.getItem(SESSION_KEY) === null ? "missing" : "present";
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
}): void {
  const localStorageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  if (localStorageItem) {
    removeJsonLocal(localStorageItem);
  }
  const sessionStorageItem = resolveStorage(
    options?.sessionStorage as Storage | undefined,
    safeGetGlobalStorage("sessionStorage"),
  );
  if (sessionStorageItem) {
    removeJsonSession(sessionStorageItem);
  }
}

/**
 * Explicit local resolution before a separate purchase. The UI must first
 * show the previous result and obtain confirmation for uncertain attempts.
 * A changed marker is never cleared: another tab may have updated it.
 */
export function resolveAttemptForNewPurchase(
  expected: OrderAttemptStatus,
  confirmedUncertain: boolean,
  options?: { storage?: Storage; sessionStorage?: Storage },
): boolean {
  if (expected.kind === "unavailable") return false;
  const local = resolveStorage(options?.storage, safeGetGlobalStorage("localStorage"));
  const session = resolveStorage(options?.sessionStorage, safeGetGlobalStorage("sessionStorage"));
  if (!local || !session) return false;

  let originalRaw: string | null;
  try {
    originalRaw = local.getItem(LOCAL_KEY);
  } catch {
    return false;
  }

  const current = getStoredAttemptStatus({ storage: local });
  if (current.kind !== expected.kind) return false;
  if (current.kind === "missing") {
    if (!confirmedUncertain || getStoredSessionPresence({ storage: session }) !== "present") return false;
  } else if (current.kind === "valid" || current.kind === "expired") {
    if (expected.kind !== current.kind) return false;
    const a = current.snapshot;
    const b = expected.snapshot;
    if (a.idempotencyKey !== b.idempotencyKey || a.createdAt !== b.createdAt ||
        a.orderId !== b.orderId || a.status !== b.status ||
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
    session.removeItem(SESSION_KEY);
    if (session.getItem(SESSION_KEY) !== null) return false;
    if (local.getItem(LOCAL_KEY) !== originalRaw) return false;
    local.removeItem(LOCAL_KEY);
    return local.getItem(LOCAL_KEY) === null;
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
}): boolean {
  const storageItem = resolveStorage(
    options?.storage as Storage | undefined,
    safeGetGlobalStorage("localStorage"),
  );
  if (!storageItem) return false;
  try {
    const raw = storageItem.getItem(LOCAL_KEY);
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
