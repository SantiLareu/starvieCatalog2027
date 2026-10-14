import { HARD_COVER_FLIP_MS } from "../data/hardCoverMotion";

export const DESKTOP_STAGE_QUERY = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
export const LOGO_RATIO = 2000 / 449;
export type ClosedCover = "front" | "back" | null;
export type LogoBookState = {
  activeIndex: number;
  ready: boolean;
  backCoverState: "open" | "closing" | "closed" | "opening";
  transition: {
    id: number;
    kind: string;
    phase: string;
    targetIndex?: number;
  } | null;
};
export type LogoFlight = { opening: boolean; cover: Exclude<ClosedCover, null>; duration: number };
export type LogoRect = { x: number; y: number; width: number; height: number };
export type LogoWallPose = { skewY: number; scaleY: number };
export const LOGO_CONTACT_OFFSET = 0.78;
export const LOGO_PAINT_END = 0.98;
export const LOGO_WALL_OPACITY = 0.62;
const FLIGHT_SAMPLES = 60;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
// Zero velocity and acceleration at both ends; no separate segment easings.
const smooth = (value: number) => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
const bezier = (from: number, controlA: number, controlB: number, to: number, t: number) =>
  (1 - t) ** 3 * from + 3 * (1 - t) ** 2 * t * controlA + 3 * (1 - t) * t * t * controlB + t ** 3 * to;
const paintProgress = (time: number) => smooth((time - LOGO_CONTACT_OFFSET) / (LOGO_PAINT_END - LOGO_CONTACT_OFFSET));

export function closedCover(state: LogoBookState): ClosedCover {
  if (state.backCoverState === "closed") return "back";
  return state.activeIndex === 0 ? "front" : null;
}

/** Read-only mapping from Magazine's committed transition, never navigation. */
export function resolveLogoFlight(state: LogoBookState, previous: ClosedCover): LogoFlight | null {
  const transition = state.transition;
  if (!transition || transition.phase !== "running") return null;
  switch (transition.kind) {
    case "initial-cover-open": return { opening: true, cover: "front", duration: HARD_COVER_FLIP_MS };
    case "close-to-cover": return { opening: false, cover: "front", duration: HARD_COVER_FLIP_MS };
    case "open-back-cover": return { opening: true, cover: "back", duration: HARD_COVER_FLIP_MS };
    case "close-back-cover": return { opening: false, cover: "back", duration: HARD_COVER_FLIP_MS };
    case "section":
      if (transition.targetIndex === 0) return { opening: false, cover: "front", duration: 760 };
      if (previous) return { opening: true, cover: previous, duration: 760 };
      return null;
    default: return null;
  }
}

/** Exact bounds of the original /X5 logo inside the front-cover PDF artwork. */
export function frontCoverLogo(page: LogoRect): LogoRect {
  return {
    x: page.x + page.width * (1825 / 6000),
    y: page.y + page.height * (1400 / 3375),
    width: page.width * (2350 / 6000),
    height: page.height * (528.125 / 3375),
  };
}

export function containLogo(box: LogoRect): LogoRect {
  const width = Math.min(box.width, box.height * LOGO_RATIO);
  const height = width / LOGO_RATIO;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

/** Sample one continuous, center-based arc once, never on each render frame.
 * Closing reverses the same timeline, including the material handoff. */
export function logoFlightFrames(source: LogoRect, wall: LogoRect,
  pose: LogoWallPose = { skewY: 0, scaleY: 1 }): Keyframe[] {
  const fromX = source.x + source.width / 2;
  const fromY = source.y + source.height / 2;
  const toX = wall.x + wall.width / 2;
  const toY = wall.y + wall.height / 2;
  const dx = fromX - toX;
  const dy = fromY - toY;
  const scale = source.width / wall.width;
  return Array.from({ length: FLIGHT_SAMPLES + 1 }, (_, index) => {
    const time = index / FLIGHT_SAMPLES;
    const progress = smooth(time / LOGO_CONTACT_OFFSET);
    const lift = progress === 0 || progress === 1 ? 0 : Math.sin(Math.PI * progress) ** 2;
    const x = bezier(fromX, fromX - dx * 0.12, toX + dx * 0.06, toX, progress) - toX;
    const y = bezier(fromY, fromY - Math.min(80, dy * 0.22), toY + Math.min(60, dy * 0.12), toY, progress) - toY;
    return {
      offset: time,
      transform: `perspective(1400px) translate3d(${x}px, ${y}px, ${32 * lift}px) rotateX(${-4 * lift}deg) rotateY(${6 * lift}deg) rotateZ(${-1.5 * lift}deg) scale(${mix(scale, 1, progress)}) skewY(${pose.skewY * progress}deg) scaleY(${mix(1, pose.scaleY, progress)})`,
      opacity: 1 - paintProgress(time),
      easing: "linear",
    };
  });
}

/** The mural is stationary before it receives ink; no competing moving copy. */
export function logoInkFrames(): Keyframe[] {
  return Array.from({ length: FLIGHT_SAMPLES + 1 }, (_, index) => {
    const offset = index / FLIGHT_SAMPLES;
    return { offset, opacity: LOGO_WALL_OPACITY * paintProgress(offset), easing: "linear" };
  });
}
