/** Leaf-only gesture handshake; never a navigation command. */
export const PREMIUM_ZOOM_CLAIM = "starvie:premium-zoom-claim";
export const PREMIUM_ZOOM_RESET = "starvie:premium-zoom-reset";
export const PREMIUM_ZOOM_MIN = 1;
export const PREMIUM_ZOOM_MAX = 2.5;
export type ZoomPoint = { x: number; y: number };
export type PremiumZoomView = ZoomPoint & { scale: number };
export const PREMIUM_ZOOM_INITIAL: PremiumZoomView = { scale: 1, x: 0, y: 0 };

export function boundPremiumZoom(view: PremiumZoomView, width: number, height: number): PremiumZoomView {
  const scale = Math.min(PREMIUM_ZOOM_MAX, Math.max(PREMIUM_ZOOM_MIN, view.scale));
  if (scale <= 1.01) return PREMIUM_ZOOM_INITIAL;
  return { scale, x: Math.min(0, Math.max(width * (1 - scale), view.x)),
    y: Math.min(0, Math.max(height * (1 - scale), view.y)) };
}

export function pinchPremiumZoom(start: PremiumZoomView, anchor: ZoomPoint, startDistance: number,
  distance: number, midpoint: ZoomPoint, width: number, height: number): PremiumZoomView {
  const scale = Math.min(PREMIUM_ZOOM_MAX, Math.max(PREMIUM_ZOOM_MIN, start.scale * distance / Math.max(1, startDistance)));
  return boundPremiumZoom({ scale, x: midpoint.x - anchor.x * scale, y: midpoint.y - anchor.y * scale }, width, height);
}
