/**
 * Contexto vivo del intento de pedido — SOLO en memoria.
 *
 * El contrato de sesión actual del backend de distribuidores NO expone un
 * identificador de cuenta: sólo `status`, `discountPercent` y `expiresAt`.
 * El descuento y el vencimiento NO distinguen a un distribuidor de otro (dos
 * cuentas pueden tener el mismo 20 % y la misma expiración), así que no se
 * usan como identidad.
 *
 * La única señal disponible sin inventar identificadores es la CONTINUIDAD
 * LOCAL: si el objeto de autenticación en memoria sigue siendo exactamente el
 * mismo, la sesión local no cambió. Esto es una INDICACIÓN DE CONTINUIDAD
 * LOCAL, NO una prueba criptográfica de que el servidor siga autenticando a
 * la misma cuenta: el backend sigue siendo la autoridad de sesión, cuenta,
 * descuento e importes.
 *
 * Reglas (S3/S4/S5):
 *  - El canal (público / distribuidor) se persiste en el registro del
 *    intento; el contexto de la cuenta NO se persiste nunca.
 *  - La prueba viva es una referencia a un objeto: no es un id de cuenta, no
 *    es un token, no se serializa y no viaja al backend.
 *  - Un intento sin canal (registro heredado) NO se adivina: no se reenvía por
 *    ningún canal; se conserva para la resolución explícita.
 *  - El canal distribuidor EXIGE una prueba viva no nula: `null` nunca
 *    demuestra continuidad (`null === null` no autoriza nada).
 *  - La vinculación es única e inmutable: el contexto de un intento se fija
 *    al crearlo y ningún re-registro lo reemplaza.
 *  - Ante la pérdida de la prueba, el estado es INCERTO: se bloquea el
 *    reenvío y se conserva el registro (nunca se borra, rota ni degrada a
 *    pedido público).
 */
export type OrderAttemptChannel = "public" | "distributor";

/**
 * Contexto vivo de un intento. `distributorProof` es el objeto exacto de
 * autenticación (identidad de objeto) vigente cuando se creó el intento.
 * `null` significa "sin prueba viva": NO autoriza ningún reenvío por el
 * canal distribuidor.
 *
 * El objeto que se guarda y se devuelve está CONGELADO en runtime (la
 * referencia a la prueba se conserva exacta: el objeto de autenticación no se
 * congela ni se modifica).
 */
export type AttemptLiveContext = {
  channel: OrderAttemptChannel;
  distributorProof: object | null;
};

/* Registro en memoria: clave de idempotencia → contexto vivo. */
const contexts = new Map<string, AttemptLiveContext>();

/**
 * Vincula el contexto vivo de un intento. La vinculación es ÚNICA: si la
 * clave ya está vinculada, el registro se ignora (el contexto original manda).
 * Se guarda una copia propia e inmutable: el llamador no puede mutar lo que
 * quedó vinculado. La referencia de la prueba se conserva exacta (su
 * identidad es la señal de continuidad).
 */
export function rememberAttemptContext(
  idempotencyKey: string,
  context: AttemptLiveContext,
): void {
  if (!idempotencyKey) return;
  if (contexts.has(idempotencyKey)) return;
  contexts.set(
    idempotencyKey,
    Object.freeze({
      channel: context.channel,
      distributorProof: context.distributorProof,
    }),
  );
}

/** Contexto vivo de un intento (congelado), o null si no hay prueba en memoria. */
export function getAttemptContext(
  idempotencyKey: string,
): AttemptLiveContext | null {
  return contexts.get(idempotencyKey) ?? null;
}

/** Olvida el contexto vivo de un intento (resolución o cierre confirmado). */
export function forgetAttemptContext(idempotencyKey: string): void {
  if (!idempotencyKey) return;
  contexts.delete(idempotencyKey);
}

/**
 * ¿Se puede reenviar el intento en el contexto actual?
 *
 * - El canal persistido debe existir y coincidir con el canal actual: un
 *   registro heredado (sin canal) NO se reenvía por ningún canal y una
 *   clave nunca viaja de público a distribuidor ni al revés.
 * - Canal público: la atribución persistida basta; el reintento con la misma
 *   clave sigue funcionando tras una recarga (no depende de una sesión).
 * - Canal distribuidor: hace falta una prueba viva NO NULA y la MISMA
 *   referencia exacta. Si se perdió o se reemplazó (recarga, logout, login,
 *   refresco de sesión) se bloquea de forma conservadora.
 */
export function attemptContextAllowsRetry(options: {
  idempotencyKey: string;
  /** Canal persistido en el registro; `undefined` = registro heredado. */
  persistedChannel?: OrderAttemptChannel | null;
  /** Canal del checkout actual. */
  channel: OrderAttemptChannel;
  /** Objeto de autenticación vigente (identidad de objeto). */
  distributorProof: object | null;
}): boolean {
  if (!options.persistedChannel) return false;
  if (options.persistedChannel !== options.channel) return false;
  if (options.channel === "public") return true;

  /* Canal distribuidor: sin prueba viva no hay continuidad demostrable. */
  if (!options.distributorProof) return false;
  const stored = contexts.get(options.idempotencyKey);
  if (!stored) return false;
  if (stored.channel !== options.channel) return false;
  if (!stored.distributorProof) return false;
  return stored.distributorProof === options.distributorProof;
}
