/**
 * Formato de precio para la presentación editorial del catálogo: la firma de
 * precio de las páginas y el bloque de precio de la ficha.
 *
 * No reemplaza `formatPrice` (src/commerce/money.ts): el carrito y el
 * checkout conservan su formato de moneda actual. Este formato omite los
 * centavos innecesarios (372.000 → "372.000") y conserva los decimales
 * significativos (1.234,5).
 */
const displayFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Importe sin moneda: "372.000" o "1.234,5". */
export function formatDisplayAmount(value: number): string {
  if (!Number.isFinite(value)) return "";
  return displayFormatter.format(value);
}

/** Importe con el signo de moneda: "$ 372.000". */
export function formatDisplayPrice(value: number): string {
  const amount = formatDisplayAmount(value);
  return amount ? `$ ${amount}` : "";
}
