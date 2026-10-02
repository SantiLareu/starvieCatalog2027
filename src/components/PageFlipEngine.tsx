import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PageFlip } from "page-flip";
import { COLLECTION_LINEUP_PAGE, type BookPage } from "../data/bookFlow";
import { createHardCoverPageFlipSettings } from "../data/hardCoverMotion";
import type { CatalogPage } from "../types/catalog";
import { PdfPage } from "./PdfPage";
import { VideoPage } from "./VideoPage";
import { Page14Coverflow } from "./Page14Coverflow";
import { BackCover, type BackCoverHandle } from "./BackCover";

type PageFlipRuntime = {
  getOrientation: () => "portrait" | "landscape";
  getRender: () => {
    orientation: "portrait" | "landscape";
    getRect: () => { left: number; top: number; height: number; pageWidth: number };
  };
  getFlipController: () => {
    flip: (point: { x: number; y: number }) => void;
    start: (point: { x: number; y: number }) => boolean;
    fold: (point: { x: number; y: number }) => void;
    stopMove: () => void;
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
  isTurning: () => boolean;
  next: () => void;
  previous: () => void;
  closeCover: () => void;
  closeBackCover: () => void;
  openBackCover: () => void;
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
  onCoverflowProductSelect: (productId: string) => void;
  coverBridgeActive: boolean;
  coverMotionActive: boolean;
  backCoverState: "open" | "closing" | "closed" | "opening";
  onBackCoverTransitionEnd: (state: "open" | "closed") => void;
  interactionLocked: boolean;
  videoPlaybackAllowed: boolean;
  productOpen: boolean;
  cartOpen: boolean;
  onCoverTransitionStart: () => void;
  manualNavigationBoundary: boolean;
  onManualNavigationIntent: (direction: "previous" | "next", drag?: boolean) => boolean;
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
      onCoverflowProductSelect,
      coverBridgeActive,
      coverMotionActive,
      backCoverState,
      onBackCoverTransitionEnd,
      interactionLocked,
      videoPlaybackAllowed,
      productOpen,
      cartOpen,
      onCoverTransitionStart,
      manualNavigationBoundary,
      onManualNavigationIntent,
    },
    forwardedRef,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [flipInProgress, setFlipInProgress] = useState(false);
    const [coverflowProductId, setCoverflowProductId] = useState<string | null>(null);
    const engineRef = useRef<PageFlip | null>(null);
    // changeState is emitted before StPageFlip updates getState(). Keep the
    // event value synchronously so input guards also work before React commits.
    const flipStateRef = useRef("read");
    const backCoverRef = useRef<BackCoverHandle>(null);
    const activeIndexRef = useRef(activeIndex);
    const sharpPagesRef = useRef(new Set([0, 1, 2, 3, 4]));
    const decodeRequestedRef = useRef(new Set<string>());
    const transitionDurationRef = useRef<number | null>(null);
    const suppressCoverStartRef = useRef(false);
    const portraitCoverMotionRef = useRef(false);
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

    const isTurning = useCallback(() =>
      flipStateRef.current === "flipping" ||
      // An invalid outward drag at a cover can emit user_fold without a
      // calculation. It owns no turn and must not lock subsequent navigation.
      (flipStateRef.current === "user_fold" && engineRef.current?.getFlipController().getCalculation() != null),
    []);

    useImperativeHandle(forwardedRef, () => ({
      isTurning,
      next: () => {
        const engine = engineRef.current;
        if (!engine) return;
        const runtime = engine as unknown as PageFlipRuntime;
        if (engine.getCurrentPageIndex() === 0 && runtime.getOrientation() === "portrait") {
          // Native portrait reuses the same hard DOM page for both faces,
          // overwriting its first transform. Compose the two real cover faces
          // exactly as in landscape, retaining the fitted portrait frame.
          runtime.getRender().orientation = "landscape";
          portraitCoverMotionRef.current = true;
          engine.turnToPage(0);
        }
        engine.flipNext("bottom");
      },
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
          portraitCoverMotionRef.current = true;
          engine.turnToPage(1);
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
      goToInstant: (bookIndex: number) => {
        backCoverRef.current?.resetOpen();
        engineRef.current?.turnToPage(bookIndex);
      },
      transitionTo: (bookIndex: number, duration: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        backCoverRef.current?.resetOpen();
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
    }), [isTurning, pages.length]);

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
      };

      type PendingBoundaryGesture = {
        x: number; y: number; tapDirection?: "previous" | "next";
        direction?: "previous" | "next"; corner?: { x: number; y: number };
        travelScale?: number;
      };
      let pendingMouseGesture: PendingBoundaryGesture | null = null;
      let pendingTouchGesture: PendingBoundaryGesture | null = null;
      let suppressGestureClick = false;
      const gestureSurface = host.closest<HTMLElement>(".magazine-stage") ?? host;

      const beginBoundaryGesture = (
        point: PendingBoundaryGesture,
        target: EventTarget | null,
      ): PendingBoundaryGesture | false => {
        const portrait = engine.getOrientation() === "portrait";
        const hotspot = target instanceof Element && target.closest("[data-product-id]") != null;
        if (
          interactionLockedRef.current ||
          (!portrait && (!manualNavigationBoundaryRef.current || activeIndexRef.current === 0)) ||
          (target instanceof Element && (target.closest(".page14-coverflow__interactive, input, video") != null ||
            (!hotspot && target.closest("button, a") != null)))
        ) {
          return false;
        }
        engine.getSettings().showPageCorners = false;
        suppressGestureClick = false;
        const leaf = target instanceof Element ? target.closest(".catalog-leaf, .back-cover-bridge") : null;
        const rect = leaf?.getBoundingClientRect();
        return { ...point, tapDirection: portrait && rect && !hotspot ? (point.x < rect.left + rect.width / 2 ? "previous" : "next") : undefined };
      };

      const resolveBoundaryGesture = (
        start: PendingBoundaryGesture,
        x: number,
        y: number,
      ): "pending" | "cancel" | "handled" => {
        const deltaX = x - start.x;
        const deltaY = y - start.y;
        if (!start.direction) {
          if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12) return "pending";
          if (Math.abs(deltaY) > Math.abs(deltaX)) return "cancel";
          const direction = deltaX < 0 ? "next" : "previous";
          suppressGestureClick = true;
          // Magazine grants a physical fold only for a normal adjacent turn.
          // Section/cover boundaries use the same safe command as buttons.
          if (!onManualNavigationIntentRef.current(direction, true)) return "handled";
          const runtime = engine as unknown as PageFlipRuntime;
          const rect = runtime.getRender().getRect();
          start.corner = { x: direction === "next" ? rect.left + rect.pageWidth * 2 - 2 : rect.left + 2,
            y: rect.top + rect.height - 2 };
          const viewport = host.getBoundingClientRect();
          const availableTravel = direction === "next" ? start.x - viewport.left : viewport.right - start.x;
          start.travelScale = rect.pageWidth * 2 / Math.max(rect.pageWidth / 4, availableTravel);
          if (!runtime.getFlipController().start(start.corner)) return "cancel";
          start.direction = direction;
        }
        const runtime = engine as unknown as PageFlipRuntime;
        const rect = runtime.getRender().getRect();
        // Map a swipe begun anywhere to the native corner, including the
        // virtual left half in portrait. The finger drives the physical fold
        // until release; no page index is changed by this adapter.
        const travel = Math.min(rect.pageWidth * 2 - 2, Math.max(2,
          (start.direction === "next" ? -deltaX : deltaX) * start.travelScale!));
        runtime.getFlipController().fold({
          x: start.corner!.x + (start.direction === "next" ? -travel : travel),
          y: start.corner!.y + Math.max(-rect.height / 3, Math.min(0, deltaY)),
        });
        return "pending";
      };

      const handleCoverMouseDown = (event: MouseEvent) => {
        suppressGestureClick = false;
        if (interactionLockedRef.current || isTurning()) {
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
        suppressGestureClick = false;
        if (interactionLockedRef.current || isTurning()) {
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
      const handleCoverMouseUp = (event: MouseEvent | TouchEvent) => {
        const pending = event.type === "mouseup" ? pendingMouseGesture : pendingTouchGesture;
        pendingMouseGesture = null;
        pendingTouchGesture = null;
        if (pending?.direction) {
          (engine as unknown as PageFlipRuntime).getFlipController().stopMove();
          event.preventDefault();
          event.stopImmediatePropagation();
        } else if (pending?.tapDirection && event.type !== "touchcancel") {
          onManualNavigationIntentRef.current(pending.tapDirection);
          event.preventDefault();
          event.stopImmediatePropagation();
        }
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
        activeIndexRef.current = pageIndex;
        syncCornerPreview(pageIndex);
        onPageChange(pageIndex);
      });
      engine.on("changeState", (event) => {
        const state = String(event.data);
        flipStateRef.current = state;
        host.dataset.flipState = state;
        setFlipInProgress(state !== "read");
        // StPageFlip updates its internal page index before the React indicator
        // catches up. Use the active direction to distinguish the cover return
        // (page 1 -> 0) from the first interior turn (page 1 -> 3).
        const currentPage = engine.getCurrentPageIndex();
        const direction = engine.getFlipController().getCalculation()?.getDirection();
        const isCoverTransition =
          (activeIndexRef.current === 0 && currentPage === 0) ||
          (currentPage === 1 && direction === 1);
        if (isCoverTransition && state !== "read") {
          const rect = (engine as unknown as PageFlipRuntime).getRender().getRect();
          host.style.setProperty("--cover-left-offset", `${rect.left}px`);
          resetCoverLight();
          host.classList.add("is-cover-opening");
          host.dataset.coverMotion = direction === 1 ? "closing" : "opening";
          if (activeIndexRef.current === 0 && direction !== 1 && !suppressCoverStartRef.current) {
            onCoverTransitionStartRef.current();
          }
        } else if (state === "read") {
          host.classList.remove("is-cover-opening");
          delete host.dataset.coverMotion;
          host.style.removeProperty("--cover-left-offset");
          if (portraitCoverMotionRef.current) {
            const render = (engine as unknown as PageFlipRuntime).getRender();
            render.orientation = "portrait";
            portraitCoverMotionRef.current = false;
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
      flipStateRef.current = "read";
      host.dataset.flipState = "read";
      // Sin densidades manuales al fondo: P39 no es hoja del book y P38
      // conserva su densidad soft nativa dentro del último spread.

      const handleDelegatedHotspot = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        const hotspot = target?.closest<HTMLElement>("[data-product-id]");
        if (interactionLockedRef.current || (suppressGestureClick && hotspot != null && event.detail !== 0)) {
          suppressGestureClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const productId = hotspot?.dataset.productId;
        if (productId) {
          event.preventDefault();
          event.stopPropagation();
          onProductSelectRef.current(productId);
        }
      };
      host.addEventListener("click", handleDelegatedHotspot, true);
      gestureSurface.addEventListener("mousedown", handleCoverMouseDown, true);
      gestureSurface.addEventListener("touchstart", handleLockedTouchStart, { capture: true, passive: false });
      host.addEventListener("pointermove", handleCoverPointerMove, true);
      host.addEventListener("pointerleave", handleCoverPointerLeave, true);
      window.addEventListener("mouseup", handleCoverMouseUp, true);
      window.addEventListener("mousemove", handleBoundaryMouseMove, true);
      window.addEventListener("touchmove", handleBoundaryTouchMove, { capture: true, passive: false });
      window.addEventListener("touchend", handleCoverMouseUp, true);
      window.addEventListener("touchcancel", handleCoverMouseUp, true);

      return () => {
        host.removeEventListener("click", handleDelegatedHotspot, true);
        gestureSurface.removeEventListener("mousedown", handleCoverMouseDown, true);
        gestureSurface.removeEventListener("touchstart", handleLockedTouchStart, true);
        host.removeEventListener("pointermove", handleCoverPointerMove, true);
        host.removeEventListener("pointerleave", handleCoverPointerLeave, true);
        window.removeEventListener("mouseup", handleCoverMouseUp, true);
        window.removeEventListener("mousemove", handleBoundaryMouseMove, true);
        window.removeEventListener("touchmove", handleBoundaryTouchMove, true);
        window.removeEventListener("touchend", handleCoverMouseUp, true);
        window.removeEventListener("touchcancel", handleCoverMouseUp, true);
        resetCoverLight();
        host.style.removeProperty("--cover-left-offset");
        engine.destroy();
        engineRef.current = null;
      };
    }, [isTurning, onOrientationChange, onPageChange, pages]);

    // El último spread abierto conserva P37–P38 en el engine principal.
    // Durante el cierre, P38 participa también como cara interior de la tapa.
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
            data-rear-source={index === pages.length - 1 ? "" : undefined}
            data-density={index === 0 ? "hard" : "soft"}
            key={bookPage.id}
          >
            {bookPage.kind === "pdf" && bookPage.originalNumber === 14 ? (
              <Page14Coverflow
                visible={activeIndex === index && !flipInProgress && !interactionLocked && !productOpen && !cartOpen}
                activeProductId={coverflowProductId}
                onActiveProductChange={setCoverflowProductId}
                onProductSelect={onCoverflowProductSelect}
              />
            ) : bookPage.kind === "pdf" ? (
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
                <Page14Coverflow
                  visible={false}
                  staticOnly
                  activeProductId={coverflowProductId}
                  onActiveProductChange={setCoverflowProductId}
                  onProductSelect={onCoverflowProductSelect}
                />
              </div>
            ) : null}
            {coverBridgeActive && index === 2 && bridgePages.video?.kind === "video" ? (
              <div className="cover-bridge-surface" data-cover-bridge={orientation === "portrait" ? "portrait-lineup" : "video"} aria-hidden="true">
                {orientation === "portrait" ? (
                  <Page14Coverflow visible={false} staticOnly activeProductId={coverflowProductId}
                    onActiveProductChange={setCoverflowProductId} onProductSelect={onCoverflowProductSelect} />
                ) : <VideoPage src={bridgePages.video.src} visible={false} />}
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
