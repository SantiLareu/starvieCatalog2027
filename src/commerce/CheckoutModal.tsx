import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { formatPrice } from "./money";
import {
  buildOrderPayload,
  submitOrder,
  validateContact,
  type CheckoutContact,
  type ContactErrors,
  type OrderPayload,
} from "./orders";
import {
  getAttemptSession,
  getStoredAttemptStatus,
  getStoredSessionPresence,
  canCloseAttemptByReconciliation,
  closeAttemptByReconciliation,
  finalizeCompletedAttempt,
  prepareAttempt,
  resolveAttemptForNewPurchase,
  canResolveAttemptLocally,
  updateAttempt,
  updateAttemptSession,
  type OrderAttemptSession,
  type OrderAttemptStatus,
} from "./orderAttempt";
import {
  attemptContextAllowsRetry,
  getAttemptContext,
  rememberAttemptContext,
  type OrderAttemptChannel,
} from "./orderAttemptContext";
import { fetchDistributorOrderResolution } from "./distributor/client";
import type { DistributorResolutionStatus } from "./distributor/types";
import type { PresentedLine } from "./types";
import { hasPrice } from "./productEligibility";
import { TurnstileWidget, turnstileEnabled, turnstileSiteKey } from "./TurnstileWidget";
import { CheckoutConfirmation } from "./CheckoutConfirmation";
import {
  CheckoutUncertainNotice,
  CONFLICT_ORDER_MESSAGE,
  FAILED_ORDER_MESSAGE,
  UNCERTAIN_ORDER_MESSAGE,
} from "./CheckoutUncertainNotice";
import "./distributor/cart-distributor.css";

export const CHECKOUT_HERO_SRC = "/checkout/checkout-hero-raptor.webp";

/**
 * Aviso único para un intento que pertenece a otro canal o a otra sesión.
 * El registro se conserva: la resolución sigue siendo explícita.
 */
const CONTEXT_MISMATCH_MESSAGE =
  "Este pedido pertenece a otro canal o a otra sesión. No se puede reenviar con la referencia anterior; conservamos su registro y consultá a StarVie antes de iniciar otro.";

/**
 * La liberación local se rechaza cuando no se puede probar que el servidor
 * no conserve un pedido pendiente. Se informa en vez de dejar el botón sin
 * efecto: el registro se conserva y no se genera una referencia nueva, que
 * podría duplicar un pedido que el servidor todavía conserva.
 */
const RELEASE_NOT_ALLOWED_MESSAGE =
  "No liberamos el registro del pedido anterior: no pudimos verificar su resultado y una compra nueva con una referencia nueva podría duplicarlo. Conservamos el registro bloqueado; consultá con StarVie antes de iniciar otra compra.";

/**
 * Mensajes de la conciliación administrativa, uno por estado del servidor.
 * Sólo RECEIVED y NOT_RECEIVED concluyen algo: los demás mantienen el
 * bloqueo y el aviso de incertidumbre.
 */
const RESOLUTION_MESSAGES: Record<DistributorResolutionStatus, string> = {
  RECEIVED: "RealStep confirmó la recepción de este pedido.",
  NOT_RECEIVED: "RealStep registró una resolución administrativa de no recepción: este pedido no fue recibido.",
  UNRESOLVED: "RealStep todavía no pudo determinar el resultado de este pedido.",
  UNKNOWN: "No hay información suficiente para determinar el resultado de este pedido.",
  EXPIRED: "El registro original de este pedido expiró y no se puede determinar su resultado.",
};

/**
 * Resolución consultada y aplicada en memoria. NUNCA se persiste: un estado
 * guardado en el navegador no es una prueba de resolución.
 */
type ResolutionView = {
  /** Referencia consultada (la del intento persistido). */
  reference: string;
  status: DistributorResolutionStatus;
  decidedAt: string | null;
  /** Prueba viva de sesión vigente en el momento de la consulta. */
  proof: object;
};

type CheckoutSubmitFn = (
  payload: OrderPayload,
  options: { turnstileToken?: string },
) => Promise<
  | Awaited<ReturnType<typeof submitOrder>>
  | { kind: "sessionExpired"; error: string }
>;

type CheckoutModalProps = {
  open: boolean;
  onClose: () => void;
  onReturnToCatalog?: () => void;
  presented: PresentedLine[];
  total: number | null;
  clearCart: () => void;
  submitFn?: CheckoutSubmitFn;
  /** Sesión de distribuidor activa: el pedido va a /api/distributor/orders. */
  distributorMode?: boolean;
  distributorDiscountPercent?: number | null;
  /**
   * El descuento está confirmado por una cotización vigente del servidor.
   * Mientras sea false, el porcentaje NO se muestra (falla cerrado).
   */
  distributorDiscountConfirmed?: boolean;
  /** Total neto cotizado por el servidor; null = a confirmar. */
  distributorTotal?: number | null;
  /** Subtotal neto del servidor por producto (para el resumen). */
  distributorNetByProduct?: Record<string, number | null>;
  onDistributorSessionExpired?: () => void;
  /**
   * Prueba viva de sesión (SOLO en memoria): el objeto exacto de
   * autenticación del distribuidor vigente. Se compara por identidad para
   * detectar que la sesión cambió (login, logout, refresco o recarga).
   * NO es un identificador de cuenta, no se persiste y no viaja al backend.
   */
  distributorSessionProof?: object | null;
};

const EMPTY_CONTACT: CheckoutContact = {
  name: "",
  legalName: "",
  phone: "",
  email: "",
  province: "",
  city: "",
  address: "",
  cuit: "",
  notes: "",
};

/**
 * CheckoutModal — full SubmitResult state machine.
 *
 * Lifecycle:
 * 1. On open: detect existing marker/session (localStorage + sessionStorage).
 *    - Valid marker + matching session → prefill contact from session.
 *    - Valid marker + no session → block (keep orderId internal).
 *    - Missing marker → fresh form; invalid/expired marker → blocked.
 * 2. On submit: build the validated first payload, then persist it before POST.
 *    Later consultations use the stored contact, lines and key unchanged.
 * 3. On result:
 *    - completed → close persisted attempt, clearCart, preserve orderId internally.
 *    - processing → keep cart + key, show "received", modal stays open.
 *    - failed/conflict/validation → terminal, no retry offered.
 *    - rateLimited/unknown → keep key + payload, allow retry or status check.
 * 4. Modal close: preserves state for pending/uncertain results.
 * 5. Double-click prevention: synchronous ref guard.
 */
