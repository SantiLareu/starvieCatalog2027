type CoverIntroProps = {
  baseSrc: string;
  src: string;
  width: number;
  height: number;
};

/**
 * Reuses the exact cover pixels for the title reveal. The mask temporarily
 * hides the title baked into P1 while the clipped duplicate brings those same
 * pixels back as an independently animatable layer.
 */
export function CoverIntro({ baseSrc, src, width, height }: CoverIntroProps) {
  return (
    <>
      <img
        className="cover-base-image"
        src={baseSrc}
        width={width}
        height={height}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className="cover-title-overlay"
        src={src}
        width={width}
        height={height}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </>
  );
}
