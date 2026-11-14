/**
 * Contratos HTTP del backend de distribuidores (verificados en
 * realstep-api/src/distributor-routes.js y docs/distributors.md).
 *
 * Estado real: implementación local, NO desplegada. En producción las rutas
 * /api/distributor/* responden 404 hasta que el backend habilite
 * DISTRIBUTOR_AUTH_ENABLED con sus bindings. El frontend trata ese 404 como
 * "no disponible" y nunca como autenticación operativa.
 *
 * Sesión: cookie host-only `__Host-ds` (HttpOnly, Secure, SameSite=Strict).
 * El frontend nunca lee ni guarda el token: viaja solo como cookie con
 * `credentials: "include"`. Mutaciones exigen header
 * `X-Requested-With: distributor` + `Content-Type: application/json`.
 *
 * Identificador de sesión: el backend devuelve `sessionId`, un valor opaco,
 * estable y NO secreto derivado del hash del token de sesión (derivación de
 * un solo sentido, con separación de dominio). Es estable durante la vida de
 * la sesión, distinto en cada login y distinto en cada cuenta, y NO es una
 * credencial: nunca habilita autenticación por sí mismo. Es la PRUEBA de
 * continuidad que usa el checkout del canal distribuidor.
 */

/** Respuesta de GET /api/distributor/session y POST /api/distributor/login. */
export type DistributorSessionResponse =
  | { ok: true; authenticated: false }
  | {
      ok: true;
      authenticated: true;
      /** Descuento autorizado por el servidor para esta identidad (0..100). */
      discountPercent: number;
      /** Expiración ISO de la sesión (TTL del servidor: 8 h). */
      expiresAt: string;
      /**
       * Identificador opaco de la sesión, tal como lo devuelve el backend.
       *
       * `null` si el servidor no lo envió (backend anterior): sin este valor
       * NO hay continuidad demostrada y NUNCA se fabrica un sustituto.
       */
      sessionId: string | null;
    };

/** Línea autoritativa de GET /api/distributor/quote. Importes en ARS o null. */
export type DistributorQuoteLine = {
  productId: string;
  qty: number;
  listUnitPrice: number | null;
  netUnitPrice: number | null;
  netSubtotal: number | null;
};

/** Respuesta de GET /api/distributor/quote?productId=&qty=. */
export type DistributorQuoteResponse = {
  ok: true;
  currency: "ARS";
  discountPercent: number;
  lines: DistributorQuoteLine[];
  listTotal: number | null;
  netTotal: number | null;
};

/**
 * Estado de conciliación administrativa de una referencia de pedido
 * (GET /api/distributor/order-resolution?reference=...).
 *
 * El servidor sólo expone el ESTADO de la referencia propia de la sesión
 * vigente: nunca la identidad del administrador, ni el motivo, ni la
 * evidencia. `decidedAt` sólo viene informado en los estados decididos.
 */
export type DistributorResolutionStatus =
  /** RealStep confirmó la recepción del pedido. */
  | "RECEIVED"
  /** RealStep verificó que el pedido nunca fue recibido ni procesado. */
  | "NOT_RECEIVED"
  /** RealStep todavía no puede determinar el resultado. */
  | "UNRESOLVED"
  /** No hay información suficiente. */
  | "UNKNOWN"
  /** El registro original expiró y no se puede concluir nada. */
  | "EXPIRED";

/** Estados que CONCLUYEN algo: sólo estos habilitan una transición. */
export const DECIDED_RESOLUTION_STATUSES = ["RECEIVED", "NOT_RECEIVED"] as const;

export const RESOLUTION_STATUSES = [
  "RECEIVED",
  "NOT_RECEIVED",
  "UNRESOLVED",
  "UNKNOWN",
  "EXPIRED",
] as const;

/** Respuesta de GET /api/distributor/order-resolution?reference=. */
export type DistributorResolutionResponse = {
  ok: true;
  /** Referencia consultada (eco del servidor). */
  reference: string;
  status: DistributorResolutionStatus;
  /** Instante de la decisión (ISO) o null si el estado no concluir. */
  decidedAt: string | null;
};

/**
 * Resultado de la consulta de conciliación.
 *
 * `unavailable` NO es una resolución: la ruta puede estar desactivada
 * (404) o el servicio no disponible (503). `error` tampoco. Sólo `ok` es
 * una respuesta del servidor utilizable.
 */
export type DistributorResolutionResult =
  | { kind: "ok"; resolution: DistributorResolutionResponse }
  /** 401: la sesión de distribuidor no es válida. */
  | { kind: "session-expired" }
  /** 404/503: la conciliación no está habilitada o el servicio no responde. */
  | { kind: "unavailable" }
  /** Red caída, 4xx/5xx inesperado o cuerpo inválido. */
  | { kind: "error" };

/** Estado de autenticación que la UI puede encontrarse. */
export type DistributorAuthState =
  /** Consultando GET /session al montar (sin afirmar nada todavía). */
  | { status: "checking" }
  /** Backend 404 / sin red: rutas no habilitadas o backend no desplegado. */
  | { status: "unavailable" }
  /** Sesión válida confirmada por el servidor. */
  | {
      status: "authenticated";
      discountPercent: number;
      expiresAt: string;
      /**
       * Identificador opaco de la sesión devuelto por el backend. `null`
       * si el servidor no lo envió: sin él no hay continuidad demostrada.
       */
      sessionId: string | null;
    }
  /** Sin sesión. `expired` = hubo sesión y venció o fue rechazada (401). */
  | { status: "anonymous"; expired?: boolean };

/** Errores de login ya clasificados para mostrar (nunca el cuerpo crudo). */
export type DistributorLoginError =
  | { kind: "invalid-cuit" }
  | { kind: "invalid-credentials" }
  | { kind: "rate-limited" }
  | { kind: "unavailable" }
  | { kind: "invalid-request" }
  | { kind: "network" };

export type DistributorLoginResult =
  | {
      kind: "ok";
      discountPercent: number;
      expiresAt: string;
      /**
       * Identificador opaco de la sesión que acaba de abrir el backend.
       * `null` si el servidor no lo envió: sin él no hay continuidad.
       */
      sessionId: string | null;
    }
  | { kind: "error"; error: DistributorLoginError };

/** Resultado de una cotización: el importe neto solo existe si vino del servidor. */
export type DistributorQuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; line: DistributorQuoteLine; discountPercent: number }
  | { status: "session-expired" }
  | { status: "unavailable" }
  | { status: "error" };
