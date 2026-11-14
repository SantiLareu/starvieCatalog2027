import { useEffect } from "react";
import { formatDisplayPrice } from "../../commerce/displayPrice";
import { useOptionalDistributor } from "../../commerce/distributor/DistributorContext";
import "./distributor.css";

/**
 * Línea "Precio distribuidor" para superficies que no usan PriceTag
 * (hojas móviles de accesorios). Solo renderiza con sesión y únicamente
 * muestra importes devueltos por GET /api/distributor/quote.
 */
export function DistributorPriceLine({ productId }: { productId: string }) {
  const distributor = useOptionalDistributor();
  const authenticated = distributor?.isAuthenticated ?? false;
  const quote = authenticated && distributor ? distributor.quoteFor(productId, 1) : null;
  // Epoch de cotizaciones: una invalidación (revalidación de sesión) vuelve a
  // pedir la cotización de este producto.
  const quoteEpoch = distributor?.quoteEpoch;

  useEffect(() => {
    if (authenticated && distributor) distributor.ensureQuote(productId, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, quoteEpoch, productId]);

  if (!authenticated || !distributor || distributor.discountPercent == null) return null;

  // El porcentaje sólo se muestra cuando una cotización vigente del servidor
  // confirmó el descuento: antes de eso no hay descuento que anunciar.
  const confirmedDiscountPercent = distributor.discountConfirmed
    ? distributor.discountPercent
    : null;
  /* La línea mostrada tiene que ser la de ESTE producto y ESTA cantidad: una
     cotización ajena no puede mostrarse como el precio de este artículo. */
  const line = quote?.status === "ready" ? quote.line : null;
  const matchesLine = line !== null && line.productId === productId && line.qty === 1;
  const net = matchesLine && line !== null ? line.netUnitPrice : undefined;
  const unavailable =
    quote?.status === "unavailable" ||
    quote?.status === "error" ||
    (quote?.status === "ready" && !matchesLine);
  return (
    <div className="distributor-price-line" data-testid="distributor-price-line">
      <span className="distributor-price-line__label" aria-hidden="true">
        Precio distribuidor
      </span>
      {typeof net === "number" ? (
        <strong className="distributor-price-line__amount" aria-hidden="true">
          {formatDisplayPrice(net)}
        </strong>
      ) : (
        <span className="distributor-price-line__pending" aria-hidden="true">
          {unavailable
            ? "No disponible"
            : net === null
              ? "A confirmar"
              : "Consultando…"}
        </span>
      )}
      {confirmedDiscountPercent != null ? (
        <span className="distributor-price-line__badge" aria-hidden="true">
          {confirmedDiscountPercent}% de descuento
        </span>
      ) : null}
      <span className="distributor-price-line__sr">
        {typeof net === "number"
          ? confirmedDiscountPercent != null
            ? `Precio distribuidor: ${formatDisplayPrice(net)} (${confirmedDiscountPercent}% de descuento).`
            : `Precio distribuidor: ${formatDisplayPrice(net)}.`
          : "Precio distribuidor a confirmar."}
      </span>
    </div>
  );
}
