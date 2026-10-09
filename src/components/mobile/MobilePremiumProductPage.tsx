import { useState, type CSSProperties } from "react";
import type { CommerceProduct } from "../../commerce/types";
import { mainProductFeatures, mobileAssets, mobilePresentationText, type MobileProductPresentation } from "../../data/mobileProductPresentation";
import { ProductImage, assetUrl } from "../ProductImage";
import { MobileIcon } from "./MobileIcon";
import { MobilePremiumTechnologyRail, MobilePremiumTechnicalPanel } from "./MobilePremiumProductTechnical";
import "./mobile-premium-product.css";
import { usePremiumPageZoom } from "./usePremiumPageZoom";

export function MobilePremiumProductPage({ product: catalogProduct, presentation, load, live, active = live }: {
  product: CommerceProduct | null;
  presentation: MobileProductPresentation;
  load: boolean;
  live: boolean;
  active?: boolean;
}) {
  const zoom = usePremiumPageZoom(active, `${presentation.pageId}:${presentation.productId}`);
  const product = catalogProduct?.id === presentation.productId ? catalogProduct : null;
  const { assets, provisional } = product ? mobileAssets(product, "page", presentation) : { assets: [], provisional: true };
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const hero = load ? assets.find(asset => !failed.has(asset.source)) : undefined;
  const features = product ? mainProductFeatures(product, presentation) : [];
  const range = mobilePresentationText(presentation.rangeLabel, product);
  const audience = mobilePresentationText(presentation.audienceLabel, product);
  const decoration = load ? presentation.backgroundTheme.asset : undefined;
  const background = decoration ? `url("${assetUrl(decoration.source)}") ${decoration.position ?? "center"} / cover no-repeat, ${presentation.backgroundTheme.background}` : presentation.backgroundTheme.background;
  // Reuse only the loaded premium hero. Real gallery photos never become a
  // scene, and a failed/deferred hero cannot trigger a background-only fetch.
  const scene = hero?.role === "hero" && presentation.heroBackgroundMode !== "contained" ? assetUrl(hero.source) : undefined;
  return <div ref={zoom.viewportRef} className="mobile-premium-page-viewport" data-premium-zoom-viewport="true"
    data-testid="mobile-premium-viewport" data-zoom={zoom.view.scale.toFixed(2)} data-pan-x={zoom.view.x.toFixed(2)} data-pan-y={zoom.view.y.toFixed(2)}
    style={{ "--premium-zoom-accent": presentation.themeAccent } as CSSProperties}>
    <article ref={zoom.contentRef} className={`mobile-premium-product-page${hero?.role === "hero" ? " mobile-premium-product-page--premium" : ""}`}
    style={{ "--mobile-premium-background": background, "--mobile-premium-accent": presentation.themeAccent,
      "--mobile-premium-scene": scene ? `url("${scene}")` : undefined,
      "--mobile-premium-readability": presentation.backgroundTheme.readabilityOverlay } as CSSProperties}
    data-testid="mobile-editorial-page" aria-label={`Página ${presentation.pageId}, edición vertical StarVie`}>
    {scene ? <>
      <div className="mobile-premium-product-page__scene" aria-hidden="true"><span /><span /></div>
      <div className="mobile-premium-product-page__readability" aria-hidden="true" />
    </> : null}
    <header className="mobile-premium-product-page__masthead">{range ? <strong>GAMA {range}</strong> : null}{audience ? <span>{audience}</span> : null}</header>
    <div className="mobile-premium-product-page__intro">
      {range ? <p>{range}</p> : null}
      <h1>{product?.nombre ?? "Colección 2027"}</h1>
      {presentation?.claim ? <span>{presentation.claim}</span> : null}
    </div>
    <button className="mobile-premium-product-page__hero" type="button" data-product-id={product?.id} data-hero-role={hero?.role} disabled={!product || !live}
      aria-label={product ? `Abrir ficha de ${product.nombre}` : "Producto no disponible"}
      >
      {hero && product ? <ProductImage key={hero.source} source={hero.source} original={assetUrl(hero.source)}
        data-mobile-hero-source={hero.source} alt={product.nombre} decoding="async" fetchPriority="high" draggable={false}
        style={{ "--asset-scale": hero.scale ?? 1 } as CSSProperties}
        onError={() => setFailed(previous => new Set(previous).add(hero.source))} />
        : <span className="mobile-premium-product-page__placeholder">Imagen no disponible</span>}
    </button>
    <button className="mobile-premium-product-page__product-button" type="button" data-product-id={product?.id} disabled={!product || !live}
      aria-haspopup="dialog" aria-label={product ? `Ver ficha y opciones de pedido de ${product.nombre}` : "Producto no disponible"}>
      <MobileIcon name="bag" />
    </button>
    <MobilePremiumTechnologyRail technologies={presentation.technologies} productName={product?.nombre ?? "producto"} load={load} />
    <MobilePremiumTechnicalPanel product={product} presentation={presentation} load={load} />
    {features.length ? <dl className="mobile-premium-product-page__features">{features.map(([label, value]) => <div key={label}>
      <MobileIcon name={label as "Forma" | "Plano" | "Peso" | "Balance"} /><div><dt>{label}</dt><dd>{value}</dd></div>
    </div>)}</dl> : null}
    <button className="mobile-premium-product-page__explore" type="button" data-product-id={product?.id} disabled={!product || !live}
      aria-label={product ? `Explorar ${product.nombre}` : "Producto no disponible"}>EXPLORAR <span aria-hidden="true">↗</span></button>
    <footer className="mobile-premium-product-page__folio"><span>STARVIE · 2027</span><span>{presentation.pageId}</span></footer>
    {load && (provisional || hero?.role === "catalog") ? <small className="mobile-premium-product-page__asset-note">Imagen de catálogo · hero mobile pendiente</small> : null}
    </article>
    {zoom.view.scale > 1 ? <button className="mobile-premium-zoom-reset" type="button" disabled={!live}
      aria-label="Restablecer zoom de la hoja" onClick={zoom.reset}>Volver a 1×</button> : null}
  </div>;
}
