import type { Hotspot, Product } from "../types/catalog";

type HotspotLayerProps = {
  hotspots: Hotspot[];
  products: Record<string, Product>;
  onProductSelect: (product: Product) => void;
};

export function HotspotLayer({ hotspots, products, onProductSelect }: HotspotLayerProps) {
  return (
    <div className="hotspot-layer" aria-label="Contenido interactivo">
      {hotspots.map((hotspot) => {
        const product = products[hotspot.productId];
        if (!product) return null;

        return (
          <button
            className="product-hotspot"
            data-hotspot-id={hotspot.id}
            data-product-id={product.id}
            key={hotspot.id}
            style={{
              left: `${hotspot.x}%`,
              top: `${hotspot.y}%`,
              width: `${hotspot.width}%`,
              height: `${hotspot.height}%`,
            }}
            type="button"
            aria-label={`Abrir ficha de ${product.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onProductSelect(product);
            }}
          >
            <span className="hotspot-marker" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M6.5 8.5h11l-.8 10h-9.4l-.8-10Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M9 9V7a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}
