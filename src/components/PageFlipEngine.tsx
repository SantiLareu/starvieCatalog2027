import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PageFlip } from "page-flip";
import { COLLECTION_LINEUP_PAGE, SECTION_COVER_ORIGINAL_PAGE, TAMARA_EDITORIAL_ID, type BookPage } from "../data/bookFlow";
import { createHardCoverPageFlipSettings } from "../data/hardCoverMotion";
import type { CatalogPage } from "../types/catalog";
import { PdfPage } from "./PdfPage";
import { VideoPage } from "./VideoPage";
import { Page14Coverflow } from "./Page14Coverflow";
import { SectionIndexLayer } from "./SectionIndexLayer";
import { SanyoEditorial } from "./SanyoEditorial";
import { TamaraEditorial } from "./TamaraEditorial";
import { sectionIndexForPage } from "../data/CatalogData";
import { BackCover, type BackCoverHandle } from "./BackCover";

type PageFlipRuntime = {
  update: () => void;
  getUI: () => { getWrapper: () => HTMLElement };
  getOrientation: () => "portrait" | "landscape";
  getRender: () => {
    orientation: "portrait" | "landscape";
    getRect: () => { left: number; top: number; height: number; pageWidth: number };
  };
  getFlipController: () => {
    getCalculation: () => { getDirection: () => number; getFlippingProgress: () => number } | null;
    flip: (point: { x: number; y: number }) => void;
    start: (point: { x: number; y: number }) => boolean;
    fold: (point: { x: number; y: number }) => void;
    stopMove: () => void;
    showCorner: (point: { x: number; y: number }) => void;
  };
  getPageCollection: () => {
    getBottomPage: (direction: number) => { getElement: () => HTMLElement };
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
  initialIndex?: number;
  /** Optional P17 leaf content. No alternative engine or gesture handlers. */
  mobileP17Content?: ReactNode;
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
  onSectionNavigate: (targetPage: number) => void;
  /** Prepara las imágenes editoriales antes de iniciar un salto físico. */
  editorialLoadIndex: number | null;
  coverBridgeActive: boolean;
  coverMotionActive: boolean;
  backCoverState: "open" | "closing" | "closed" | "opening";
  onBackCoverTransitionEnd: (state: "open" | "closed") => void;
  interactionLocked: boolean;
  videoPlaybackAllowed: boolean;
  /** Índice de book revelado por la transición running (salto por sección). */
  videoRevealIndex: number | null;
  /** Destino del bridge de apertura; sólo reproduce cuando el motor lo expone. */
  coverVideoRevealIndex: number | null;
  productOpen: boolean;
  cartOpen: boolean;
  onCoverTransitionStart: () => void;
  manualNavigationBoundary: boolean;
  onManualNavigationIntent: (direction: "previous" | "next", drag?: boolean) => boolean;
};

export const PageFlipEngine = forwardRef<PageFlipHandle, PageFlipEngineProps>(
  function PageFlipEngine(
    {
      initialIndex = 0,
      mobileP17Content,
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
      onSectionNavigate,
      editorialLoadIndex,
      coverBridgeActive,
      coverMotionActive,
      backCoverState,
      onBackCoverTransitionEnd,
      interactionLocked,
      videoPlaybackAllowed,
      videoRevealIndex,
      coverVideoRevealIndex,
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
    // Spread adyacente revelado por un flip manual (botón/flecha/drag), sin
    // BookTransition: el evento "flip" recién llega al final de la animación.
    const [manualRevealIndex, setManualRevealIndex] = useState<number | null>(null);
    const [departingVideoIndex, setDepartingVideoIndex] = useState<number | null>(null);
    const [coverVideoRevealed, setCoverVideoRevealed] = useState(false);
    const [coverflowProductId, setCoverflowProductId] = useState<string | null>(null);
    const engineRef = useRef<PageFlip | null>(null);
    const mobileGeometryRef = useRef(false);
    // changeState is emitted before StPageFlip updates getState(). Keep the
    // event value synchronously so input guards also work before React commits.
    const flipStateRef = useRef("read");
    const backCoverRef = useRef<BackCoverHandle>(null);
    const activeIndexRef = useRef(activeIndex);
    const sharpPagesRef = useRef(new Set([0, 1, 2, 3, 4]));
    const transitionDurationRef = useRef<number | null>(null);
    const suppressCoverStartRef = useRef(false);
    const portraitCoverMotionRef = useRef(false);
    const onProductSelectRef = useRef(onProductSelect);
    const onSectionNavigateRef = useRef(onSectionNavigate);
    const onPageSettledRef = useRef(onPageSettled);
    const onCoverTransitionStartRef = useRef(onCoverTransitionStart);
    const onManualNavigationIntentRef = useRef(onManualNavigationIntent);
    const interactionLockedRef = useRef(interactionLocked);
    const manualNavigationBoundaryRef = useRef(manualNavigationBoundary);
    activeIndexRef.current = activeIndex;
    onProductSelectRef.current = onProductSelect;
    onSectionNavigateRef.current = onSectionNavigate;
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

      // StPageFlip clona hojas soft en portrait antes del commit de React.
      // Las copias son fotografías: nunca deben heredar interacción/reveal.
      // No tocar las hojas originales, cuyos atributos pertenecen a React.
      const sourceLeaves = new Set(host.querySelectorAll<HTMLElement>(".catalog-leaf"));
      const staticCopies = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            const leaves = node.matches(".catalog-leaf") ? [node] : node.querySelectorAll<HTMLElement>(".catalog-leaf");
            for (const leaf of leaves) {
              if (sourceLeaves.has(leaf)) continue;
              leaf.querySelectorAll<HTMLElement>(".section-index-layer, .sanyo-editorial, .tamara-editorial").forEach(layer => {
                layer.dataset.live = "false";
                layer.setAttribute("aria-hidden", "true");
                layer.inert = true;
              });
            }
          }
        }
      });
      staticCopies.observe(host, { childList: true, subtree: true });

      const engine = new PageFlip(
        host,
        { ...createHardCoverPageFlipSettings(
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        ), startPage: initialIndex },
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
        const sectionHotspot = target instanceof Element && target.closest("[data-section-target]") != null;
        const hotspot = sectionHotspot || (target instanceof Element && target.closest("[data-product-id]") != null);
        if (
          interactionLockedRef.current ||
          (!portrait && !sectionHotspot && (!manualNavigationBoundaryRef.current || activeIndexRef.current === 0)) ||
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
        if (state === "flipping" || state === "user_fold") {
          const currentIndex = activeIndexRef.current;
          const videoIndex = pages.findIndex((page, index) => page.kind === "video" &&
            (index === currentIndex || (engine.getOrientation() === "landscape" && currentIndex > 0 && index === currentIndex + 1)));
          if (videoIndex >= 0) {
            setDepartingVideoIndex(videoIndex);
            // Cortar en el evento, antes del commit de React. Incluye las
            // copias portrait ya creadas; si se clona después de user_fold,
            // el original ya no tiene autoplay y hereda el atributo muted.
            host.querySelectorAll<HTMLVideoElement>(`.catalog-leaf[data-book-index="${videoIndex}"] video`).forEach(video => {
              video.muted = true;
              video.defaultMuted = true;
              video.autoplay = false;
              video.pause();
            });
          }
        } else if (state === "read") {
          // Si el drag se canceló, activeIndex sigue en el video y se recupera
          // su reproducción. Si terminó, la hoja saliente permanece inactiva.
          setDepartingVideoIndex(null);
        }
        flipStateRef.current = state;
        host.dataset.flipState = state;
        setFlipInProgress(state !== "read");
        if (state !== "read") {
          // El índice React (activeIndex) recién se sincroniza con "flip" al
          // final de la animación. El spread adyacente en la dirección del
          // cálculo ya está quedando expuesto: anticipa sólo su visibilidad.
          const direction = engine.getFlipController().getCalculation()?.getDirection();
          if (direction === 0 || direction === 1) {
            const step = engine.getOrientation() === "portrait" ? 1 : 2;
            const currentPage = engine.getCurrentPageIndex();
            const target = direction === 0 ? currentPage + step : currentPage - step;
            setManualRevealIndex(Math.max(0, Math.min(pages.length - 1, target)));
          }
        }
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
          setManualRevealIndex(null);
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
        const hotspot = target?.closest<HTMLElement>("[data-product-id], [data-section-target]");
        if (interactionLockedRef.current ||
            (hotspot?.hasAttribute("data-section-target") && isTurning()) ||
            (suppressGestureClick && hotspot != null && event.detail !== 0)) {
          suppressGestureClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const productId = hotspot?.dataset.productId;
        const sectionTarget = hotspot?.dataset.sectionTarget;
        if (sectionTarget) {
          event.preventDefault();
          event.stopPropagation();
          if (hotspot.closest<HTMLElement>(".section-index-layer")?.dataset.live === "true") {
            onSectionNavigateRef.current(Number(sectionTarget));
          }
          return;
        }
        if (productId) {
          event.preventDefault();
          event.stopPropagation();
          onProductSelectRef.current(productId);
        }
      };
      // Excepción explícita para P27 (índice de Bolsos & Accesorios):
      // mismo curl, misma física, pero activado en una zona rectangular
      // calibrada en navegador (20.5% del ancho × 12.2% del alto de la
      // hoja) en vez del cuadrado diagonal/5 de StPageFlip, que invadía
      // sus hotspots. El resto del catálogo conserva el original, que no
      // expone opción pública para esta zona. Este listener (host) corre
      // antes que el mousemove de StPageFlip (window) en el mismo
      // dispatch, así el flag ya está al día cuando userMove decide entre
      // showCorner y fold. Solo mouse/pen (touch no tiene hover). Con el
      // preview ya visible se usa la retracción nativa al salir del
      // rectángulo, sin modificar el cálculo ni la física del curl.
      const defaultCornerPreview = () =>
        activeIndexRef.current !== 0 && !manualNavigationBoundaryRef.current;
      // Proporciones medidas en P27 real (hoja 581×327: X=119px/20.5%,
      // Y=40px/12.2%). Relativas a la hoja (.catalog-leaf), responsive.
      const SECTION_COVER_ZONE_W = 0.205;
      const SECTION_COVER_ZONE_H = 0.122;
      const sectionCoverIndex = pages.findIndex(
        (bookPage) => bookPage.kind === "pdf" && bookPage.originalNumber === SECTION_COVER_ORIGINAL_PAGE,
      );
      let sectionCoverRect: DOMRect | null = null;
      let sectionCornerPreview = false;
      const retractSectionPreview = () => {
        if (sectionCornerPreview && flipStateRef.current === "fold_corner") {
          const runtime = engine as unknown as PageFlipRuntime;
          const bounds = runtime.getRender().getRect();
          // Un punto central fuera de las esquinas solicita el cierre
          // normal de showCorner, sin cambiar tiempos ni cálculos internos.
          runtime.getFlipController().showCorner({
            x: bounds.left + bounds.pageWidth,
            y: bounds.top + bounds.height / 2,
          });
        }
        sectionCornerPreview = false;
      };
      const handleSectionCoverZone = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
        if (flipStateRef.current !== "read" && flipStateRef.current !== "fold_corner") return;
        if (sectionCoverIndex < 0 || activeIndexRef.current !== sectionCoverIndex) {
          sectionCornerPreview = false;
          engine.getSettings().showPageCorners = defaultCornerPreview();
          return;
        }
        const leaf = host.querySelector<HTMLElement>(`.catalog-leaf[data-book-index="${sectionCoverIndex}"]`);
        if (!leaf) return;
        // Durante el curl el rect transformado ya no es la hoja en reposo.
        if (flipStateRef.current === "read" || !sectionCoverRect) sectionCoverRect = leaf.getBoundingClientRect();
        const rect = sectionCoverRect;
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const overSectionCover = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
        if (!overSectionCover && !sectionCornerPreview) {
          engine.getSettings().showPageCorners = defaultCornerPreview();
          return;
        }
        const zoneW = rect.width * SECTION_COVER_ZONE_W;
        const zoneH = rect.height * SECTION_COVER_ZONE_H;
        const nearCorner =
          overSectionCover && (x <= zoneW || x >= rect.width - zoneW) &&
          (y <= zoneH || y >= rect.height - zoneH);
        if (!nearCorner) retractSectionPreview();
        else sectionCornerPreview = true;
        engine.getSettings().showPageCorners = nearCorner && defaultCornerPreview();
      };
      const restoreCornerZone = () => {
        retractSectionPreview();
        if (flipStateRef.current !== "read") return;
        engine.getSettings().showPageCorners = defaultCornerPreview();
      };
      host.addEventListener("pointermove", handleSectionCoverZone);
      host.addEventListener("pointerleave", restoreCornerZone);
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
        staticCopies.disconnect();
        host.removeEventListener("pointermove", handleSectionCoverZone);
        host.removeEventListener("pointerleave", restoreCornerZone);
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

    useEffect(() => {
      const engine = engineRef.current;
      const host = hostRef.current;
      if (!engine || !host || isTurning()) return;
      const page = pages[activeIndex];
      const vertical = mobileP17Content != null && page?.kind === "pdf" && page.originalNumber === 17;
      if (!vertical && !mobileGeometryRef.current) return;
      mobileGeometryRef.current = vertical;
      // Only the custom P17 leaf follows its responsive frame. Native physics
      // and gestures are unchanged; freeze geometry while turning and restore
      // the approved dimensions at read on any other page/device.
      const settings = engine.getSettings();
      host.classList.toggle("mobile-p17-frame", vertical);
      const runtime = engine as unknown as PageFlipRuntime;
      const updateGeometry = () => {
        if (isTurning()) return;
        const width = host.clientWidth, height = host.clientHeight;
        if (vertical && (!width || !height)) return;
        settings.width = 960;
        settings.height = vertical ? 960 * height / width : 540;
        runtime.getUI().getWrapper().style.paddingBottom = vertical ? "0" : `${settings.height / settings.width * (engine.getOrientation() === "portrait" ? 100 : 50)}%`;
        runtime.update();
      };
      updateGeometry();
      if (!vertical) return;
      // CSS owns the reading band. Observe it because dvh/safe-area changes
      // must also update native hit testing and fold bounds, not just the DOM.
      const observer = new ResizeObserver(updateGeometry);
      observer.observe(host);
      return () => observer.disconnect();
    }, [activeIndex, flipInProgress, mobileP17Content != null, pages, isTurning]);

    useLayoutEffect(() => {
      setCoverVideoRevealed(false);
      // En portrait el bridge de P3 muestra las palas, no el video.
      if (coverVideoRevealIndex == null || orientation !== "landscape" || !coverBridgeActive ||
          pages[coverVideoRevealIndex + 1]?.kind !== "video") return;
      let frame: number;
      const checkReveal = () => {
        const engine = engineRef.current;
        const runtime = engine as unknown as PageFlipRuntime | null;
        const calculation = runtime?.getFlipController().getCalculation();
        if (!engine || flipStateRef.current === "read" || calculation?.getDirection() !== 0) {
          setCoverVideoRevealed(false);
          return;
        }
        // changeState precede al primer dibujo. Esperar al progreso físico y
        // al bottom page pintado evita reproducir al tocar una tapa aún cerrada.
        const bottom = runtime!.getPageCollection().getBottomPage(0);
        const leaf = bottom.getElement();
        setCoverVideoRevealed(leaf.querySelector('[data-cover-bridge="video"]') != null && leaf.style.display === "block" && calculation.getFlippingProgress() > 0);
        frame = requestAnimationFrame(checkReveal);
      };
      frame = requestAnimationFrame(checkReveal);
      return () => cancelAnimationFrame(frame);
    }, [coverVideoRevealIndex, orientation, coverBridgeActive, pages]);

    // El último spread abierto conserva P37–P38 en el engine principal.
    // Durante el cierre, P38 participa también como cara interior de la tapa.
    // Conservar el thumbnail hasta que decode() prepare la full para pintar.
    // Sin decode() o ante un rechazo, aceptar sólo una imagen cargada utilizable.
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      let cancelled = false;
      const probes: HTMLImageElement[] = [];
      host.querySelectorAll<HTMLImageElement>("img[data-catalog-page]").forEach((image) => {
        const index = Number(image.closest<HTMLElement>(".catalog-leaf")?.dataset.bookIndex);
        if (!Number.isInteger(index)) return;
        const fullSrc = image.dataset.fullSrc;
        if (!fullSrc) return;
        const shouldBeSharp = index === 0 || Math.abs(index - activeIndex) <= 2;
        if (shouldBeSharp) sharpPagesRef.current.add(index);
        if (!sharpPagesRef.current.has(index)) return;
        if (image.getAttribute("src") === fullSrc) return;
        const probe = new Image();
        probes.push(probe);
        probe.decoding = "async";
        let swapped = false;
        let loadFallback = typeof probe.decode !== "function";
        const swap = () => {
          if (swapped || cancelled || !image.isConnected ||
              !probe.complete || probe.naturalWidth === 0 || probe.naturalHeight === 0) return;
          swapped = true;
          if (image.getAttribute("src") !== fullSrc) image.src = fullSrc;
        };
        const enableLoadFallback = () => {
          loadFallback = true;
          swap();
        };
        probe.onload = () => {
          if (loadFallback) swap();
        };
        probe.src = fullSrc;
        if (!loadFallback) {
          try {
            void probe.decode().then(swap).catch(enableLoadFallback);
          } catch {
            enableLoadFallback();
          }
        }
      });
      return () => {
        cancelled = true;
        for (const probe of probes) probe.onload = null;
      };
    }, [activeIndex, mobileP17Content != null]);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) return;
      // Logical boundaries are resolved by Magazine before PageFlip. Disable
      // the passive hover fold there as well, so it cannot race the captured
      // mousedown/touch intent under concurrent browser load.
      engine.getSettings().showPageCorners = activeIndex !== 0 && !manualNavigationBoundary;
    }, [activeIndex, manualNavigationBoundary]);

    // Spread que está quedando expuesto a mitad del flip: salto por sección
    // (target en running, vía prop) o flip manual adyacente (dirección del
    // cálculo, vía estado local). Sólo anticipa el video de ese spread; el
    // gate global videoPlaybackAllowed queda intacto para todo lo demás.
    const videoRevealLeft = videoRevealIndex ?? manualRevealIndex;

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
            {bookPage.kind === "pdf" && bookPage.originalNumber === 17 && mobileP17Content != null ? mobileP17Content : bookPage.kind === "pdf" && bookPage.originalNumber === 14 ? (
              <Page14Coverflow
                visible={activeIndex === index && !flipInProgress && !interactionLocked && !productOpen && !cartOpen}
                activeProductId={coverflowProductId}
                onActiveProductChange={setCoverflowProductId}
                onProductSelect={onCoverflowProductSelect}
              />
            ) : bookPage.kind === "pdf" && bookPage.originalNumber === SECTION_COVER_ORIGINAL_PAGE ? (
              <>
                <PdfPage
                  page={bookPage.page}
                  initiallySharp={index <= 4}
                  onCoverReady={undefined}
                  productNames={productNames}
                  onProductSelect={onProductSelect}
                />
                <SectionIndexLayer
                  hotspots={sectionIndexForPage(bookPage.page.id)}
                  live={activeIndex === index && !flipInProgress && !interactionLocked && !productOpen && !cartOpen}
                  onNavigate={onSectionNavigate}
                />
              </>
            ) : bookPage.kind === "editorial" && bookPage.id === TAMARA_EDITORIAL_ID ? (
              <TamaraEditorial
                visible={(activeIndex === index || (orientation === "landscape" && activeIndex > 0 && activeIndex + 1 === index)) && !flipInProgress && !interactionLocked && !productOpen && !cartOpen}
                load={Math.abs(index - activeIndex) <= (orientation === "landscape" ? 3 : 2) || (editorialLoadIndex != null && Math.abs(index - editorialLoadIndex) <= 1)}
              />
            ) : bookPage.kind === "editorial" ? (
              <SanyoEditorial
                visible={(activeIndex === index || (orientation === "landscape" && activeIndex > 0 && activeIndex + 1 === index)) && !flipInProgress && !interactionLocked && !productOpen && !cartOpen}
                load={Math.abs(index - activeIndex) <= (orientation === "landscape" ? 3 : 2) || (editorialLoadIndex != null && Math.abs(index - editorialLoadIndex) <= 1)}
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
                playbackAllowed={index !== departingVideoIndex}
                visible={
                  (videoPlaybackAllowed && (index === activeIndex || (orientation === "landscape" && activeIndex > 0 && index === activeIndex + 1))) ||
                  (videoRevealLeft != null && (index === videoRevealLeft || (orientation === "landscape" && index === videoRevealLeft + 1)))
                }
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
                ) : <VideoPage src={bridgePages.video.src} visible={coverVideoRevealIndex != null && coverVideoRevealed} />}
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
