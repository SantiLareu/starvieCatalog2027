/**
 * Carrito puro (sin React): operaciones sin tope de inventario, reconciliación
 * contra el catálogo vigente y persistencia mínima (identidad + cantidad).
 *
 * El precio y la disponibilidad NUNCA se leen de localStorage: siempre del
 * catálogo en memoria, que es la copia vigente de generated/products.json.
 * Una línea es válida si el producto existe y disponible === true.
 * La cantidad no tiene máximo asociado a inventario (mínimo 1).
 */
import type { CartLine, CartNotice, CommerceProduct, PresentedLine } from "./types";

export const CART_STORAGE_KEY = "starvie-cart-v1";

function normalizeQty(value: unknown): number | null {
  const qty = Number(value);
  if (!Number.isFinite(qty)) return null;
  return Math.max(1, Math.floor(qty));
}

/** Solo identidad + cantidad. Precio/disponibilidad guardados se descartan. */
export function sanitizeLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const lines: CartLine[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    if (typeof record.productId !== "string" || record.productId.trim() === "") continue;
    const qty = normalizeQty(record.qty ?? record.quantity);
    if (qty == null) continue;
    const productId = record.productId;
    const existing = lines.find((line) => line.productId === productId);
    if (existing) existing.qty += qty;
    else lines.push({ productId, qty });
  }
  return lines;
}

export function loadCart(storage: Pick<Storage, "getItem"> | null | undefined): CartLine[] {
  try {
    const raw = storage?.getItem(CART_STORAGE_KEY);
    if (raw == null) return [];
    return sanitizeLines(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveCart(
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  lines: CartLine[],
): void {
  try {
    if (lines.length === 0) storage?.removeItem(CART_STORAGE_KEY);
    else storage?.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Almacenamiento no disponible: el carrito sigue vivo en memoria.
  }
}

/** Agrega qty unidades sin límite de inventario. */
export function addLine(lines: CartLine[], productId: string, qty: number): CartLine[] {
  const wanted = normalizeQty(qty);
  if (wanted == null) return lines;
  const index = lines.findIndex((line) => line.productId === productId);
  if (index < 0) return [...lines, { productId, qty: wanted }];
  return lines.map((line, i) => (i === index ? { ...line, qty: line.qty + wanted } : line));
}

/** Fija cantidad con mínimo 1 y sin máximo. qty <= 0 elimina la línea. */
export function setLineQty(lines: CartLine[], productId: string, qty: number): CartLine[] {
  if (qty <= 0) return removeLine(lines, productId);
  const index = lines.findIndex((line) => line.productId === productId);
  if (index < 0) return lines;
  const next = Math.max(1, Math.floor(qty));
  return lines.map((line, i) => (i === index ? { ...line, qty: next } : line));
}

export function removeLine(lines: CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

export function cartUnits(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

export function cartTotal(lines: CartLine[], byId: Map<string, CommerceProduct>): number {
  return lines.reduce((sum, line) => {
    const product = byId.get(line.productId);
    return sum + (product ? product.precio * line.qty : 0);
  }, 0);
}

/** Enriquece líneas con producto vigente y subtotal (precio ACTUAL). */
export function presentLines(lines: CartLine[], byId: Map<string, CommerceProduct>): PresentedLine[] {
  const out: PresentedLine[] = [];
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product || !product.disponible) continue;
    out.push({ line, product, subtotal: product.precio * line.qty });
  }
  return out;
}

/**
 * Reconcilia el carrito contra un catálogo nuevo:
 * - producto inexistente → se retira (aviso "removed");
 * - disponible false → se retira (aviso "out-of-stock");
 * - el precio nuevo siempre gana (se usa el vigente, sin snapshots),
 *   en silencio: los cambios de precio no generan avisos.
 * La cantidad nunca se reduce: no hay tope de inventario.
 */
export function reconcileLines(
  lines: CartLine[],
  byId: Map<string, CommerceProduct>,
): { lines: CartLine[]; notices: CartNotice[] } {
  const next: CartLine[] = [];
  const notices: CartNotice[] = [];
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) {
      notices.push({ type: "removed", productId: line.productId, name: line.productId });
      continue;
    }
    if (!product.disponible) {
      notices.push({ type: "out-of-stock", productId: line.productId, name: product.nombre });
      continue;
    }
    next.push(line);
  }
  return { lines: next, notices };
}

/**
 * Redacción visible de un aviso de carrito (banner + toast).
 * Solo disponibilidad: no existen cantidades de inventario ni avisos de precio.
 */
export function formatNotice(notice: CartNotice): string {
  switch (notice.type) {
    case "removed":
      return `${notice.name} ya no está disponible y fue retirado del pedido.`;
    case "out-of-stock":
      return `${notice.name} se quedó sin stock y fue retirado del pedido.`;
  }
}
