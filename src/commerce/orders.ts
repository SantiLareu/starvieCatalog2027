/**
 * Servicio de pedidos (frontend): construcción del payload y envío.
 *
 * El frontend NUNCA manda precios como autoridad: solo identidad + cantidad.
 * El Worker futuro recalcula precio/disponibilidad contra el catálogo vigente.
 */
import type { PresentedLine } from "./types";

export const ORDERS_ENDPOINT = "/api/orders";
export const ORDERS_TIMEOUT_MS = 15_000;
export const NOTES_MAX_LENGTH = 500;

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

/** Clave estable por intento de pedido. Nueva solo ante pedido nuevo o éxito previo. */
export function newIdempotencyKey(): string {
  const random = (globalThis as { crypto?: Crypto }).crypto;
  if (random && typeof random.randomUUID === "function") return random.randomUUID();
  return `order-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
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
 * disponible=true) y cantidades enteras >= 1. Sin precio/subtotal/total.
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

export type SubmitResult =
  | { ok: true; orderId: string | null }
  | { ok: false; error: string };

type SubmitOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  endpoint?: string;
};

/** POST /api/orders con timeout. No incluye secretos ni lógica de email. */
export async function submitOrder(payload: OrderPayload, options: SubmitOptions = {}): Promise<SubmitResult> {
  const {
    fetchImpl = fetch,
    timeoutMs = ORDERS_TIMEOUT_MS,
    endpoint = ORDERS_ENDPOINT,
  } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      return { ok: false, error: "Respuesta inválida del servidor." };
    }
    if (!response.ok) {
      const message =
        data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : `Error ${response.status} al enviar el pedido.`;
      return { ok: false, error: message };
    }
    const orderId =
      data && typeof data === "object" && "orderId" in data && typeof (data as { orderId: unknown }).orderId === "string"
        ? (data as { orderId: string }).orderId
        : null;
    return { ok: true, orderId };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "El envío tardó demasiado. Reintentá." };
    }
    return { ok: false, error: "Sin conexión con el servidor. Reintentá." };
  } finally {
    clearTimeout(timer);
  }
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
