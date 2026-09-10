import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CatalogPage, Product } from "../types/catalog";

type ProductModalProps = {
  product: Product | null;
  page?: CatalogPage;
  onClose: () => void;
};

export function ProductModal({ product, page, onClose }: ProductModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!product) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [product, onClose]);

  if (!product) return null;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Cerrar ficha">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="product-visual">
          {page ? <img src={page.src} alt={`${product.name}, detalle de la página ${product.pageNumber}`} /> : null}
          <span>Pág. {product.pageNumber}</span>
        </div>

        <div className="product-details">
          <p className="product-range">{product.range}</p>
          <h2 id="product-modal-title">{product.name}</h2>
          <dl>
            <div><dt>Tipo de juego</dt><dd>{product.playStyle}</dd></div>
            <div><dt>Forma</dt><dd>{product.shape}</dd></div>
            <div><dt>Plano</dt><dd>{product.surface}</dd></div>
            <div><dt>Peso</dt><dd>{product.weight}</dd></div>
            <div><dt>Balance</dt><dd>{product.balance}</dd></div>
            <div><dt>Referencia</dt><dd>{product.reference}</dd></div>
          </dl>
          <div className="product-prices">
            <span><small>P.V.P.</small>{product.price}</span>
            <span><small>Street price</small>{product.streetPrice}</span>
          </div>
          <button className="order-button" type="button" disabled title="Disponible en una próxima fase">
            Agregar al pedido
          </button>
          <p className="future-note">Pedido disponible en una próxima fase · EAN {product.ean}</p>
        </div>
      </section>
    </div>,
    document.body,
  );
}
