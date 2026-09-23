import { describe, expect, it } from "vitest";
import {
  HARD_COVER_FLIP_MS,
  createHardCoverPageFlipSettings,
} from "./hardCoverMotion";

describe("física compartida de tapas duras", () => {
  it("comparte la configuración completa de StPageFlip usada por P1", () => {
    expect(createHardCoverPageFlipSettings(false)).toMatchObject({
      width: 960,
      height: 540,
      size: "stretch",
      minWidth: 300,
      maxWidth: 1100,
      minHeight: 169,
      maxHeight: 619,
      drawShadow: true,
      flippingTime: HARD_COVER_FLIP_MS,
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
    });
  });

  it("sólo reduce la duración cuando el sistema pide reduced motion", () => {
    const regular = createHardCoverPageFlipSettings(false);
    const reduced = createHardCoverPageFlipSettings(true);

    expect(regular.flippingTime).toBe(950);
    expect(reduced).toEqual({ ...regular, flippingTime: 180 });
    expect(reduced).not.toBe(regular);
  });
});
