/**
 * Cliente HTTP de distribuidores. Único lugar que conoce las rutas reales
 * verificadas del backend (`/api/distributor/*`):
 *
 *   POST /api/distributor/login    { cuit, password }        -> cookie de sesión
 *   GET  /api/distributor/session                            -> estado de sesión
 *   POST /api/distributor/logout                             -> revoca la sesión
 *   GET  /api/distributor/quote?productId=&qty=              -> precios del servidor
 *   GET  /api/distributor/order-resolution?reference=         -> estado de la conciliación
 *   POST /api/distributor/orders   { contact, lines, idempotencyKey, turnstileToken? }
 *
 * `/login` y `/session` devuelven además `sessionId`: el identificador
 * opaco, estable y no secreto de la sesión. Es la prueba de continuidad que
 * consume el checkout del canal distribuidor; si el servidor no lo envía,
 * el resultado lo lleva como ausente y nunca se fabrica un sustituto.
 *
 * Seguridad:
 * - `credentials: "include"` siempre: la cookie `__Host-ds` es HttpOnly y el
 *   frontend jamás ve, guarda ni envía el token a mano.
 * - Mutaciones con `X-Requested-With: distributor` (defensa CSRF del backend).
 * - Ni la contraseña ni ningún token se escriben en storage ni en logs.
 * - Base EXCLUSIVA de distribuidores (`VITE_DISTRIBUTOR_API_BASE_URL`),
 *   independiente de la API pública de pedidos (`VITE_API_BASE_URL` no se
 *   toca). Sin configurar, la integración está DESHABILITADA y el cliente
 *   no realiza ninguna solicitud: nunca apunta por defecto a producción
 *   para endpoints que todavía no existen. Sin secretos en variables VITE_.
 */
import type { OrderPayload, SubmitResult } from "../orders";
import type {
  DistributorLoginResult,
  DistributorQuoteResponse,
  DistributorResolutionResponse,
  DistributorResolutionResult,
  DistributorResolutionStatus,
  DistributorSessionResponse,
} from "./types";
import { RESOLUTION_STATUSES } from "./types";

export const DISTRIBUTOR_TIMEOUT_MS = 15_000;
const CSRF_HEADER = { "X-Requested-With": "distributor" } as const;

/**
 * Base URL de la integración de distribuidores, o null si no está configurada.
 * Solo `VITE_DISTRIBUTOR_API_BASE_URL` la habilita (p. ej. el Worker local);
 * ausente o vacía significa backend no disponible y CERO solicitudes.
 *
 * Se lee el objeto `import.meta.env` completo (mismo patrón probado de
 * `TurnstileWidget`): el acceso punteado directo quedaría congelado en
 * tiempo de transform y nunca reflejaría la configuración de runtime.
 */
export function resolveDistributorApiBaseUrl(): string | null {
  const env = import.meta.env;
  const raw = env.VITE_DISTRIBUTOR_API_BASE_URL;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value === "" ? null : value;
}

/** La integración solo existe cuando hay un backend configurado para ella. */
export function isDistributorIntegrationEnabled(): boolean {
  return resolveDistributorApiBaseUrl() !== null;
}

export function distributorUrl(path: string): string {
  const baseUrl = resolveDistributorApiBaseUrl() ?? "";
  return baseUrl.endsWith("/") ? `${baseUrl.slice(0, -1)}${path}` : `${baseUrl}${path}`;
}

type FetchImpl = typeof fetch;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function serverError(data: unknown): string | null {
  return isRecord(data) && typeof data.error === "string" ? data.error : null;
}

/**
 * Identificador opaco de sesión que devuelve el backend.
 *
 * El backend lo deriva del hash del token de sesión (derivación de un solo
 * sentido, con separación de dominio): es estable durante la vida de la
 * sesión, distinto en cada login y en cada cuenta, y NO es una credencial.
 * Es la PRUEBA de continuidad que usa el checkout del canal distribuidor.
 *
 * Si el servidor no lo envía, el resultado lo lleva como AUSENTE (`null`):
 * NUNCA se fabrica un sustituto (ni con el descuento ni con el
 * vencimiento), porque sin ese identificador la continuidad de la sesión no
 * está demostrada.
 */
function parseSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  /* Un identificador opaco no lleva espacios: un valor con espacios no es
     un identificador de sesión y no puede probar continuidad. */
  if (/\s/.test(trimmed)) return null;
  return trimmed;
}

async function distributorFetch(
  path: string,
  init: RequestInit,
  fetchImpl: FetchImpl,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(distributorUrl(path), {
      ...init,
      credentials: "include",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** GET /session. 404 = backend no habilitado (nunca se afirma lo contrario). */
export async function fetchDistributorSession(
  fetchImpl: FetchImpl = fetch,
  timeoutMs = DISTRIBUTOR_TIMEOUT_MS,
): Promise<DistributorSessionResponse | { ok: false; unavailable: true }> {
  // Sin backend configurado no hay nada que consultar: cero solicitudes.
  if (!isDistributorIntegrationEnabled()) return { ok: false, unavailable: true };
  try {
    const response = await distributorFetch(
      "/api/distributor/session",
      { method: "GET", headers: { Accept: "application/json" } },
      fetchImpl,
      timeoutMs,
    );
    if (response.status === 404) return { ok: false, unavailable: true };
    const data = await readJson(response);
    if (!response.ok || !isRecord(data) || data.ok !== true) {
      return { ok: false, unavailable: true };
    }
    if (data.authenticated !== true) return { ok: true, authenticated: false };
    if (
      typeof data.discountPercent !== "number" ||
      !Number.isFinite(data.discountPercent) ||
      typeof data.expiresAt !== "string"
    ) {
      return { ok: false, unavailable: true };
    }
    return {
      ok: true,
      authenticated: true,
      discountPercent: data.discountPercent,
      expiresAt: data.expiresAt,
      /* El identificador de sesión viaja tal cual lo devuelve el backend; si
         no viene, queda ausente: la continuidad no está demostrada. */
      sessionId: parseSessionId(data.sessionId),
    };
  } catch {
    return { ok: false, unavailable: true };
  }
}

/**
 * POST /login. La contraseña vive solo en este argumento y en el cuerpo del
 * POST; no se persiste en ningún storage. Errores genéricos del servidor
 * (401 "Invalid credentials") nunca se distinguen por cuenta.
 */
export async function loginDistributor(
  cuit: string,
  password: string,
  fetchImpl: FetchImpl = fetch,
  timeoutMs = DISTRIBUTOR_TIMEOUT_MS,
): Promise<DistributorLoginResult> {
  if (!isDistributorIntegrationEnabled()) {
    return { kind: "error", error: { kind: "unavailable" } };
  }
  let response: Response;
  try {
    response = await distributorFetch(
      "/api/distributor/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...CSRF_HEADER },
        body: JSON.stringify({ cuit, password }),
      },
      fetchImpl,
      timeoutMs,
    );
  } catch {
    return { kind: "error", error: { kind: "network" } };
  }
  if (response.status === 404 || response.status === 503) {
    return { kind: "error", error: { kind: "unavailable" } };
  }
  const data = await readJson(response);
  if (response.ok && isRecord(data) && data.ok === true && data.authenticated === true) {
    if (
      typeof data.discountPercent === "number" &&
      Number.isFinite(data.discountPercent) &&
      typeof data.expiresAt === "string"
    ) {
      return {
        kind: "ok",
        discountPercent: data.discountPercent,
        expiresAt: data.expiresAt,
        /* El identificador de sesión viaja tal cual lo devuelve el backend;
           si no viene, queda ausente: la continuidad no está demostrada. */
        sessionId: parseSessionId(data.sessionId),
      };
    }
    return { kind: "error", error: { kind: "unavailable" } };
  }
  if (response.status === 429) return { kind: "error", error: { kind: "rate-limited" } };
  if (response.status === 400) {
    return {
      kind: "error",
      error: { kind: serverError(data) === "Invalid CUIT" ? "invalid-cuit" : "invalid-request" },
    };
  }
  if (response.status === 401) return { kind: "error", error: { kind: "invalid-credentials" } };
  return { kind: "error", error: { kind: "unavailable" } };
}

/** Resultado del cierre de sesión: sólo el servidor confirma la revocación. */
export type DistributorLogoutResult = { kind: "ok" } | { kind: "unavailable" };

/** POST /logout. La revocación la confirma el servidor: si la red falla, el
 *  frontend NO puede anunciar un cierre de sesión exitoso ni limpiar el
 *  estado local, porque la sesión del servidor sigue viva. */
export async function logoutDistributor(
  fetchImpl: FetchImpl = fetch,
  timeoutMs = DISTRIBUTOR_TIMEOUT_MS,
): Promise<DistributorLogoutResult> {
  if (!isDistributorIntegrationEnabled()) return { kind: "ok" };
  try {
    const response = await distributorFetch(
      "/api/distributor/logout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...CSRF_HEADER },
        body: JSON.stringify({}),
      },
      fetchImpl,
      timeoutMs,
    );
    return response.ok ? { kind: "ok" } : { kind: "unavailable" };
  } catch {
    // Sin red no hay revocación confirmada: el cierre NO se da por hecho.
    return { kind: "unavailable" };
  }
}

export type DistributorQuoteResult =
  | { kind: "ok"; quote: DistributorQuoteResponse }
  | { kind: "session-expired" }
  | { kind: "unavailable" }
  | { kind: "error" };

/**
 * GET /quote: ÚNICA fuente del precio distribuidor mostrado. El frontend no
 * deriva importes desde el porcentaje: si el servidor no responde, no hay
 * precio distribuidor para mostrar.
 */
export async function fetchDistributorQuote(
  productId: string,
  qty: number,
  fetchImpl: FetchImpl = fetch,
  timeoutMs = DISTRIBUTOR_TIMEOUT_MS,
): Promise<DistributorQuoteResult> {
  if (!isDistributorIntegrationEnabled()) return { kind: "unavailable" };
  const query = new URLSearchParams({ productId, qty: String(qty) });
  let response: Response;
  try {
    response = await distributorFetch(
      `/api/distributor/quote?${query.toString()}`,
      { method: "GET", headers: { Accept: "application/json" } },
      fetchImpl,
      timeoutMs,
    );
  } catch {
    return { kind: "unavailable" };
  }
  if (response.status === 401) return { kind: "session-expired" };
  if (response.status === 404 || response.status === 503) return { kind: "unavailable" };
  const data = await readJson(response);
  if (!response.ok || !isRecord(data) || data.ok !== true || !Array.isArray(data.lines)) {
    return { kind: "error" };
  }
  const line = data.lines[0];
  if (!isRecord(line) || typeof line.productId !== "string") return { kind: "error" };
  /* La cotización es SÓLO del producto y la cantidad pedidos: una respuesta
     bien formada para otro producto (o otra cantidad) no se aplica, porque se
     cachearía bajo la clave pedida y mostraría el precio de otro artículo. */
  if (line.productId !== productId) return { kind: "error" };
  if (typeof line.qty === "number" && line.qty !== qty) return { kind: "error" };
  const amount = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    kind: "ok",
    quote: {
      ok: true,
      currency: "ARS",
      discountPercent:
        typeof data.discountPercent === "number" && Number.isFinite(data.discountPercent)
          ? data.discountPercent
          : 0,
      lines: [
        {
          productId: line.productId,
          qty: typeof line.qty === "number" ? line.qty : qty,
          listUnitPrice: amount(line.listUnitPrice),
          netUnitPrice: amount(line.netUnitPrice),
          netSubtotal: amount(line.netSubtotal),
        },
      ],
      listTotal: amount(data.listTotal),
      netTotal: amount(data.netTotal),
    },
  };
}

