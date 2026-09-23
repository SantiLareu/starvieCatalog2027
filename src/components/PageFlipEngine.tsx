import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { PageFlip } from "page-flip";
import { COLLECTION_LINEUP_PAGE, type BookPage } from "../data/bookFlow";
import { createHardCoverPageFlipSettings } from "../data/hardCoverMotion";
import type { CatalogPage } from "../types/catalog";
import { PdfPage } from "./PdfPage";
import { VideoPage } from "./VideoPage";
import { BackCover, type BackCoverHandle } from "./BackCover";

type PageFlipRuntime = {
  getOrientation: () => "portrait" | "landscape";
  getRender: () => {
    orientation: "portrait" | "landscape";
    getRect: () => { left: number; top: number; height: number };
  };
  getFlipController: () => {
    flip: (point: { x: number; y: number }) => void;
  };
  getPageCollection: () => {
    getPage: (pageIndex: number) => {
      setDensity: (density: "soft" | "hard") => void;
    };
    getCurrentSpreadIndex: () => number;
    getSpreadIndexByPage: (pageIndex: number) => number;
    setCurrentSpreadIndex: (spreadIndex: number) => void;
  };
};

export type PageFlipHandle = {
  next: () => void;
  previous: () => void;
  closeCover: () => void;
  closeBackCover: () => void;
  openBackCover: () => void;
  first: () => void;
  last: () => void;
  goTo: (pageNumber: number) => void;
  goToInstant: (bookIndex: number) => void;
  transitionTo: (bookIndex: number, duration: number) => void;
};

type PageFlipEngineProps = {
  pages: BookPage[];
  /** P39 como superficie visual: nunca es .catalog-leaf ni tiene índice. */
  backCoverPage: CatalogPage | undefined;
  activeIndex: number;
  orientation: "portrait" | "landscape";
  onPageChange: (pageIndex: number) => void;
  onPageSettled: (pageIndex: number) => void;
  onOrientationChange: (orientation: "portrait" | "landscape") => void;
  onCoverReady: () => void;
  productNames: Record<string, string>;
  onProductSelect: (productId: string) => void;
  coverBridgeActive: boolean;
  coverMotionActive: boolean;
  backCoverState: "open" | "closing" | "closed" | "opening";
  onBackCoverTransitionEnd: (state: "open" | "closed") => void;
  interactionLocked: boolean;
  videoPlaybackAllowed: boolean;
  onCoverTransitionStart: () => void;
  manualNavigationBoundary: boolean;
  onManualNavigationIntent: (direction: "previous" | "next") => void;
};

