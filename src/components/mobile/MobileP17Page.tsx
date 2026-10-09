import { useState, type CSSProperties } from "react";
import type { CommerceProduct } from "../../commerce/types";
import { mainProductFeatures, mobileAssets } from "../../data/mobileProductPresentation";
import { ProductImage, assetUrl } from "../ProductImage";
import { MobileIcon } from "./MobileIcon";
import { MobileP17TechnologyRail, MobileP17TechnicalPanel } from "./MobileP17Technical";
import "./mobile-pilot.css";

export function MobileP17Page({ product, load, live }: {
  product: CommerceProduct | null;
  load: boolean;
  live: boolean;
}) {
  const { presentation, assets, provisional } = product ? mobileAssets(product) : { presentation: undefined, assets: [], provisional: true };
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const hero = load ? assets.find(asset => !failed.has(asset.source)) : undefined;
  const features = product ? mainProductFeatures(product) : [];
  const [range, audience] = product?.gama.split(" · ") ?? [];
  return <article className={`mobile-p17-page${hero?.role === "hero" ? " mobile-p17-page--premium" : ""}`} data-testid="mobile-editorial-page" aria-label="Página 17, edición vertical StarVie">
    <header className="mobile-p17-page__masthead">{range ? <strong>GAMA {range}</strong> : null}{audience ? <span>{audience}</span> : null}</header>
    <div className="mobile-p17-page__intro">
      {range ? <p>{range}</p> : null}
      <h1>{product?.nombre ?? "Colección 2027"}</h1>
      {presentation?.claim ? <span>{presentation.claim}</span> : null}
    </div>
    <button className="mobile-p17-page__hero" type="button" data-product-id={product?.id} data-hero-role={hero?.role} disabled={!product || !live}
      aria-label={product ? `Abrir ficha de ${product.nombre}` : "Producto no disponible"}
      >
      {hero && product ? <ProductImage key={hero.source} source={hero.source} original={assetUrl(hero.source)}
        data-mobile-hero-source={hero.source} alt={product.nombre} decoding="async" fetchPriority="high" draggable={false}
        style={{ "--asset-scale": hero.scale ?? 1 } as CSSProperties}
        onError={() => setFailed(previous => new Set(previous).add(hero.source))} />
        : <span className="mobile-p17-page__placeholder">Imagen no disponible</span>}
    </button>
    <button className="mobile-p17-page__product-button" type="button" data-product-id={product?.id} disabled={!product || !live}
      aria-haspopup="dialog" aria-label={product ? `Ver ficha y opciones de pedido de ${product.nombre}` : "Producto no disponible"}>
      <MobileIcon name="bag" />
    </button>
    <MobileP17TechnologyRail load={load} />
    <MobileP17TechnicalPanel product={product} />
    {features.length ? <dl className="mobile-p17-page__features">{features.map(([label, value]) => <div key={label}>
      <MobileIcon name={label as "Forma" | "Plano" | "Peso" | "Balance"} /><div><dt>{label}</dt><dd>{value}</dd></div>
    </div>)}</dl> : null}
    <button className="mobile-p17-page__explore" type="button" data-product-id={product?.id} disabled={!product || !live}
      aria-label={product ? `Explorar ${product.nombre}` : "Producto no disponible"}>EXPLORAR <span aria-hidden="true">↗</span></button>
    <footer className="mobile-p17-page__folio"><span>STARVIE · 2027</span><span>17</span></footer>
    {load && (provisional || hero?.role === "catalog") ? <small className="mobile-p17-page__asset-note">Imagen de catálogo · hero mobile pendiente</small> : null}
  </article>;
}
