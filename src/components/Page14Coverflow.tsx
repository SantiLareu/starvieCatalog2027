import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectCoverflow, Navigation, A11y } from "swiper/modules";
import type { Swiper as SwiperInstance } from "swiper";
import { useCommerce } from "../commerce/CommerceContext";
import type { CommerceProduct } from "../commerce/types";
import { assetUrl } from "./ProductModal";
import "swiper/css";
import "swiper/css/effect-coverflow";
import "./page14-coverflow.css";

export function coverflowProducts(products: CommerceProduct[]): CommerceProduct[] {
  return products
    .filter((p) => p.categoria.toLowerCase() === "palas" && p.pagina != null && p.pagina >= 15 && p.pagina <= 26 && p.imagenes.length > 0)
    .sort((a, b) => (a.pagina ?? 0) - (b.pagina ?? 0));
}

function coverflowImage(product: CommerceProduct): string {
  const sourceName = product.imagenes[0].split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? "";
  const slug = (product.id + "--" + sourceName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return assetUrl("catalog/coverflow/" + slug + ".webp");
}

// The live slider and the inert cover/flip view share the same fan geometry.
function fanTransform(distance: number, x: string, y: string): string {
  const depth = Math.abs(distance);
  const angle = Math.sign(distance) * Math.min(depth * 20, 65);
  return "translate3d(" + x + "," + y + "," + (-depth * 45) + "px) rotateY(" + (-angle) + "deg) rotateZ(" + (distance * 2) + "deg) scale(" + (1 - Math.min(depth, 4) * .08) + ")";
}

function composeFan(swiper: SwiperInstance) {
  if (swiper.destroyed || !swiper.width) return;
  // Read the rendered wrapper position, not its destination. One continuous
  // progress drives translation, rotation, scale, opacity and stacking order.
  const matrix = getComputedStyle(swiper.wrapperEl).transform;
  const translate = matrix === "none" ? swiper.translate : new DOMMatrixReadOnly(matrix).m41;
  const center = -translate + swiper.width / 2;
  swiper.slides.forEach((slide, index) => {
    const size = swiper.slidesSizesGrid[index];
    if (!size) return;
    const offset = (slide as HTMLElement & { swiperSlideOffset?: number }).swiperSlideOffset ?? 0;
    const distance = (offset + size / 2 - center) / size;
    slide.style.setProperty("--fan-transform", fanTransform(distance, (-distance * size * .2) + "px", (Math.abs(distance) * swiper.height * .022) + "px"));
    slide.style.zIndex = String(20 - Math.round(Math.abs(distance) * 3));
    slide.style.opacity = String(Math.min(1, Math.max(0, (4 - Math.abs(distance)) * 2)));
    slide.style.visibility = Math.abs(distance) >= 4 ? "hidden" : "visible";
    slide.style.filter = "brightness(" + (1 - Math.min(Math.abs(distance), 3) * .06) + ")";
  });
}

type Page14CoverflowProps = {
  visible: boolean;
  activeProductId: string | null;
  onActiveProductChange: (productId: string) => void;
  onProductSelect: (productId: string) => void;
  staticOnly?: boolean;
};

export function Page14Coverflow({ visible, activeProductId, onActiveProductChange, onProductSelect, staticOnly = false }: Page14CoverflowProps) {
  const { products } = useCommerce();
  const palas = useMemo(() => coverflowProducts(products), [products]);
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const fanFrameRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const pointerFocusRef = useRef(false);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const activeIndex = Math.max(0, palas.findIndex((product) => product.id === activeProductId));
  const active = palas[activeIndex];

  const updateFan = useCallback((instance: SwiperInstance) => {
    composeFan(instance);
    if (fanFrameRef.current != null || !visibleRef.current) return;
    const frame = () => {
      fanFrameRef.current = null;
      if (instance.destroyed || !visibleRef.current) return;
      composeFan(instance);
      if (instance.animating) fanFrameRef.current = requestAnimationFrame(frame);
    };
    fanFrameRef.current = requestAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    if (visible && !staticOnly) setInitialized(true);
    if (!visible) {
      swiper?.autoplay.stop();
      if (fanFrameRef.current != null) cancelAnimationFrame(fanFrameRef.current);
      fanFrameRef.current = null;
    }
  }, [visible, staticOnly, swiper]);

  useLayoutEffect(() => {
    if (!visible || !swiper || swiper.destroyed) return;
    if (Math.abs(swiper.el.clientWidth - swiper.width) > 1) swiper.update();
    updateFan(swiper);
    if (ready) return;
    let cancelled = false;
    // Keep the already painted static fan until the live geometry AND its
    // seven images are ready. No empty frame and no timed crossfade.
    const images = swiper.slides.filter(slide => slide.style.visibility !== "hidden")
      .flatMap(slide => Array.from(slide.querySelectorAll("img")));
    void Promise.all(images.map(image => image.decode().catch(() => undefined))).then(() => {
      if (!cancelled && !swiper.destroyed) { composeFan(swiper); setReady(true); }
    });
    return () => { cancelled = true; };
  }, [visible, swiper, ready, updateFan]);

  useEffect(() => () => {
    if (fanFrameRef.current != null) cancelAnimationFrame(fanFrameRef.current);
  }, []);

  useEffect(() => {
    if (staticOnly) return;
    const onVisibilityChange = () => setTabVisible(!document.hidden);
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => setReducedMotion(media.matches);
    onMotionChange();
    media.addEventListener("change", onMotionChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      media.removeEventListener("change", onMotionChange);
    };
  }, [staticOnly]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !visible) return;
    const isolate = (event: Event) => event.stopPropagation();
    const finishInteraction = () => {
      setInteracting(false);
      // Pointer/touch buttons release their focus with the gesture; keyboard
      // focus remains a deliberate autoplay pause until it leaves the carousel.
      if (pointerFocusRef.current && root.contains(document.activeElement)) {
        (document.activeElement as HTMLElement)?.blur();
      }
      pointerFocusRef.current = false;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      setFocused(true);
      if (event.key === "ArrowLeft") swiper?.slidePrev();
      else swiper?.slideNext();
    };
    root.addEventListener("mousedown", isolate);
    root.addEventListener("touchstart", isolate, { passive: true });
    root.addEventListener("keydown", handleKeyDown);
    for (const name of ["pointerup", "pointercancel", "touchend", "touchcancel"]) window.addEventListener(name, finishInteraction);
    return () => {
      root.removeEventListener("mousedown", isolate);
      root.removeEventListener("touchstart", isolate);
      root.removeEventListener("keydown", handleKeyDown);
      for (const name of ["pointerup", "pointercancel", "touchend", "touchcancel"]) window.removeEventListener(name, finishInteraction);
    };
  }, [visible, swiper]);

  useEffect(() => {
    if (!swiper || swiper.destroyed) return;
    const allowed = visible && ready && tabVisible && !reducedMotion && !hovered && !focused && !interacting && palas.length > 1;
    if (allowed && !swiper.autoplay.running) swiper.autoplay.start();
    if (!allowed && swiper.autoplay.running) swiper.autoplay.stop();
  }, [swiper, visible, ready, tabVisible, reducedMotion, hovered, focused, interacting, palas.length]);

  useEffect(() => {
    if (!visible) { setHovered(false); setFocused(false); setInteracting(false); }
  }, [visible]);

  const image = (product: CommerceProduct, eager = false) => (
    <img src={coverflowImage(product)} alt={product.nombre} draggable={false} loading={eager ? "eager" : "lazy"} decoding="async" />
  );

  return (
    <div className="pdf-page page14-coverflow" data-page-number="14" data-testid="page14-coverflow" data-presentation={visible && ready ? "interactive" : "snapshot"} data-live-ready={ready}>
      <div className="page14-coverflow__heading">
        <span className="page14-coverflow__eyebrow">STARVIE / COLLECTION 2027</span>
        <strong>ENCUENTRA TU JUEGO</strong>
        <span className="page14-coverflow__rule" aria-hidden="true" />
      </div>
      <div ref={rootRef} className="page14-coverflow__interactive" inert={!visible}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setHovered(false); }}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
        onPointerDown={() => { pointerFocusRef.current = true; setFocused(false); setInteracting(true); }}
      >
        {palas.length > 0 ? <>
          <button ref={previousRef} className="page14-coverflow__arrow page14-coverflow__arrow--prev" type="button" aria-label="Paleta anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
          <button ref={nextRef} className="page14-coverflow__arrow page14-coverflow__arrow--next" type="button" aria-label="Paleta siguiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
          {initialized && !staticOnly ? <Swiper
            modules={[EffectCoverflow, Navigation, Autoplay, A11y]} effect="coverflow"
            navigation={{ prevEl: previousRef.current, nextEl: nextRef.current }}
            onBeforeInit={(instance) => {
              if (typeof instance.params.navigation === "object") {
                instance.params.navigation.prevEl = previousRef.current;
                instance.params.navigation.nextEl = nextRef.current;
              }
            }}
            a11y={{ prevSlideMessage: "Paleta anterior", nextSlideMessage: "Paleta siguiente" }}
            centeredSlides slidesPerView="auto" loop={palas.length > 7} initialSlide={activeIndex}
            speed={reducedMotion ? 0 : 600} grabCursor watchSlidesProgress
            coverflowEffect={{ rotate: 0, depth: 0, slideShadows: false }}
            autoplay={{ enabled: false, delay: 1500, disableOnInteraction: false }}
            onSwiper={(instance) => { instance.autoplay.stop(); composeFan(instance); setSwiper(instance); }}
            onSetTranslate={updateFan} onResize={updateFan} onTransitionEnd={updateFan}
            onSlideChange={(instance) => { const p = palas[instance.realIndex]; if (p) onActiveProductChange(p.id); }}
            onTouchStart={() => setInteracting(true)} onTouchEnd={() => setInteracting(false)}
            className="page14-coverflow__swiper" aria-label="Paletas StarVie 2027"
          >
            {palas.map((product) => <SwiperSlide key={product.id} className="page14-coverflow__slide"><div className="page14-coverflow__pala">{image(product)}</div></SwiperSlide>)}
          </Swiper> : null}
          {!ready || staticOnly ? <div className="page14-coverflow__snapshot" aria-hidden="true">
            {Array.from({ length: Math.min(7, palas.length) }, (_, slot) => {
              const distance = slot - Math.floor(Math.min(7, palas.length) / 2);
              const product = palas[(activeIndex + distance + palas.length) % palas.length];
              const style = {
                transform: "translate(-50%, -50%) " + fanTransform(distance, (distance * 28.718) + "%", (Math.abs(distance) * 2.2) + "%"),
                zIndex: 20 - Math.abs(distance) * 3,
                filter: "brightness(" + (1 - Math.abs(distance) * .06) + ")",
              } as CSSProperties;
              return <div key={product.id} className="page14-coverflow__pala" style={style}>{image(product, true)}</div>;
            })}
          </div> : null}
        </> : <p className="page14-coverflow__empty">Cargando colección de paletas…</p>}
        {active ? <div className="page14-coverflow__details" aria-live={visible ? "polite" : "off"}>
          <span className="page14-coverflow__count">{String(activeIndex + 1).padStart(2, "0")} / {String(palas.length).padStart(2, "0")}</span>
          <h2>{active.nombre}</h2>
          <span className="page14-coverflow__availability">{active.disponible ? "DISPONIBLE" : "SIN STOCK"}</span>
          <button className="page14-coverflow__product" type="button" onClick={() => onProductSelect(active.id)}>VER PRODUCTO <span aria-hidden="true">↗</span></button>
        </div> : null}
      </div>
      <span className="page-edge" aria-hidden="true" />
    </div>
  );
}
