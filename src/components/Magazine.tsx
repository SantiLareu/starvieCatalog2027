import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogMetadata, Product } from "../types/catalog";
import { PageFlipEngine, type PageFlipHandle } from "./PageFlipEngine";
import { ProductModal } from "./ProductModal";

type MagazineProps = {
  catalog: CatalogMetadata;
};

export function Magazine({ catalog }: MagazineProps) {
  const engineRef = useRef<PageFlipHandle>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [coverReady, setCoverReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const onPageChange = useCallback((index: number) => {
    setActiveIndex(index);
    setPageInput(String(index + 1));
  }, []);
  const onOrientationChange = useCallback((value: "portrait" | "landscape") => {
    setOrientation(value);
  }, []);

  useEffect(() => {
    const candidates = new Set([0, activeIndex - 2, activeIndex - 1, activeIndex, activeIndex + 1, activeIndex + 2]);
    for (const index of candidates) {
      const page = catalog.pages[index];
      if (page) {
        const image = new Image();
        image.decoding = "async";
        image.src = page.src;
      }
    }
  }, [activeIndex, catalog.pages]);

  const currentLabel = useMemo(() => {
    const first = activeIndex + 1;
    if (orientation === "landscape" && activeIndex > 0 && activeIndex < catalog.pageCount - 1) {
      return `${first}–${Math.min(first + 1, catalog.pageCount)} / ${catalog.pageCount}`;
    }
    return `${first} / ${catalog.pageCount}`;
  }, [activeIndex, catalog.pageCount, orientation]);

  const goToPage = (event: FormEvent) => {
    event.preventDefault();
    const requested = Math.max(1, Math.min(catalog.pageCount, Number(pageInput) || 1));
    setPageInput(String(requested));
    engineRef.current?.goTo(requested);
    setPagePickerOpen(false);
  };

  const modalPage = selectedProduct
    ? catalog.pages[selectedProduct.pageNumber - 1]
    : undefined;

  return (
    <main className={`catalog-app ${coverReady ? "cover-ready" : ""} ${activeIndex === 0 ? "cover-active" : ""} ${activeIndex === 0 && orientation === "landscape" ? "is-cover" : ""}`}>
      <header className="catalog-toolbar">
        <div className="toolbar-left">
          <button
            className="icon-button menu-button"
            type="button"
            aria-label={drawerOpen ? "Cerrar miniaturas" : "Abrir miniaturas"}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <span aria-hidden="true">{drawerOpen ? "×" : "☰"}</span>
          </button>
          <div className="brand-lockup" aria-label="StarVie 2027">
            <strong>STARVIE</strong><span>2027</span>
          </div>
        </div>

        <div className="page-picker-wrap">
          <button
            className="page-indicator"
            data-testid="page-indicator"
            type="button"
            aria-label="Ir a una página"
            aria-expanded={pagePickerOpen}
            onClick={() => setPagePickerOpen((open) => !open)}
          >
            {currentLabel}
          </button>
          {pagePickerOpen ? (
            <form className="page-picker" onSubmit={goToPage}>
              <label htmlFor="page-number">Ir a</label>
              <input
                id="page-number"
                type="number"
                inputMode="numeric"
                min="1"
                max={catalog.pageCount}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                autoFocus
              />
              <span>/ {catalog.pageCount}</span>
              <button type="submit">Ir</button>
            </form>
          ) : null}
        </div>

        <p className="toolbar-hint">Arrastra una esquina o usa las flechas</p>
      </header>

      <aside className={`thumbnail-drawer ${drawerOpen ? "is-open" : ""}`} aria-label="Miniaturas">
        <div className="thumbnail-list">
          {catalog.pages.map((page) => (
            <button
              className={Math.abs(page.number - 1 - activeIndex) <= (orientation === "landscape" && activeIndex > 0 ? 1 : 0) ? "is-active" : ""}
              key={page.id}
              type="button"
              onClick={() => {
                engineRef.current?.goTo(page.number);
                setDrawerOpen(false);
              }}
              aria-label={`Ir a página ${page.number}`}
            >
              <img src={page.thumbnail} alt="" width="120" height="68" loading="lazy" decoding="async" />
              <span>{page.number}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="magazine-stage" aria-label="Catálogo StarVie 2027">
        <div className="stage-glow" aria-hidden="true" />
        <PageFlipEngine
          ref={engineRef}
          pages={catalog.pages}
          activeIndex={activeIndex}
          onPageChange={onPageChange}
          onOrientationChange={onOrientationChange}
          onCoverReady={() => setCoverReady(true)}
          onProductSelect={setSelectedProduct}
        />

        <nav className="edge-controls previous-controls" aria-label="Navegación anterior">
          <button type="button" onClick={() => engineRef.current?.previous()} disabled={activeIndex === 0} aria-label="Página anterior">
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" onClick={() => engineRef.current?.first()} disabled={activeIndex === 0} aria-label="Primera página">
            <span aria-hidden="true">|‹</span>
          </button>
        </nav>
        <nav className="edge-controls next-controls" aria-label="Navegación siguiente">
          <button type="button" onClick={() => engineRef.current?.next()} disabled={activeIndex >= catalog.pageCount - 1} aria-label="Página siguiente">
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" onClick={() => engineRef.current?.last()} disabled={activeIndex >= catalog.pageCount - 1} aria-label="Última página">
            <span aria-hidden="true">›|</span>
          </button>
        </nav>

        {!coverReady ? (
          <div className="catalog-loading" role="status">
            <span className="loading-mark">✦</span>
            <strong>STARVIE</strong>
            <small>Cargando catálogo 2027</small>
          </div>
        ) : null}
      </section>

      <ProductModal product={selectedProduct} page={modalPage} onClose={() => setSelectedProduct(null)} />
    </main>
  );
}
