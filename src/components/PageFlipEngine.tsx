import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PageFlip } from "page-flip";
import type { CatalogPage, Product } from "../types/catalog";
import { products } from "../data/CatalogData";
import { PdfPage } from "./PdfPage";

export type PageFlipHandle = {
  next: () => void;
  previous: () => void;
  first: () => void;
  last: () => void;
  goTo: (pageNumber: number) => void;
};

type PageFlipEngineProps = {
  pages: CatalogPage[];
  activeIndex: number;
  onPageChange: (pageIndex: number) => void;
  onOrientationChange: (orientation: "portrait" | "landscape") => void;
  onCoverReady: () => void;
  onProductSelect: (product: Product) => void;
};

export const PageFlipEngine = forwardRef<PageFlipHandle, PageFlipEngineProps>(
  function PageFlipEngine(
    { pages, activeIndex, onPageChange, onOrientationChange, onCoverReady, onProductSelect },
    forwardedRef,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<PageFlip | null>(null);
    const activeIndexRef = useRef(activeIndex);
    const sharpPagesRef = useRef(new Set([0, 1, 2, 3, 4]));
    const decodeRequestedRef = useRef(new Set<string>());
    const onProductSelectRef = useRef(onProductSelect);
    activeIndexRef.current = activeIndex;
    onProductSelectRef.current = onProductSelect;

    useImperativeHandle(forwardedRef, () => ({
      next: () => engineRef.current?.flipNext("bottom"),
      previous: () => engineRef.current?.flipPrev("bottom"),
      first: () => engineRef.current?.turnToPage(0),
      last: () => engineRef.current?.turnToPage(pages.length - 1),
      goTo: (pageNumber: number) => engineRef.current?.flip(pageNumber - 1, "bottom"),
    }), [pages.length]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host || pages.length === 0) return;

      const engine = new PageFlip(host, {
        width: 960,
        height: 540,
        size: "stretch",
        minWidth: 300,
        maxWidth: 1100,
        minHeight: 169,
        maxHeight: 619,
        drawShadow: true,
        flippingTime: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 180 : 950,
        usePortrait: true,
        startPage: 0,
        autoSize: true,
        maxShadowOpacity: 0.52,
        showCover: true,
        mobileScrollSupport: true,
        swipeDistance: 28,
        clickEventForward: true,
        useMouseEvents: true,
        disableFlipByClick: true,
      });

      // The cover is intentionally quiet at rest. PageFlip uses this setting
      // only for its passive corner preview; an intentional mouse/touch drag
      // still enters the normal user-touch path.
      engine.getSettings().showPageCorners = false;

      const syncCornerPreview = (pageIndex: number) => {
        engine.getSettings().showPageCorners = pageIndex !== 0;
        if (pageIndex !== 0) host.classList.remove("is-cover-opening");
      };

      const handleCoverMouseDown = () => {
        if (activeIndexRef.current === 0) engine.getSettings().showPageCorners = true;
      };
      const handleCoverMouseUp = () => {
        if (activeIndexRef.current === 0) engine.getSettings().showPageCorners = false;
      };

      const resetCoverLight = () => {
        host.classList.remove("is-cover-engaged");
        host.style.setProperty("--cover-light-x", "50%");
        host.style.setProperty("--cover-light-y", "45%");
        host.style.setProperty("--cover-tilt-x", "0deg");
        host.style.setProperty("--cover-tilt-y", "0deg");
      };
      const handleCoverPointerMove = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || activeIndexRef.current !== 0 || host.classList.contains("is-cover-opening")) {
          resetCoverLight();
          return;
        }
        const cover = host.querySelector<HTMLElement>(".catalog-leaf:first-child");
        if (!cover || !cover.contains(event.target as Node)) {
          resetCoverLight();
          return;
        }
        const rect = cover.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
        host.style.setProperty("--cover-light-x", `${x}%`);
        host.style.setProperty("--cover-light-y", `${y}%`);
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const maxTiltX = reduceMotion ? 0 : 1.05;
        const maxTiltY = reduceMotion ? 0 : 0.75;
        const tiltX = ((x - 50) / 50) * maxTiltX;
        const tiltY = -((y - 50) / 50) * maxTiltY;
        host.style.setProperty("--cover-tilt-x", `${tiltX.toFixed(2)}deg`);
        host.style.setProperty("--cover-tilt-y", `${tiltY.toFixed(2)}deg`);
        host.classList.add("is-cover-engaged");
      };
      const handleCoverPointerLeave = () => resetCoverLight();

      engine.on("flip", (event) => {
        const pageIndex = Number(event.data);
        syncCornerPreview(pageIndex);
        onPageChange(pageIndex);
      });
      engine.on("changeState", (event) => {
        const state = String(event.data);
        // StPageFlip updates its internal page index before the React indicator
        // catches up. Use the active direction to distinguish the cover return
        // (page 1 -> 0) from the first interior turn (page 1 -> 3).
        const currentPage = engine.getCurrentPageIndex();
        const direction = engine.getFlipController().getCalculation()?.getDirection();
        const isCoverTransition =
          (activeIndexRef.current === 0 && currentPage === 0) ||
          (currentPage === 1 && direction === 1);
        if (isCoverTransition && state !== "read") {
          resetCoverLight();
          host.classList.add("is-cover-opening");
        } else if (state === "read") {
          host.classList.remove("is-cover-opening");
        }
      });
      engine.on("changeOrientation", (event) => {
        onOrientationChange(event.data as "portrait" | "landscape");
      });
      engine.on("init", (event) => {
        const data = event.data as { page: number; mode: "portrait" | "landscape" };
        syncCornerPreview(data.page);
        onPageChange(data.page);
        onOrientationChange(data.mode);
      });

      engine.loadFromHTML(host.querySelectorAll<HTMLElement>(".catalog-leaf"));
      engineRef.current = engine;
      const coverLeaf = host.querySelector<HTMLElement>(".catalog-leaf:first-child");
      const captureCoverTop = () => {
        if (!coverLeaf || activeIndexRef.current !== 0 || host.classList.contains("is-cover-opening")) return;
        const coverTop = coverLeaf.style.top || getComputedStyle(coverLeaf).top;
        if (coverTop && coverTop !== "auto") host.style.setProperty("--cover-open-top", coverTop);
      };
      captureCoverTop();
      const coverTopFrame = window.requestAnimationFrame(captureCoverTop);

      const handleDelegatedHotspot = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        const hotspot = target?.closest<HTMLElement>("[data-product-id]");
        const productId = hotspot?.dataset.productId;
        if (productId && products[productId]) {
          event.preventDefault();
          event.stopPropagation();
          onProductSelectRef.current(products[productId]);
        }
      };
      host.addEventListener("click", handleDelegatedHotspot, true);
      host.addEventListener("mousedown", handleCoverMouseDown, true);
      host.addEventListener("pointermove", handleCoverPointerMove, true);
      host.addEventListener("pointerleave", handleCoverPointerLeave, true);
      window.addEventListener("mouseup", handleCoverMouseUp, true);

      return () => {
        host.removeEventListener("click", handleDelegatedHotspot, true);
        host.removeEventListener("mousedown", handleCoverMouseDown, true);
        host.removeEventListener("pointermove", handleCoverPointerMove, true);
        host.removeEventListener("pointerleave", handleCoverPointerLeave, true);
        window.removeEventListener("mouseup", handleCoverMouseUp, true);
        resetCoverLight();
        window.cancelAnimationFrame(coverTopFrame);
        host.style.removeProperty("--cover-open-top");
        engine.destroy();
        engineRef.current = null;
      };
    }, [onOrientationChange, onPageChange, pages]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      host.querySelectorAll<HTMLImageElement>("img[data-catalog-page]").forEach((image) => {
        const index = Number(image.dataset.catalogPage) - 1;
        const shouldBeSharp = index === 0 || Math.abs(index - activeIndex) <= 2;
        if (shouldBeSharp) sharpPagesRef.current.add(index);
        const nextSrc = sharpPagesRef.current.has(index) ? image.dataset.fullSrc : image.dataset.thumbnailSrc;
        if (nextSrc && image.getAttribute("src") !== nextSrc) image.src = nextSrc;

        if (shouldBeSharp && image.dataset.fullSrc && !decodeRequestedRef.current.has(image.dataset.fullSrc)) {
          decodeRequestedRef.current.add(image.dataset.fullSrc);
          const probe = new Image();
          probe.decoding = "async";
          probe.src = image.dataset.fullSrc;
          void probe.decode().catch(() => undefined);
        }
      });
    }, [activeIndex]);

    return (
      <div ref={hostRef} className="page-flip-host" data-testid="page-flip-engine">
        {pages.map((page, index) => (
          <div
            className="catalog-leaf"
            data-density={index === 0 || index === pages.length - 1 ? "hard" : "soft"}
            key={page.id}
          >
            <PdfPage
              page={page}
            initiallySharp={index <= 4}
              onCoverReady={index === 0 ? onCoverReady : undefined}
              onProductSelect={onProductSelect}
            />
          </div>
        ))}
      </div>
    );
  },
);
