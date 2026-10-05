/**
 * Servicio de pedidos (frontend): construcción del payload y envío.
 *
 * El frontend NUNCA manda precios como autoridad: solo identidad + cantidad.
 * El Worker futuro recalcula precio/disponibilidad contra el catálogo vigente.
 *
 * Catálogo: "starvie". Endpoint de producción:
 *   https://api.real-step.com.ar/api/orders
 *
 * En desarrollo, VITE_API_BASE_URL anula la URL base sin exponer secretos.
 * Nunca se usa en producción: el modal usa submitOrder por defecto y los
 * errores reales se muestran tal cual.
 */
import type { PresentedLine } from "./types";

export const ORDERS_ENDPOINT = "/api/orders";
export const ORDERS_TIMEOUT_MS = 15_000;
export const NOTES_MAX_LENGTH = 500;

/** Identificador del catálogo que este cliente siempre envía. */
export const ORDERS_CATALOG_ID = "starvie";

/** URL base de producción para pedidos. */
export const ORDERS_PRODUCTION_API = "https://api.real-step.com.ar";

/** URL base en desarrollo (sin secretos); se anula con la variable de Vite. */
export function resolveApiBaseUrl(): string {
  if (
    typeof import.meta !== "undefined" &&
    "env" in import.meta &&
    typeof (import.meta as { env: Record<string, string> }).env.VITE_API_BASE_URL === "string"
  ) {
    return (import.meta as { env: Record<string, string> }).env.VITE_API_BASE_URL;
  }
  return ORDERS_PRODUCTION_API;
}

export type CheckoutContact = {
  name: string;
  legalName: string;
  email: string;
  phone?: string;
  province?: string;
  city?: string;
  address?: string;
  cuit?: string;
  notes?: string;
};

export type OrderLine = {
  productId: string;
  qty: number;
};

/**
 * Full OrderPayload — contact (required fields + optional) + lines + key.
 * Used verbatim by sessionStorage for same-tab retry.
 */
export type OrderPayload = {
  contact: {
    name: string;
    legalName: string;
    email: string;
    phone?: string;
    province?: string;
    city?: string;
    address?: string;
    cuit?: string;
    notes?: string;
  };
  lines: OrderLine[];
  idempotencyKey: string;
};

export type ContactErrors = Partial<
  Record<"name" | "legalName" | "email" | "phone" | "province" | "city" | "cuit" | "notes", string>
>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Stable idempotency key for a purchase attempt.
 * New only before a new order or after a successful prior completion.
 * Throws when crypto.randomUUID is unavailable — never falls back to Math.random.
 */
export function newIdempotencyKey(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  throw new Error("Secure random UUID generation unavailable");
}

export function validateContact(contact: CheckoutContact): ContactErrors {
  const errors: ContactErrors = {};
  if (contact.name.trim() === "") errors.name = "Ingresá tu nombre y apellido.";
  if (contact.legalName.trim() === "") errors.legalName = "Ingresá la razón social.";
  if (!EMAIL_PATTERN.test(contact.email.trim())) errors.email = "Ingresá un correo electrónico válido.";
  const cuit = (contact.cuit ?? "").trim();
  if (cuit !== "" && digitsOnly(cuit).length !== 11) {
    errors.cuit = "El CUIT debe tener 11 dígitos.";
  }
  if ((contact.notes ?? "").length > NOTES_MAX_LENGTH) {
    errors.notes = `Máximo ${NOTES_MAX_LENGTH} caracteres.`;
  }
  return errors;
}

/**
 * Construye el payload solo con líneas vigentes (presentadas: existen y
 * disponible=true, con o sin precio) y cantidades enteras >= 1.
 * Sin precio/subtotal/total en el payload.
 */
export function buildOrderPayload(
  presented: PresentedLine[],
  contact: CheckoutContact,
  idempotencyKey: string,
): OrderPayload | null {
  const lines: OrderLine[] = [];
  for (const { line, product } of presented) {
    if (!product || !product.disponible) continue;
    const qty = Math.floor(line.qty);
    if (!Number.isFinite(qty) || qty < 1) continue;
    lines.push({ productId: line.productId, qty });
  }
  if (lines.length === 0) return null;
  const payload: OrderPayload = {
    contact: {
      name: contact.name.trim(),
      legalName: contact.legalName.trim(),
      email: contact.email.trim(),
    },
    lines,
    idempotencyKey,
  };
  const phone = (contact.phone ?? "").trim();
  const province = (contact.province ?? "").trim();
  const city = (contact.city ?? "").trim();
  const address = (contact.address ?? "").trim();
  const cuit = (contact.cuit ?? "").trim();
  const notes = (contact.notes ?? "").trim();
  if (phone !== "") payload.contact.phone = phone;
  if (province !== "") payload.contact.province = province;
  if (city !== "") payload.contact.city = city;
  if (address !== "") payload.contact.address = address;
  if (cuit !== "") payload.contact.cuit = cuit;
  if (notes !== "") payload.contact.notes = notes;
  return payload;
}

