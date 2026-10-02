import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ProductImage } from "./ProductImage";

type Props = ComponentProps<typeof ProductImage>;
type ImageSource = Pick<Props, "source" | "original">;

/** Keep the last decoded image mounted while only the selected image loads.
 * Reuse ProductImage so responsive derivatives, zoom and fallback stay intact.
 */
export function ProductGalleryImage(props: Props) {
  const wantedRef = useRef(props.source);
  wantedRef.current = props.source;
  const [displayed, setDisplayed] = useState<ImageSource>(() => ({ source: props.source, original: props.original }));
  const displayedRef = useRef(displayed);
  displayedRef.current = displayed;
  const [retiring, setRetiring] = useState<ImageSource | null>(null);
  const pending = displayed.source !== props.source;
  const retained = pending ? displayed : retiring;

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const stopFade = () => { if (media.matches) setRetiring(null); };
    media.addEventListener("change", stopFade);
    return () => media.removeEventListener("change", stopFade);
  }, []);

  const showDecoded = async (image: HTMLImageElement, source: string) => {
    if (displayedRef.current.source === source) return;
    const loadedUrl = image.currentSrc || image.src;
    try {
      await image.decode();
    } catch {
      // A source replaced by zoom/fallback/rapid selection can reject decode.
      if (!image.complete || image.naturalWidth === 0) return;
    }
    if (!image.isConnected || wantedRef.current !== source || (image.currentSrc || image.src) !== loadedUrl) return;
    const previous = displayedRef.current;
    const next = { source, original: props.original };
    displayedRef.current = next;
    setDisplayed(next);
    setRetiring(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? null : previous);
  };

  // Stable keys preserve the old DOM image while it changes from current to
  // retained. At most two images exist, even under rapid gallery navigation.
  return <>
    {retained && retained.source !== props.source ? (
      <ProductImage key={retained.source} {...retained}
        className={`product-gallery-image is-retained${pending ? "" : " is-retiring"}`}
        alt="" aria-hidden="true" draggable={false} decoding="async"
        style={props.style} />
    ) : null}
    <ProductImage key={props.source} {...props}
      className={`product-gallery-image${pending ? " is-pending" : retiring ? " is-entering" : ""}`}
      onLoad={event => {
        props.onLoad?.(event);
        void showDecoded(event.currentTarget, props.source);
      }}
      onAnimationEnd={event => {
        props.onAnimationEnd?.(event);
        if (event.animationName === "product-gallery-in" && wantedRef.current === props.source) setRetiring(null);
      }} />
  </>;
}
