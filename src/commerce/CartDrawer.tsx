import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCommerce } from "./CommerceContext";
import { formatNotice } from "./cart";
import { CHECKOUT_HERO_SRC, CheckoutModal } from "./CheckoutModal";
import { formatPrice } from "./money";
import { getStoredAttemptStatus, getStoredSessionPresence } from "./orderAttempt";

export function CartDrawer() {
  const {
    cartOpen,
    setCartOpen,
    setUiBusy,
    presented,
    units,
    total,
    setQty,
    removeFromCart,
    clearCart,
    cartNotices,
    dismissNotices,
  } = useCommerce();

  useEffect(() => {
    setUiBusy(cartOpen);
  }, [cartOpen, setUiBusy]);

  useEffect(() => {
    if (!cartOpen || presented.length === 0 || !window.matchMedia("(min-width: 1024px)").matches) return;
    const image = new Image();
    image.decoding = "async";
    image.src = CHECKOUT_HERO_SRC;
    void image.decode().catch(() => undefined);
  }, [cartOpen, presented.length]);

  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    if (!cartOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !checkoutOpen) setCartOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cartOpen, checkoutOpen, setCartOpen]);

  if (!cartOpen) return null;

  return createPortal(
    <div
      className="cart-backdrop"
      role="presentation"
      onMouseDown={() => setCartOpen(false)}
    >
      <aside
        className="cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Pedido"
        inert={checkoutOpen}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cart-header">
          <h2>Pedido {units > 0 ? <span>({units})</span> : null}</h2>
          <button
            className="modal-close cart-close"
            type="button"
            onClick={() => setCartOpen(false)}
            aria-label="Cerrar pedido"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="m6 6 12 12M18 6 6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {cartNotices.length > 0 ? (
          <div className="cart-notices" role="alert">
            {cartNotices.length > 1 ? (
              <p className="cart-notices-title">
                Se actualizaron algunos productos de tu pedido.
              </p>
            ) : null}
            <ul>
              {cartNotices.map((notice, index) => (
                <li key={`${notice.productId}-${notice.type}-${index}`}>
                  {formatNotice(notice)}
                </li>
              ))}
            </ul>
            <button
              className="cart-notices-dismiss"
              type="button"
              onClick={dismissNotices}
            >
              Entendido
            </button>
          </div>
        ) : null}

        {presented.length === 0 ? (
          getStoredAttemptStatus().kind !== "missing" || getStoredSessionPresence() !== "missing" ? (
            <p className="cart-empty">
              Hay un pedido anterior para revisar.{" "}
              <button
                className="cart-retry"
                type="button"
                onClick={() => setCheckoutOpen(true)}
              >
                Consultar pedido
              </button>
            </p>
          ) : (
            <p className="cart-empty">
              Todavía no agregaste productos. Tocá una pala del catálogo para
              ver su ficha.
            </p>
          )
        ) : (
          <>
            <ul className="cart-lines">
              {presented.map(({ line, product, subtotal }) => (
                <li key={line.productId} className="cart-line">
                  <div className="cart-line-info">
                    <strong>{product.nombre}</strong>
                    <small>SKU {product.sku}</small>
                    <span className="cart-line-price">
                      {formatPrice(product.precio)} c/u
                    </span>
                  </div>
                  <div className="cart-line-controls">
                    <div
                      className="qty-selector"
                      role="group"
                      aria-label={`Cantidad de ${product.nombre}`}
                    >
                      <button
                        type="button"
                        onClick={() => setQty(line.productId, line.qty - 1)}
                        aria-label="Quitar una unidad"
                      >
                        −
                      </button>
                      <span aria-live="polite">{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(line.productId, line.qty + 1)}
                        aria-label="Agregar una unidad"
                      >
                        +
                      </button>
                    </div>
                    <span className="cart-line-subtotal">
                      {formatPrice(subtotal)}
                    </span>
                    <button
                      className="cart-line-remove"
                      type="button"
                      onClick={() => removeFromCart(line.productId)}
                      aria-label={`Quitar ${product.nombre} del pedido`}
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <footer className="cart-footer">
              <div className="cart-total">
                <span>Total</span>
                <strong>{formatPrice(total)}</strong>
              </div>
              <button
                className="order-button is-active"
                type="button"
                onClick={() => setCheckoutOpen(true)}
              >
                Finalizar pedido
              </button>
              <button className="cart-clear" type="button" onClick={clearCart}>
                Vaciar pedido
              </button>
              <p className="future-note">
                Precios y disponibilidad vigentes del catálogo.
              </p>
            </footer>
          </>
        )}
      </aside>
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        presented={presented}
        total={total}
        clearCart={clearCart}
      />
    </div>,
    document.body,
  );
}
