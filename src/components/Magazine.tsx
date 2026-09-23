import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CatalogMetadata } from "../types/catalog";
import { CartDrawer } from "../commerce/CartDrawer";
import { useCommerce } from "../commerce/CommerceContext";
import { PageFlipEngine, type PageFlipHandle } from "./PageFlipEngine";
import { ProductModal } from "./ProductModal";
import {
  BACK_COVER_ORIGINAL_PAGE,
  COLLECTION_LINEUP_PAGE,
  STARLAB_FIRST_PAGE,
  STARLAB_LAST_PAGE,
  backCoverOpenBookIndex,
  backCoverPageForCatalog,
  bookIndexForOriginalPage,
  bookPageLabel,
  buildBookPages,
  isStarLabOriginalPage,
} from "../data/bookFlow";

type MagazineProps = {
  catalog: CatalogMetadata;
};

type ExperienceMode = "collection" | "starlab";
type BackCoverState = "open" | "closing" | "closed" | "opening";
type NavigationDirection = "previous" | "next";
type NavigationIntent =
  | "blocked"
  | "open-collection"
  | "close-cover-from-starlab"
  | "close-cover-from-collection"
  | "enter-collection"
  | "close-back-cover"
  | "open-back-cover"
  | "normal-previous"
  | "normal-next";

type NavigationContext = {
  activeIndex: number;
  experience: ExperienceMode;
  starLabStartIndex: number;
  starLabEndIndex: number;
  collectionStartIndex: number;
  backCoverOpenIndex: number;
  backCoverState: BackCoverState;
};

function resolveNavigation(
  context: NavigationContext,
  direction: NavigationDirection,
): NavigationIntent {
  const {
    activeIndex,
    experience,
    starLabStartIndex,
    starLabEndIndex,
    collectionStartIndex,
    backCoverOpenIndex,
    backCoverState,
  } = context;

  if (direction === "previous") {
    if (backCoverState === "closed") return "open-back-cover";
    if (activeIndex === 0) return "blocked";
    if (experience === "starlab" && activeIndex <= starLabStartIndex) {
      return "close-cover-from-starlab";
    }
    if (experience === "collection" && activeIndex === collectionStartIndex) {
      return "close-cover-from-collection";
    }
    return "normal-previous";
  }

  if (backCoverState === "closed") return "blocked";
  if (experience === "collection" && activeIndex === 0) return "open-collection";
  if (experience === "starlab" && activeIndex >= starLabEndIndex) {
    return "enter-collection";
  }
  if (experience === "collection" && activeIndex >= backCoverOpenIndex) {
    return "close-back-cover";
  }
  return "normal-next";
}

type BookTransition =
  | { id: number; kind: "initial-cover-open"; phase: "running"; targetIndex: number }
  | {
      id: number;
      kind: "close-to-cover";
      phase: "prepare" | "aligned" | "running";
      source: "starlab" | "collection";
    }
  | { id: number; kind: "edge-enter-collection"; phase: "running"; targetIndex: number }
  | { id: number; kind: "close-back-cover"; phase: "prepare" | "running"; targetIndex: number }
  | { id: number; kind: "open-back-cover"; phase: "prepare" | "running"; targetIndex: number }
  | {
      id: number;
      kind: "section";
      phase: "prepare" | "running";
      targetIndex: number;
      targetExperience: ExperienceMode;
      direction: "forward" | "backward";
    };

