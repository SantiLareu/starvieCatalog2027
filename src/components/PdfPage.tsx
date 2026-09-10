import type { CatalogPage, Product } from "../types/catalog";
import { hotspotsForPage, products } from "../data/CatalogData";
import { CoverIntro } from "./CoverIntro";
import { HotspotLayer } from "./HotspotLayer";

type PdfPageProps = {
  page: CatalogPage;
  initiallySharp: boolean;
  onCoverReady?: () => void;
  onProductSelect: (product: Product) => void;
};

export function PdfPage({ page, initiallySharp, onCoverReady, onProductSelect }: PdfPageProps) {
  const pageHotspots = hotspotsForPage(page.id);

  return (
    <div className="pdf-page" data-page-number={page.number}>
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
        <CoverIntro
          baseSrc="/catalog/pages/page-01-base.webp"
          src={page.src}
          width={page.width}
          height={page.height}
        />
      ) : null}
      {pageHotspots.length > 0 ? (
        <HotspotLayer
          hotspots={pageHotspots}
          products={products}
          onProductSelect={onProductSelect}
        />
      ) : null}
      <span className="page-edge" aria-hidden="true" />
    </div>
  );
}
