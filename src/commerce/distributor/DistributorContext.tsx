/**
 * Estado de autenticación de distribuidores (solo en memoria).
 *
 * - Nada de contraseñas ni tokens en localStorage/sessionStorage: la sesión
 *   vive en la cookie HttpOnly del backend y acá solo queda el estado
 *   público (descuento autorizado + expiración) devuelto por el servidor.
 * - Integración EXPLÍCITA (`VITE_DISTRIBUTOR_API_BASE_URL`): sin backend
 *   configurado el estado es `unavailable` y NO se realiza ninguna
 *   solicitud (ni al montar, ni en foco/visibilidad, ni por timer). El
 *   desarrollo local nunca consulta endpoints de producción inexistentes.
 * - Con backend configurado, al montar se consulta GET /session: un 404
 *   significa backend no habilitado y la UI lo muestra como no disponible,
 *   sin afirmar que la autenticación opere en producción.
 * - Las cotizaciones se cachean por producto+cantidad y son la única fuente
 *   del precio distribuidor visible. Un 401 en quote/pedido vence la sesión
 *   local y conserva el carrito (identidad + cantidades, como siempre).
 * - El contrato de sesión NO expone identificador de cuenta: una revalidación
 *   no puede probarse como la MISMA cuenta. Por eso toda revalidación
 *   autenticada invalida las cotizaciones (epoch) y las vuelve a pedir, y el
 *   descuento queda SIN confirmar hasta que una cotización vigente lo
 *   corrobora. El carrito nunca se modifica por este motivo.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchDistributorQuote,
  fetchDistributorSession,
  isDistributorIntegrationEnabled,
  loginDistributor,
  logoutDistributor,
} from "./client";
import type {
  DistributorAuthState,
  DistributorLoginResult,
  DistributorQuoteState,
} from "./types";

type DistributorContextValue = {
  auth: DistributorAuthState;
  isAuthenticated: boolean;
  /** Porcentaje autorizado por el servidor; null si no hay sesión. */
  discountPercent: number | null;
  /**
   * Epoch monotónico de cotizaciones. Se incrementa cada vez que las
   * cotizaciones se invalidan (revalidación de sesión no atribuible, login,
   * logout o expiración). Los consumidores lo dependen para volver a pedir
   * la cotización una sola vez por invalidación.
   */
  quoteEpoch: number;
  /**
   * true cuando una cotización VIGENTE del servidor confirmó el descuento.
   * Mientras sea false, ningún precio ni porcentaje de la sesión anterior
   * puede mostrarse: el descuento todavía no está confirmado.
   */
  discountConfirmed: boolean;
  login: (cuit: string, password: string) => Promise<DistributorLoginResult>;
  logout: () => Promise<{ kind: "ok" | "unconfirmed" }>;
  refreshSession: () => Promise<void>;
  /** Vence la sesión local (p. ej. tras un 401 del servidor). */
  expireSession: () => void;
  quoteFor: (productId: string, qty: number) => DistributorQuoteState;
  ensureQuote: (productId: string, qty: number) => void;
};

const DistributorContext = createContext<DistributorContextValue | null>(null);

function quoteKey(productId: string, qty: number): string {
  return `${productId}:${qty}`;
}