/* ── Typed discriminated union for HTTP status classification ───────── */

/**
 * Discriminated union describing the outcome of a submitOrder call.
 *
 * - completed  — JSON body status:'completed' with valid orderId, HTTP 200/201.
 * - processing — JSON body status:'processing' or status:'accepted', HTTP 200/201/202.
 * - failed     — HTTP 502 with body status:'failed' and valid orderId.
 * - conflict   — HTTP 409 (idempotency key used with different request).
 * - rateLimited — HTTP 429 with Retry-After seconds.
 * - unknown    — Network/timeout/malformed 2xx/503/5xx with unknown outcome.
 * - validation — 4xx error from server.
 * - verificationRequired — no order was created; retry same key/payload with a fresh token.
 */
export type SubmitResult =
  | { kind: "completed";   orderId: string }
  | { kind: "processing";  orderId: string; nextRetryAt?: number }
  | { kind: "failed";      orderId: string | null }
  | { kind: "conflict";    error: string }
  | { kind: "rateLimited"; error: string; retryAfter: number }
  | { kind: "unknown";     error: string }
  | { kind: "verificationRequired"; error: string }
  | { kind: "validation";  error: string };

type SubmitOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  endpoint?: string;
  baseUrl?: string;
  turnstileToken?: string;
};

/** Parse a Retry-After header value into seconds; returns null on any failure. */
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
    if (diff > 0 && diff <= 86400_000) {
      return Math.ceil(diff / 1000);
    }
  }
  return null;
}

/** Classify a successful HTTP response body into a typed result. */
function parseSuccessResponse(data: unknown, httpStatus: number): SubmitResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { kind: "unknown", error: "Respuesta inválida del servidor." };
  }

  const obj = data as Record<string, unknown>;

  // Must have a valid orderId string to be actionable
  if (!("orderId" in obj) || typeof obj.orderId !== "string" || obj.orderId.trim() === "") {
    return { kind: "unknown", error: "Respuesta inválida del servidor." };
  }

  const orderId = obj.orderId;
  const status = obj.status;

  // HTTP 202 is always processing (idempotent retry of existing order)
  if (httpStatus === 202) {
    return { kind: "processing", orderId, nextRetryAt: typeof obj.nextRetryAt === "number" ? obj.nextRetryAt : undefined };
  }

  // HTTP 200/201 — classify by body status
  if (httpStatus === 200 || httpStatus === 201) {
    if (status === "completed") {
      return { kind: "completed", orderId };
    }
    if (status === "processing" || status === "accepted") {
      return { kind: "processing", orderId, nextRetryAt: typeof obj.nextRetryAt === "number" ? obj.nextRetryAt : undefined };
    }
    // 200/201 with statusless body or unexpected status — fail-closed
    return { kind: "unknown", error: "Respuesta ambigua del servidor." };
  }

  // Other 2xx — treat as unknown
  return { kind: "unknown", error: "Respuesta inesperada del servidor." };
}

/**
 * POST /api/orders with catalogId, timeout, and strict status classification.
 *
 * Status handling (backend contract):
 * - 201 → new order: body status 'accepted' → processing
 * - 200 → existing order processed: body status 'completed' → completed
 * - 202 → existing order processing: always processing (idempotent retry)
 * - 409 → conflict (idempotency key used with different request)
 * - 429 → rate limited; parse Retry-After (seconds or HTTP-date, bounded 24h)
 * - 502 → failed (terminal); backend may include orderId in body
 * - 503 → retryable unknown / service unavailable
 * - 400/401/403 → terminal client errors (validation)
 * - 5xx → retryable unknown
 * - timeout / network → retryable unknown
 */
