import { useState, type ImgHTMLAttributes } from "react";
import manifest from "../data/productImageVariants.json";

type Variant = { src: string; width: number; height: number; bytes: number };
type Variants = { thumbnail: Variant; standard: Variant; large: Variant };
const images: Record<string, Variants> = manifest.images;

export function assetUrl(relative: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const encoded = relative.split("/").map(segment => encodeURIComponent(segment)).join("/");
  return new URL(encoded, new URL(base, window.location.href)).href;
}

type ProductImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes"> & {
  source: string;
  original: string;
  thumbnail?: boolean;
  zoomed?: boolean;
};

/** No probes or prefetch: the browser requests only the selected derivative.
 * Unknown catalog paths or missing derivatives fall back to the original.
 * Keep this component keyed by source to isolate each gallery item's errors.
 */
export function ProductImage({ source, original, thumbnail = false, zoomed = false, onError, ...props }: ProductImageProps) {
  const [failedDerivative, setFailedDerivative] = useState(false);
  const [failedOriginal, setFailedOriginal] = useState(false);
  const variants = images[source];
  const useDerivative = variants && !failedDerivative && (!zoomed || failedOriginal);
  const src = useDerivative ? assetUrl(thumbnail ? variants.thumbnail.src : variants.standard.src) : original;
  const srcSet = useDerivative && !thumbnail
    ? `${assetUrl(variants.standard.src)} ${variants.standard.width}w, ${assetUrl(variants.large.src)} ${variants.large.width}w`
    : undefined;

  return <img {...props} src={src} srcSet={srcSet}
    sizes={srcSet ? "(max-width: 760px) calc(100vw - 62px), (max-width: 1016px) calc(45vw - 78px), 380px" : undefined}
    onError={event => {
      if (useDerivative) {
        setFailedDerivative(true);
        if (failedOriginal) onError?.(event);
      } else if (zoomed && variants && !failedDerivative) {
        // A broken zoom original should still allow the normal image to work.
        setFailedOriginal(true);
      } else {
        onError?.(event);
      }
    }} />;
}
