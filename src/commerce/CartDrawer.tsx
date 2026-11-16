import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useCommerce } from "./CommerceContext";
import { formatNotice } from "./cart";
import { CHECKOUT_HERO_SRC, CheckoutModal } from "./CheckoutModal";
import { formatPrice } from "./money";
import { getStoredAttemptStatus, getStoredSessionPresence } from "./orderAttempt";
import { hasPrice } from "./productEligibility";
import { useOptionalDistributor } from "./distributor/DistributorContext";
import { submitDistributorOrder } from "./distributor/client";
import {
  distributorLinePendingLabel,
  distributorLinePricing,
  distributorPendingLabel,
  discountBadgeLabel,
  formatAmountWithSymbol,
  type DistributorLinePricing,
} from "./distributor/pricingDisplay";
import "./distributor/cart-distributor.css";

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
  // Vía del pedido fijada al abrir el checkout: si la sesión distribuidor
  // cae con el checkout abierto, el envío sigue yendo al endpoint de
  // distribuidores (401 + reintento con la misma clave) y nunca se degrada
  // a pedido público. Solo reabrir el checkout cambia la vía.
  const [checkoutDist, setCheckoutDist] = useState<{ mode: boolean; discount: number | null }>({
    mode: false,
    discount: null,
  });
  const openCheckout = (asDistributor: boolean, discount: number | null) => {
    setCheckoutDist({ mode: asDistributor, discount: asDistributor ? discount : null });
    setCheckoutOpen(true);
  };
  const closeCheckout = () => setCheckoutOpen(false);

  const distributor = useOptionalDistributor();
  const isDistributor = distributor?.isAuthenticated ?? false;
  /* Cada canal consulta SU compartmento de intentos: el de un
     distribuidor autenticado y el público (histórico) para el resto. Un
     intento pendiente del canal contrario no bloquea la compra. */
  const attemptChannel = isDistributor ? "distributor" : "public";
  // Formato del importe: el carrito público conserva su formato vigente
  // (símbolo atrás); la experiencia de distribuidores usa el signo adelante
  // para que el "$" nunca quede solo en otra línea.
  const money = isDistributor ? formatAmountWithSymbol : formatPrice;

  // Cotizaciones del servidor por línea (producto + cantidad exacta).
  // El epoch de cotizaciones se consume como dependencia: cuando la sesión se
  // revalida y las cotizaciones se invalidan, se vuelve a cotizar una sola vez
  // por producto+cantidad.
  const quoteEpoch = distributor?.quoteEpoch;
  useEffect(() => {
    if (!cartOpen || !isDistributor || !distributor) return;
    for (const { line, product } of presented) {
      if (hasPrice(product)) distributor.ensureQuote(line.productId, line.qty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartOpen, isDistributor, presented, quoteEpoch]);

  // Precio distribuidor de cada línea: sólo el cotizado por el servidor para
  // la cantidad exacta de esa línea (nunca el precio lista).
  const distributorPricing = useMemo(() => {
    const map: Record<string, DistributorLinePricing> = {};
    if (!isDistributor || !distributor) return map;
    for (const { line } of presented) {
      map[line.productId] = distributorLinePricing({
        authenticated: true,
        productId: line.productId,
        qty: line.qty,
        quote: distributor.quoteFor(line.productId, line.qty),
      });
    }
    return map;
  }, [isDistributor, distributor, presented]);

  const distributorNetByProduct = useMemo(() => {
    const map: Record<string, number | null> = {};
    if (!isDistributor) return map;
    for (const { line } of presented) {
      const pricing = distributorPricing[line.productId];
      map[line.productId] = pricing?.kind === "ready" ? pricing.netSubtotal : null;
    }
    return map;
  }, [isDistributor, presented, distributorPricing]);

  const distributorTotal = useMemo<number | null>(() => {
    if (!isDistributor || presented.length === 0) return null;
    let sum = 0;
    for (const { line } of presented) {
      const pricing = distributorPricing[line.productId];
      if (!pricing || pricing.kind !== "ready") return null;
      sum += pricing.netSubtotal;
    }
    return sum;
  }, [isDistributor, presented, distributorPricing]);

  // Rótulo del total mientras alguna línea no tiene importe: el fallo de
  // cotización se informa, nunca se disfraza de precio lista.
  const distributorTotalLabel = useMemo(() => {
    const kinds = presented.map(({ line }) => distributorPricing[line.productId]?.kind);
    if (kinds.some(kind => kind === "unavailable")) return distributorPendingLabel("unavailable");
    if (kinds.some(kind => kind === "loading")) return distributorPendingLabel("loading");
    return distributorPendingLabel("pending");
  }, [presented, distributorPricing]);

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
          !isDistributor && (getStoredAttemptStatus({ channel: attemptChannel }).kind !== "missing" ||
          getStoredSessionPresence({ channel: attemptChannel }) !== "missing") ? (
            <p className="cart-empty">
              Hay un pedido anterior para revisar.{" "}
              <button
                className="cart-retry"
                type="button"
                onClick={() => openCheckout(isDistributor, distributor?.discountPercent ?? null)}
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
              {presented.map(({ line, product, subtotal }) => {
                  const pricing = distributorPricing[line.productId];
                  return (
                  <li key={line.productId} className="cart-line">
                    <div className="cart-line-info">
                      <strong>{product.nombre}</strong>
                      {product.sku ? <small>SKU {product.sku}</small> : null}
                      {hasPrice(product) ? <span className="cart-line-price">
                        {isDistributor ? "Precio lista " : ""}{money(product.precio)} c/u
                      </span> : null}
                      {isDistributor && hasPrice(product) ? (() => {
                        if (!pricing) return null;
                        if (pricing.kind === "ready") {
                          return <span className="cart-line-distributor">
                            Distribuidor {money(pricing.netUnitPrice)} c/u
                          </span>;
                        }
                        if (pricing.kind === "pending") {
                          return <span className="cart-line-distributor">Distribuidor a confirmar</span>;
                        }
                        if (pricing.kind === "unavailable") {
                          return <span className="cart-line-distributor">Precio distribuidor no disponible</span>;
                        }
                        return <span className="cart-line-distributor">Consultando precio distribuidor…</span>;
                      })() : null}
                    </div>
                    <div className={`cart-line-controls${isDistributor ? " cart-line-controls--distributor" : ""}`}>
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
                      {isDistributor ? (
                        // El subtotal de la línea es el precio unitario cotizado
                        // por la cantidad exacta: nunca el precio lista.
                        hasPrice(product) ? (
                          <span className="cart-line-subtotal cart-line-subtotal--distributor">
                            <small className="cart-line-subtotal-label">Subtotal</small>
                            {pricing?.kind === "ready" ? (
                              <strong>{money(pricing.netSubtotal)}</strong>
                            ) : (
                              <span className="cart-line-subtotal-pending">
                                {pricing ? distributorLinePendingLabel(pricing) : distributorPendingLabel("loading")}
                              </span>
                            )}
                          </span>
                        ) : null
                      ) : hasPrice(product) && subtotal != null ? <span className="cart-line-subtotal">
                        {formatPrice(subtotal)}
                      </span> : null}
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
                );
              })}
            </ul>
            <footer className="cart-footer">
              {total != null && presented.every(({ product }) => hasPrice(product)) ? <div className="cart-total">
                <span>{isDistributor ? "Total lista" : "Total"}</span>
                <strong>{money(total)}</strong>
              </div> : null}
              {isDistributor ? (
                <div className="cart-total cart-total--distributor">
                  <span>
                    Total distribuidor
                    {distributor?.discountPercent != null && distributor.discountConfirmed ? (
                      <em className="cart-distributor-badge">{discountBadgeLabel(distributor.discountPercent)}</em>
                    ) : null}
                  </span>
                  {distributorTotal != null ? (
                    <strong>{money(distributorTotal)}</strong>
                  ) : (
                    <strong className="cart-distributor-pending">
                      {presented.length > 0 ? distributorTotalLabel : "—"}
                    </strong>
                  )}
                </div>
              ) : null}
              {isDistributor ? (
                <p className="future-note">
                  Importes cotizados por el servidor. El total final se confirma al procesar el pedido.
                </p>
              ) : null}
              <button
                className="order-button is-active"
                type="button"
                onClick={() => openCheckout(isDistributor, distributor?.discountPercent ?? null)}
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
        onClose={closeCheckout}
        onReturnToCatalog={() => { closeCheckout(); setCartOpen(false); }}
        presented={presented}
        total={total}
        clearCart={clearCart}
        distributorMode={checkoutDist.mode}
        distributorDiscountPercent={checkoutDist.discount}
        /* El porcentaje sólo se muestra si una cotización vigente lo
           confirmó: mientras no esté confirmado no hay descuento que
           anunciar. */
        distributorDiscountConfirmed={distributor?.discountConfirmed ?? false}
        distributorTotal={distributorTotal}
        distributorNetByProduct={distributorNetByProduct}
        onDistributorSessionExpired={() => distributor?.expireSession()}
        /* Prueba de continuidad de la sesión (sólo memoria): el identificador
           opaco de sesión que devuelve el backend. El backend devuelve el
           MISMO identificador en cada revalidación de la misma sesión, así
           que una revalidación inocua conserva la prueba y el intento sigue
           siendo reenviable. Un login nuevo, un logout o una expiración
           cambian la prueba (o la borran) y el intento deja de ser
           reenviable. Sin ese valor no hay continuidad demostrada. */
        distributorSessionFingerprint={distributor?.sessionFingerprint ?? null}
        submitFn={checkoutDist.mode ? submitDistributorOrder : undefined}
      />
    </div>,
    document.body,
  );
}
