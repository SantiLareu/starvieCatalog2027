import { describe, expect, it } from "vitest";
import { closedCover, containLogo, frontCoverLogo, logoFlightFrames, logoInkFrames,
  LOGO_CONTACT_OFFSET, LOGO_WALL_OPACITY, resolveLogoFlight,
  type LogoBookState } from "./desktopLogoFlight";

const state: LogoBookState = { activeIndex: 0, ready: true, backCoverState: "open", transition: null };
const transition = (kind: string, phase = "running", targetIndex?: number) => ({ id: 1, kind, phase, targetIndex });

describe("desktop logo observes book transitions", () => {
  it("waits for physical running phase, including the two-step cover alignment", () => {
    for (const phase of ["prepare", "aligned"]) {
      expect(resolveLogoFlight({ ...state, transition: transition("close-to-cover", phase) }, null)).toBeNull();
    }
    expect(resolveLogoFlight({ ...state, transition: transition("close-to-cover") }, null)?.opening).toBe(false);
  });

  it("handles cover boundaries and preserves a fixed mural for interior navigation", () => {
    for (const kind of ["initial-cover-open", "open-back-cover"]) {
      expect(resolveLogoFlight({ ...state, transition: transition(kind) }, "front")?.opening).toBe(true);
    }
    for (const kind of ["close-to-cover", "close-back-cover"]) {
      expect(resolveLogoFlight({ ...state, transition: transition(kind) }, null)?.opening).toBe(false);
    }
    expect(resolveLogoFlight({ ...state, transition: transition("section", "running", 15) }, null)).toBeNull();
    expect(resolveLogoFlight({ ...state, transition: transition("edge-enter-collection") }, null)).toBeNull();
  });

  it("also flies for section shortcuts from/to closed covers", () => {
    expect(resolveLogoFlight({ ...state, transition: transition("section", "running", 2) }, "front"))
      .toMatchObject({ opening: true, cover: "front", duration: 760 });
    expect(resolveLogoFlight({ ...state, transition: transition("section", "running", 0) }, null))
      .toMatchObject({ opening: false, cover: "front", duration: 760 });
    expect(resolveLogoFlight({ ...state, transition: transition("section", "running", 14) }, "back"))
      .toMatchObject({ opening: true, cover: "back" });
  });

  it("derives resting state from the actual book, including aborted opening", () => {
    expect(closedCover(state)).toBe("front");
    expect(closedCover({ ...state, activeIndex: 14 })).toBeNull();
    expect(closedCover({ ...state, activeIndex: 37, backCoverState: "closed" })).toBe("back");
  });
});

describe("logo geometry", () => {
  it("locates the original cover mark without altering the page rectangle", () => {
    const page = { x: 720, y: 270, width: 720, height: 405 };
    const logo = frontCoverLogo(page);
    expect(logo.x).toBeCloseTo(939);
    expect(logo.y).toBeCloseTo(438);
    expect(logo.width).toBeCloseTo(282);
    expect(logo.height).toBeCloseTo(63.375);
    expect(page.width).toBe(720);
  });

  it("fits the mural's actual image, not the letterboxed CSS container", () => {
    const logo = containLogo({ x: 0, y: 0, width: 720, height: 100 });
    expect(logo.height).toBe(100);
    expect(logo.width / logo.height).toBeCloseTo(2000 / 449);
    expect(logo.x).toBeCloseTo((720 - logo.width) / 2);
  });

  it("moves along a continuous arc with gentle takeoff/landing and no scale jump", () => {
    const frames = logoFlightFrames({ x: 900, y: 440, width: 280, height: 62.86 },
      { x: 360, y: 80, width: 720, height: 161.64 }, { skewY: -5, scaleY: 0.82 });
    const poses = frames.map(frame => {
      const transform = String(frame.transform);
      const translation = transform.match(/translate3d\(([^p]+)px, ([^p]+)px, ([^p]+)px\)/)!;
      return { x: Number(translation[1]), y: Number(translation[2]), z: Number(translation[3]),
        scale: Number(transform.match(/ scale\(([^)]+)\)/)![1]) };
    });
    expect(poses[0].x).toBeCloseTo(320); // center-to-center, not top-left
    expect(poses[0].y).toBeCloseTo(310.61);
    expect(poses[0].scale).toBeCloseTo(280 / 720);
    expect(Math.max(...poses.map(pose => pose.z))).toBeLessThanOrEqual(32);
    const velocities = poses.slice(1).map((pose, index) => Math.hypot(pose.x - poses[index].x, pose.y - poses[index].y));
    expect(velocities[0]).toBeLessThan(0.1);
    expect(Math.max(...velocities.slice(1).map((v, i) => Math.abs(v - velocities[i])))).toBeLessThan(2);
    expect(poses.every((pose, index) => index === 0 || pose.scale >= poses[index - 1].scale)).toBe(true);
    expect(poses.at(-1)?.scale).toBe(1);
    expect(frames.at(-1)?.transform).toContain("translate3d(0px, 0px, 0px)");
    expect(frames.at(-1)?.transform).toContain("skewY(-5deg) scaleY(0.82)");
  });

  it("changes material only after contact, with matching ink/flight opacity and pose", () => {
    const frames = logoFlightFrames({ x: 900, y: 440, width: 280, height: 62.86 },
      { x: 360, y: 80, width: 720, height: 161.64 });
    const ink = logoInkFrames();
    for (const [index, frame] of frames.entries()) {
      expect(Number(frame.opacity) + Number(ink[index].opacity) / LOGO_WALL_OPACITY).toBeCloseTo(1);
      if (Number(frame.offset) <= LOGO_CONTACT_OFFSET) expect(frame.opacity).toBe(1);
      else expect(frame.transform).toBe(frames.at(-1)?.transform);
    }
    expect(frames.at(-1)?.opacity).toBe(0);
    expect(ink.at(-1)?.opacity).toBe(LOGO_WALL_OPACITY);
  });
});
