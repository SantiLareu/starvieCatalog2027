import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { closedCover, containLogo, DESKTOP_STAGE_QUERY, frontCoverLogo, logoFlightFrames, logoInkFrames,
  resolveLogoFlight, type ClosedCover, type LogoBookState, type LogoFlight } from "./desktopLogoFlight";
import "./desktop-stage.css";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribe(query: string, update: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
const subscribeDesktop = (update: () => void) => subscribe(DESKTOP_STAGE_QUERY, update);
const subscribeReduced = (update: () => void) => subscribe(REDUCED_MOTION_QUERY, update);

/** Decorative scene only: never owns book geometry, navigation or input. */
export function DesktopStageBackground({ book }: { book: LogoBookState }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const flyingRef = useRef<HTMLDivElement>(null);
  const latest = useRef(book);
  latest.current = book;
  const motion = useRef<{
    animations: Animation[]; id: number | null; previous: ClosedCover;
    flight: LogoFlight | null; generation: number;
  }>({ animations: [], id: null, previous: closedCover(book), flight: null, generation: 0 });
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_STAGE_QUERY).matches, () => false);
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_MOTION_QUERY).matches, () => true);

  function cancelFlight() {
    const current = motion.current;
    current.generation++;
    for (const animation of current.animations) { animation.onfinish = null; animation.cancel(); }
    current.animations = [];
    current.flight = null;
    flyingRef.current?.removeAttribute("style");
    flightRef.current?.removeAttribute("data-active");
    const app = sceneRef.current?.parentElement;
    if (app) {
      delete app.dataset.desktopLogoFlight;
      delete app.dataset.desktopLogoCover;
    }
  }

  function settle(open: boolean) {
    if (sceneRef.current) sceneRef.current.dataset.logoState = open ? "wall" : "closed";
    cancelFlight();
  }

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const wall = wallRef.current;
    const flying = flyingRef.current;
    const layer = flightRef.current;
    const app = scene?.parentElement;
    if (!scene || !wall || !flying || !layer || !app) return;
    const current = motion.current;
    const spec = resolveLogoFlight(book, current.previous);
    if (!desktop || reduced || typeof flying.animate !== "function") {
      settle(desktop && (spec ? spec.opening : closedCover(book) === null));
      current.previous = closedCover(book);
      current.id = book.transition?.id ?? null;
      return;
    }
    if (spec && book.transition && current.id !== book.transition.id) {
      cancelFlight();
      current.id = book.transition.id;
      const block = app.querySelector<HTMLElement>(".stf__block");
      const cover = app.querySelector<HTMLElement>('.catalog-leaf[data-book-index="0"]');
      if (!block || !cover) { settle(spec.opening); return; }
      const viewport = block.getBoundingClientRect();
      const origin = app.getBoundingClientRect();
      // Use the renderer's stable page dimensions, never the rotating face's
      // bounding box. The closed front cover occupies the right half of the book.
      // Hidden covers have offsetWidth=0; the renderer retains their fitted
      // dimensions inline while reading interior spreads.
      const pageWidth = cover.offsetWidth || Number.parseFloat(cover.style.width) || viewport.width / 2;
      const pageHeight = cover.offsetHeight || Number.parseFloat(cover.style.height) || viewport.height;
      const page = { x: viewport.left - origin.left + (spec.cover === "front" ? pageWidth : 0),
        y: viewport.top - origin.top, width: pageWidth, height: pageHeight };
      const source = spec.cover === "front" ? frontCoverLogo(page) : containLogo({
        x: page.x + page.width * 0.22, y: page.y + page.height * 0.34,
        width: page.width * 0.56, height: page.height * 0.34,
      });
      const targetBox = wall.getBoundingClientRect();
      const target = containLogo({ x: targetBox.left - origin.left, y: targetBox.top - origin.top,
        width: targetBox.width, height: targetBox.height });
      const wallStyle = getComputedStyle(wall);
      const pose = { skewY: Number.parseFloat(wallStyle.getPropertyValue("--desktop-wall-logo-skew-y")) || 0,
        scaleY: Number.parseFloat(wallStyle.getPropertyValue("--desktop-wall-logo-scale-y")) || 1 };
      if (!source.width || !target.width) { settle(spec.opening); return; }
      Object.assign(flying.style, { left: `${target.x}px`, top: `${target.y}px`,
        width: `${target.width}px`, height: `${target.height}px`, willChange: "transform, opacity" });
      scene.dataset.logoState = "flying";
      layer.dataset.active = "true";
      app.dataset.desktopLogoFlight = spec.opening ? "opening" : "closing";
      app.dataset.desktopLogoCover = spec.cover;
      const options: KeyframeAnimationOptions = { duration: spec.duration, fill: "both",
        direction: spec.opening ? "normal" : "reverse" };
      const flight = flying.animate(logoFlightFrames(source, target, pose), options);
      const ink = wall.animate(logoInkFrames(), options);
      // Start both effects on the current document tick, rather than letting
      // separate pending animation tasks drift a frame behind the native flip.
      const startTime = document.timeline.currentTime;
      if (startTime != null) { flight.startTime = startTime; ink.startTime = startTime; }
      current.animations = [flight, ink];
      current.flight = spec;
      const generation = current.generation;
      flight.onfinish = () => {
        if (motion.current.generation !== generation) return;
        settle(latest.current.transition ? spec.opening : closedCover(latest.current) === null);
      };
      return;
    }
    if (!book.transition) {
      const open = closedCover(book) === null;
      current.previous = closedCover(book);
      // A cancelled native drag returns to its source. Reverse the actual
      // in-flight timeline instead of leaving a stale mural or restarting it.
      if (current.flight && current.flight.opening !== open) {
        current.flight.opening = open;
        for (const animation of current.animations) animation.reverse();
      } else {
        // The book's settle event is authoritative. Native flips may finish
        // slightly before their configured maximum duration; never leave a
        // flying copy over a cover that has already closed.
        settle(open);
      }
    }
  }, [book, desktop, reduced]);

  useLayoutEffect(() => {
    if (!desktop) return;
    // Resizing or hiding a tab invalidates viewport coordinates. Snap only the
    // decoration to its intended destination; never touch book state or layout.
    const reconcile = () => {
      const current = latest.current;
      const spec = resolveLogoFlight(current, motion.current.previous);
      motion.current.id = current.transition?.id ?? null;
      settle(spec ? spec.opening : closedCover(current) === null);
    };
    const onVisibility = () => { if (document.hidden) reconcile(); };
    window.addEventListener("resize", reconcile);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("resize", reconcile);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelFlight();
    };
  }, [desktop]);

  return (
    <>
    <div ref={sceneRef} className="desktop-stage-background" aria-hidden="true">
      <div className="desktop-stage-background__frame">
        <div className="desktop-stage-background__court" />
      </div>
      <div ref={wallRef} className="desktop-stage-background__wall-logo">
        <div className="desktop-stage-background__wall-mark" />
      </div>
    </div>
    <div ref={flightRef} className="desktop-logo-flight" aria-hidden="true">
      <div ref={flyingRef} className="desktop-logo-flight__logo" />
    </div>
    </>
  );
}
