import { useEffect, useState } from "react";
import type { MobileAccessoryEditorialPresentation } from "../../data/mobileAccessoryEditorialPresentation";
import { assetUrl } from "../ProductImage";
import "./mobile-eternal-editorial.css";
import "./mobile-accessory-editorial.css";

/** HTML type and independently positioned real crops; the native book owns gestures. */
export function MobileAccessoryEditorial({ presentation, visible, load = visible }: {
  presentation: MobileAccessoryEditorialPresentation; visible: boolean; load?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (load) setLoaded(true); }, [load]);
  const prepared = load || loaded;
  const image = (kind: "signature" | "portrait") => {
    const asset = presentation[kind];
    return asset ? <img className={`mobile-eternal-editorial__${kind}`}
      src={prepared ? assetUrl(asset.src) : undefined} alt={asset.alt}
      width={asset.width} height={asset.height} draggable={false} decoding="async" /> : null;
  };
  return <section className={`${presentation.className} mobile-eternal-editorial mobile-accessory-editorial`}
    data-live={visible ? "true" : "false"} aria-label={presentation.label} aria-hidden={!visible}>
    <div className="mobile-eternal-editorial__masthead"><span>STARVIE</span><span>COLLECTION 2027</span></div>
    <header className="mobile-eternal-editorial__heading">
      <span>{presentation.eyebrow}</span><h1>{presentation.title}</h1><p>{presentation.byline}</p>
    </header>
    {image("signature")}{image("portrait")}
    <footer>{presentation.footer}</footer>
  </section>;
}
