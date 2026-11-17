import { useRef } from "react";
import type { CatalogPage } from "../types/catalog";
import { hotspotsForPage, selectLiveHotspots } from "../data/CatalogData";
import { CoverIntro } from "./CoverIntro";
import { MobilePortraitCover } from "./mobile/MobilePortraitCover";
import { HotspotLayer } from "./HotspotLayer";
import { PagePriceOverlay, pagePriceTargets, usePageVisible } from "./PagePriceTag";

type PdfPageProps = {
  page: CatalogPage;
  initiallySharp: boolean;
  onCoverReady?: () => void;
  productNames: Record<string, string>;
  onProductSelect: (productId: string) => void;
};

export function PdfPage({
  page,
  initiallySharp,
  onCoverReady,
  productNames,
  onProductSelect,
}: PdfPageProps) {
  // Solo productos vigentes del Excel (cualquier categoría): un producto
  // retirado del catálogo deja de mostrar hotspot; uno no disponible sigue
  // visible y abre el modal como "Sin stock".
  const pageHotspots = selectLiveHotspots(hotspotsForPage(page.id), productNames);
  // La capa de precio sólo se monta en páginas con producto y sólo pide la
  // cotización del distribuidor cuando la hoja está a la vista.
  const hasPrices = pagePriceTargets(page.id, page.number).length > 0;
  const pageRef = useRef<HTMLDivElement>(null);
  const visible = usePageVisible(pageRef, hasPrices);

  return (
    <div className="pdf-page" data-page-number={page.number} ref={pageRef}>
      <img
        className="pdf-page-image"
        data-catalog-page={page.number}
        data-full-src={page.src}
        data-thumbnail-src={page.thumbnail}
        src={initiallySharp ? page.src : page.thumbnail}
        alt={`Página ${page.number} del catálogo StarVie 2027`}
        width={page.width}
        height={page.height}
        draggable={false}
        loading={page.number <= 3 ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={page.number === 1 ? "high" : "auto"}
        onLoad={page.number === 1 ? onCoverReady : undefined}
      />
      {page.number === 1 ? (
        <>
          <CoverIntro
            baseSrc="/catalog/pages/page-01-base.webp"
            src={page.src}
            width={page.width}
            height={page.height}
          />
          <MobilePortraitCover />
        </>
      ) : null}
      {pageHotspots.length > 0 ? (
        <HotspotLayer
          hotspots={pageHotspots}
          productNames={productNames}
          onProductSelect={onProductSelect}
        />
      ) : null}
      {hasPrices ? (
        <PagePriceOverlay pageId={page.id} pageNumber={page.number} active={visible} />
      ) : null}
      <span className="page-edge" aria-hidden="true" />
    </div>
  );
}
