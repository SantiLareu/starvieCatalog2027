import { useEffect, useState, type CSSProperties } from "react";
import type { CommerceProduct } from "../../commerce/types";
import { mainProductFeatures, mobileAssets, mobilePresentationText, type MobileProductPresentation } from "../../data/mobileProductPresentation";
import { ProductImage, assetUrl } from "../ProductImage";
import { MobileIcon } from "./MobileIcon";
import { MobilePremiumTechnologyRail, MobilePremiumTechnicalPanel } from "./MobilePremiumProductTechnical";
import "./mobile-premium-product.css";
import { usePremiumPageZoom } from "./usePremiumPageZoom";
import { MobileCourtBackground } from "./MobileCourtBackground";

export function MobilePremiumProductPage({ product: catalogProduct, presentation, load, live, active = live, courtScene = false }: {
  product: CommerceProduct | null;
  presentation: MobileProductPresentation;
  load: boolean;
  live: boolean;
  active?: boolean;
  courtScene?: boolean;
}) {
  const zoom = usePremiumPageZoom(active, `${presentation.pageId}:${presentation.productId}`);
  const product = catalogProduct?.id === presentation.productId ? catalogProduct : null;
  const { assets, provisional } = product ? courtScene
    ? { assets: product.imagenes.map(source => ({ source, role: "front" as const, scale: 0.9 })), provisional: false }
    : mobileAssets(product, "page", presentation) : { assets: [], provisional: true };
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const hero = load ? assets.find(asset => !failed.has(asset.source)) : undefined;
  const features = product ? mainProductFeatures(product, presentation) : [];
  const range = mobilePresentationText(presentation.rangeLabel, product);
  const rangeHeading = [presentation.rangePrefix ?? "GAMA", range].filter(Boolean).join(" ");
  const audience = mobilePresentationText(presentation.audienceLabel, product);
  // Printed identifiers may be explicitly supplied for the premium edition;
  // otherwise follow the live catalog. Blank values are treated as absent.
  const reference = presentation.printedDetails?.ref?.trim() || product?.sku?.trim() || "";
  const ean = presentation.printedDetails?.ean?.trim() || product?.ean?.trim() || "";
  // An independent environment loads only alongside an eligible premium hero;
  // distant leaves, contained presentation and real-gallery fallbacks defer it.
  const hasScene = hero?.role === "hero" && presentation.heroBackgroundMode !== "contained";
  const decoration = hasScene ? presentation.backgroundTheme.asset : undefined;
  const scene = hasScene && hero ? assetUrl(decoration?.source ?? hero.source) : undefined;
  const ambientSource = decoration ? scene : undefined;
  useEffect(() => {
    if (!ambientSource) return;
    // Hidden neighbour leaves defer CSS backgrounds until the first fold.
    // Reuse the existing load window to warm the same resource beforehand;
    // no React updates, retained image refs or additional distant-page loads.
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = ambientSource;
    if (typeof image.decode === "function") void image.decode().catch(() => {
      // A decode rejection must not block the native turn or foreground.
      // The existing CSS background keeps its normal browser load fallback.
    });
  }, [ambientSource]);
  return <div ref={zoom.viewportRef} className="mobile-premium-page-viewport" data-premium-zoom-viewport="true"
    data-testid="mobile-premium-viewport" data-zoom={zoom.view.scale.toFixed(2)} data-pan-x={zoom.view.x.toFixed(2)} data-pan-y={zoom.view.y.toFixed(2)}
    style={{ "--premium-zoom-accent": presentation.themeAccent } as CSSProperties}>
    <article ref={zoom.contentRef} className={`mobile-premium-product-page${hero?.role === "hero" ? " mobile-premium-product-page--premium" : ""}${decoration ? " mobile-premium-product-page--ambient" : ""}${courtScene ? " mobile-premium-product-page--court" : ""}`}
    style={{ "--mobile-premium-background": presentation.backgroundTheme.background, "--mobile-premium-accent": presentation.themeAccent,
      "--mobile-premium-scene": scene ? `url("${scene}")` : undefined,
      "--mobile-premium-scene-position": decoration?.position,
      "--mobile-premium-readability": presentation.backgroundTheme.readabilityOverlay } as CSSProperties}
    data-testid="mobile-editorial-page" aria-label={`Página ${presentation.pageId}, edición vertical StarVie`}>
    {courtScene ? <MobileCourtBackground variant="product" /> : null}
    {scene ? <>
      <div className={`mobile-premium-product-page__scene${decoration ? " mobile-premium-product-page__scene--ambient" : ""}${decoration?.soften === false ? " mobile-premium-product-page__scene--sharp" : ""}`} aria-hidden="true">{decoration ? null : <><span /><span /></>}</div>
      <div className="mobile-premium-product-page__readability" aria-hidden="true" />
    </> : null}
    <header className="mobile-premium-product-page__masthead">{range ? <strong>{rangeHeading}</strong> : null}{audience ? <span>{audience}</span> : null}</header>
    <div className="mobile-premium-product-page__intro">
      {range ? <p>{range}</p> : null}
      <h1>{product ? presentation.title ?? product.nombre : "Colección 2027"}</h1>
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
    <footer className="mobile-premium-product-page__folio mobile-premium-product-page__folio--details">
      <span>STARVIE · 2027
        {reference ? <small className="mobile-premium-product-page__printed-details">REF: {reference}</small> : null}
        {ean ? <small className="mobile-premium-product-page__printed-details">EAN: {ean}</small> : null}
      </span>
      <span>{presentation.printedDetails?.include ? <small className="mobile-premium-product-page__printed-details">
        INCLUYE<br />{presentation.printedDetails.include}
      </small> : null}{presentation.pageId}</span>
    </footer>
    {load && (provisional || hero?.role === "catalog") ? <small className="mobile-premium-product-page__asset-note">Imagen de catálogo · hero mobile pendiente</small> : null}
    </article>
    {zoom.view.scale > 1 ? <button className="mobile-premium-zoom-reset" type="button" disabled={!live}
      aria-label="Restablecer zoom de la hoja" onClick={zoom.reset}>Volver a 1×</button> : null}
  </div>;
}
