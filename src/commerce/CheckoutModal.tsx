import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { formatPrice } from "./money";
import {
  buildOrderPayload,
  newIdempotencyKey,
  submitOrder,
  validateContact,
  type CheckoutContact,
  type ContactErrors,
} from "./orders";
import type { PresentedLine } from "./types";

type CheckoutStatus = "idle" | "submitting" | "success" | "error";

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

export function CheckoutModal({ open, onClose, presented, total, clearCart, submitFn = submitOrder }: CheckoutModalProps) {
  const [contact, setContact] = useState<CheckoutContact>(EMPTY_CONTACT);
  const [fieldErrors, setFieldErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    setContact(EMPTY_CONTACT);
    setFieldErrors({});
    setStatus("idle");
    setServerError(null);
    setOrderId(null);
    setIdempotencyKey(newIdempotencyKey());
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || status === "submitting") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, status, onClose]);

  useEffect(() => {
    if (!open && openerRef.current instanceof HTMLElement) openerRef.current.focus();
  }, [open]);

  if (!open) return null;

  const set = (field: keyof CheckoutContact) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setContact((current) => ({ ...current, [field]: event.target.value }));
  };

  const send = async () => {
    if (status === "submitting") return;
    const errors = validateContact(contact);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const payload = buildOrderPayload(presented, contact, idempotencyKey);
    if (!payload) {
      setServerError("El pedido quedó vacío: revisá disponibilidad antes de enviar.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setServerError(null);
    const result = await submitFn(payload);
    if (result.ok) {
      setOrderId(result.orderId);
      setStatus("success");
      clearCart();
    } else {
      setServerError(result.error);
      setStatus("error");
    }
  };

  const canSend = status !== "submitting" && presented.length > 0;

  return createPortal(
    <div
      className="modal-backdrop checkout-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (status !== "submitting") onClose();
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
          disabled={status === "submitting"}
          aria-label="Cerrar checkout"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="checkout-grid">
          {status === "success" ? (
            <div className="checkout-success" role="status">
              <h2 id="checkout-title">Finalizar pedido</h2>
              <p className="in-stock">Pedido enviado.</p>
              {orderId ? <p className="future-note">N° {orderId}</p> : null}
              <p className="future-note">Te contactaremos por email para coordinar.</p>
              <button className="order-button is-active" type="button" onClick={onClose}>
                Seguir viendo el catálogo
              </button>
            </div>
          ) : (
            <>
              <div className="checkout-summary">
                <h2 id="checkout-title">Finalizar pedido</h2>
                <h3 className="checkout-subtitle">Resumen del pedido</h3>
                <ul className="checkout-lines">
                  {presented.map(({ line, product, subtotal }) => (
                    <li key={line.productId} className="checkout-line">
                      <div className="checkout-line-info">
                        <strong>{product.nombre}</strong>
                        <span>{line.qty} {line.qty === 1 ? "unidad" : "unidades"}</span>
                      </div>
                      <span className="checkout-line-subtotal">{formatPrice(subtotal)}</span>
                    </li>
                  ))}
                </ul>
                <p className="checkout-total">
                  <span>Total</span> <strong>{formatPrice(total)}</strong>
                </p>
                <p className="future-note">Precio y stock se reconfirman al procesar el pedido.</p>
              </div>
              <div className="checkout-form">
                <div className="checkout-field">
                  <label htmlFor="checkout-name">Nombre y apellido *</label>
                  <input id="checkout-name" name="name" autoComplete="name" value={contact.name} onChange={set("name")} aria-describedby="checkout-name-error" />
                  {fieldErrors.name ? <p id="checkout-name-error" role="alert">{fieldErrors.name}</p> : null}
                </div>
                <div className="checkout-field">
                  <label htmlFor="checkout-legalname">Razón social *</label>
                  <input id="checkout-legalname" name="legalName" autoComplete="organization" value={contact.legalName} onChange={set("legalName")} aria-describedby="checkout-legalname-error" />
                  {fieldErrors.legalName ? <p id="checkout-legalname-error" role="alert">{fieldErrors.legalName}</p> : null}
                </div>
                <div className="checkout-field">
                  <label htmlFor="checkout-phone">Teléfono <span className="checkout-hint" aria-hidden="true">(si sos cliente nuevo, completa este campo)</span></label>
                  <input id="checkout-phone" name="phone" type="tel" autoComplete="tel" value={contact.phone} onChange={set("phone")} aria-describedby="checkout-phone-error" />
                  {fieldErrors.phone ? <p id="checkout-phone-error" role="alert">{fieldErrors.phone}</p> : null}
                </div>
                <div className="checkout-field">
                  <label htmlFor="checkout-email">Correo electrónico *</label>
                  <input id="checkout-email" name="email" type="email" autoComplete="email" value={contact.email} onChange={set("email")} aria-describedby="checkout-email-error" />
                  {fieldErrors.email ? <p id="checkout-email-error" role="alert">{fieldErrors.email}</p> : null}
                </div>
                <div className="checkout-row">
                  <div className="checkout-field">
                    <label htmlFor="checkout-province">Provincia <span className="checkout-hint" aria-hidden="true">(si sos cliente nuevo, completa este campo)</span></label>
                    <input id="checkout-province" name="province" autoComplete="address-level1" value={contact.province} onChange={set("province")} aria-describedby="checkout-province-error" />
                    {fieldErrors.province ? <p id="checkout-province-error" role="alert">{fieldErrors.province}</p> : null}
                  </div>
                  <div className="checkout-field">
                    <label htmlFor="checkout-city">Localidad <span className="checkout-hint" aria-hidden="true">(si sos cliente nuevo, completa este campo)</span></label>
                    <input id="checkout-city" name="city" autoComplete="address-level2" value={contact.city} onChange={set("city")} aria-describedby="checkout-city-error" />
                    {fieldErrors.city ? <p id="checkout-city-error" role="alert">{fieldErrors.city}</p> : null}
                  </div>
                </div>
                <div className="checkout-field">
                  <label htmlFor="checkout-address">Dirección <span className="checkout-hint" aria-hidden="true">(si sos cliente nuevo, completa este campo)</span></label>
                  <input id="checkout-address" name="address" autoComplete="street-address" value={contact.address} onChange={set("address")} />
                </div>
                <div className="checkout-field">
                  <label htmlFor="checkout-cuit">CUIT <span className="checkout-hint" aria-hidden="true">(si sos cliente nuevo, completa este campo)</span></label>
                  <input id="checkout-cuit" name="cuit" inputMode="numeric" value={contact.cuit} onChange={set("cuit")} aria-describedby="checkout-cuit-error" />
                  {fieldErrors.cuit ? <p id="checkout-cuit-error" role="alert">{fieldErrors.cuit}</p> : null}
                </div>
                <div className="checkout-field">
                  <label htmlFor="checkout-notes">Observaciones</label>
                  <textarea id="checkout-notes" name="notes" rows={3} maxLength={500} value={contact.notes} onChange={set("notes")} aria-describedby="checkout-notes-error" />
                  {fieldErrors.notes ? <p id="checkout-notes-error" role="alert">{fieldErrors.notes}</p> : null}
                </div>

                {status === "error" && serverError ? (
                  <p className="checkout-error" role="alert">{serverError}</p>
                ) : null}

                <button
                  className="order-button is-active"
                  type="button"
                  onClick={send}
                  disabled={!canSend}
                >
                  {status === "submitting" ? "Enviando pedido..." : status === "error" ? "Reintentar envío" : "Enviar pedido"}
                </button>
              </div>
            </>
          )}
          <div className="checkout-visual" aria-hidden="true">
            <img src="/checkout/checkout-hero-raptor.png" alt="" loading="lazy" decoding="async" />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