export function CheckoutModal({
  open,
  onClose,
  onReturnToCatalog = onClose,
  presented,
  total,
  clearCart,
  submitFn = submitOrder,
  distributorMode = false,
  distributorDiscountPercent = null,
  distributorDiscountConfirmed = false,
  distributorTotal = null,
  distributorNetByProduct,
  onDistributorSessionExpired,
  distributorSessionProof = null,
}: CheckoutModalProps) {
  const [contact, setContact] = useState<CheckoutContact>(EMPTY_CONTACT);
  const [fieldErrors, setFieldErrors] = useState<ContactErrors>({});
  const [mode, setMode] = useState<{
    kind: "idle" | "submitting" | "completed" | "processing" | "retryable" | "terminal" | "blocked";
  }>({ kind: "idle" });
  const [orderId, setOrderId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [observedAttempt, setObservedAttempt] = useState<OrderAttemptStatus>({ kind: "missing" });
  const [resolutionConfirmed, setResolutionConfirmed] = useState(false);
  const [completedCleanupFailed, setCompletedCleanupFailed] = useState(false);
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number>(0);
  const [retryUntil, setRetryUntil] = useState<number>(0);
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationReset, setVerificationReset] = useState(0);
  /* ── Conciliación administrativa (canal distribuidor) ───────────── */
  const [resolution, setResolution] = useState<ResolutionView | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState<string | null>(null);
  const [resolutionLoading, setResolutionLoading] = useState(false);
  const resolutionRequestRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const siteKey = turnstileSiteKey();
  const verificationConfigured = turnstileEnabled();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);

  /* ── Double-click prevention (synchronous ref) ──────────────────── */
  const submittingRef = useRef(false);

  /* ── Canal del intento + prueba viva de sesión ──────────────────── */
  /* El canal queda fijado mientras el checkout está abierto (lo fija
     CartDrawer al abrir). La prueba viva es la SESIÓN VIGENTE: si cambia
     (login, logout, refresco o recarga) el intento ya no es reenviable. */
  const channel: OrderAttemptChannel = distributorMode ? "distributor" : "public";
  const liveProof = distributorSessionProof ?? null;
  /* Última prueba viva conocida: permite descartar una respuesta que llega
     después de que la sesión cambió. */
  const liveProofRef = useRef(liveProof);
  liveProofRef.current = liveProof;

  /* ── Open: detect existing marker/session, prefill ──────────────── */
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    setMode({ kind: "idle" });
    setFieldErrors({});
    setOrderId(null);
    setServerError(null);
    setRateLimitRemaining(0);
    setRetryUntil(0);
    setResolutionConfirmed(false);
    setCompletedCleanupFailed(false);
    tokenRef.current = null;
    setTokenReady(false);
    setVerificationNeeded(false);
    setVerificationError(null);
    /* La conciliación no sobrevive a la apertura: cada consulta arranca de
       cero y las respuestas en vuelo quedan invalidadas. */
    setResolution(null);
    setResolutionError(null);
    setResolutionNote(null);
    setResolutionLoading(false);
    resolutionRequestRef.current += 1;
    closeRef.current?.focus();

    const markerStatus: OrderAttemptStatus = getStoredAttemptStatus();
    setObservedAttempt(markerStatus);
    if ((markerStatus.kind === "valid" || markerStatus.kind === "expired") &&
        markerStatus.snapshot.status === "completed" && markerStatus.snapshot.orderId?.trim()) {
      const marker = markerStatus.snapshot;
      if (finalizeCompletedAttempt(marker.idempotencyKey, marker.orderId!)) {
        setObservedAttempt({ kind: "missing" });
        setContact(EMPTY_CONTACT);
      } else {
        setOrderId(marker.orderId);
        setMode({ kind: "completed" });
        setCompletedCleanupFailed(true);
        setServerError("El pedido está confirmado, pero su referencia local cambió o no se pudo limpiar. Volvé a abrir el checkout o contactá a StarVie antes de iniciar otra compra.");
      }
      return;
    }
    /* El canal distribuidor sin prueba viva autenticada no puede preparar ni
       reenviar nada: se bloquea conservando el registro existente. */
    if (channel === "distributor" && !liveProof) {
      setMode({ kind: "blocked" });
      setServerError(CONTEXT_MISMATCH_MESSAGE);
      return;
    }
    if (markerStatus.kind === "missing") {
      setContact(EMPTY_CONTACT);
      const sessionPresence = getStoredSessionPresence();
      if (sessionPresence !== "missing") {
        setMode({ kind: "blocked" });
        setServerError("Quedó información de un pedido anterior sin marcador. No podemos confirmar su resultado; consultá a StarVie antes de iniciar otro.");
      }
      return;
    }
    if (markerStatus.kind !== "valid") {
      setMode({ kind: "blocked" });
      if (markerStatus.kind === "expired") {
        setOrderId(markerStatus.snapshot.orderId);
        setServerError("Venció la ventana de seguridad de este pedido. No lo reintentes con la clave anterior; consultá a StarVie antes de iniciar otro.");
      } else if (markerStatus.kind === "invalid") {
        setServerError("La referencia local del pedido está dañada. No podemos confirmar su resultado; consultá a StarVie antes de iniciar otro.");
      } else {
        setServerError("El almacenamiento del navegador no está disponible. Habilitalo para continuar con seguridad.");
      }
      return;
    }

    const marker = markerStatus.snapshot;
    setOrderId(marker.orderId);
    if (marker.status === "completed") {
      setMode({ kind: "blocked" });
      setServerError("La referencia del pedido completado está incompleta. Contactá a StarVie antes de iniciar otro.");
      return;
    }
    if (["failed", "conflict", "validation"].includes(marker.status ?? "")) {
      setMode({ kind: "terminal" });
      setServerError("Este pedido terminó sin completarse. Contactá soporte antes de iniciar otro.");
      return;
    }

    const session: OrderAttemptSession | null = getAttemptSession();
    const blockMissingOriginal = () => {
      setMode({ kind: "blocked" });
      setServerError("No está disponible el pedido original completo. Conservamos su referencia; consultá a StarVie antes de iniciar otro.");
    };
    if (channel === "distributor") {
      if (!session || session.idempotencyKey !== marker.idempotencyKey) {
        blockMissingOriginal();
        return;
      }
      /* El intento debe pertenecer a este canal y a esta sesión viva: un
         registro heredado (sin canal) o de otro contexto no se reenvía. */
      if (!attemptContextAllowsRetry({
        idempotencyKey: marker.idempotencyKey,
        persistedChannel: marker.channel,
        channel,
        distributorProof: liveProof,
      })) {
        setMode({ kind: "blocked" });
        setServerError(CONTEXT_MISMATCH_MESSAGE);
        return;
      }
      if (!prepareAttempt(session.contact, session.lines, { channel })) {
        blockMissingOriginal();
        return;
      }
    } else if (!session || session.idempotencyKey !== marker.idempotencyKey ||
               !prepareAttempt(session.contact, session.lines, { channel })) {
      /* Canal PÚBLICO: exactamente la condición de origin/main, sin
         atribución de canal: un registro heredado (sin `channel`) se puede
         reenviar y liberar como antes. */
      blockMissingOriginal();
      return;
    }
    setContact({ ...EMPTY_CONTACT, ...session.contact });
    if (marker.status === "processing") {
      setMode({ kind: "processing" });
    } else {
      setMode({ kind: "retryable" });
      setServerError("El resultado anterior no está confirmado. Podés consultar con la misma referencia.");
    }
  }, [open]);

  /* ── Escape handler ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!open || mode.kind === "submitting") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, mode, onClose]);

  /* ── Focus restore on close ─────────────────────────────────────── */
  useEffect(() => {
    if (!open && openerRef.current instanceof HTMLElement)
      openerRef.current.focus();
  }, [open]);

  /* ── Contact field setter ────────────────────────────────────────── */
  const set =
    (field: keyof CheckoutContact) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setContact((current) => ({ ...current, [field]: event.target.value }));
    };

  /* ── New submit or idempotent status check/retry ──────────────────── */
  const send = async () => {
    /* Synchronous double-click prevention. */
    if (submittingRef.current) return;

    if (!["idle", "retryable", "processing"].includes(mode.kind) || Date.now() < retryUntil) return;
    const wasProcessing = mode.kind === "processing";

    let payload: OrderPayload;
    let lines: { productId: string; qty: number }[];
    let tokenForRequest: string | undefined;
    let contextMismatch = false;
    try {
      /* El canal distribuidor exige una prueba viva autenticada. Sin ella no
         se prepara ni se reenvía nada: ni clave nueva, ni token consumido, ni
         registros escritos, ni carrito tocado. */
      if (channel === "distributor" && !liveProof) {
        contextMismatch = true;
        throw new Error("distributor without live proof");
      }
      const markerStatus = getStoredAttemptStatus();
      if (markerStatus.kind === "missing" && mode.kind === "idle") {
        const errors = validateContact(contact);
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;
        const candidate = buildOrderPayload(presented, contact, "");
        if (!candidate) {
          setServerError("El pedido quedó vacío.");
          return;
        }
        if (verificationConfigured && !siteKey) {
          setVerificationError("La verificación de seguridad no está configurada. Contactá a StarVie.");
          return;
        }
        if (siteKey && !tokenRef.current) {
          setVerificationError("Completá la verificación de seguridad antes de enviar el pedido.");
          return;
        }
        const prepared = prepareAttempt(candidate.contact, candidate.lines, { channel });
        if (!prepared) throw new Error("attempt unavailable");
        /* El intento queda atado a este canal y a esta sesión viva. */
        rememberAttemptContext(prepared.idempotencyKey, {
          channel,
          distributorProof: liveProof,
        });
        payload = { contact: prepared.contact, lines: prepared.lines, idempotencyKey: prepared.idempotencyKey };
        tokenForRequest = tokenRef.current ?? undefined;
      } else if (markerStatus.kind === "valid" && mode.kind !== "idle") {
        const session = getAttemptSession();
        if (!session || session.idempotencyKey !== markerStatus.snapshot.idempotencyKey) {
          throw new Error("original payload unavailable");
        }
        /* Mismo canal y misma prueba viva: si no, el reintento se bloquea
           sin borrar el registro ni generar otra clave. La regla es
           EXCLUSIVA del canal DISTRIBUIDOR: el canal público reenvía como
           lo reenviaba origin/main. */
        if (channel === "distributor" && !attemptContextAllowsRetry({
          idempotencyKey: markerStatus.snapshot.idempotencyKey,
          persistedChannel: markerStatus.snapshot.channel,
          channel,
          distributorProof: liveProof,
        })) {
          contextMismatch = true;
          throw new Error("attempt context changed");
        }
        const prepared = prepareAttempt(session.contact, session.lines, { channel });
        if (!prepared) throw new Error("attempt is terminal or changed");
        if (verificationNeeded && siteKey && !tokenRef.current) {
          setVerificationError("Completá una nueva verificación para continuar con el mismo pedido.");
          return;
        }
        payload = { contact: prepared.contact, lines: prepared.lines, idempotencyKey: prepared.idempotencyKey };
        tokenForRequest = verificationNeeded ? tokenRef.current ?? undefined : undefined;
      } else {
        throw new Error("attempt unavailable");
      }
      lines = payload.lines;
    } catch {
      setServerError(
        contextMismatch
          ? CONTEXT_MISMATCH_MESSAGE
          : "No se puede continuar este pedido con seguridad. Contactá soporte.",
      );
      setMode({ kind: "blocked" });
      return;
    }

    /* Submit. */
    submittingRef.current = true;
    tokenRef.current = null; // A Turnstile response is single-use and never persisted.
    setTokenReady(false);
    setVerificationNeeded(false);
    setVerificationError(null);
    setMode({ kind: "submitting" });
    setServerError(null);

    try {
      const result = await submitFn(payload, {
        turnstileToken: tokenForRequest,
      });
      submittingRef.current = false;

      switch (result.kind) {
        case "completed": {
          setOrderId(result.orderId);
          setMode({ kind: "completed" });
          const cleaned = finalizeCompletedAttempt(payload.idempotencyKey, result.orderId);
          setCompletedCleanupFailed(!cleaned);
          if (!cleaned) {
            setServerError("El pedido está confirmado, pero su referencia local cambió o no se pudo limpiar. Volvé a abrir el checkout o contactá a StarVie antes de iniciar otra compra.");
          }
          setObservedAttempt(getStoredAttemptStatus());
          /* Clear cart after user sees the result. */
          clearCart();
          break;
        }
        case "processing": {
          setOrderId(result.orderId);
          setMode({ kind: "processing" });
          setRetryUntil(Number.isFinite(result.nextRetryAt) ? Math.max(0, result.nextRetryAt ?? 0) : 0);
          /* Update marker with orderId and session with orderId (immutable). */
          try {
            updateAttempt(lines, {
              orderId: result.orderId,
              status: "processing",
            });
            updateAttemptSession(result.orderId);
          } catch {
            /* Storage unavailable — proceed anyway. */
          }
          setObservedAttempt(getStoredAttemptStatus());
          break;
        }
        case "failed": {
          const resolvedOrderId = result.orderId ?? orderId;
          setOrderId(resolvedOrderId);
          setMode({ kind: "terminal" });
          setServerError("El pedido falló definitivamente. Contactá a StarVie antes de iniciar otro; no lo reintentes.");
          /* Update marker with failed orderId (preserves createdAt, lines). */
          try {
            updateAttempt(lines, {
              orderId: resolvedOrderId,
              status: "failed",
            });
            updateAttemptSession(resolvedOrderId);
          } catch {
            /* Storage unavailable — proceed anyway. */
          }
          setObservedAttempt(getStoredAttemptStatus());
          break;
        }
        case "conflict": {
          setServerError(result.error);
          setMode({ kind: "terminal" });
          updateAttempt(lines, { status: "conflict" });
          setObservedAttempt(getStoredAttemptStatus());
          break;
        }
        case "rateLimited": {
          setServerError(result.error);
          setRateLimitRemaining(result.retryAfter);
          /* Set actual disable timer. */
          setRetryUntil(Date.now() + result.retryAfter * 1000);
          setMode({ kind: wasProcessing ? "processing" : "retryable" });
          break;
        }
        case "unknown": {
          setServerError(channel === "distributor" ? UNCERTAIN_ORDER_MESSAGE : result.error);
          setMode({ kind: wasProcessing ? "processing" : "retryable" });
          if (!wasProcessing) {
            updateAttempt(lines, { status: "accepted" });
          }
          /* El refresco del intento observado es del canal DISTRIBUIDOR: el
             público conserva el estado de origin/main. */
          if (channel === "distributor") setObservedAttempt(getStoredAttemptStatus());
          break;
        }
        case "verificationRequired": {
          if (!siteKey) {
            setServerError("El servidor requiere verificación y este checkout no está configurado para completarla. Conservamos el pedido original; contactá a StarVie.");
            setObservedAttempt(getStoredAttemptStatus());
            setMode({ kind: "blocked" });
          } else {
            setServerError(result.error);
            setVerificationNeeded(true);
            setVerificationError("Se necesita una verificación nueva para continuar.");
            setMode({ kind: "retryable" });
          }
          break;
        }
        case "validation": {
          setServerError(result.error);
          setMode({ kind: "terminal" });
          updateAttempt(lines, { status: "validation" });
          setObservedAttempt(getStoredAttemptStatus());
          break;
        }
        case "sessionExpired": {
          // Sesión distribuidor vencida: se conserva carrito e intento con
          // la misma clave y NUNCA se reenvía como pedido público.
          onDistributorSessionExpired?.();
          setServerError(result.error);
          setMode({ kind: "retryable" });
          break;
        }
      }
    } catch {
      submittingRef.current = false;
      setServerError(channel === "distributor" ? UNCERTAIN_ORDER_MESSAGE : "Error de conexión.");
      if (channel === "distributor") setObservedAttempt(getStoredAttemptStatus());
      setMode({ kind: wasProcessing ? "processing" : "retryable" });
    }
  };

  const startNewPurchase = () => {
    if (submittingRef.current || !["completed", "terminal", "blocked"].includes(mode.kind)) return;
    if (mode.kind === "completed" && completedCleanupFailed) return;
    if (mode.kind === "blocked" && !resolutionConfirmed) return;
    /* La compuerta de liberación local protege el pedido del DISTRIBUIDOR:
       se aplica en su propio canal y también cuando su registro se toca
       desde el checkout público. El canal público, para sus propios
       registros, libera el intento como lo liberaba origin/main. */
    if ((channel === "distributor" || attemptOwnedByDistributor) && mode.kind !== "completed" &&
        !canResolveAttemptLocally(getStoredAttemptStatus(), getAttemptSession())) {
      setServerError(attemptOwnedByDistributor && channel !== "distributor"
        ? CONTEXT_MISMATCH_MESSAGE
        : RELEASE_NOT_ALLOWED_MESSAGE);
      return;
    }
    const resolved = mode.kind === "completed"
      ? getStoredAttemptStatus().kind === "missing" && getStoredSessionPresence() === "missing"
      : resolveAttemptForNewPurchase(
          observedAttempt,
          mode.kind === "blocked" && resolutionConfirmed,
          { channel },
        );
    if (!resolved) {
      setMode({ kind: "blocked" });
      setServerError("El estado local cambió o no se pudo liberar. Volvé a abrir el pedido o contactá a StarVie.");
      return;
    }
    setObservedAttempt({ kind: "missing" });
    setResolutionConfirmed(false);
    setContact(EMPTY_CONTACT);
    setFieldErrors({});
    setOrderId(null);
    setServerError(null);
    setMode({ kind: "idle" });
    tokenRef.current = null;
    setTokenReady(false);
    setVerificationNeeded(false);
    setVerificationError(null);
    if (presented.length === 0) onClose();
  };

  /* ── Conciliación: consulta explícita al backend autenticado ────── */
  /**
   * Consulta de SOLO LECTURA del estado de la resolución de la referencia
   * persistida del intento. Nunca es automática, nunca sondea y nunca envía
   * un pedido: sólo informa.
   *
   * Blindajes:
   *  - sin sesión viva o sin referencia no hay consulta;
   *  - una respuesta vieja (consulta posterior ya emitida) se descarta;
   *  - una respuesta que llega tras un cambio de sesión se descarta;
   *  - la respuesta se aplica sólo si su eco es la referencia consultada.
   */
  const consultResolution = async () => {
    if (!distributorMode || !liveProof || !persistedReference) return;
    const reference = persistedReference;
    const proof = liveProof;
    const requestId = resolutionRequestRef.current + 1;
    resolutionRequestRef.current = requestId;
    setResolutionLoading(true);
    setResolutionError(null);
    setResolutionNote(null);

    const result = await fetchDistributorOrderResolution(reference);

    /* Respuesta vieja: la consulta más reciente manda. */
    if (resolutionRequestRef.current !== requestId) return;
    setResolutionLoading(false);

    if (result.kind === "ok") {
      if (result.resolution.reference !== reference) {
        setResolutionError("La respuesta no corresponde a la referencia consultada. El pedido sigue bloqueado.");
        return;
      }
      /* La sesión cambió mientras consultábamos: la respuesta no se aplica. */
      if (proof !== liveProofRef.current) {
        setResolutionError("La sesión cambió durante la consulta: la respuesta no se aplica. Volvé a consultar la resolución.");
        return;
      }
      setResolution({
        reference,
        status: result.resolution.status,
        decidedAt: result.resolution.decidedAt,
        proof,
      });
      return;
    }
    if (result.kind === "session-expired") {
      setResolutionError("Tu sesión de distribuidor venció. Volvé a ingresar para consultar la resolución del pedido.");
      return;
    }
    if (result.kind === "unavailable") {
      setResolutionError("La consulta de resolución no está disponible en este entorno. El pedido sigue bloqueado.");
      return;
    }
    setResolutionError("No pudimos consultar la resolución del pedido. El pedido sigue bloqueado; podés volver a consultar.");
  };

  /**
   * RECEIVED: RealStep confirmó la recepción. El pedido NO se reenvía ni se
   * genera otra clave para repetirlo. Se permite iniciar una compra nueva,
   * independiente y explícita: se cierra el intento ya resuelto y la compra
   * nueva arranca desde cero (formulario vacío, clave nueva).
   */
  const startNewPurchaseAfterResolution = () => {
    if (!resolution || resolution.status !== "RECEIVED") return;
    if (!liveProof || resolution.proof !== liveProof) return;
    if (!persistedReference || resolution.reference !== persistedReference) return;
    if (!attemptProofIntact) {
      setResolutionError("La sesión de este pedido cambió desde la consulta: no se puede cerrar el pedido anterior con seguridad.");
      return;
    }
    if (!closeAttemptByReconciliation(resolution.reference, "RECEIVED")) {
      setResolutionError("El estado local cambió y no se pudo cerrar el pedido anterior. Volvé a consultar la resolución.");
      return;
    }
    setObservedAttempt({ kind: "missing" });
    setResolutionError(null);
    setResolutionNote("Pedido anterior cerrado: RealStep confirmó su recepción. La compra nueva se arma desde cero y usa una referencia nueva.");
    setContact(EMPTY_CONTACT);
    setFieldErrors({});
    setOrderId(null);
    setServerError(null);
    setMode({ kind: "idle" });
    tokenRef.current = null;
    setTokenReady(false);
    setVerificationNeeded(false);
    setVerificationError(null);
    /* La compra nueva es independiente: no reutiliza el pedido anterior. */
    clearCart();
  };

  /**
   * NOT_RECEIVED: RealStep registró que el pedido no fue recibido. NO se
   * envía automáticamente: el distribuidor tiene que actuar.
   *
   * - Si el intento vigente puede reenviarse con la MISMA referencia (misma
   *   ventana, mismo payload, misma sesión), se conserva la referencia y se
   *   fuerza una verificación de seguridad NUEVA: un token ya consumido no
   *   se reutiliza. La sesión, los precios y la disponibilidad se revalidan
   *   en el envío (el servidor sigue siendo la autoridad).
   * - Si el intento ya no es reenviable con la misma referencia (ventana
   *   vencida o registro original incompleto), se cierra explícitamente y el
   *   envío siguiente es un intento NUEVO con clave nueva. La referencia
   *   anterior no se borra en silencio: sigue visible en el aviso.
   *
   * `NOT_RECEIVED` NO amplía permisos: un `failed` o un `conflict` siguen
   * bloqueados aunque el servidor registre la no recepción, porque esa
   * decisión no resuelve el resultado que el servidor conservó.
   */
  const continueAfterNotReceived = () => {
    if (!resolution || resolution.status !== "NOT_RECEIVED") return;
    if (!liveProof || resolution.proof !== liveProof) return;
    if (!persistedReference || resolution.reference !== persistedReference) return;
    if (!attemptProofIntact) {
      setResolutionError("La sesión de este pedido cambió desde la consulta: no se puede continuar con seguridad. Volvé a consultar la resolución.");
      return;
    }
    const status = getStoredAttemptStatus();
    const session = getAttemptSession();
    const snapshot = status.kind === "valid" ? status.snapshot : null;
    /* El reenvío con la MISMA referencia sólo existe si el intento sigue
       siendo reenviable: los estados terminales que el servidor conservó
       (`failed`) o que no se pueden verificar (`conflict`) no se reenvían. */
    const sameReferenceRetry =
      snapshot !== null &&
      session !== null &&
      session.idempotencyKey === snapshot.idempotencyKey &&
      !["completed", "failed", "conflict", "validation"].includes(snapshot.status ?? "") &&
      attemptContextAllowsRetry({
        idempotencyKey: snapshot.idempotencyKey,
        persistedChannel: snapshot.channel,
        channel,
        distributorProof: liveProof,
      });

    if (sameReferenceRetry) {
      tokenRef.current = null;
      setTokenReady(false);
      setVerificationNeeded(true);
      setVerificationError(null);
      setVerificationReset((value) => value + 1);
      setResolutionError(null);
      setResolutionNote("Podés reenviar este pedido con la misma referencia: completá una verificación de seguridad nueva y el servidor revalida sesión, precios y disponibilidad.");
      setMode({ kind: "retryable" });
      setServerError(null);
      return;
    }

    if (!canCloseAttemptByReconciliation(resolution.reference, "NOT_RECEIVED")) {
      setResolutionError("RealStep registró que este pedido no fue recibido, pero este resultado no alcanza para cerrar el intento. Conservamos su referencia; consultá a RealStep.");
      return;
    }
    if (!closeAttemptByReconciliation(resolution.reference, "NOT_RECEIVED")) {
      setResolutionError("El estado local cambió y no se pudo cerrar el pedido anterior. Volvé a consultar la resolución.");
      return;
    }
    const previousContact = session?.contact ?? null;
    setObservedAttempt({ kind: "missing" });
    setResolutionError(null);
    setResolutionNote("Podés enviar el pedido de nuevo: se validan la sesión, los precios y la disponibilidad antes de enviar, con una referencia nueva.");
    setContact(previousContact ? { ...EMPTY_CONTACT, ...previousContact } : EMPTY_CONTACT);
    setFieldErrors({});
    setOrderId(null);
    setServerError(null);
    setMode({ kind: "idle" });
    tokenRef.current = null;
    setTokenReady(false);
    setVerificationNeeded(false);
    setVerificationError(null);
  };

  /* ── Computed state ──────────────────────────────────────────────── */
  // Read persisted ownership/reference, never infer it from the current login.
  const persistedAttempt = getStoredAttemptStatus();
  const persistedSession = getAttemptSession();
  const sessionPresence = getStoredSessionPresence();
  const localResolutionAllowed = canResolveAttemptLocally(persistedAttempt, persistedSession);
  /* El registro persistido puede pertenecer al canal DISTRIBUIDOR aunque el
     checkout se abra en el canal público: sus protecciones lo acompañan
     (nadie lo libera desde el catálogo público). */
  const attemptOwnedByDistributor =
    (persistedAttempt.kind === "valid" || persistedAttempt.kind === "expired"
      ? persistedAttempt.snapshot.channel
      : persistedSession?.channel) === "distributor";
  /* El canal PÚBLICO conserva la visibilidad de origin/main: el checkbox de
     confirmación y el botón de liberación aparecen en los mismos estados que
     antes. El canal DISTRIBUIDOR sólo los habilita cuando el intento es
     realmente liberable en local: un registro heredado, de otro canal o de
     otra sesión no se libera nunca. */
  const releaseUiAllowed = distributorMode ? localResolutionAllowed : true;
  const persistedReference = persistedAttempt.kind === "valid" || persistedAttempt.kind === "expired"
    ? persistedAttempt.snapshot.idempotencyKey : persistedSession?.idempotencyKey ?? null;
  const persistedStatus = persistedAttempt.kind === "valid" || persistedAttempt.kind === "expired"
    ? persistedAttempt.snapshot.status : undefined;
  /* ── Conciliación administrativa (canal distribuidor) ───────────── */
  /* Prueba viva del intento: si el contexto en memoria no existe o su prueba
     ya no es la vigente, la sesión cambió y el intento NO se libera. */
  const attemptContext = persistedReference ? getAttemptContext(persistedReference) : null;
  const attemptProofIntact =
    liveProof !== null &&
    attemptContext !== null &&
    attemptContext.channel === "distributor" &&
    attemptContext.distributorProof === liveProof;
  const canConsultResolution = distributorMode && liveProof !== null && persistedReference !== null;
  const showReconciliation =
    distributorMode &&
    !["submitting", "completed"].includes(mode.kind) &&
    (persistedReference !== null || resolution !== null);
  /* RECEIVED: el pedido llegó. No se reenvía ni se genera otra clave. La
     regla se aplica a la referencia consultada: cuando el intento ya se
     cerró y la compra nueva arranca, el envío vuelve a estar disponible. */
  const resolutionBlocksResend =
    resolution?.status === "RECEIVED" && resolution.reference === persistedReference;
  /* La resolución es AUTÉNTICA cuando la obtuvo el backend con la sesión
     viva, para la referencia persistida y con la prueba del intento todavía
     vigente. */
  const resolutionIsAuthentic =
    resolution !== null &&
    liveProof !== null &&
    resolution.proof === liveProof &&
    persistedReference !== null &&
    resolution.reference === persistedReference &&
    attemptProofIntact;
  /* El cierre sólo es posible si la decisión lo habilita: `RECEIVED` cierra
     también `failed` y `conflict` (el pedido fue recibido: no queda nada
     pendiente por duplicar y la compra nueva es independiente); con
     `NOT_RECEIVED` los bloqueos de `failed`/`conflict` siguen vigentes. */
  const resolutionCanClose =
    resolutionIsAuthentic &&
    resolution !== null &&
    canCloseAttemptByReconciliation(
      persistedReference as string,
      resolution.status === "RECEIVED" ? "RECEIVED" : "NOT_RECEIVED",
    );
  const resolutionMessage =
    resolution && (resolution.status === "RECEIVED" || resolution.status === "NOT_RECEIVED")
      ? RESOLUTION_MESSAGES[resolution.status]
      : undefined;
  /* Un pedido que el servidor conservó (`failed`) o un 409 (`conflict`) NO se
     pueden liberar localmente, pero tampoco son un callejón sin salida: el
     aviso conserva la referencia, la copia y el contacto de RealStep. El
     aviso de incertidumbre sería FALSO para `failed` (sabemos que el pedido
     llegó al servidor) y el resultado no es verificable desde el catálogo
     para `conflict`. */
  const unreleasableTerminal = mode.kind === "terminal" &&
    (persistedStatus === "failed" || persistedStatus === "conflict");
  /* Mientras se pide una verificación nueva NO hay pedido en duda: el
     backend rechaza el envío antes de crear el pedido, así que el aviso
     de "pedido sin confirmar" sería falso y contradiría el reintento con
     la misma clave. En el canal público el aviso ya no se mostraba en ese
     estado (el intento público se puede resolver localmente): el cambio
     sólo afecta al canal distribuidor. */
  const showUncertainNotice = !verificationNeeded && !localResolutionAllowed && persistedAttempt.kind !== "unavailable" &&
    (persistedAttempt.kind !== "missing" || sessionPresence === "present") &&
    !["idle", "submitting", "completed"].includes(mode.kind) &&
    (mode.kind !== "terminal" || unreleasableTerminal);
  /* El aviso con referencia, copia y contacto pertenece al canal
     DISTRIBUIDOR. El canal público conserva el de origin/main: sólo el
     párrafo de error, sin referencia, sin botón de copia y sin contacto. */
  const uncertainNotice = distributorMode && showUncertainNotice ? <CheckoutUncertainNotice
    reference={persistedReference}
    showWarning={mode.kind !== "processing" && serverError !== UNCERTAIN_ORDER_MESSAGE}
    message={resolutionMessage ?? (persistedStatus === "failed"
      ? FAILED_ORDER_MESSAGE
      : persistedStatus === "conflict"
        ? CONFLICT_ORDER_MESSAGE
        : undefined)}
    resolutionMechanism="reconciliation"
  /> : null;
  const reconciliationPanel = showReconciliation ? (
    <div className="checkout-reconciliation" data-testid="checkout-reconciliation">
      {resolution ? (
        <>
          <p role="status">{RESOLUTION_MESSAGES[resolution.status]}</p>
          {resolution.decidedAt ? <p>RealStep resolvió esta referencia el {resolution.decidedAt}.</p> : null}
          <p>Referencia consultada: <code>{resolution.reference}</code></p>
        </>
      ) : null}
      {resolutionNote ? <p role="status">{resolutionNote}</p> : null}
      {resolutionError ? <p role="alert" className="checkout-error">{resolutionError}</p> : null}
      {resolutionLoading ? <p role="status">Consultando la resolución…</p> : null}
      {canConsultResolution ? (
        <button className="cart-retry" type="button" onClick={() => { void consultResolution(); }}>
          Consultar estado del pedido
        </button>
      ) : null}
      {resolution?.status === "RECEIVED" ? (
        <button className="cart-retry" type="button" onClick={startNewPurchaseAfterResolution} disabled={!resolutionCanClose}>
          Iniciar una nueva compra
        </button>
      ) : null}
      {resolution?.status === "NOT_RECEIVED" ? (
        <button className="cart-retry" type="button" onClick={continueAfterNotReceived} disabled={!resolutionIsAuthentic}>
          Continuar con el envío
        </button>
      ) : null}
    </div>
  ) : null;
  const isSubmitting = mode.kind === "submitting";
  const isSuccess = mode.kind === "completed" || mode.kind === "processing";
  const isError = mode.kind === "retryable";
  const rateLimited = Date.now() < retryUntil;
  const canSubmit =
    (mode.kind === "idle" || mode.kind === "retryable") && !rateLimited &&
    !resolutionBlocksResend &&
    (mode.kind === "retryable" || presented.length > 0) &&
    (!verificationConfigured || (Boolean(siteKey) && (mode.kind !== "idle" && !verificationNeeded || tokenReady)));
  const showVerification = Boolean(siteKey && (mode.kind === "idle" || verificationNeeded));

  /* ── Managed rate-limit timeout cleanup ─────────────────────────── */
  useEffect(() => {
    if (rateLimited) {
      const ms = retryUntil - Date.now();
      if (ms <= 0) {
        setRateLimitRemaining(0);
        setRetryUntil(0);
        return;
      }
      const id = window.setTimeout(() => {
        setRateLimitRemaining(0);
        setRetryUntil(0);
      }, ms);
      return () => window.clearTimeout(id);
    }
  }, [rateLimited, retryUntil]);

  /* ── Render ──────────────────────────────────────────────────────── */
  if (!open) return null;

  /* Success / Processing state */
  if (isSuccess) {
    if (mode.kind === "completed") {
      return createPortal(<CheckoutConfirmation error={serverError}
        onClose={onClose} onReturn={onReturnToCatalog} closeRef={closeRef} />, document.body);
    }
    return createPortal(
      <div
        className="modal-backdrop checkout-backdrop"
        role="presentation"
        onMouseDown={() => {}}
      >
        <section
          className="product-modal checkout-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            ref={closeRef}
            className="modal-close"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Cerrar checkout"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="m6 6 12 12M18 6 6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="checkout-grid">
            <div className="checkout-success" role="status">
              <h2 id="checkout-title">Finalizar pedido</h2>
              <p className="in-stock">
                Pedido recibido — en proceso.
              </p>
              {serverError ? <p className="checkout-error" role="alert" style={channel === "distributor" ? { whiteSpace: "pre-line" } : undefined}>{serverError}</p> : null}
              {uncertainNotice}
              {reconciliationPanel}
              <p className="future-note">
                Te contactaremos por email para coordinar.
              </p>
              {resolutionBlocksResend ? null : (
                <button
                  className="order-button is-active"
                  type="button"
                  onClick={send}
                  disabled={rateLimited}
                >
                  Consultar estado
                </button>
              )}
            </div>
            <div className="checkout-visual" aria-hidden="true">
              <img
                src={CHECKOUT_HERO_SRC}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>
      </div>,
      document.body,
    );
  }

  /* Form state (idle / error / blocked / retry) */
  const retryAfterText =
    rateLimitRemaining > 0 ? ` Reintentá en ${rateLimitRemaining}s.` : "";

  return createPortal(
    <div
      className="modal-backdrop checkout-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <section
        className="product-modal checkout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          className="modal-close"
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Cerrar checkout"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="m6 6 12 12M18 6 6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="checkout-grid">
          <div className="checkout-summary">
            <h2 id="checkout-title">Finalizar pedido</h2>
            <h3 className="checkout-subtitle">Resumen del pedido</h3>
            <ul className="checkout-lines">
              {presented.map(({ line, product, subtotal }) => (
                <li key={line.productId} className="checkout-line">
                  <div className="checkout-line-info">
                    <strong>{product.nombre}</strong>
                    <span>
                      {line.qty} {line.qty === 1 ? "unidad" : "unidades"}
                    </span>
                    {distributorMode ? (
                      distributorNetByProduct?.[line.productId] != null ? (
                        <span className="checkout-line-distributor">
                          Distribuidor {formatPrice(distributorNetByProduct[line.productId] as number)}
                        </span>
                      ) : (
                        <span className="checkout-line-distributor">Distribuidor a confirmar</span>
                      )
                    ) : null}
                  </div>
                  {hasPrice(product) && subtotal != null ? <span className="checkout-line-subtotal">
                    {distributorMode ? `Lista ${formatPrice(subtotal)}` : formatPrice(subtotal)}
                  </span> : null}
                </li>
              ))}
            </ul>
            {total != null && presented.length > 0 && presented.every(({ product }) => hasPrice(product)) ? <p className="checkout-total">
              <span>{distributorMode ? "Total lista" : "Total"}</span> <strong>{formatPrice(total)}</strong>
            </p> : null}
            {distributorMode ? (
              <>
                <p className="checkout-total checkout-total--distributor">
                  <span>
                    Total distribuidor
                    {distributorDiscountPercent != null && distributorDiscountConfirmed
                      ? ` · ${distributorDiscountPercent}% de descuento`
                      : ""}
                  </span>{" "}
                  <strong>
                    {distributorTotal != null ? formatPrice(distributorTotal) : "A confirmar"}
                  </strong>
                </p>
                <p className="checkout-distributor-note" role="status">
                  Pedido de distribuidor: el importe final lo calcula y valida el
                  servidor al procesarlo. Si tu sesión vence, volvé a ingresar
                  desde Distribuidores y reintentá con el mismo pedido.
                </p>
              </>
            ) : null}
            <p className="future-note">
              Precio y stock se reconfirman al procesar el pedido.
            </p>
          </div>
          <div className="checkout-form">
            <div className="checkout-field">
              <label htmlFor="checkout-name">Nombre y apellido *</label>
              <input
                id="checkout-name"
                name="name"
                autoComplete="name"
                value={contact.name}
                disabled={mode.kind !== "idle"}
                onChange={set("name")}
                aria-describedby="checkout-name-error"
              />
              {fieldErrors.name ? (
                <p id="checkout-name-error" role="alert">
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-legalname">Razón social *</label>
              <input
                id="checkout-legalname"
                name="legalName"
                autoComplete="organization"
                value={contact.legalName}
                disabled={mode.kind !== "idle"}
                onChange={set("legalName")}
                aria-describedby="checkout-legalname-error"
              />
              {fieldErrors.legalName ? (
                <p id="checkout-legalname-error" role="alert">
                  {fieldErrors.legalName}
                </p>
              ) : null}
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-phone">
                Teléfono{" "}
                <span className="checkout-hint" aria-hidden="true">
                  (si sos cliente nuevo, completa este campo)
                </span>
              </label>
              <input
                id="checkout-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={contact.phone}
                disabled={mode.kind !== "idle"}
                onChange={set("phone")}
                aria-describedby="checkout-phone-error"
              />
              {fieldErrors.phone ? (
                <p id="checkout-phone-error" role="alert">
                  {fieldErrors.phone}
                </p>
              ) : null}
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-email">Correo electrónico *</label>
              <input
                id="checkout-email"
                name="email"
                type="email"
                autoComplete="email"
                value={contact.email}
                disabled={mode.kind !== "idle"}
                onChange={set("email")}
                aria-describedby="checkout-email-error"
              />
              {fieldErrors.email ? (
                <p id="checkout-email-error" role="alert">
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>
            <div className="checkout-row">
              <div className="checkout-field">
                <label htmlFor="checkout-province">
                  Provincia{" "}
                  <span className="checkout-hint" aria-hidden="true">
                    (si sos cliente nuevo, completa este campo)
                  </span>
                </label>
                <input
                  id="checkout-province"
                  name="province"
                  autoComplete="address-level1"
                  value={contact.province}
                  disabled={mode.kind !== "idle"}
                  onChange={set("province")}
                  aria-describedby="checkout-province-error"
                />
                {fieldErrors.province ? (
                  <p id="checkout-province-error" role="alert">
                    {fieldErrors.province}
                  </p>
                ) : null}
              </div>
              <div className="checkout-field">
                <label htmlFor="checkout-city">
                  Localidad{" "}
                  <span className="checkout-hint" aria-hidden="true">
                    (si sos cliente nuevo, completa este campo)
                  </span>
                </label>
                <input
                  id="checkout-city"
                  name="city"
                  autoComplete="address-level2"
                  value={contact.city}
                  disabled={mode.kind !== "idle"}
                  onChange={set("city")}
                  aria-describedby="checkout-city-error"
                />
                {fieldErrors.city ? (
                  <p id="checkout-city-error" role="alert">
                    {fieldErrors.city}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-address">
                Dirección{" "}
                <span className="checkout-hint" aria-hidden="true">
                  (si sos cliente nuevo, completa este campo)
                </span>
              </label>
              <input
                id="checkout-address"
                name="address"
                autoComplete="street-address"
                value={contact.address}
                disabled={mode.kind !== "idle"}
                onChange={set("address")}
              />
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-cuit">
                CUIT{" "}
                <span className="checkout-hint" aria-hidden="true">
                  (si sos cliente nuevo, completa este campo)
                </span>
              </label>
              <input
                id="checkout-cuit"
                name="cuit"
                inputMode="numeric"
                value={contact.cuit}
                disabled={mode.kind !== "idle"}
                onChange={set("cuit")}
                aria-describedby="checkout-cuit-error"
              />
              {fieldErrors.cuit ? (
                <p id="checkout-cuit-error" role="alert">
                  {fieldErrors.cuit}
                </p>
              ) : null}
            </div>
            <div className="checkout-field">
              <label htmlFor="checkout-notes">Observaciones</label>
              <textarea
                id="checkout-notes"
                name="notes"
                rows={3}
                maxLength={500}
                value={contact.notes}
                disabled={mode.kind !== "idle"}
                onChange={set("notes")}
                aria-describedby="checkout-notes-error"
              />
              {fieldErrors.notes ? (
                <p id="checkout-notes-error" role="alert">
                  {fieldErrors.notes}
                </p>
              ) : null}
            </div>

            {serverError ? (
              <p className="checkout-error" role="alert" style={channel === "distributor" ? { whiteSpace: "pre-line" } : undefined}>
                {serverError}
                {retryAfterText}
              </p>
            ) : null}
            {showVerification && siteKey ? (
              <div className="checkout-verification">
                <TurnstileWidget
                  siteKey={siteKey}
                  resetSignal={verificationReset}
                  onToken={(token) => {
                    if (!token.trim() || token.length > 2048) {
                      tokenRef.current = null;
                      setTokenReady(false);
                      setVerificationError("La verificación no devolvió un token válido. Intentá nuevamente.");
                      return;
                    }
                    tokenRef.current = token;
                    setTokenReady(true);
                    setVerificationError(null);
                  }}
                  onUnavailable={(reason) => {
                    tokenRef.current = null;
                    setTokenReady(false);
                    setVerificationError(reason === "expired"
                      ? "La verificación venció. Renovala para continuar."
                      : "No se pudo completar la verificación. Intentá nuevamente.");
                  }}
                />
                {verificationError ? <p role="alert" className="checkout-error">{verificationError}</p> : null}
                {verificationError ? (
                  <button className="cart-retry" type="button" onClick={() => {
                    tokenRef.current = null;
                    setTokenReady(false);
                    setVerificationError(null);
                    setVerificationReset((value) => value + 1);
                  }}>Reiniciar verificación</button>
                ) : null}
              </div>
            ) : null}
            {verificationConfigured && !siteKey && mode.kind === "idle" ? (
              <p role="alert" className="checkout-error">La verificación de seguridad no está configurada. Contactá a StarVie.</p>
            ) : null}

            {uncertainNotice}
            {reconciliationPanel}
            {releaseUiAllowed && mode.kind === "blocked" && observedAttempt.kind !== "unavailable" &&
              getStoredSessionPresence() !== "unavailable" ? (
              <label className="future-note">
                <input
                  type="checkbox"
                  checked={resolutionConfirmed}
                  onChange={(event) => setResolutionConfirmed(event.target.checked)}
                />
                Confirmo que consulté con StarVie el estado del pedido anterior y quiero iniciar una compra nueva.
              </label>
            ) : null}
            {releaseUiAllowed && getStoredSessionPresence() !== "unavailable" &&
              (mode.kind === "terminal" || (mode.kind === "blocked" && resolutionConfirmed &&
                observedAttempt.kind !== "unavailable")) ? (
              <button className="cart-retry" type="button" onClick={startNewPurchase}>
                Resolver intento e iniciar nueva compra
              </button>
            ) : null}

            {mode.kind !== "terminal" && mode.kind !== "blocked" && !resolutionBlocksResend ? <button
              className="order-button is-active"
              type="button"
              onClick={send}
              disabled={!canSubmit}
            >
              {isSubmitting
                ? "Enviando pedido..."
                : isError
                  ? "Reintentar envío"
                  : "Enviar pedido"}
            </button> : null}
          </div>
          <div className="checkout-visual" aria-hidden="true">
            <img
              src={CHECKOUT_HERO_SRC}
              alt=""
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