export async function submitOrder(
  payload: OrderPayload,
  options: SubmitOptions = {},
): Promise<SubmitResult> {
  const {
    fetchImpl = fetch,
    timeoutMs = ORDERS_TIMEOUT_MS,
    endpoint = ORDERS_ENDPOINT,
    baseUrl = resolveApiBaseUrl(),
    turnstileToken,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = baseUrl.endsWith("/")
      ? `${baseUrl.slice(0, -1)}${endpoint}`
      : `${baseUrl}${endpoint}`;

    const body = {
      catalogId: ORDERS_CATALOG_ID,
      ...payload,
      ...(turnstileToken ? { turnstileToken } : {}),
    };

    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // Error statuses still have meaning when an intermediary returns no JSON.
      // A successful response without a valid body remains uncertain.
      if (response.ok) {
        return { kind: "unknown", error: "Respuesta inválida del servidor." };
      }
    }

    /* ── Error responses ────────────────────────────────────────── */

    if (!response.ok) {
      // 409 Conflict
      if (response.status === 409) {
        if (data && typeof data === "object" && !Array.isArray(data) && "error" in data && typeof (data as Record<string, unknown>).error === "string") {
          return { kind: "conflict", error: (data as Record<string, unknown>).error as string };
        }
        return { kind: "conflict", error: `Error 409 al enviar el pedido.` };
      }

      // 429 Rate Limited — parse Retry-After
      if (response.status === 429) {
        const retryAfter = parseRetryAfterSeconds(response.headers.get("Retry-After"));
        if (retryAfter !== null) {
          return { kind: "rateLimited", error: `Demasiadas solicitudes. Reintentá en ${retryAfter}s.`, retryAfter };
        }
        return { kind: "rateLimited", error: "Demasiadas solicitudes. Reintentá más tarde.", retryAfter: 60 };
      }

      // 502 is terminal only when the API confirms a failed order. A gateway
      // error or incomplete body cannot prove that the order failed.
      if (response.status === 502) {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const body = data as Record<string, unknown>;
          if (body.status === "failed" && typeof body.orderId === "string" && body.orderId.trim() !== "") {
            return { kind: "failed", orderId: body.orderId };
          }
        }
        return { kind: "unknown", error: "No se pudo confirmar el estado del pedido. Consultalo con la misma referencia." };
      }

      // 503 Service Unavailable — retryable unknown
      if (response.status === 503) {
        return { kind: "unknown", error: "Servicio no disponible. Reintentá." };
      }

      // The Worker checks an existing idempotent order before Turnstile. These
      // exact errors mean no new order was created and a fresh token is needed.
      const serverError = data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>).error : null;
      if ((response.status === 400 && serverError === "Turnstile token is required") ||
          (response.status === 403 && serverError === "Turnstile verification failed")) {
        return { kind: "verificationRequired", error: "La verificación de seguridad venció o falló. Completala de nuevo para continuar con el mismo pedido." };
      }

      // Other 4xx → validation (client error)
      if (response.status >= 400 && response.status < 500) {
        if (data && typeof data === "object" && !Array.isArray(data) && "error" in data && typeof (data as Record<string, unknown>).error === "string") {
          return { kind: "validation", error: (data as Record<string, unknown>).error as string };
        }
        return { kind: "validation", error: `Error ${response.status} al enviar el pedido.` };
      }

      // Generic 5xx → unknown (retryable)
      if (response.status >= 500) {
        return { kind: "unknown", error: `Error del servidor (${response.status}). Reintentá.` };
      }

      // Fallback
      return { kind: "unknown", error: httpErrorMessage(data, response.status) };
    }

    /* ── Success responses ──────────────────────────────────────── */
    return parseSuccessResponse(data, response.status);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { kind: "unknown", error: "El envío tardó demasiado. Reintentá." };
    }
    return { kind: "unknown", error: "Sin conexión con el servidor. Reintentá." };
  } finally {
    clearTimeout(timer);
  }
}

/** Classify an HTTP error body for user-facing messages. */
function httpErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if ("error" in obj && typeof obj.error === "string") {
      return obj.error as string;
    }
  }
  return `Error ${status} al enviar el pedido.`;
}

/**
 * Stub explícito solo para desarrollo/tests mientras no exista el backend.
 * Nunca se usa en producción: el modal usa submitOrder por defecto y los
 * errores reales se muestran tal cual.
 */
export function createMockSubmitOrder(result: SubmitResult, delayMs = 0): typeof submitOrder {
  return async () =>
    new Promise<SubmitResult>((resolve) => {
      setTimeout(() => resolve(result), delayMs);
    });
}
