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
      <p className="section-index-instruction">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="m5 3 13 9-6 1-3 6-4-16Zm7 10 4 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Seleccioná un producto para verlo</span>
      </p>
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
