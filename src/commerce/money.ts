const formatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 320 → "320,00 $". El valor siempre llega como número desde el JSON generado. */
export function formatPrice(value: number): string {
  return `${formatter.format(value)} $`;
}
