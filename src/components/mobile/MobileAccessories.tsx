import type { CSSProperties, ReactNode } from "react";
import type { CommerceProduct } from "../../commerce/types";
import { MOBILE_ACCESSORY_INDEX_PAGE, mobileAccessorySections, type MobileAccessoryPresentation, type MobileAccessoryPairPresentation } from "../../data/mobileAccessoryPresentation";
import logo from "../../assets/desktop/starvie-wall-logo.webp";
import { ProductImage, assetUrl } from "../ProductImage";
import { MobileCourtBackground } from "./MobileCourtBackground";
import { MobileIcon } from "./MobileIcon";
import { usePremiumPageZoom } from "./usePremiumPageZoom";
import "./mobile-accessories.css";

type PageState = { active: boolean; load: boolean; live: boolean };

export function AccessoryViewport({ active, pageId, accent, children }: {
  active: boolean; pageId: number; accent: string;
  children: (contentRef: ReturnType<typeof usePremiumPageZoom>["contentRef"]) => ReactNode;
}) {
  const zoom = usePremiumPageZoom(active, `accessories:${pageId}`);
  return <div ref={zoom.viewportRef} className="mobile-premium-page-viewport mobile-accessory-viewport"
    data-testid="mobile-accessory-viewport" data-premium-zoom-viewport="true" data-zoom={zoom.view.scale.toFixed(2)}
    style={{ "--premium-zoom-accent": accent } as CSSProperties}>
    {children(zoom.contentRef)}
    {zoom.view.scale > 1 ? <button className="mobile-premium-zoom-reset" type="button"
      aria-label="Restablecer zoom de la hoja" onClick={zoom.reset}>Volver a 1×</button> : null}
  </div>;
}

export function MobileAccessoriesIndex({ products, active, load, live, onNavigate }: PageState & {
  products: readonly CommerceProduct[]; onNavigate: (page: number) => void;
}) {
  const byId = new Map(products.map(product => [product.id, product]));
  return <AccessoryViewport active={active} pageId={MOBILE_ACCESSORY_INDEX_PAGE} accent="#b5bec8">{ref =>
    <article ref={ref} className="mobile-premium-product-page mobile-accessory-page mobile-accessory-index" aria-label="Página 27, índice de accesorios StarVie">
      <MobileCourtBackground />
      <header className="mobile-accessory-index__header">
        <img src={logo} alt="StarVie" /><span>COLECCIÓN 2027</span>
        <h1>Seleccioná un producto<br /> para verlo</h1>
      </header>
      <div className="section-index-layer mobile-accessory-index__groups" data-live={live ? "true" : "false"} inert={!live}>
        {mobileAccessorySections.map(section => <section key={section.title} aria-label={section.title}>
          <h2>{section.title}</h2>
          <div className="mobile-accessory-index__grid">{section.productIds.map(id => {
            const product = byId.get(id);
            if (!product || product.pagina == null) return null;
            const source = product.imagenes[0];
            return <button type="button" className="mobile-accessory-index__card" key={id} disabled={!live}
              data-section-target={product.pagina} aria-label={`${product.nombre}: ver en página ${product.pagina}`}
              onClick={() => { if (live) onNavigate(product.pagina!); }}>
              <span>{load && source ? <ProductImage source={source} original={assetUrl(source)} thumbnail data-accessory-thumbnail-source={source} alt="" draggable={false} decoding="async" /> : null}</span>
              <strong>{product.nombre.replace(/^(Paletero|Mochila|Neceser)\s+/i, "")}</strong>
            </button>;
          })}</div>
        </section>)}
      </div>
      <footer>STARVIE · 2027<span>27</span></footer>
    </article>
  }</AccessoryViewport>;
}

