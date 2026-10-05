import type { CommerceProduct } from "./types";

/** También protege catálogos antiguos con 0, y llamadas fuera del importador. */
export function hasPrice(product: CommerceProduct): product is CommerceProduct & { precio: number } {
  return typeof product.precio === "number" && Number.isFinite(product.precio) && product.precio > 0;
}

/** Catálogo mayorista: el precio pendiente no impide tomar un pedido. */
export function isPurchasable(product: CommerceProduct): boolean {
  return product.disponible;
}