export function DistributorProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<DistributorAuthState>(() =>
    isDistributorIntegrationEnabled() ? { status: "checking" } : { status: "unavailable" },
  );
  const [quotes, setQuotes] = useState<Record<string, DistributorQuoteState>>({});
  // Epoch de cotizaciones: se incrementa al invalidarlas. Los consumidores lo
  // consumen como dependencia para re-cotizar una vez por invalidación.
  const [quoteEpoch, setQuoteEpoch] = useState(0);
  // El descuento sólo está confirmado cuando una cotización vigente del
  // servidor lo corrobora: hasta entonces no se muestra.
  const [discountConfirmed, setDiscountConfirmed] = useState(false);
  // Peticiones en vuelo por producto+cantidad, con su identificador: sólo la
  // petición vigente puede liberar la clave (un cierre viejo no cancela la
  // petición nueva del mismo producto).
  const inflightRef = useRef(new Map<string, number>());
  const requestSeqRef = useRef(0);
  const authRef = useRef(auth);
  authRef.current = auth;
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;
  // Generación de la identidad de sesión: cada transición (login, logout,
  // expiración, cambio de descuento) la incrementa. Las respuestas que
  // llegan tarde (quote, session, login anterior) se descartan si su
  // generación ya no es la vigente: nunca aplican datos de otra sesión.
  const genRef = useRef(0);
  // Orden de los intentos de login: el último iniciado es el único que
  // puede fijar el estado, aunque una respuesta anterior llegue después.
  const loginSeqRef = useRef(0);
  // Una sola revalidación de sesión en vuelo: monta + foco + timer.
  const refreshInflightRef = useRef(false);

  /**
   * Oculta los precios de la sesión anterior: limpia el caché, descarta las
   * respuestas en vuelo (nueva generación) y deja el descuento SIN confirmar.
   * NO incrementa el epoch: el epoch es la señal para volver a cotizar y
   * depende de la respuesta de la sesión.
   */
  const hideQuotes = useCallback(() => {
    genRef.current += 1;
    setQuotes((current) => (Object.keys(current).length === 0 ? current : {}));
    inflightRef.current.clear();
    setDiscountConfirmed(false);
  }, []);

  /**
   * Invalidación completa de las cotizaciones: las oculta y además
   * incrementa el epoch para que los consumidores vuelvan a cotizar una
   * sola vez. El carrito NO se toca: sólo son precios en memoria.
   */
  const invalidateQuotes = useCallback(() => {
    hideQuotes();
    setQuoteEpoch((epoch) => epoch + 1);
  }, [hideQuotes]);

  const expireSession = useCallback(() => {
    invalidateQuotes();
    setAuth((current) =>
      current.status === "authenticated" ? { status: "anonymous", expired: true } : current,
    );
  }, [invalidateQuotes]);

  const refreshSession = useCallback(async () => {
    // Sin backend configurado no se consulta nada: ni al montar, ni en
    // foco/visibilidad, ni por timer. Estado unavailable, cero solicitudes.
    if (!isDistributorIntegrationEnabled()) {
      setAuth({ status: "unavailable" });
      return;
    }
    if (refreshInflightRef.current) return;
    refreshInflightRef.current = true;
    // Invalidación OPTIMISTA: desde que empieza la revalidación la
    // atribución de la cuenta es desconocida, así que ningún precio ni
    // descuento de la sesión anterior puede quedar visible durante el ida y
    // vuelta. Las respuestas en vuelo se descartan con la nueva generación.
    hideQuotes();
    // La generación se captura DESPUÉS de ocultar: la respuesta de esta
    // revalidación es la vigente y no debe descartarse.
    const gen = genRef.current;
    try {
      const session = await fetchDistributorSession();
      // Respuesta de una sesión anterior: se ignora sin tocar el estado.
      if (gen !== genRef.current) return;
      if ("unavailable" in session) {
        setAuth({ status: "unavailable" });
        return;
      }
      if (!session.authenticated) {
        // Las cotizaciones ya están ocultas: sin sesión no hay nada que
        // volver a cotizar (el epoch no se incrementa).
        setAuth((current) =>
          current.status === "authenticated"
            ? { status: "anonymous", expired: true }
            : { status: "anonymous" },
        );
        return;
      }
      // La sesión revalidada NO se puede atribuir a la misma cuenta: el
      // contrato vigente sólo expone status/discountPercent/expiresAt y el
      // porcentaje o el vencimiento no distinguen a un distribuidor de otro.
      // Las cotizaciones ya quedaron ocultas al empezar la revalidación: aquí
      // se incrementa el epoch UNA vez para que los consumidores pidan una
      // cotización nueva al backend (el importe final siempre lo calcula el
      // servidor).
      invalidateQuotes();
      setAuth({
        status: "authenticated",
        discountPercent: session.discountPercent,
        expiresAt: session.expiresAt,
      });
    } finally {
      refreshInflightRef.current = false;
    }
  }, [hideQuotes, invalidateQuotes]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // Otra pestaña puede cerrar la sesión (logout o revocación del servidor):
  // la cookie es compartida pero este estado vive en memoria. Revalidar al
  // volver a la pestaña acota la ventana de precios privados obsoletos.
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible") void refreshSession();
    };
    const onFocus = () => void refreshSession();
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshSession]);

  // Vencimiento local por reloj: al pasar expiresAt se re-consulta la sesión.
  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const ms = Date.parse(auth.expiresAt) - Date.now();
    if (!Number.isFinite(ms)) return;
    if (ms <= 0) {
      expireSession();
      return;
    }
    const timer = window.setTimeout(() => void refreshSession(), ms);
    return () => window.clearTimeout(timer);
  }, [auth, expireSession, refreshSession]);

  const login = useCallback(async (cuit: string, password: string) => {
    loginSeqRef.current += 1;
    const seq = loginSeqRef.current;
    const result = await loginDistributor(cuit, password);
    // Un intento anterior que resuelve tarde nunca pisa al último iniciado.
    if (seq !== loginSeqRef.current) return result;
    if (result.kind === "ok") {
      // Nueva identidad: las cotizaciones anteriores pertenecen a otra
      // sesión y se descartan antes de mostrar el nuevo descuento.
      invalidateQuotes();
      setAuth({
        status: "authenticated",
        discountPercent: result.discountPercent,
        expiresAt: result.expiresAt,
      });
    } else if (result.error.kind === "unavailable") {
      setAuth({ status: "unavailable" });
    }
    return result;
  }, [invalidateQuotes]);

  const logout = useCallback(async () => {
    const result = await logoutDistributor();
    if (result.kind !== "ok") {
      /* El servidor NO confirmó la revocación: la sesión sigue viva. No se
         anuncia un cierre exitoso ni se limpia el estado local, porque la
         revalidación siguiente volvería a autenticar al distribuidor sin
         que él vuelva a ingresar. */
      return { kind: "unconfirmed" as const };
    }
    invalidateQuotes();
    setAuth({ status: "anonymous" });
    return { kind: "ok" as const };
  }, [invalidateQuotes]);

  const ensureQuote = useCallback(
    (productId: string, qty: number) => {
      if (!isDistributorIntegrationEnabled()) return;
      if (authRef.current.status !== "authenticated") return;
      if (!productId || !Number.isInteger(qty) || qty < 1) return;
      const key = quoteKey(productId, qty);
      if (inflightRef.current.has(key)) return;
      if (quotesRef.current[key]?.status === "ready") return;
      requestSeqRef.current += 1;
      const requestId = requestSeqRef.current;
      inflightRef.current.set(key, requestId);
      const gen = genRef.current;
      setQuotes((current) =>
        current[key]?.status === "ready" ? current : { ...current, [key]: { status: "loading" } },
      );
      void fetchDistributorQuote(productId, qty)
        .then((result) => {
          // Respuesta de una sesión anterior (logout/login/expiración en el
          // medio): se descarta sin aplicar importes ni vencer la sesión
          // vigente. Un 401 obsoleto nunca revoca un login posterior.
          if (gen !== genRef.current || authRef.current.status !== "authenticated") return;
          if (result.kind === "session-expired") {
            expireSession();
            return;
          }
          setQuotes((current) => ({
            ...current,
            [key]:
              result.kind === "ok"
                ? {
                    status: "ready",
                    line: result.quote.lines[0],
                    discountPercent: result.quote.discountPercent,
                  }
                : { status: result.kind === "unavailable" ? "unavailable" : "error" },
          }));
          // La cotización vigente del servidor confirma el descuento: recién
          // ahora puede mostrarse el porcentaje.
          if (result.kind === "ok") setDiscountConfirmed(true);
        })
        .finally(() => {
          // Sólo la petición vigente libera la clave: el cierre de una
          // petición vieja no puede cancelar la petición nueva del mismo
          // producto y cantidad.
          if (inflightRef.current.get(key) === requestId) inflightRef.current.delete(key);
        });
    },
    [expireSession],
  );

  const quoteFor = useCallback(
    (productId: string, qty: number): DistributorQuoteState =>
      quotes[quoteKey(productId, qty)] ?? { status: "idle" },
    [quotes],
  );

  const value = useMemo<DistributorContextValue>(
    () => ({
      auth,
      isAuthenticated: auth.status === "authenticated",
      discountPercent: auth.status === "authenticated" ? auth.discountPercent : null,
      quoteEpoch,
      discountConfirmed,
      login,
      logout,
      refreshSession,
      expireSession,
      quoteFor,
      ensureQuote,
    }),
    [
      auth,
      quoteEpoch,
      discountConfirmed,
      login,
      logout,
      refreshSession,
      expireSession,
      quoteFor,
      ensureQuote,
    ],
  );

  return <DistributorContext.Provider value={value}>{children}</DistributorContext.Provider>;
}

export function useDistributor(): DistributorContextValue {
  const value = useContext(DistributorContext);
  if (!value) throw new Error("useDistributor debe usarse dentro de DistributorProvider");
  return value;
}

/** Como useDistributor, pero null fuera del provider (superficies opcionales). */
export function useOptionalDistributor(): DistributorContextValue | null {
  return useContext(DistributorContext);
}
