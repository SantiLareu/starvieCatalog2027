/**
 * Configuración física única para ambas instancias de StPageFlip.
 *
 * P1 y la contratapa temporal consumen este mismo objeto; rotateY, hinge,
 * perspectiva, clipping, backface y sombras siguen perteneciendo a
 * StPageFlip 2.0.7. No se reproducen con fórmulas o keyframes propios.
 */
export const HARD_COVER_FLIP_MS = 950;

export function createHardCoverPageFlipSettings(reducedMotion: boolean) {
  return {
    width: 960,
    height: 540,
    size: "stretch" as const,
    minWidth: 300,
    maxWidth: 1100,
    minHeight: 169,
    maxHeight: 619,
    drawShadow: true,
    flippingTime: reducedMotion ? 180 : HARD_COVER_FLIP_MS,
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
  };
}