export type DistributorSubmitResult = SubmitResult | { kind: "sessionExpired"; error: string };

/** Límite de longitud de la referencia (mismo límite que el servidor). */
const MAX_RESOLUTION_REFERENCE_LENGTH = 128;

function isResolutionStatus(value: unknown): value is DistributorResolutionStatus {
  return typeof value === "string" && (RESOLUTION_STATUSES as readonly string[]).includes(value);
}

/**
 * GET /api/distributor/order-resolution?reference=...
 *
 * Consulta de SOLO LECTURA del estado de la conciliación administrativa de
 * UNA referencia. La identidad la pone la SESIÓN VIGENTE (cookie): el
 * navegador nunca envía un CUIT ni un id de distribuidor, y el servidor
 * deriva el localizador desde la sesión, de modo que la referencia de otra
 * cuenta le resulta simplemente desconocida.
 *
 * Esta consulta NUNCA crea un pedido, nunca reenvía un correo y nunca
 * autoriza por sí sola un envío: sólo informa el estado.
 *
 * Reglas de lectura:
 *  - sin backend configurado no hay solicitud (cero peticiones);
 *  - 401 → la sesión no es válida (`session-expired`);
 *  - 404/503 → la ruta está desactivada o el servicio no responde
 *    (`unavailable`), NO es una resolución;
 *  - cualquier otro fallo, cuerpo inválido o eco de referencia distinto al
 *    consultado → `error`: nunca se interpreta como resolución válida.
 */