export function Magazine({ catalog }: MagazineProps) {
  const engineRef = useRef<PageFlipHandle>(null);
  const experienceRef = useRef<ExperienceMode>("collection");
  const transitionRef = useRef<BookTransition | null>(null);
  const transitionSequenceRef = useRef(0);
  const startedTransitionRef = useRef<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [experience, setExperience] = useState<ExperienceMode>("collection");
  const [bookTransition, setBookTransition] = useState<BookTransition | null>(null);
  const [backCoverState, setBackCoverState] = useState<BackCoverState>("open");
  const [coverReady, setCoverReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const {
    catalogError,
    productNames,
    resolveProduct,
    lines,
    units,
    addToCart,
    cartOpen,
    setCartOpen,
    setUiBusy,
    toast,
    showToast,
  } = useCommerce();

  const bookPages = useMemo(() => buildBookPages(catalog), [catalog]);
  // P39 no pertenece al flujo normal: es sólo la superficie visual del
  // overlay de contratapa dura y nunca recibe índice de book.
  const backCoverPage = useMemo(() => backCoverPageForCatalog(catalog), [catalog]);
  const starLabStartIndex = useMemo(
    () => bookIndexForOriginalPage(bookPages, STARLAB_FIRST_PAGE),
    [bookPages],
  );
  const starLabLastIndex = useMemo(
    () => bookIndexForOriginalPage(bookPages, STARLAB_LAST_PAGE),
    [bookPages],
  );
  const collectionStartIndex = useMemo(
    () => bookIndexForOriginalPage(bookPages, COLLECTION_LINEUP_PAGE),
    [bookPages],
  );
  const starLabEndIndex = orientation === "landscape"
    ? Math.max(starLabStartIndex, starLabLastIndex - 1)
    : starLabLastIndex;
  const lastPageIndex = bookPages.length - 1;
  // En P37–P38 "no hay página siguiente normal" significa CLOSE_BACK_COVER,
  // nunca Next deshabilitado: el resolver central tiene prioridad sobre los
  // límites físicos del engine (ver backCoverOpenBookIndex).
  const backCoverOpenIndex = backCoverOpenBookIndex(lastPageIndex, orientation);
  const isBookTransitioning = bookTransition != null;

  const finishBookTransition = useCallback(() => {
    transitionRef.current = null;
    startedTransitionRef.current = null;
    setBookTransition(null);
  }, []);

  const setExperienceMode = useCallback((mode: ExperienceMode) => {
    experienceRef.current = mode;
    setExperience(mode);
  }, []);

  const onPageChange = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);
  const onOrientationChange = useCallback((value: "portrait" | "landscape") => {
    setOrientation(value);
  }, []);

  const displayIndex = bookTransition?.kind === "initial-cover-open"
    ? (activeIndex === collectionStartIndex ? collectionStartIndex : 0)
    : bookTransition?.kind === "close-to-cover"
      ? (activeIndex === 0
          ? 0
          : bookTransition.source === "starlab" ? starLabStartIndex : collectionStartIndex)
      : bookTransition?.kind === "close-back-cover" || bookTransition?.kind === "open-back-cover" || backCoverState === "closed"
        ? lastPageIndex
        : activeIndex;

  useEffect(() => {
    const page = bookPages[displayIndex];
    if (page?.kind === "pdf") setPageInput(String(page.originalNumber));
  }, [bookPages, displayIndex]);

  useEffect(() => {
    const candidates = new Set([0, displayIndex - 2, displayIndex - 1, displayIndex, displayIndex + 1, displayIndex + 2]);
    for (const index of candidates) {
      const bookPage = bookPages[index];
      if (bookPage?.kind === "pdf") {
        const image = new Image();
        image.decoding = "async";
        image.src = bookPage.page.src;
      }
    }
  }, [bookPages, displayIndex]);

  const currentLabel = useMemo(() => {
    if (backCoverState === "closed") return `CONTRATAPA / ${catalog.pageCount}`;
    if (orientation === "landscape" && displayIndex === lastPageIndex) {
      return `${bookPageLabel(bookPages[lastPageIndex - 1])}–${bookPageLabel(bookPages[lastPageIndex])} / ${catalog.pageCount}`;
    }
    const labels = [bookPageLabel(bookPages[displayIndex])];
    if (orientation === "landscape" && displayIndex > 0 && displayIndex < bookPages.length - 1) {
      labels.push(bookPageLabel(bookPages[displayIndex + 1]));
    }
    return `${labels.filter(Boolean).join(labels.includes("VIDEO") ? " · " : "–")} / ${catalog.pageCount}`;
  }, [backCoverState, bookPages, catalog.pageCount, displayIndex, lastPageIndex, orientation]);

  const goToBookIndex = useCallback((index: number, mode: ExperienceMode, instant = true) => {
    if (index < 0 || index >= bookPages.length || transitionRef.current) return;
    setBackCoverState("open");
    setExperienceMode(mode);
    if (instant) engineRef.current?.goToInstant(index);
    else engineRef.current?.goTo(index + 1);
  }, [bookPages.length, setExperienceMode]);

  const goToOriginalPage = useCallback((originalNumber: number, instant = true) => {
    // La contratapa no tiene índice: ir a P39 deja el spread P37–P38 abierto.
    if (originalNumber === BACK_COVER_ORIGINAL_PAGE) {
      goToBookIndex(lastPageIndex, "collection", instant);
      return;
    }
    const index = bookIndexForOriginalPage(bookPages, originalNumber);
    goToBookIndex(index, isStarLabOriginalPage(originalNumber) ? "starlab" : "collection", instant);
  }, [bookPages, goToBookIndex, lastPageIndex]);

  const startSectionTransition = useCallback((targetIndex: number, targetExperience: ExperienceMode) => {
    if (transitionRef.current || targetIndex < 0 || targetIndex >= bookPages.length) return;
    if (activeIndex === targetIndex && experienceRef.current === targetExperience) return;
    const transition: BookTransition = {
      id: ++transitionSequenceRef.current,
      kind: "section",
      phase: "prepare",
      targetIndex,
      targetExperience,
      direction: targetIndex < activeIndex ? "backward" : "forward",
    };
    transitionRef.current = transition;
    setBookTransition(transition);
    setBackCoverState("open");
    setExperienceMode(targetExperience);
    setDrawerOpen(false);
    setPagePickerOpen(false);
  }, [activeIndex, bookPages.length, setExperienceMode]);

  const enterStarLab = useCallback(() => {
    startSectionTransition(starLabStartIndex, "starlab");
    setDrawerOpen(false);
  }, [starLabStartIndex, startSectionTransition]);

  const enterCollection = useCallback(() => {
    startSectionTransition(collectionStartIndex, "collection");
    setDrawerOpen(false);
  }, [collectionStartIndex, startSectionTransition]);

  const startInitialCoverOpen = useCallback(() => {
    if (transitionRef.current) return;
    const transition: BookTransition = {
      id: ++transitionSequenceRef.current,
      kind: "initial-cover-open",
      phase: "running",
      targetIndex: collectionStartIndex,
    };
    transitionRef.current = transition;
    setBookTransition(transition);
  }, [collectionStartIndex]);

  const startCoverClose = useCallback((source: "starlab" | "collection") => {
    if (transitionRef.current) return;
    const transition: BookTransition = {
      id: ++transitionSequenceRef.current,
      kind: "close-to-cover",
      phase: "prepare",
      source,
    };
    transitionRef.current = transition;
    setBookTransition(transition);
    setExperienceMode("collection");
    setPagePickerOpen(false);
  }, [setExperienceMode]);

  const startEnterCollection = useCallback(() => {
    if (transitionRef.current) return;
    const transition: BookTransition = {
      id: ++transitionSequenceRef.current,
      kind: "edge-enter-collection",
      phase: "running",
      targetIndex: collectionStartIndex,
    };
    transitionRef.current = transition;
    setBookTransition(transition);
    setExperienceMode("collection");
    engineRef.current?.next();
  }, [collectionStartIndex, setExperienceMode]);

  const startBackCoverClose = useCallback(() => {
    if (transitionRef.current) return;
    const transition: BookTransition = {
      id: ++transitionSequenceRef.current,
      kind: "close-back-cover",
      phase: "prepare",
      targetIndex: lastPageIndex,
    };
    transitionRef.current = transition;
    setBookTransition(transition);
    setBackCoverState("closing");
    setDrawerOpen(false);
    setPagePickerOpen(false);
  }, [lastPageIndex]);

  const startBackCoverOpen = useCallback(() => {
    if (transitionRef.current) return;
    const transition: BookTransition = {
      id: ++transitionSequenceRef.current,
      kind: "open-back-cover",
      phase: "prepare",
      targetIndex: backCoverOpenIndex,
    };
    transitionRef.current = transition;
    setBookTransition(transition);
    setBackCoverState("opening");
    setDrawerOpen(false);
    setPagePickerOpen(false);
  }, [backCoverOpenIndex]);

  useLayoutEffect(() => {
    if (!bookTransition || bookTransition.kind === "initial-cover-open" || bookTransition.phase === "running") return;
    const stepKey = `${bookTransition.id}:${bookTransition.phase}`;
    if (startedTransitionRef.current === stepKey) return;
    startedTransitionRef.current = stepKey;

    if (bookTransition.kind === "close-back-cover" || bookTransition.kind === "open-back-cover") {
      const running: BookTransition = { ...bookTransition, phase: "running" };
      transitionRef.current = running;
      setBookTransition(running);
      if (bookTransition.kind === "close-back-cover") engineRef.current?.closeBackCover();
      else engineRef.current?.openBackCover();
      return;
    }

    if (bookTransition.kind === "close-to-cover") {
      if (bookTransition.phase === "prepare") {
        if (bookTransition.source === "starlab") {
          const running: BookTransition = { ...bookTransition, phase: "running" };
          transitionRef.current = running;
          setBookTransition(running);
          engineRef.current?.closeCover();
          return;
        }
        // El bridge ya fue confirmado por React en el DOM. Alinear primero el
        // spread físico y esperar otro commit evita que portrait intente
        // cerrar antes de que StPageFlip haya dibujado su página adyacente.
        const aligned: BookTransition = { ...bookTransition, phase: "aligned" };
        transitionRef.current = aligned;
        setBookTransition(aligned);
        engineRef.current?.goToInstant(1);
        return;
      }
      const running: BookTransition = { ...bookTransition, phase: "running" };
      transitionRef.current = running;
      setBookTransition(running);
      engineRef.current?.closeCover();
      return;
    }

    const running: BookTransition = { ...bookTransition, phase: "running" };
    transitionRef.current = running;
    setBookTransition(running);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      engineRef.current?.goToInstant(bookTransition.targetIndex);
      finishBookTransition();
    } else {
      engineRef.current?.transitionTo(bookTransition.targetIndex, 760);
    }
  }, [bookTransition, finishBookTransition]);

  const navigate = useCallback((direction: NavigationDirection) => {
    if (transitionRef.current) return;
    const intent = resolveNavigation({
      activeIndex,
      experience: experienceRef.current,
      starLabStartIndex,
      starLabEndIndex,
      collectionStartIndex,
      backCoverOpenIndex,
      backCoverState,
    }, direction);

    switch (intent) {
      case "open-collection":
        startInitialCoverOpen();
        engineRef.current?.next();
        break;
      case "close-cover-from-starlab":
        startCoverClose("starlab");
        break;
      case "close-cover-from-collection":
        startCoverClose("collection");
        break;
      case "enter-collection":
        startEnterCollection();
        break;
      case "close-back-cover":
        startBackCoverClose();
        break;
      case "open-back-cover":
        startBackCoverOpen();
        break;
      case "normal-previous":
        engineRef.current?.previous();
        break;
      case "normal-next":
        engineRef.current?.next();
        break;
      case "blocked":
        break;
    }
  }, [
    activeIndex,
    backCoverState,
    collectionStartIndex,
    backCoverOpenIndex,
    starLabEndIndex,
    starLabStartIndex,
    startBackCoverClose,
    startBackCoverOpen,
    startCoverClose,
    startEnterCollection,
    startInitialCoverOpen,
  ]);

  const handlePrevious = useCallback(() => navigate("previous"), [navigate]);
  const handleNext = useCallback(() => navigate("next"), [navigate]);

  const atFirstPage = experience === "starlab"
    ? activeIndex <= starLabStartIndex
    : activeIndex === 0;
  const atLastPage = experience === "starlab"
    ? activeIndex >= starLabEndIndex
    : activeIndex >= backCoverOpenIndex;
  const previousBlocked = experience === "collection" && activeIndex === 0 && backCoverState !== "closed";
  const nextBlocked = backCoverState === "closed";

  const handleFirst = useCallback(() => {
    if (transitionRef.current) return;
    if (experienceRef.current === "starlab") engineRef.current?.goToInstant(starLabStartIndex);
    else engineRef.current?.goToInstant(0);
  }, [starLabStartIndex]);

  const handleLast = useCallback(() => {
    if (transitionRef.current) return;
    if (experienceRef.current === "starlab") engineRef.current?.goToInstant(starLabEndIndex);
    else {
      setBackCoverState("open");
      engineRef.current?.goToInstant(lastPageIndex);
    }
  }, [lastPageIndex, starLabEndIndex]);

  const handlePageSettled = useCallback((index: number) => {
    const transition = transitionRef.current;
    if (transition?.kind === "initial-cover-open") {
      if (index === 0) {
        finishBookTransition();
      } else if (index < collectionStartIndex) {
        engineRef.current?.goToInstant(transition.targetIndex);
        finishBookTransition();
      } else if (index === transition.targetIndex) {
        finishBookTransition();
      }
      return;
    }
    if (transition?.kind === "close-to-cover") {
      if (index === 0) finishBookTransition();
      return;
    }
    if (transition?.kind === "edge-enter-collection") {
      if (index === transition.targetIndex) finishBookTransition();
      return;
    }
    if (transition?.kind === "section") {
      if (index === transition.targetIndex) finishBookTransition();
      return;
    }
  }, [collectionStartIndex, finishBookTransition]);

  const handleBackCoverTransitionEnd = useCallback((state: "open" | "closed") => {
    const transition = transitionRef.current;
    if (
      (state === "closed" && transition?.kind !== "close-back-cover") ||
      (state === "open" && transition?.kind !== "open-back-cover")
    ) {
      return;
    }
    setBackCoverState(state);
    finishBookTransition();
  }, [finishBookTransition]);

  const goToPage = (event: FormEvent) => {
    event.preventDefault();
    if (transitionRef.current) return;
    const requested = Math.max(1, Math.min(catalog.pageCount, Number(pageInput) || 1));
    setPageInput(String(requested));
    goToOriginalPage(requested, false);
    setPagePickerOpen(false);
  };

  const handleProductSelect = useCallback(
    (productId: string) => {
      const resolved = resolveProduct(productId);
      if (resolved.kind === "ok") {
        setSelectedProductId(productId);
      } else {
        showToast("Este producto no está disponible ahora.");
      }
    },
    [resolveProduct, showToast],
  );

  // El modal resuelve el producto vivo en cada render: si el catálogo se
  // actualiza por polling, precio/disponibilidad/imágenes se refrescan sin F5.
  const resolvedSelected = selectedProductId ? resolveProduct(selectedProductId) : null;
  const modalProduct = resolvedSelected?.kind === "ok" ? resolvedSelected.product : null;
  const modalPage =
    modalProduct?.pagina != null ? catalog.pages[modalProduct.pagina - 1] : undefined;
  const modalCartQty =
    modalProduct != null
      ? lines.find((line) => line.productId === modalProduct.id)?.qty ?? 0
      : 0;

  useEffect(() => {
    setUiBusy(selectedProductId != null || cartOpen || isBookTransitioning);
  }, [selectedProductId, cartOpen, isBookTransitioning, setUiBusy]);

  // Navegación por teclado: ← spread anterior, → spread siguiente.
  // Solo actúa en lectura normal: nunca con modal/carrito abiertos, con
  // modificadores, con tecla mantenida, dentro de diálogos ni cuando el
  // foco está en un control que usa flechas (inputs, selects, editables).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (selectedProductId != null || cartOpen || transitionRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.closest('[role="dialog"]')) return;
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      event.preventDefault();
      if (event.key === "ArrowRight") handleNext();
      else handlePrevious();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProductId, cartOpen, handleNext, handlePrevious]);

  const visualCoverActive = displayIndex === 0 || bookTransition?.kind === "close-to-cover";
  const coverBridgeActive =
    bookTransition?.kind === "initial-cover-open" ||
    (bookTransition?.kind === "close-to-cover" && bookTransition.source === "collection") ||
    (experience === "collection" && activeIndex === 0);
  const manualNavigationBoundary = !isBookTransitioning && (
    (experience === "starlab" && (activeIndex <= starLabStartIndex || activeIndex >= starLabEndIndex)) ||
    (experience === "collection" && (
      activeIndex === collectionStartIndex ||
      activeIndex >= backCoverOpenIndex ||
      backCoverState === "closed"
    ))
  );

  return (
    <main
      className={`catalog-app ${coverReady ? "cover-ready" : ""} ${visualCoverActive ? "cover-active" : ""} ${visualCoverActive && orientation === "landscape" ? "is-cover" : ""} ${backCoverState === "closed" ? "back-cover-closed" : ""}`}
      data-book-transition={bookTransition?.kind ?? "idle"}
      data-back-cover-state={backCoverState}
      data-transition-direction={bookTransition?.kind === "section"
        ? bookTransition.direction
        : bookTransition?.kind === "edge-enter-collection" ? "forward" : undefined}
    >
      <header className="catalog-toolbar">
        <div className="toolbar-left">
          <button
            className="icon-button menu-button"
            type="button"
            aria-label={drawerOpen ? "Cerrar miniaturas" : "Abrir miniaturas"}
            aria-expanded={drawerOpen}
            disabled={isBookTransitioning}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <span aria-hidden="true">{drawerOpen ? "×" : "☰"}</span>
          </button>
          <div className="brand-lockup" aria-label="StarVie 2027">
            <strong>STARVIE</strong><span>2027</span>
          </div>
          <nav className="experience-nav" aria-label="Secciones del catálogo">
            <button
              className={experience === "collection" ? "is-active" : ""}
              type="button"
              aria-pressed={experience === "collection"}
              disabled={isBookTransitioning}
              onClick={enterCollection}
            >
              COLECCIÓN 2027
            </button>
            <button
              className={experience === "starlab" ? "is-active" : ""}
              type="button"
              aria-pressed={experience === "starlab"}
              disabled={isBookTransitioning}
              onClick={enterStarLab}
            >
              STARLAB
            </button>
          </nav>
        </div>

        <div className="page-picker-wrap">
          <button
            className="page-indicator"
            data-testid="page-indicator"
            type="button"
            aria-label="Ir a una página"
            aria-expanded={pagePickerOpen}
            disabled={isBookTransitioning}
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

        <div className="toolbar-right">
          <p className="toolbar-hint">Arrastra una esquina o usa las flechas</p>
          <button
            className="cart-button"
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={units > 0 ? `Abrir pedido, ${units} unidades` : "Abrir pedido"}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
              <path d="M6.5 8.5h11l-.8 10h-9.4l-.8-10Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path d="M9 9V7a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
            {units > 0 ? (
              <span className="cart-badge" aria-hidden="true">{units}</span>
            ) : null}
          </button>
        </div>
      </header>

      <aside className={`thumbnail-drawer ${drawerOpen ? "is-open" : ""}`} aria-label="Miniaturas">
        <div className="thumbnail-list">
          {bookPages.map((bookPage, index) => (
            <button
              className={Math.abs(index - displayIndex) <= (orientation === "landscape" && displayIndex > 0 ? 1 : 0) ? "is-active" : ""}
              key={bookPage.id}
              type="button"
              disabled={isBookTransitioning}
              onClick={() => {
                if (bookPage.kind === "pdf") goToOriginalPage(bookPage.originalNumber, false);
                else goToBookIndex(index, "collection", false);
                setDrawerOpen(false);
              }}
              aria-label={bookPage.kind === "pdf" ? `Ir a página ${bookPage.originalNumber}` : "Ir a página de video"}
            >
              {bookPage.kind === "pdf" ? (
                <img src={bookPage.page.thumbnail} alt="" width="120" height="68" loading="lazy" decoding="async" />
              ) : (
                <div className="video-thumbnail" aria-hidden="true"><strong>STARVIE</strong><small>VIDEO</small></div>
              )}
              <span>{bookPage.kind === "pdf" ? bookPage.originalNumber : "VIDEO"}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="magazine-stage" aria-label="Catálogo StarVie 2027">
        <div className="stage-glow" aria-hidden="true" />
        <PageFlipEngine
          ref={engineRef}
          pages={bookPages}
          backCoverPage={backCoverPage}
          activeIndex={activeIndex}
          orientation={orientation}
          onPageChange={onPageChange}
          onPageSettled={handlePageSettled}
          onOrientationChange={onOrientationChange}
          onCoverReady={() => setCoverReady(true)}
          productNames={productNames}
          onProductSelect={handleProductSelect}
          coverBridgeActive={coverBridgeActive}
          coverMotionActive={bookTransition?.kind === "initial-cover-open" || bookTransition?.kind === "close-to-cover"}
          backCoverState={backCoverState}
          onBackCoverTransitionEnd={handleBackCoverTransitionEnd}
          interactionLocked={isBookTransitioning}
          videoPlaybackAllowed={!isBookTransitioning}
          onCoverTransitionStart={startInitialCoverOpen}
          manualNavigationBoundary={manualNavigationBoundary}
          onManualNavigationIntent={navigate}
        />

        <nav className="page-controls" aria-label="Navegación de páginas">
          <button className="page-jump" type="button" onClick={handleFirst} disabled={isBookTransitioning || atFirstPage} aria-label="Primera página">
            <span aria-hidden="true">|‹</span>
          </button>
          <button type="button" onClick={handlePrevious} disabled={isBookTransitioning || previousBlocked} aria-label="Página anterior">
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" onClick={handleNext} disabled={isBookTransitioning || nextBlocked} aria-label="Página siguiente">
            <span aria-hidden="true">›</span>
          </button>
          <button className="page-jump" type="button" onClick={handleLast} disabled={isBookTransitioning || atLastPage} aria-label="Última página">
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

      {modalProduct ? (
        <ProductModal
          product={modalProduct}
          pageSrc={modalPage?.src}
          pageNumber={modalProduct.pagina}
          cartQty={modalCartQty}
          onAdd={(qty) => addToCart(modalProduct.id, qty)}
          onClose={() => setSelectedProductId(null)}
        />
      ) : null}
      <CartDrawer />
      {catalogError ? (
        <p className="commerce-warning" role="status">{catalogError}</p>
      ) : null}
      {toast ? (
        <p className="commerce-toast" role="status">{toast}</p>
      ) : null}
    </main>
  );
}