export const PageFlipEngine = forwardRef<PageFlipHandle, PageFlipEngineProps>(
  function PageFlipEngine(
    {
      pages,
      backCoverPage,
      activeIndex,
      orientation,
      onPageChange,
      onPageSettled,
      onOrientationChange,
      onCoverReady,
      productNames,
      onProductSelect,
      coverBridgeActive,
      coverMotionActive,
      backCoverState,
      onBackCoverTransitionEnd,
      interactionLocked,
      videoPlaybackAllowed,
      onCoverTransitionStart,
      manualNavigationBoundary,
      onManualNavigationIntent,
    },
    forwardedRef,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<PageFlip | null>(null);
    const backCoverRef = useRef<BackCoverHandle>(null);
    const activeIndexRef = useRef(activeIndex);
    const sharpPagesRef = useRef(new Set([0, 1, 2, 3, 4]));
    const decodeRequestedRef = useRef(new Set<string>());
    const transitionDurationRef = useRef<number | null>(null);
    const suppressCoverStartRef = useRef(false);
    const portraitCoverCloseRef = useRef(false);
    const onProductSelectRef = useRef(onProductSelect);
    const onPageSettledRef = useRef(onPageSettled);
    const onCoverTransitionStartRef = useRef(onCoverTransitionStart);
    const onManualNavigationIntentRef = useRef(onManualNavigationIntent);
    const interactionLockedRef = useRef(interactionLocked);
    const manualNavigationBoundaryRef = useRef(manualNavigationBoundary);
    activeIndexRef.current = activeIndex;
    onProductSelectRef.current = onProductSelect;
    onPageSettledRef.current = onPageSettled;
    onCoverTransitionStartRef.current = onCoverTransitionStart;
    onManualNavigationIntentRef.current = onManualNavigationIntent;
    interactionLockedRef.current = interactionLocked;
    manualNavigationBoundaryRef.current = manualNavigationBoundary;

    const bridgePages = useMemo(() => ({
      lineup: pages.find(
        (page) => page.kind === "pdf" && page.originalNumber === COLLECTION_LINEUP_PAGE,
      ),
      video: pages.find((page) => page.kind === "video"),
    }), [pages]);
    const rearContentPages = useMemo(
      () => pages.filter((page) => page.kind === "pdf").slice(-2),
      [pages],
    );

    useImperativeHandle(forwardedRef, () => ({
      next: () => engineRef.current?.flipNext("bottom"),
      previous: () => {
        const engine = engineRef.current;
        if (!engine) return;
        const runtime = engine as unknown as PageFlipRuntime;
        if (runtime.getOrientation() === "portrait") {
          const rect = runtime.getRender().getRect();
          runtime.getFlipController().flip({ x: rect.left + 10, y: rect.top + rect.height - 2 });
          return;
        }
        engine.flipPrev("bottom");
      },
      closeCover: () => {
        const engine = engineRef.current;
        if (!engine) return;
        const runtime = engine as unknown as PageFlipRuntime;
        if (runtime.getOrientation() === "portrait") {
          // page-flip 2.0.7 no inicia el retorno de una tapa hard desde el
          // spread portrait 1. Para esta única operación usamos su propia
          // composición hard-cover landscape conservando el rect portrait;
          // el viewport sigue mostrando una sola hoja y se restaura al leer.
          const render = runtime.getRender();
          render.orientation = "landscape";
          portraitCoverCloseRef.current = true;
          const rect = render.getRect();
          runtime.getFlipController().flip({
            x: rect.left + 10,
            y: rect.top + rect.height - 2,
          });
          return;
        }
        engine.flipPrev("bottom");
      },
      closeBackCover: () => {
        backCoverRef.current?.close();
      },
      openBackCover: () => {
        backCoverRef.current?.open();
      },
      first: () => engineRef.current?.turnToPage(0),
      last: () => engineRef.current?.turnToPage(pages.length - 1),
      goTo: (pageNumber: number) => {
        suppressCoverStartRef.current = true;
        engineRef.current?.flip(pageNumber - 1, "bottom");
      },
      goToInstant: (bookIndex: number) => engineRef.current?.turnToPage(bookIndex),
      transitionTo: (bookIndex: number, duration: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        transitionDurationRef.current = engine.getSettings().flippingTime ?? 950;
        engine.getSettings().flippingTime = duration;
        suppressCoverStartRef.current = true;
        const runtime = engine as unknown as PageFlipRuntime;
        if (runtime.getOrientation() === "portrait" && bookIndex < engine.getCurrentPageIndex()) {
          const collection = runtime.getPageCollection();
          const targetSpread = collection.getSpreadIndexByPage(bookIndex);
          collection.setCurrentSpreadIndex(targetSpread + 1);
          const rect = runtime.getRender().getRect();
          runtime.getFlipController().flip({ x: rect.left + 10, y: rect.top + rect.height - 2 });
          return;
        }
        engine.flip(bookIndex, "bottom");
      },
    }), [pages.length]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host || pages.length === 0) return;

      const engine = new PageFlip(
        host,
        createHardCoverPageFlipSettings(
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      );

      // The cover is intentionally quiet at rest. PageFlip uses this setting
      // only for its passive corner preview; an intentional mouse/touch drag
      // still enters the normal user-touch path.
      engine.getSettings().showPageCorners = false;

      const syncCornerPreview = (pageIndex: number) => {
        engine.getSettings().showPageCorners = pageIndex !== 0;
        if (pageIndex !== 0) host.classList.remove("is-cover-opening");
      };

      type PendingBoundaryGesture = { x: number; y: number };
      let pendingMouseGesture: PendingBoundaryGesture | null = null;
      let pendingTouchGesture: PendingBoundaryGesture | null = null;

      const isLeafTarget = (target: EventTarget | null) =>
        target instanceof HTMLElement && target.closest(".catalog-leaf, .back-cover-bridge") != null;

      const beginBoundaryGesture = (
        point: PendingBoundaryGesture,
        target: EventTarget | null,
      ) => {
        if (
          interactionLockedRef.current ||
          !manualNavigationBoundaryRef.current ||
          activeIndexRef.current === 0 ||
          !isLeafTarget(target)
        ) {
          return false;
        }
        engine.getSettings().showPageCorners = false;
        return point;
      };

      const resolveBoundaryGesture = (
        start: PendingBoundaryGesture,
        x: number,
        y: number,
      ): "pending" | "cancel" | "handled" => {
        const deltaX = x - start.x;
        const deltaY = y - start.y;
        if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12) return "pending";
        if (Math.abs(deltaY) > Math.abs(deltaX)) return "cancel";
        onManualNavigationIntentRef.current(deltaX < 0 ? "next" : "previous");
        return "handled";
      };

      const handleCoverMouseDown = (event: MouseEvent) => {
        if (interactionLockedRef.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (event.button === 0) {
          const pending = beginBoundaryGesture(
            { x: event.clientX, y: event.clientY },
            event.target,
          );
          if (pending) {
            pendingMouseGesture = pending;
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
        }
        if (activeIndexRef.current === 0) engine.getSettings().showPageCorners = true;
      };
      const handleLockedTouchStart = (event: TouchEvent) => {
        if (interactionLockedRef.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        const touch = event.changedTouches[0];
        if (!touch) return;
        const pending = beginBoundaryGesture(
          { x: touch.clientX, y: touch.clientY },
          event.target,
        );
        if (pending) {
          pendingTouchGesture = pending;
          event.stopImmediatePropagation();
        }
      };
      const handleBoundaryMouseMove = (event: MouseEvent) => {
        if (!pendingMouseGesture) return;
        const result = resolveBoundaryGesture(
          pendingMouseGesture,
          event.clientX,
          event.clientY,
        );
        if (result === "cancel") {
          pendingMouseGesture = null;
          syncCornerPreview(activeIndexRef.current);
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (result === "handled") pendingMouseGesture = null;
      };
      const handleBoundaryTouchMove = (event: TouchEvent) => {
        if (!pendingTouchGesture) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const result = resolveBoundaryGesture(
          pendingTouchGesture,
          touch.clientX,
          touch.clientY,
        );
        if (result === "cancel") {
          pendingTouchGesture = null;
          syncCornerPreview(activeIndexRef.current);
          return;
        }
        if (event.cancelable) event.preventDefault();
        event.stopImmediatePropagation();
        if (result === "handled") pendingTouchGesture = null;
      };
      const handleCoverMouseUp = () => {
        pendingMouseGesture = null;
        pendingTouchGesture = null;
        if (activeIndexRef.current === 0) engine.getSettings().showPageCorners = false;
        else syncCornerPreview(activeIndexRef.current);
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
          host.dataset.coverMotion = direction === 1 ? "closing" : "opening";
          if (activeIndexRef.current === 0 && direction !== 1 && !suppressCoverStartRef.current) {
            onCoverTransitionStartRef.current();
          }
        } else if (state === "read") {
          host.classList.remove("is-cover-opening");
          delete host.dataset.coverMotion;
          if (portraitCoverCloseRef.current) {
            const render = (engine as unknown as PageFlipRuntime).getRender();
            render.orientation = "portrait";
            portraitCoverCloseRef.current = false;
            engine.turnToPage(currentPage);
          }
          if (transitionDurationRef.current != null) {
            engine.getSettings().flippingTime = transitionDurationRef.current;
            transitionDurationRef.current = null;
          }
          suppressCoverStartRef.current = false;
          onPageSettledRef.current(currentPage);
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
      // Sin densidades manuales al fondo: P39 no es hoja del book y P38
      // conserva su densidad soft nativa dentro del último spread.
      const coverLeaf = host.querySelector<HTMLElement>(".catalog-leaf:first-child");
      const captureCoverTop = () => {
        if (!coverLeaf || activeIndexRef.current !== 0 || host.classList.contains("is-cover-opening")) return;
        const coverTop = coverLeaf.style.top || getComputedStyle(coverLeaf).top;
        if (coverTop && coverTop !== "auto") host.style.setProperty("--cover-open-top", coverTop);
      };
      captureCoverTop();
      const coverTopFrame = window.requestAnimationFrame(captureCoverTop);

      const handleDelegatedHotspot = (event: MouseEvent) => {
        if (interactionLockedRef.current) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const target = event.target as HTMLElement | null;
        const hotspot = target?.closest<HTMLElement>("[data-product-id]");
        const productId = hotspot?.dataset.productId;
        if (productId) {
          event.preventDefault();
          event.stopPropagation();
          onProductSelectRef.current(productId);
        }
      };
      host.addEventListener("click", handleDelegatedHotspot, true);
      host.addEventListener("mousedown", handleCoverMouseDown, true);
      host.addEventListener("touchstart", handleLockedTouchStart, { capture: true, passive: false });
      host.addEventListener("pointermove", handleCoverPointerMove, true);
      host.addEventListener("pointerleave", handleCoverPointerLeave, true);
      window.addEventListener("mouseup", handleCoverMouseUp, true);
      window.addEventListener("mousemove", handleBoundaryMouseMove, true);
      window.addEventListener("touchmove", handleBoundaryTouchMove, { capture: true, passive: false });
      window.addEventListener("touchend", handleCoverMouseUp, true);

      return () => {
        host.removeEventListener("click", handleDelegatedHotspot, true);
        host.removeEventListener("mousedown", handleCoverMouseDown, true);
        host.removeEventListener("touchstart", handleLockedTouchStart, true);
        host.removeEventListener("pointermove", handleCoverPointerMove, true);
        host.removeEventListener("pointerleave", handleCoverPointerLeave, true);
        window.removeEventListener("mouseup", handleCoverMouseUp, true);
        window.removeEventListener("mousemove", handleBoundaryMouseMove, true);
        window.removeEventListener("touchmove", handleBoundaryTouchMove, true);
        window.removeEventListener("touchend", handleCoverMouseUp, true);
        resetCoverLight();
        window.cancelAnimationFrame(coverTopFrame);
        host.style.removeProperty("--cover-open-top");
        engine.destroy();
        engineRef.current = null;
      };
    }, [onOrientationChange, onPageChange, pages]);

    // Sin spread P38–P39: el último spread abierto lo compone StPageFlip de
    // forma nativa como P37–P38. La contratapa sólo existe como overlay.
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      host.querySelectorAll<HTMLImageElement>("img[data-catalog-page]").forEach((image) => {
        const index = Number(image.closest<HTMLElement>(".catalog-leaf")?.dataset.bookIndex);
        if (!Number.isInteger(index)) return;
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

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) return;
      // Logical boundaries are resolved by Magazine before PageFlip. Disable
      // the passive hover fold there as well, so it cannot race the captured
      // mousedown/touch intent under concurrent browser load.
      engine.getSettings().showPageCorners = activeIndex !== 0 && !manualNavigationBoundary;
    }, [activeIndex, manualNavigationBoundary]);

    return (
      <div
        ref={hostRef}
        className={`page-flip-host ${coverMotionActive ? "is-cover-opening" : ""} ${backCoverState === "closing" ? "is-back-cover-closing" : ""} ${backCoverState === "opening" ? "is-back-cover-opening" : ""} ${backCoverState === "closed" ? "is-back-cover-closed" : ""} ${interactionLocked ? "is-interaction-locked" : ""}`}
        data-testid="page-flip-engine"
        data-orientation={orientation}
        data-back-cover-motion={backCoverState === "closing" ? "closing" : backCoverState === "opening" ? "opening" : undefined}
      >
        {pages.map((bookPage, index) => (
          <div
            className="catalog-leaf"
            data-book-index={index}
            data-density={index === 0 ? "hard" : "soft"}
            key={bookPage.id}
          >
            {bookPage.kind === "pdf" ? (
              <PdfPage
                page={bookPage.page}
                initiallySharp={index <= 4}
                onCoverReady={index === 0 ? onCoverReady : undefined}
                productNames={productNames}
                onProductSelect={onProductSelect}
              />
            ) : (
              <VideoPage
                src={bookPage.src}
                visible={videoPlaybackAllowed && (index === activeIndex || (orientation === "landscape" && activeIndex > 0 && index === activeIndex + 1))}
              />
            )}
            {coverBridgeActive && index === 1 && bridgePages.lineup?.kind === "pdf" ? (
              <div className="cover-bridge-surface" data-cover-bridge="lineup" aria-hidden="true">
                <PdfPage
                  page={bridgePages.lineup.page}
                  initiallySharp
                  productNames={productNames}
                  onProductSelect={() => undefined}
                />
              </div>
            ) : null}
            {coverBridgeActive && index === 2 && bridgePages.video?.kind === "video" ? (
              <div className="cover-bridge-surface" data-cover-bridge="video" aria-hidden="true">
                <VideoPage src={bridgePages.video.src} visible={false} />
              </div>
            ) : null}
          </div>
        ))}
        {backCoverPage && rearContentPages[0]?.kind === "pdf" && rearContentPages[1]?.kind === "pdf" ? (
          <BackCover
            ref={backCoverRef}
            coverPage={backCoverPage}
            leftPage={rearContentPages[0].page}
            rightPage={rearContentPages[1].page}
            active={backCoverState !== "open"}
            live={backCoverState === "closed"}
            onMotionEnd={onBackCoverTransitionEnd}
          />
        ) : null}
      </div>
    );
  },
);
