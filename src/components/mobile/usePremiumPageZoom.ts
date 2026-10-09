import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { usePilotViewport } from "./mobilePilot";
import { boundPremiumZoom, pinchPremiumZoom, PREMIUM_ZOOM_CLAIM, PREMIUM_ZOOM_INITIAL, PREMIUM_ZOOM_RESET,
  type PremiumZoomView, type ZoomPoint } from "./premiumPageZoom";

type Finger = ZoomPoint & { id: number };
type Gesture = { mode: "pinch"; ids: [number, number]; start: PremiumZoomView; distance: number; anchor: ZoomPoint }
  | { mode: "pan"; id: number; start: PremiumZoomView; point: ZoomPoint; moved: boolean; control: HTMLElement | null }
  | { mode: "drain" };
const TAP_TRAVEL = 8;

/** Captures only pinch/zoomed pan; a 1x one-finger sequence passes unchanged. */
export function usePremiumPageZoom(active: boolean, identity: string) {
  const portrait = usePilotViewport();
  const enabled = active && portrait;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const current = useRef(PREMIUM_ZOOM_INITIAL);
  const frame = useRef<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [view, setView] = useState(PREMIUM_ZOOM_INITIAL);

  const paint = useCallback((next: PremiumZoomView) => {
    const content = contentRef.current, viewport = viewportRef.current;
    if (content) {
      if (next.scale === 1) content.style.removeProperty("transform");
      else content.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
    if (viewport) {
      viewport.dataset.zoom = next.scale.toFixed(2);
      viewport.dataset.panX = next.x.toFixed(2);
      viewport.dataset.panY = next.y.toFixed(2);
      const resetButton = viewport.querySelector<HTMLButtonElement>(".mobile-premium-zoom-reset");
      if (resetButton) resetButton.hidden = next.scale === 1;
    }
    setView(next);
  }, []);
  const reset = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    current.current = PREMIUM_ZOOM_INITIAL;
    if (gesture.current) gesture.current = { mode: "drain" };
    // Synchronous DOM reset also covers the native book's static turn copies.
    paint(PREMIUM_ZOOM_INITIAL);
  }, [paint]);

  useLayoutEffect(() => { reset(); }, [enabled, identity, reset]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!enabled || !viewport) return;
    let first: { id: number; rect: DOMRect } | null = null;
    const inside = (target: EventTarget | null) => target instanceof Node && viewport.contains(target);
    const controlAt = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("button, a") : null;
    const stop = (event: Event) => { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); };
    const fingers = (event: TouchEvent): Finger[] => {
      const rect = viewport.getBoundingClientRect();
      return Array.from(event.touches, touch => ({ id: touch.identifier, x: touch.clientX - rect.left, y: touch.clientY - rect.top }));
    };
    const claim = () => viewport.dispatchEvent(new CustomEvent(PREMIUM_ZOOM_CLAIM, { bubbles: true, cancelable: true }));
    const commit = (next: PremiumZoomView) => {
      current.current = boundPremiumZoom(next, viewport.clientWidth, viewport.clientHeight);
      if (frame.current == null) frame.current = requestAnimationFrame(() => {
        frame.current = null;
        paint(current.current);
      });
    };
    const beginPinch = (points: Finger[]) => {
      const [a, b] = points;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const start = current.current;
      gesture.current = { mode: "pinch", ids: [a.id, b.id], start,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        anchor: { x: (midpoint.x - start.x) / start.scale, y: (midpoint.y - start.y) / start.scale } };
      suppressClick.current = true;
    };
    const beginPan = (point: Finger, control: HTMLElement | null, moved = false) => {
      gesture.current = { mode: "pan", id: point.id, start: current.current, point, control, moved };
    };
    const onStart = (event: TouchEvent) => {
      const touches = Array.from(event.touches);
      if (!gesture.current) {
        const sameLeaf = inside(event.target) && touches.every(touch => inside(touch.target));
        // Native folds can put a static copy under the second finger. The
        // original first finger + original reading-band bounds still identify
        // its owner, before the handshake retracts that fold.
        const promotedFold = first && touches.some(touch => touch.identifier === first!.id && inside(touch.target)) &&
          touches.every(touch => touch.clientX >= first!.rect.left && touch.clientX <= first!.rect.right &&
            touch.clientY >= first!.rect.top && touch.clientY <= first!.rect.bottom);
        if (!sameLeaf && !(touches.length >= 2 && promotedFold)) return;
      }
      if (touches.length >= 2) {
        if (!gesture.current && !claim()) gesture.current = { mode: "drain" };
        first = null;
        if (gesture.current?.mode !== "drain") beginPinch(fingers(event));
        suppressClick.current = true;
        stop(event);
      } else if (gesture.current) stop(event);
      else if (current.current.scale > 1 && touches.length) {
        suppressClick.current = false;
        gesture.current = claim() ? null : { mode: "drain" };
        if (!gesture.current) beginPan(fingers(event)[0], controlAt(event.target));
        stop(event);
      } else {
        first = touches.length ? { id: touches[0].identifier, rect: viewport.getBoundingClientRect() } : null;
        suppressClick.current = false; // Let the original book own this finger.
      }
    };
    const onMove = (event: TouchEvent) => {
      const state = gesture.current;
      if (!state) {
        if (!Array.from(event.touches).some(touch => touch.identifier === first?.id)) first = null;
        return;
      }
      stop(event);
      const points = fingers(event);
      if (state.mode === "pinch") {
        const a = points.find(point => point.id === state.ids[0]), b = points.find(point => point.id === state.ids[1]);
        if (!a || !b) return;
        commit(pinchPremiumZoom(state.start, state.anchor, state.distance, Math.hypot(a.x - b.x, a.y - b.y),
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, viewport.clientWidth, viewport.clientHeight));
      } else if (state.mode === "pan") {
        const point = points.find(candidate => candidate.id === state.id);
        if (!point) return;
        const dx = point.x - state.point.x, dy = point.y - state.point.y;
        if (Math.hypot(dx, dy) >= TAP_TRAVEL) state.moved = true;
        if (state.moved) {
          suppressClick.current = true;
          commit({ scale: state.start.scale, x: state.start.x + dx, y: state.start.y + dy });
        }
      }
    };
    const onEnd = (event: TouchEvent) => {
      const state = gesture.current;
      if (!state) {
        if (!Array.from(event.touches).some(touch => touch.identifier === first?.id)) first = null;
        return;
      }
      stop(event);
      const points = fingers(event);
      if (points.length >= 2) beginPinch(points);
      else if (points.length) {
        // Even at 1x, the tail of a pinch must never become a new book swipe.
        if (current.current.scale > 1 && state.mode !== "drain") beginPan(points[0], null, true);
        else gesture.current = { mode: "drain" };
      } else {
        gesture.current = null;
        if (state.mode === "pan" && !state.moved && state.control && viewport.contains(state.control)) {
          const touch = event.changedTouches[0];
          const endControl = touch ? controlAt(document.elementFromPoint(touch.clientX, touch.clientY)) : null;
          const rect = viewport.getBoundingClientRect();
          const travel = touch ? Math.hypot(touch.clientX - rect.left - state.point.x, touch.clientY - rect.top - state.point.y) : Infinity;
          if (travel >= TAP_TRAVEL) suppressClick.current = true;
          if (travel < TAP_TRAVEL && endControl === state.control) {
            suppressClick.current = false;
            // Same original click delegate / React control, never commerce logic.
            state.control.click();
          }
        }
      }
    };
    const onCancel = (event: TouchEvent) => {
      first = null;
      if (!gesture.current) return;
      stop(event);
      suppressClick.current = true;
      reset();
      if (!event.touches.length) gesture.current = null;
    };
    const onClick = (event: MouseEvent) => {
      if (inside(event.target) && suppressClick.current && event.detail !== 0) stop(event);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!inside(event.target)) return;
      const compatibilityTouch = (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } }).sourceCapabilities?.firesTouchEvents;
      if (compatibilityTouch && suppressClick.current) stop(event);
      else {
        suppressClick.current = false;
        if (current.current.scale > 1) event.stopImmediatePropagation();
      }
    };
    const onMouseMove = (event: MouseEvent | PointerEvent) => {
      if ((current.current.scale > 1 || gesture.current || suppressClick.current) && inside(event.target)) event.stopImmediatePropagation();
    };
    const onMouseUp = (event: MouseEvent) => {
      if (inside(event.target) && (current.current.scale > 1 || suppressClick.current)) event.stopImmediatePropagation();
    };
    const onHidden = () => { if (document.hidden) reset(); };
    const options = { capture: true, passive: false };
    window.addEventListener("touchstart", onStart, options);
    window.addEventListener("touchmove", onMove, options);
    window.addEventListener("touchend", onEnd, options);
    window.addEventListener("touchcancel", onCancel, options);
    window.addEventListener("click", onClick, true);
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("pointermove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", onHidden);
    viewport.addEventListener(PREMIUM_ZOOM_RESET, reset);
    let width = viewport.clientWidth, height = viewport.clientHeight;
    const observer = new ResizeObserver(() => {
      if (width !== viewport.clientWidth || height !== viewport.clientHeight) {
        width = viewport.clientWidth; height = viewport.clientHeight; reset();
      }
    });
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      window.removeEventListener("touchstart", onStart, true);
      window.removeEventListener("touchmove", onMove, true);
      window.removeEventListener("touchend", onEnd, true);
      window.removeEventListener("touchcancel", onCancel, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("pointermove", onMouseMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", onHidden);
      viewport.removeEventListener(PREMIUM_ZOOM_RESET, reset);
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null; gesture.current = null;
      contentRef.current?.style.removeProperty("transform");
    };
  }, [enabled, identity, paint, reset]);
  return { viewportRef, contentRef, view, reset };
}
