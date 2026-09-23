import type { Hotspot } from "../types/catalog";

type HotspotLayerProps = {
  hotspots: Hotspot[];
  /** Nombres vigentes (del catálogo generado) para accesibilidad. */
  productNames: Record<string, string>;
  onProductSelect: (productId: string) => void;
};

export function HotspotLayer({ hotspots, productNames, onProductSelect }: HotspotLayerProps) {
  return (
    <div className="hotspot-layer" aria-label="Contenido interactivo">
      {hotspots.map((hotspot) => {
        const name = productNames[hotspot.productId] ?? hotspot.productId;

        return (
          <button
            className="product-hotspot"
            data-hotspot-id={hotspot.id}
            data-product-id={hotspot.productId}
            key={hotspot.id}
            style={{
              left: `${hotspot.x}%`,
              top: `${hotspot.y}%`,
              width: `${hotspot.width}%`,
              height: `${hotspot.height}%`,
            }}
            type="button"
            aria-label={`Abrir ficha de ${name}`}
            onClick={(event) => {
              event.stopPropagation();
              onProductSelect(hotspot.productId);
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
