/**
 * Contexto vivo del intento de pedido — SOLO en memoria.
 *
 * El contrato de sesión actual del backend de distribuidores NO expone un
 * identificador de cuenta: sólo `status`, `discountPercent` y `expiresAt`.
 * El backend devuelve el VENCIMIENTO ALMACENADO de la sesión (mismo valor
 * con precisión de milisegundos en el login y en cada revalidación), así que
 * el par (descuento, vencimiento) es un VALOR estable de la sesión: cambia
 * con un login nuevo, con un logout y con la expiración, y NO cambia cuando
 * la misma sesión se revalida (montaje, foco, visibilidad, temporizador).
 *
 * La prueba viva es ese VALOR (la "huella" de la sesión), no la identidad
 * del objeto de autenticación: comparar objetos.convertiría una
 * revalidación inocua en un cambio de sesión y dejaría al intento sin
 * reenviar, sin liberar y sin conciliar. Sigue siendo una INDICACIÓN DE
 * CONTINUIDAD LOCAL, NO una prueba criptográfica de que el servidor siga
 * autenticando a la misma cuenta: el backend sigue siendo la autoridad de
 * sesión, cuenta, descuento e importes.
 *
 * Reglas (S3/S4/S5):
 *  - El canal (público / distribuidor) se persiste en el registro del
 *    intento; el contexto de la cuenta NO se persiste nunca.
 *  - La prueba viva es una cadena de valor: no es un id de cuenta, no es un
 *    token, no se serializa y no viaja al backend.
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
 * Contexto vivo de un intento. `distributorProof` es la HUELLA DE VALOR de
 * la sesión (`v1:<descuento>:<vencimiento>`) vigente cuando se creó el
 * intento. `null` significa "sin prueba viva": NO autoriza ningún reenvío
 * por el canal distribuidor.
 *
 * La comparación es POR VALOR (cadenas): la misma sesión revalidada produce
 * la misma huella y el intento sigue siendo reenviable; otra cuenta (otro
 * login ⇒ otro vencimiento) produce otra huella y el intento se bloquea.
 */
export type AttemptLiveContext = {
  channel: OrderAttemptChannel;
  distributorProof: string | null;
};

/* Registro en memoria: clave de idempotencia → contexto vivo. */
const contexts = new Map<string, AttemptLiveContext>();

/**
 * Vincula el contexto vivo de un intento. La vinculación es ÚNICA: si la
 * clave ya está vinculada, el registro se ignora (el contexto original manda).
 * Se guarda una copia propia e inmutable: el llamador no puede mutar lo que
 * quedó vinculado. La huella de valor se conserva exacta (comparar por
 * valor es lo que distingue una revalidación inocua de un cambio de
 * sesión).
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
 *   huella de valor. Una revalidación de la MISMA sesión conserva la huella
 *   (el backend devuelve el mismo vencimiento): el intento sigue siendo
 *   reenviable. Un login nuevo, un logout o una expiración cambian la
 *   huella (o la borran): el intento se bloquea de forma conservadora.
 */
export function attemptContextAllowsRetry(options: {
  idempotencyKey: string;
  /** Canal persistido en el registro; `undefined` = registro heredado. */
  persistedChannel?: OrderAttemptChannel | null;
  /** Canal del checkout actual. */
  channel: OrderAttemptChannel;
  /** Huella de valor de la sesión vigente (cadena). */
  distributorProof: string | null;
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
  /* Comparación POR VALOR: la misma sesión revalidada mantiene la huella. */
  return stored.distributorProof === options.distributorProof;
}
