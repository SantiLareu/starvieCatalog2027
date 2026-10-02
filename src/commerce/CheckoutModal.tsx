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
  type SubmitResult,
} from "./orders";
import {
  getAttemptSession,
  getStoredAttemptStatus,
  getStoredSessionPresence,
  prepareAttempt,
  resolveAttemptForNewPurchase,
  updateAttempt,
  updateAttemptSession,
  type OrderAttemptSession,
  type OrderAttemptStatus,
} from "./orderAttempt";
import type { PresentedLine } from "./types";
import { TurnstileWidget, turnstileEnabled, turnstileSiteKey } from "./TurnstileWidget";

export const CHECKOUT_HERO_SRC = "/checkout/checkout-hero-raptor.webp";

type CheckoutModalProps = {
  open: boolean;
  onClose: () => void;
  presented: PresentedLine[];
  total: number;
  clearCart: () => void;
  submitFn?: typeof submitOrder;
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
 *    - Valid marker + no session → block (show orderId if available).
 *    - Missing marker → fresh form; invalid/expired marker → blocked.
 * 2. On submit: build the validated first payload, then persist it before POST.
 *    Later consultations use the stored contact, lines and key unchanged.
 * 3. On result:
 *    - completed → clearCart, preserve orderId, close modal.
 *    - processing → keep cart + key, show "received", modal stays open.
 *    - failed/conflict/validation → terminal, no retry offered.
 *    - rateLimited/unknown → keep key + payload, allow retry or status check.
 * 4. Modal close: preserves state for pending/uncertain results.
 * 5. Double-click prevention: synchronous ref guard.
 */
export function CheckoutModal({
  open,
  onClose,
  presented,
  total,
  clearCart,
  submitFn = submitOrder,
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
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number>(0);
  const [retryUntil, setRetryUntil] = useState<number>(0);
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationReset, setVerificationReset] = useState(0);
  const tokenRef = useRef<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const siteKey = turnstileSiteKey();
  const verificationConfigured = turnstileEnabled();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);

  /* ── Double-click prevention (synchronous ref) ──────────────────── */
  const submittingRef = useRef(false);

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
    tokenRef.current = null;
    setTokenReady(false);
    setVerificationNeeded(false);
    setVerificationError(null);
    closeRef.current?.focus();

    const markerStatus: OrderAttemptStatus = getStoredAttemptStatus();
    setObservedAttempt(markerStatus);
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
      setMode({ kind: "completed" });
      return;
    }
    if (["failed", "conflict", "validation"].includes(marker.status ?? "")) {
      setMode({ kind: "terminal" });
      setServerError("Este pedido terminó sin completarse. Contactá soporte antes de iniciar otro.");
      return;
    }

    const session: OrderAttemptSession | null = getAttemptSession();
    if (!session || session.idempotencyKey !== marker.idempotencyKey ||
        !prepareAttempt(session.contact, session.lines)) {
      setMode({ kind: "blocked" });
      setServerError("No está disponible el pedido original completo. Conservamos su referencia; consultá a StarVie antes de iniciar otro.");
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
    try {
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
        const prepared = prepareAttempt(candidate.contact, candidate.lines);
        if (!prepared) throw new Error("attempt unavailable");
        payload = { contact: prepared.contact, lines: prepared.lines, idempotencyKey: prepared.idempotencyKey };
        tokenForRequest = tokenRef.current ?? undefined;
      } else if (markerStatus.kind === "valid" && mode.kind !== "idle") {
        const session = getAttemptSession();
        if (!session || session.idempotencyKey !== markerStatus.snapshot.idempotencyKey) {
          throw new Error("original payload unavailable");
        }
        const prepared = prepareAttempt(session.contact, session.lines);
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
        "No se puede continuar este pedido con seguridad. Contactá soporte.",
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
          /* Update marker with completed status (immutable contract). */
          try {
            updateAttempt(lines, {
              orderId: result.orderId,
              status: "completed",
              completed: true,
            });
          } catch {
            /* Storage unavailable — proceed anyway. */
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
          setServerError("El pedido falló definitivamente. Contactá soporte con la referencia; no lo reintentes.");
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
          setServerError(result.error);
          setMode({ kind: wasProcessing ? "processing" : "retryable" });
          if (!wasProcessing) {
            updateAttempt(lines, { status: "accepted" });
          }
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
      }
    } catch {
      submittingRef.current = false;
      setServerError("Error de conexión.");
      setMode({ kind: wasProcessing ? "processing" : "retryable" });
    }
  };

  const startNewPurchase = () => {
    if (submittingRef.current || !["completed", "terminal", "blocked"].includes(mode.kind)) return;
    if (mode.kind === "blocked" && !resolutionConfirmed) return;
    if (!resolveAttemptForNewPurchase(observedAttempt, mode.kind === "blocked" && resolutionConfirmed)) {
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

  /* ── Computed state ──────────────────────────────────────────────── */
  const isSubmitting = mode.kind === "submitting";
  const isSuccess = mode.kind === "completed" || mode.kind === "processing";
  const isError = mode.kind === "retryable";
  const rateLimited = Date.now() < retryUntil;
  const canSubmit =
    (mode.kind === "idle" || mode.kind === "retryable") && !rateLimited &&
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
                {mode.kind === "completed"
                  ? "Pedido enviado."
                  : "Pedido recibido — en proceso."}
              </p>
              {orderId ? <p className="future-note">N° {orderId}</p> : null}
              {serverError ? <p className="checkout-error" role="alert">{serverError}</p> : null}
              <p className="future-note">
                Te contactaremos por email para coordinar.
              </p>
              <button
                className="order-button is-active"
                type="button"
                onClick={mode.kind === "processing" ? send : onClose}
                disabled={mode.kind === "processing" && rateLimited}
              >
                {mode.kind === "completed"
                  ? "Seguir viendo el catálogo"
                  : "Consultar estado"}
              </button>
              {mode.kind === "completed" ? (
                <button className="cart-retry" type="button" onClick={startNewPurchase} disabled={getStoredSessionPresence() === "unavailable"}>
                  Iniciar nueva compra
                </button>
              ) : null}
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
                  </div>
                  <span className="checkout-line-subtotal">
                    {formatPrice(subtotal)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="checkout-total">
              <span>Total</span> <strong>{formatPrice(total)}</strong>
            </p>
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
              <p className="checkout-error" role="alert">
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
            {orderId && (mode.kind === "terminal" || mode.kind === "blocked") ? (
              <p className="future-note">N° {orderId}</p>
            ) : null}

            {mode.kind === "blocked" && observedAttempt.kind !== "unavailable" &&
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
            {getStoredSessionPresence() !== "unavailable" &&
              (mode.kind === "terminal" || (mode.kind === "blocked" && resolutionConfirmed &&
                observedAttempt.kind !== "unavailable")) ? (
              <button className="cart-retry" type="button" onClick={startNewPurchase}>
                Resolver intento e iniciar nueva compra
              </button>
            ) : null}

            {mode.kind !== "terminal" && mode.kind !== "blocked" ? <button
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
