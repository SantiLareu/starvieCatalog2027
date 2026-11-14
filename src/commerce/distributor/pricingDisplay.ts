/**
 * Modelo de presentación Lista vs Distribuidor.
 *
 * Regla de autoridad: el importe distribuidor SOLO existe si vino de
 * GET /api/distributor/quote. Este módulo nunca multiplica el precio lista
 * por el porcentaje: un descuento calculado en el navegador no está
 * autorizado. El porcentaje que se muestra es el que el servidor ató a la
 * sesión autenticada; el importe final lo recalcula el servidor al pedir.
 */
import type { DistributorQuoteLine, DistributorQuoteState } from "./types";

export type DistributorPriceDisplay =
  | { kind: "hidden" }
  | { kind: "loading"; discountPercent: number }
  | { kind: "unavailable"; discountPercent: number }
  | { kind: "pending"; discountPercent: number }
  | {
      kind: "ready";
      discountPercent: number;
      /** Importe neto unitario devuelto por el servidor (null = a confirmar). */
      netUnitPrice: number | null;
    };

export function distributorPriceDisplay(input: {
  authenticated: boolean;
  discountPercent: number | null;
  quoteStatus: "idle" | "loading" | "ready" | "session-expired" | "unavailable" | "error";
  line: DistributorQuoteLine | null;
}): DistributorPriceDisplay {
  if (!input.authenticated || input.discountPercent == null) return { kind: "hidden" };
  const discountPercent = input.discountPercent;
  if (input.quoteStatus === "ready" && input.line) {
    return { kind: "ready", discountPercent, netUnitPrice: input.line.netUnitPrice };
  }
  if (input.quoteStatus === "unavailable" || input.quoteStatus === "error") {
    return { kind: "unavailable", discountPercent };
  }
  if (input.quoteStatus === "session-expired") return { kind: "pending", discountPercent };
  return { kind: "loading", discountPercent };
}

/** Texto del badge de descuento, p. ej. "20% de descuento". */
export function discountBadgeLabel(discountPercent: number): string {
  return `${discountPercent}% de descuento`;
}

/**
 * Precio distribuidor de UNA línea del carrito.
 *
 * El importe nunca se deriva del precio lista ni del porcentaje: sale del
 * precio unitario que el servidor cotizó para la cantidad EXACTA de la línea
 * (neto = línea cotizada × cantidad de la línea). Si la cotización no
 * corresponde a esa línea o cantidad, o el subtotal del servidor no cuadra
 * con el unitario, la línea falla cerrada: no se muestra ningún importe.
 */
export type DistributorLinePricing =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "pending" }
  | { kind: "ready"; netUnitPrice: number; netSubtotal: number };

/** Precisión de la moneda: centavos (no pesos enteros aproximados). */
const CENTS = 100;

/** Redondeo a centavos: la presentación y la comparación usan la misma escala.
 *
 * El borde de medio centavo se decide con un ajuste RELATIVO de una ULP: en
 * binario, 297600.005 llega como 29760000.499999996 y un redondeo ingenuo lo
 * baja al centavo anterior, con lo que el subtotal local deja de coincidir
 * con el del servidor por un centavo y una cotización válida se rechaza como
 * no disponible. El ajuste sólo mueve valores que YA están en el borde (error
 * de representación): un importe claramente por debajo del medio centavo
 * redondea igual que antes. */
export function roundToCents(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  const scaled = value * CENTS;
  const nudged = scaled >= 0 ? scaled * (1 + Number.EPSILON) : scaled * (1 - Number.EPSILON);
  return Math.round(nudged) / CENTS;
}

export function distributorLinePricing(input: {
  authenticated: boolean;
  /** Producto de la línea del carrito: la cotización debe ser de ÉSTE. */
  productId: string;
  qty: number;
  quote: DistributorQuoteState | null;
}): DistributorLinePricing {
  if (!input.authenticated) return { kind: "hidden" };
  const quote = input.quote;
  if (!quote) return { kind: "loading" };
  if (
    quote.status === "unavailable" ||
    quote.status === "error" ||
    quote.status === "session-expired"
  ) {
    return { kind: "unavailable" };
  }
  if (quote.status !== "ready") return { kind: "loading" };
  const line = quote.line;
  if (!line) return { kind: "unavailable" };
  // Una cotización de otro producto o de otra cantidad no es de esta línea:
  // se descarta (una cotización vieja nunca se aplica).
  if (line.productId !== input.productId) return { kind: "unavailable" };
  if (line.qty !== input.qty) return { kind: "loading" };
  const netUnitPrice = line.netUnitPrice;
  if (netUnitPrice == null) return { kind: "pending" };
  if (!Number.isFinite(netUnitPrice) || netUnitPrice < 0) return { kind: "unavailable" };
  const netSubtotal = roundToCents(netUnitPrice * input.qty);
  if (!Number.isFinite(netSubtotal) || netSubtotal < 0) return { kind: "unavailable" };
  // Cuando el servidor envía el subtotal, tiene que coincidir al centavo:
  // un peso de diferencia ya es un importe que el servidor no autorizó.
  if (line.netSubtotal != null) {
    const serverSubtotal = roundToCents(line.netSubtotal);
    if (!Number.isFinite(serverSubtotal) || serverSubtotal < 0) return { kind: "unavailable" };
    if (serverSubtotal !== netSubtotal) return { kind: "unavailable" };
  }
  return { kind: "ready", netUnitPrice, netSubtotal };
}

/** Rótulo visible de una línea sin importe distribuidor (falla cerrada). */
export function distributorPendingLabel(kind: "loading" | "pending" | "unavailable"): string {
  if (kind === "unavailable") return "No disponible";
  if (kind === "pending") return "A confirmar";
  return "Consultando…";
}

/** Rótulo de una línea sin importe: null cuando la línea ya tiene precio. */
export function distributorLinePendingLabel(pricing: DistributorLinePricing): string | null {
  if (pricing.kind === "ready") return null;
  if (pricing.kind === "hidden") return null;
  return distributorPendingLabel(pricing.kind);
}

const symbolFirstFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Importe con el signo de moneda DELANTE: "$ 1.488.000,00".
 *
 * El símbolo y la cifra viajan juntos (el CSS impide el corte de línea), así
 * el "$" nunca queda solo en otra línea. `formatPrice` (money.ts) mantiene el
 * formato con el símbolo atrás para el resto del catálogo: no se cambia.
 */
export function formatAmountWithSymbol(value: number): string {
  if (!Number.isFinite(value)) return "";
  return `$ ${symbolFirstFormatter.format(value)}`;
}
