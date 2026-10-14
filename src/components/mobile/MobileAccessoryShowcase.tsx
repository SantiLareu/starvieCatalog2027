import type { CommerceProduct } from "../../commerce/types";
import { MOBILE_ACCESSORY_SHOWCASE_PAGE, mobileAccessoryShowcaseGroups } from "../../data/mobileAccessoryShowcase";
import { ProductImage, assetUrl } from "../ProductImage";
import { AccessoryViewport } from "./MobileAccessories";
import { MobileCourtBackground } from "./MobileCourtBackground";
import { MobileIcon } from "./MobileIcon";
import "./mobile-accessory-showcase.css";

/** One final product leaf. Reuses native product delegation and portrait pinch. */
export function MobileAccessoryShowcase({ products, active, load, live }: {
  products: readonly CommerceProduct[]; active: boolean; load: boolean; live: boolean;
}) {
  const byId = new Map(products.map(product => [product.id, product]));
  return <AccessoryViewport active={active} pageId={MOBILE_ACCESSORY_SHOWCASE_PAGE} accent="#b5bec8">{ref =>
    <article ref={ref} className="mobile-premium-product-page mobile-accessory-page mobile-accessory-showcase"
      aria-label="Página 38, accesorios StarVie">
      <MobileCourtBackground />
      <header className="mobile-accessory-showcase__header">
        <span>ACCESORIOS · STARVIE 2027</span>
        <h1>COMPLETÁ<br />TU JUEGO</h1>
        <p>Detalles que hacen la diferencia</p>
      </header>
      <div className="mobile-accessory-showcase__groups">
        {mobileAccessoryShowcaseGroups.map(group => <section key={group.key} data-accessory-group={group.key}
          className="mobile-accessory-showcase__group" aria-label={group.category}>
          <h2>{group.category}</h2>
          <div className="mobile-accessory-showcase__items">{group.items.map(item => {
            const product = byId.get(item.productId);
            const source = "image" in item ? item.image : product?.imagenes[0];
            return <div key={item.productId} className="mobile-accessory-showcase__item" data-showcase-product={item.productId}>
              <button className="mobile-accessory-showcase__photo" type="button" data-product-id={product?.id}
                disabled={!live || !product} aria-label={product ? `Explorar ${product.nombre}` : `${item.title}: producto no disponible`}>
                {load && source ? <ProductImage key={source} source={source} original={assetUrl(source)}
                  alt={item.title} data-showcase-source={source} draggable={false} decoding="async" /> : null}
                <strong>{item.title}</strong>
              </button>
              <button className="mobile-premium-product-page__product-button" type="button" data-product-id={product?.id}
                disabled={!live || !product} aria-haspopup="dialog"
                aria-label={product ? `Ver ficha y opciones de pedido de ${product.nombre}` : `${item.title}: producto no disponible`}>
                <MobileIcon name="bag" />
              </button>
            </div>;
          })}</div>
        </section>)}
      </div>
      <footer>STARVIE · COLECCIÓN 2027<span>38</span></footer>
    </article>
  }</AccessoryViewport>;
}
