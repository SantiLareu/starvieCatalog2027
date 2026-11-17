import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { hotspotsForPage } from "../data/CatalogData";
import { hasPagePricePlacement, pagePricePlacement } from "../data/pagePriceZones";
import { useCommerce } from "../commerce/CommerceContext";
import { hasPrice } from "../commerce/productEligibility";
import type { CommerceProduct } from "../commerce/types";
import { MobileAccessoryPriceCell } from "./mobile/MobileAccessoryPriceCell";

/**
 * Precio editorial sobre las páginas desktop del catálogo.
 *
 * El precio NO se inventa: sale del catálogo vivo (CommerceContext) y, para
 * el distribuidor, de la cotización del servidor (la misma lógica y el mismo
 * componente que ya usan las hojas mobile de accesorios, sin clonarla).
 *
 * La capa es INERTE: no captura el clic del hotspot ni publica
 * `data-product-id` (los hotspots los delega el motor del libro). El precio
 * se pide sólo cuando la hoja está a la vista, para no cotizar el catálogo
 * entero al abrir el libro.
 */

/** Zona editorial del precio según la familia de página. */
export type PagePriceZone = "paddle" | "accessory" | "pair-left" | "pair-right";

/**
 * Páginas SIN precio por decisión editorial (no es un olvido):
 *  · P38 es la retícula de accesorios: lleva nueve productos chicos y su
 *    precio pertenece a la ficha, no a la página;
 *  · P27 es el índice y las demás páginas no son de producto.
 */
export function pagePriceZone(pageNumber: number, index: number): PagePriceZone | null {
  if (pageNumber >= 15 && pageNumber <= 26) return "paddle";
  if (pageNumber >= 28 && pageNumber <= 36) return "accessory";
  if (pageNumber === 37) return index === 0 ? "pair-left" : "pair-right";
  return null;
}

export type PagePriceTarget = { productId: string; index: number };

/**
 * Productos con precio de una página, tomados del mapa editorial existente
 * (CatalogData): P15–26 una pala, P28–36 un accesorio, P37 dos neceseres.
 * La categoría no aparece en ninguna decisión: manda el mapa.
 */
export function pagePriceTargets(pageId: string, pageNumber: number): PagePriceTarget[] {
  if (pageNumber === 38) return [];
  return hotspotsForPage(pageId).map((hotspot, index) => ({ productId: hotspot.productId, index }));
}

/**
 * ¿Está la hoja a la vista? Sólo entonces se consulta la cotización del
 * distribuidor: el libro monta todas sus hojas y no todas son legibles.
 * Sin IntersectionObserver (entornos sin soporte) la hoja se toma como
 * visible: el precio lista nunca depende de esta señal.
 */
export function usePageVisible(ref: RefObject<HTMLElement | null>, enabled = true): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => setVisible(entries.some(entry => entry.isIntersecting)),
      { threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return visible;
}

/**
 * Precio de un producto sobre la página. Reutiliza la celda de precio
 * mobile (misma fuente de verdad y mismo contrato de distribuidor) y la
 * presenta con la tipografía editorial de la página.
 */
export function PagePriceTag({ product, pageNumber, index, active, live }: {
  product: CommerceProduct | null;
  pageNumber: number;
  index: number;
  /** La hoja está a la vista: se permite consultar y mostrar el neto. */
  active: boolean;
  /** El catálogo vivo conoce el producto. */
  live: boolean;
}) {
  const zone = pagePriceZone(pageNumber, index);
  if (zone == null || product == null || !hasPrice(product)) return null;
  /* La posición NO es genérica: cada página tiene su zona libre medida sobre
     el arte original (src/data/pagePriceZones.ts). P37 conserva su
     distribución propia y no recibe override por página. */
  const placement = pagePricePlacement(pageNumber);
  const style = placement
    ? ({
      "--price-left": `${placement.region.left}%`,
      "--price-top": `${placement.region.top}%`,
      "--price-width": `${placement.region.width}%`,
    } as CSSProperties)
    : undefined;
  return (
    <div
      className="page-price-tag"
      data-price-zone={zone}
      data-price-page={placement ? pageNumber : undefined}
      style={style}
    >
      {zone === "pair-left" || zone === "pair-right" ? (
        <span className="page-price-tag__name">{product.nombre}</span>
      ) : null}
      <MobileAccessoryPriceCell product={product} active={active} live={live} />
    </div>
  );
}

/**
 * Marco de la capa de precio de una hoja.
 *
 * Sólo las páginas con ubicación medida (P15–26, P28–36) llevan el marcador
 * `data-price-measured`: es lo que habilita la contención de tamaño para
 * medir el chip respecto del ancho de la hoja. P37 (distribución aprobada) y
 * P38 (sin precios) conservan la capa tal cual, sin marcador ni contención.
 */
export function PriceOverlayFrame({ pageNumber, children }: {
  pageNumber: number;
  children: ReactNode;
}) {
  const measured = hasPagePricePlacement(pageNumber);
  return (
    <div className="page-price-overlay" data-price-measured={measured ? "true" : undefined}>
      {children}
    </div>
  );
}

/** Capa de precios de una página: resuelve los productos del catálogo vivo. */
export function PagePriceOverlay({ pageId, pageNumber, active }: {
  pageId: string;
  pageNumber: number;
  active: boolean;
}) {
  const { products } = useCommerce();
  const byId = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const targets = useMemo(() => pagePriceTargets(pageId, pageNumber), [pageId, pageNumber]);
  if (targets.length === 0) return null;
  return (
    <PriceOverlayFrame pageNumber={pageNumber}>
      {targets.map(target => (
        <PagePriceTag
          key={target.productId}
          product={byId.get(target.productId) ?? null}
          pageNumber={pageNumber}
          index={target.index}
          active={active}
          live={byId.has(target.productId)}
        />
      ))}
    </PriceOverlayFrame>
  );
}
