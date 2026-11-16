import { useEffect, useRef } from "react";
import { formatDisplayPrice } from "../../commerce/displayPrice";
import { hasPrice } from "../../commerce/productEligibility";
import { useOptionalDistributor } from "../../commerce/distributor/DistributorContext";
import {
  distributorLinePricing,
  distributorLinePendingLabel,
  distributorPendingLabel,
  type DistributorLinePricing,
} from "../../commerce/distributor/pricingDisplay";
import type { CommerceProduct } from "../../commerce/types";

/**
 * Celda de precio de las hojas mobile de accesorios (P28–37).
 *
 * Es la tercera celda de la ficha de datos (DIMENSIONES | MATERIALES | PRECIO
 * LISTA) del diseño aprobado: rótulo editorial, importe destacado y un filete
 * vertical como el de las otras dos celdas. Sin placa ni panel aparte.
 *
 * Reglas de autoridad:
 *  · el precio LISTA sale del catálogo vivo; si el producto no tiene precio,
 *    la celda no existe (P28/P33 se quedan como están);
 *  · el precio NETO existe únicamente si lo devolvió la cotización del
 *    servidor para ESE producto y ESA cantidad. El frontend no calcula
 *    descuentos: si la cotización no llega, o llega de otro producto, o
 *    corresponde a un precio lista que ya cambió, no se muestra ningún
 *    importe como precio final;
 *  · la hoja sólo pide su cotización cuando está activa: el motor de páginas
 *    monta todas las hojas, así que una hoja inactiva no puede pedir precios.
 */
export function MobileAccessoryPriceCell({ product, active, live }: {
  product: CommerceProduct | null;
  active: boolean;
  live: boolean;
}) {
  const distributor = useOptionalDistributor();
  const authenticated = distributor?.isAuthenticated ?? false;
  const productId = product?.id ?? "";
  const priced = product != null && hasPrice(product);
  // Epoch de cotizaciones: una invalidación (revalidación de sesión, login o
  // cierre) vuelve a pedir la cotización de este producto UNA vez.
  const quoteEpoch = distributor?.quoteEpoch;
  /* Último contexto de distribuidores conocido. El efecto NO depende del
     objeto entero: si dependiera, cada cambio de cotizaciones re-ejecutaría
     el efecto y el contexto volvería a pedir la cotización de un fallo que
     ya terminó (bucle de peticiones). */
  const distributorRef = useRef(distributor);
  distributorRef.current = distributor;
  /* Petición ya emitida para este producto y esta generación de cotizaciones.
     Un fallo o una indisponibilidad NO se reintentan solos: sólo una nueva
     activación de la hoja o un nuevo epoch pueden pedir de nuevo. */
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active) {
      // Al salir de la hoja se libera la petición: la próxima activación
      // puede volver a consultar el precio del distribuidor.
      requestedRef.current = null;
      return;
    }
    const current = distributorRef.current;
    if (!live || !current?.isAuthenticated) return;
    if (!productId || !priced) return;
    const requestKey = `${productId}:${current.quoteEpoch}`;
    if (requestedRef.current === requestKey) return;
    requestedRef.current = requestKey;
    current.ensureQuote(productId, 1);
  }, [active, live, productId, priced, quoteEpoch]);

  if (!product || !priced) return null;

  const quote = authenticated && distributor ? distributor.quoteFor(productId, 1) : null;
  const pricing: DistributorLinePricing = distributorLinePricing({
    authenticated,
    productId,
    qty: 1,
    quote,
  });
  const listPrice = product.precio;

  /* El neto sólo se muestra si la cotización vigente es de este producto y
     esta cantidad (lo garantiza `distributorLinePricing`) Y corresponde al
     precio lista vigente: una cotización de un catálogo anterior es un
     importe desactualizado y no puede presentarse como precio final. */
  const quoteLine = quote?.status === "ready" ? quote.line : null;
  const matchesCatalog =
    quoteLine != null &&
    quoteLine.listUnitPrice != null &&
    quoteLine.listUnitPrice === listPrice;
  const netPrice =
    pricing.kind === "ready" && matchesCatalog ? pricing.netUnitPrice : null;

  let netValue: string | null = null;
  if (authenticated) {
    if (netPrice != null) netValue = formatDisplayPrice(netPrice);
    /* Una cotización lista pero desactualizada se trata como pendiente: el
       importe existe, pero no es el de este catálogo. */
    else if (pricing.kind === "ready") netValue = distributorPendingLabel("pending");
    else netValue = distributorLinePendingLabel(pricing);
  }

  /* La línea de distribuidor sólo aparece cuando hay algo que decir: una hoja
     activa consulta su precio (aunque sea "Consultando…"); una hoja inactiva
     todavía no pidió nada y no anuncia una consulta inexistente. */
  const showNet = authenticated && (active || (quote != null && quote.status !== "idle"));

  return (
    <div
      className="mobile-accessory-price"
      data-price-state={netPrice != null ? "net" : authenticated ? "pending" : "list"}
      data-has-net={netPrice != null ? "true" : "false"}
      data-price-product={product.id}
    >
      <span className="mobile-accessory-price__label">PRECIO LISTA</span>
      <span className="mobile-accessory-price__amount">{formatDisplayPrice(listPrice)}</span>
      {showNet ? (
        <span className="mobile-accessory-price__net">
          <span className="mobile-accessory-price__net-label">Distribuidor</span>
          <span className="mobile-accessory-price__net-value">{netValue}</span>
        </span>
      ) : null}
    </div>
  );
}
