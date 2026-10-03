import type { SectionIndexHotspot } from "../data/CatalogData";
import "./section-index-layer.css";

type SectionIndexLayerProps = {
  hotspots: SectionIndexHotspot[];
  /** Solo presentada y estable: habilita interacción; si no, inerte. */
  live: boolean;
  onNavigate: (targetPage: number) => void;
};

/**
 * Zonas clickeables transparentes sobre P27: saltan a la página de
 * detalle impresa, sin modal ni datos comerciales. Montada siempre
 * (estable durante el flip); inerte salvo `live`.
 */
export function SectionIndexLayer({ hotspots, live, onNavigate }: SectionIndexLayerProps) {
  return (
    <div
      className="section-index-layer"
      data-live={live ? "true" : "false"}
      aria-hidden={!live}
      inert={!live}
    >
      {hotspots.map((hotspot) => (
        <button
          key={hotspot.id}
          className="section-index-hotspot"
          data-section-target={hotspot.targetPage}
          type="button"
          style={{
            left: `${hotspot.x}%`,
            top: `${hotspot.y}%`,
            width: `${hotspot.width}%`,
            height: `${hotspot.height}%`,
          }}
          aria-label={`${hotspot.label}: ver en página ${hotspot.targetPage}`}
          onClick={(event) => {
            event.stopPropagation();
            if (live) onNavigate(hotspot.targetPage);
          }}
        >
          <span className="section-index-tag" aria-hidden="true">Ver</span>
        </button>
      ))}
    </div>
  );
}
