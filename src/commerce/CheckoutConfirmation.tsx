import { useEffect, useRef, type RefObject } from "react";
import "./checkout-confirmation.css";

const INSTAGRAMS = [
  { name: "RealStep", href: "https://www.instagram.com/realstep.oficial/" },
  { name: "StarVie Argentina", href: "https://www.instagram.com/starvieargoficial/" },
] as const;

/** Presentation only: the confirmed reference and close actions come from checkout. */
export function CheckoutConfirmation({ orderId, error, onClose, onReturn, closeRef }: {
  orderId: string | null;
  error: string | null;
  onClose: () => void;
  onReturn: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, [closeRef]);
  useEffect(() => {
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button, a") ?? [])];
      const first = controls[0], last = controls.at(-1);
      const outside = !dialogRef.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault(); first?.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, []);

  return <div className="modal-backdrop checkout-backdrop checkout-confirmation-backdrop" role="presentation">
    <section className="checkout-confirmation" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="checkout-title"
      onMouseDown={event => event.stopPropagation()}>
      <button className="checkout-confirmation-close" type="button" ref={closeRef} onClick={onClose} aria-label="Cerrar checkout">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <div className="checkout-confirmation-content">
        <div className="checkout-confirmation-status" role="status">
          <svg className="checkout-confirmation-mark" viewBox="0 0 64 64" aria-hidden="true" fill="none">
            <circle cx="32" cy="32" r="27" stroke="currentColor" strokeWidth="1.2" />
            <path d="m20 32 8 8 17-17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 id="checkout-title">¡Pedido enviado con éxito!</h2>
        </div>
        <div className="checkout-confirmation-message">
          <p className="checkout-confirmation-motto"><span>SIN RIESGO</span>{" "}<span>NO HAY HISTORIA</span></p>
          <p className="checkout-confirmation-thanks">Gracias por elegir StarVie.</p>
        </div>
        {orderId ? <div className="checkout-confirmation-reference">
          <p>NÚMERO DE PEDIDO</p>
          <p className="checkout-confirmation-id" data-testid="confirmed-order-id">{orderId}</p>
        </div> : null}
        {error ? <p className="checkout-error" role="alert">{error}</p> : null}
        <button className="checkout-confirmation-return" type="button" onClick={onReturn}>VOLVER AL CATÁLOGO</button>
        <div className="checkout-confirmation-social">
          <p>SEGUINOS EN NUESTRAS REDES</p>
          <div className="checkout-confirmation-links">
            {INSTAGRAMS.map(({ name, href }) => <a key={name} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Instagram de ${name}`}>
              <span className="checkout-confirmation-instagram">
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span>{name}</span>
            </a>)}
          </div>
        </div>
        <div className="checkout-confirmation-license">
          <span>RealStep</span>
          <p>Licenciatario Oficial</p>
        </div>
      </div>
    </section>
  </div>;
}
