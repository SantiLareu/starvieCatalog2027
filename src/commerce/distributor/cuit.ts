/**
 * Ayuda de formato CUIT/CUIL en el cliente.
 *
 * Es solo una pista de UX para detectar errores de tipeo antes de enviar:
 * la autoridad es el servidor (`isValidCuit` en distributor-store.js, mismo
 * algoritmo: prefijos 20/23/24/27/30/33/34, pesos módulo 11 y resto 1 sin
 * dígito verificador válido). Un CUIT que pasa acá puede ser rechazado igual
 * por el servidor, y eso se maneja como error de credenciales/formato.
 */

const CUIT_PREFIXES = new Set([20, 23, 24, 27, 30, 33, 34]);
const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Solo dígitos (acepta guiones y espacios como los tipea el usuario). */
export function normalizeCuitInput(raw: string): string {
  return raw.replace(/[\s-]+/g, "");
}

/** Formato progresivo 20-12345678-9 mientras se escribe. */
export function formatCuitInput(raw: string): string {
  const digits = normalizeCuitInput(raw).replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

/** true si el CUIT/CUIL tiene forma y dígito verificador válidos. */
export function hasValidCuitShape(raw: string): boolean {
  const digits = normalizeCuitInput(raw);
  if (!/^\d{11}$/.test(digits)) return false;
  if (!CUIT_PREFIXES.has(Number(digits.slice(0, 2)))) return false;
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(digits[index]) * CUIT_WEIGHTS[index];
  }
  const remainder = sum % 11;
  if (remainder === 1) return false;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  return checkDigit === Number(digits[10]);
}
