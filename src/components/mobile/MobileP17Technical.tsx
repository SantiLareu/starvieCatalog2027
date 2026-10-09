import type { CSSProperties } from "react";
import type { CommerceProduct } from "../../commerce/types";
import { assetUrl } from "../ProductImage";

// P17 editorial labels requested by the user. Icon windows reference the
// existing page artwork; no product record or original bitmap is duplicated.
const technologies = [
  ["3D Carbon Hybrid", 178, 187],
  ["M-Eva Balance", 213, 251],
  ["Air Booster", 297, 317],
  ["Tri-Force Core", 336, 382],
  ["Hexa Cell", 363, 449],
  ["A-Shock", 381, 516],
  ["Spin Boost Tech", 382, 586],
  ["Longer Handgrip", 387, 660],
  ["Z-shock", 390, 729],
] as const;

export function MobileP17TechnologyRail({ load }: { load: boolean }) {
  return <aside className="mobile-p17-page__technologies" aria-label="Tecnologías de Raptor+">
    <svg className="mobile-p17-page__technology-arc" viewBox="0 0 40 360" fill="none" aria-hidden="true">
      <path d="M2 1C19 70 28 193 30 347" stroke="currentColor" strokeWidth=".75" />
      <circle cx="30" cy="347" r="1.6" fill="currentColor" />
    </svg>
    <h2>TECNOLOGÍAS</h2>
    <ul>{technologies.map(([label, x, y]) => <li key={label}>
      <span className="mobile-p17-page__technology-icon" aria-hidden="true" style={{
        "--source-x": x, "--source-y": y,
        backgroundImage: load ? `url("${assetUrl("catalog/pages/page-17.webp")}")` : undefined,
      } as CSSProperties} />
      <span>{label}</span>
    </li>)}</ul>
  </aside>;
}

/** Outline and perforations traced from references/mobile/estatienequeir.png.
 * Vector presentation only; this is not a measurement or a commerce attribute. */
export function RaptorSweetSpot() {
  const outline = "M85 33C46 31 15 52 15 87C13 119 27 151 46 175L51 183C57 185 68 206 74 216L73 290Q72 296 78 296H88Q94 296 93 290V216C100 207 111 186 120 182L127 173C147 147 159 118 158 89C158 52 126 31 85 33Z";
  const perforations = [
    [63, [49, 64, 86, 109, 124]],
    [76, [46, 59, 73, 86, 99, 112, 126]],
    [88, [32, 45, 58, 72, 86, 99, 112, 126, 139]],
    [104, [32, 45, 59, 72, 85, 99, 113, 126, 139]],
    [120, [32, 45, 59, 72, 85, 99, 113, 126, 139]],
    [133, [46, 59, 72, 85, 99, 112, 125]],
    [144, [49, 62, 85, 109, 123]],
  ] as const;
  return <svg className="mobile-p17-page__sweet-spot" viewBox="0 0 100 156" role="img" aria-label="Punto dulce de Raptor+">
    <g transform="translate(3.25 -13.15) scale(.55)">
      <path d={outline} fill="#171819" stroke="#ece8e3" strokeWidth="2.2" />
      <ellipse cx="85" cy="89.5" rx="58" ry="50.5" fill="#d72b29" />
      {perforations.flatMap(([y, xs]) => xs.map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.75" fill="none" stroke="#f1e8e1" strokeWidth="1.4" />))}
      <path d="M68 182Q85 185 103 182L99 190Q85 194 73 190ZM76 199H94L90 208H80ZM74 216H93" fill="none" stroke="#ece8e3" strokeWidth="1.8" />
    </g>
  </svg>;
}

export function MobileP17TechnicalPanel({ product }: { product: CommerceProduct | null }) {
  const specs = product ? [["Forma", product.forma], ["Plano", product.plano],
    ["Peso", product.peso.replace(/\s*g$/i, " GR")], ["Balance", product.balance]].filter(([, value]) => !!value) : [];
  return <aside className="mobile-p17-page__technical" aria-label="Datos técnicos de Raptor+">
    <div className="mobile-p17-page__sweet-spot-block"><RaptorSweetSpot /><h2>PUNTO DULCE</h2></div>
    {product?.tipoJuego ? <p className="mobile-p17-page__playstyle"><span>TIPO DE JUEGO</span><strong>{product.tipoJuego}</strong></p> : null}
    {specs.length ? <dl>{specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
  </aside>;
}