export function MobileAccessoryProductPage({ product: candidate, presentation, active, load, live }: PageState & {
  product: CommerceProduct | null; presentation: MobileAccessoryPresentation;
}) {
  const product = candidate?.id === presentation.productId ? candidate : null;
  return <AccessoryViewport active={active} pageId={presentation.pageId} accent={presentation.accent}>{ref =>
    <article ref={ref} className="mobile-premium-product-page mobile-accessory-page mobile-accessory-product" aria-label={`Página ${presentation.pageId}, ${presentation.title}`}
      data-accessory-product={presentation.productId}
      data-extended-specs={presentation.extendedSpecs ? "true" : undefined}
      style={{ "--accessory-accent": presentation.accent } as CSSProperties}>
      <MobileCourtBackground />
      <header className="mobile-accessory-product__header"><span>{presentation.category}</span><h1>{presentation.title}</h1></header>
      <div className="mobile-accessory-product__hero">
        <button type="button" className="mobile-accessory-product__photo" data-product-id={product?.id} disabled={!live || !product}
          aria-label={product ? `Abrir ficha de ${product.nombre}` : "Producto no disponible"}>
          {load ? <img src={assetUrl(presentation.image)} alt={presentation.title} data-accessory-hero-source={presentation.image} decoding="async" draggable={false} /> : null}
        </button>
        <button className="mobile-premium-product-page__product-button" type="button" data-product-id={product?.id} disabled={!live || !product}
          aria-haspopup="dialog" aria-label={product ? `Ver ficha y opciones de pedido de ${product.nombre}` : "Producto no disponible"}>
          <MobileIcon name="bag" />
        </button>
      </div>
      <section className="mobile-accessory-product__features" aria-label={presentation.category === "MOCHILAS" ? "Características de la mochila" : "Características del paletero"}
        style={{ "--accessory-feature-count": presentation.features.length } as CSSProperties}>
        <h2>CARACTERÍSTICAS</h2><ol>{presentation.features.map((feature, index) => <li key={feature.title}>
          <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div><strong>{feature.title}</strong>{feature.description ? <p>{feature.description}</p> : null}</div>
        </li>)}</ol>
      </section>
      <dl className="mobile-accessory-product__specs">{presentation.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <footer><span>REF: {presentation.ref}<br />EAN: {presentation.ean}</span><span>{presentation.pageId}</span></footer>
      <button className="mobile-accessory-product__explore" type="button" data-product-id={product?.id} disabled={!live || !product}
        aria-label={product ? `Explorar ${product.nombre}` : "Producto no disponible"}>EXPLORAR <span aria-hidden="true">↗</span></button>
    </article>
  }</AccessoryViewport>;
}

/** One book leaf, two stacked presentations. Clicks use the existing book delegate. */
export function MobileAccessoryPairPage({ products, presentation, active, load, live }: PageState & {
  products: readonly CommerceProduct[]; presentation: MobileAccessoryPairPresentation;
}) {
  const byId = new Map(products.map(product => [product.id, product]));
  return <AccessoryViewport active={active} pageId={presentation.pageId} accent={presentation.accent}>{ref =>
    <article ref={ref} className="mobile-premium-product-page mobile-accessory-page mobile-accessory-pair"
      aria-label={`Página ${presentation.pageId}, ${presentation.category}`}
      style={{ "--accessory-accent": presentation.accent } as CSSProperties}>
      <MobileCourtBackground />
      <header className="mobile-accessory-product__header"><h1>{presentation.category}</h1></header>
      <div className="mobile-accessory-pair__blocks">{presentation.products.map(item => {
        const product = byId.get(item.productId);
        return <section key={item.productId} className="mobile-accessory-pair__block" aria-label={item.title}>
          <h2>{item.title}</h2>
          <div className="mobile-accessory-product__hero mobile-accessory-pair__hero">
            <button type="button" className="mobile-accessory-product__photo" data-product-id={product?.id}
              disabled={!live || !product} aria-label={product ? `Abrir ficha de ${product.nombre}` : `${item.title}: producto no disponible`}>
              {load ? <img src={assetUrl(item.image)} alt={item.title} data-accessory-hero-source={item.image} decoding="async" draggable={false} /> : null}
            </button>
          </div>
          <button className="mobile-premium-product-page__product-button" type="button" data-product-id={product?.id}
            disabled={!live || !product} aria-haspopup="dialog"
            aria-label={product ? `Ver ficha y opciones de pedido de ${product.nombre}` : `${item.title}: producto no disponible`}>
            <MobileIcon name="bag" />
          </button>
          <div className="mobile-accessory-pair__details">
            <dl><dt>MATERIALES</dt><dd>{item.materials}</dd></dl>
            <p>REF: {item.ref}<br />EAN: {item.ean}</p>
          </div>
          <button className="mobile-accessory-product__explore" type="button" data-product-id={product?.id}
            disabled={!live || !product} aria-label={product ? `Explorar ${product.nombre}` : `${item.title}: producto no disponible`}>
            EXPLORAR <span aria-hidden="true">↗</span>
          </button>
        </section>;
      })}</div>
    </article>
  }</AccessoryViewport>;
}