export async function fetchDistributorOrderResolution(
  reference: string,
  fetchImpl: FetchImpl = fetch,
  timeoutMs = DISTRIBUTOR_TIMEOUT_MS,
): Promise<DistributorResolutionResult> {
  const trimmed = typeof reference === "string" ? reference.trim() : "";
  if (trimmed === "" || trimmed.length > MAX_RESOLUTION_REFERENCE_LENGTH) {
    return { kind: "error" };
  }
  // Sin backend configurado no hay nada que consultar: cero solicitudes.
  if (!isDistributorIntegrationEnabled()) return { kind: "unavailable" };

  const query = new URLSearchParams({ reference: trimmed });
  let response: Response;
  try {
    response = await distributorFetch(
      `/api/distributor/order-resolution?${query.toString()}`,
      { method: "GET", headers: { Accept: "application/json" } },
      fetchImpl,
      timeoutMs,
    );
  } catch {
    return { kind: "error" };
  }

  if (response.status === 401) return { kind: "session-expired" };
  if (response.status === 404 || response.status === 503) return { kind: "unavailable" };

  const data = await readJson(response);
  if (!response.ok || !isRecord(data) || data.ok !== true) return { kind: "error" };
  /* El eco del servidor debe ser EXACTAMENTE la referencia consultada: una
     respuesta de otra referencia no es confiable y no se aplica. */
  if (data.reference !== trimmed) return { kind: "error" };
  if (!isResolutionStatus(data.status)) return { kind: "error" };

  const decidedAt = typeof data.decidedAt === "string" && !Number.isNaN(Date.parse(data.decidedAt))
    ? data.decidedAt
    : null;

  const resolution: DistributorResolutionResponse = {
    ok: true,
    reference: trimmed,
    status: data.status,
    decidedAt,
  };
  return { kind: "ok", resolution };
}

function parseRetryAfterSeconds(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) && seconds <= 86400 ? seconds : null;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    const diff = parsed - Date.now();
    if (diff > 0 && diff <= 86400_000) return Math.ceil(diff / 1000);
  }
  return null;
}

/**
 * POST /api/distributor/orders con la sesión (cookie) y Turnstile.
 * Sin `catalogId`: el alias `starvie-distributor` es solo del servidor y el
 * cuerpo admite únicamente contact/lines/idempotencyKey/turnstileToken.
 * Misma clasificación de resultados que el checkout público, más
 * `sessionExpired` (401): jamás se degrada en silencio a pedido público.
 */
export async function submitDistributorOrder(
  payload: OrderPayload,
  options: { fetchImpl?: FetchImpl; timeoutMs?: number; turnstileToken?: string } = {},
): Promise<DistributorSubmitResult> {
  const { fetchImpl = fetch, timeoutMs = DISTRIBUTOR_TIMEOUT_MS, turnstileToken } = options;
  // Inalcanzable con la UI (sin backend no hay sesión), pero nunca se envía
  // un pedido distribuidor sin endpoint configurado.
  if (!isDistributorIntegrationEnabled()) {
    return { kind: "unknown", error: "El acceso para distribuidores no está configurado en este entorno." };
  }
  let response: Response;
  try {
    response = await distributorFetch(
      "/api/distributor/orders",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...CSRF_HEADER },
        body: JSON.stringify({
          contact: payload.contact,
          lines: payload.lines,
          idempotencyKey: payload.idempotencyKey,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      },
      fetchImpl,
      timeoutMs,
    );
  } catch {
    return { kind: "unknown", error: "Sin conexión con el servidor. Reintentá." };
  }

  const data = await readJson(response);

  if (response.status === 401) {
    return {
      kind: "sessionExpired",
      error: "Tu sesión de distribuidor venció. Volvé a ingresar para enviar el pedido con tu descuento.",
    };
  }
  if (!response.ok) {
    if (response.status === 409) {
      return { kind: "conflict", error: serverError(data) ?? "Error 409 al enviar el pedido." };
    }
    if (response.status === 429) {
      const retryAfter = parseRetryAfterSeconds(response.headers.get("Retry-After"));
      return retryAfter !== null
        ? { kind: "rateLimited", error: `Demasiadas solicitudes. Reintentá en ${retryAfter}s.`, retryAfter }
        : { kind: "rateLimited", error: "Demasiadas solicitudes. Reintentá más tarde.", retryAfter: 60 };
    }
    if (response.status === 502) {
      if (isRecord(data) && data.status === "failed" && typeof data.orderId === "string" && data.orderId.trim() !== "") {
        return { kind: "failed", orderId: data.orderId };
      }
      return { kind: "unknown", error: "No se pudo confirmar el estado del pedido. Consultalo con la misma referencia." };
    }
    /* 503 de Turnstile: la verificación no estuvo disponible (Siteverify
       inalcanzable o secreto ausente) y el backend NO creó ningún pedido.
       No es un resultado incierto: se pide un token nuevo y se reintenta
       con la MISMA clave y el MISMO payload. Un 503 que no venga de
       Turnstile sigue siendo incierto (no se puede afirmar que no se
       creó un pedido). */
    if (response.status === 503 && serverError(data) === "Turnstile verification unavailable") {
      return {
        kind: "verificationRequired",
        error: "La verificación de seguridad no pudo completarse en el servidor. Intentá de nuevo para continuar con el mismo pedido.",
      };
    }
    if (response.status === 503 || response.status === 404) {
      return { kind: "unknown", error: "Servicio no disponible. Reintentá." };
    }
    const error = serverError(data);
    if (
      (response.status === 400 && error === "Turnstile token is required") ||
      (response.status === 403 && error === "Turnstile verification failed")
    ) {
      return {
        kind: "verificationRequired",
        error: "La verificación de seguridad venció o falló. Completala de nuevo para continuar con el mismo pedido.",
      };
    }
    if (response.status >= 400 && response.status < 500) {
      return { kind: "validation", error: error ?? `Error ${response.status} al enviar el pedido.` };
    }
    return { kind: "unknown", error: `Error del servidor (${response.status}). Reintentá.` };
  }

  if (!isRecord(data) || typeof data.orderId !== "string" || data.orderId.trim() === "") {
    return { kind: "unknown", error: "Respuesta inválida del servidor." };
  }
  const orderId = data.orderId;
  if (response.status === 202) {
    return {
      kind: "processing",
      orderId,
      nextRetryAt: typeof data.nextRetryAt === "number" ? data.nextRetryAt : undefined,
    };
  }
  if (response.status === 200 || response.status === 201) {
    if (data.status === "completed") return { kind: "completed", orderId };
    if (data.status === "processing" || data.status === "accepted") {
      return {
        kind: "processing",
        orderId,
        nextRetryAt: typeof data.nextRetryAt === "number" ? data.nextRetryAt : undefined,
      };
    }
    return { kind: "unknown", error: "Respuesta ambigua del servidor." };
  }
  return { kind: "unknown", error: "Respuesta inesperada del servidor." };
}
