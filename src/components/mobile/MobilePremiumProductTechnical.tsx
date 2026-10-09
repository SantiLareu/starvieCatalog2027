import type { CommerceProduct } from "../../commerce/types";
import { mobilePresentationText, mobileProductSpecs, type MobileProductPresentation, type MobileSweetSpot, type MobileTechnology } from "../../data/mobileProductPresentation";
import { assetUrl } from "../ProductImage";

export function MobilePremiumTechnologyRail({ technologies, productName, load }: {
  technologies: readonly MobileTechnology[]; productName: string; load: boolean;
}) {
  if (!technologies.length) return null;
  return <aside className="mobile-premium-product-page__technologies" aria-label={`Tecnologías de ${productName}`}>
    <svg className="mobile-premium-product-page__technology-arc" viewBox="0 0 40 360" fill="none" aria-hidden="true">
      <path d="M2 1C19 70 28 193 30 347" stroke="currentColor" strokeWidth=".75" />
      <circle cx="30" cy="347" r="1.6" fill="currentColor" />
    </svg>
    <h2>TECNOLOGÍAS</h2>
    <ul>{technologies.map(({ label, icon }) => <li key={label}>
      <span className="mobile-premium-product-page__technology-icon" aria-hidden="true" style={{
        backgroundImage: load ? `url("${assetUrl(icon.source)}")` : undefined,
        backgroundSize: icon.crop ? `calc(var(--icon-size) * ${icon.crop.width / icon.crop.size}) calc(var(--icon-size) * ${icon.crop.height / icon.crop.size})` : "contain",
        backgroundPosition: icon.crop ? `calc(-1 * ${icon.crop.x} * var(--icon-size) / ${icon.crop.size}) calc(-1 * ${icon.crop.y} * var(--icon-size) / ${icon.crop.size})` : "center",
      }} />
      <span>{label}</span>
    </li>)}</ul>
  </aside>;
}

export function MobileSweetSpotGraphic({ graphic, productName, load }: { graphic: MobileSweetSpot; productName: string; load: boolean }) {
  const label = `Punto dulce de ${productName}`;
  if (graphic.kind === "asset") return <img className="mobile-premium-product-page__sweet-spot"
    src={load ? assetUrl(graphic.source) : undefined} width={graphic.width} height={graphic.height} alt={label} decoding="async" />;
  return <svg className="mobile-premium-product-page__sweet-spot" viewBox={graphic.viewBox} role="img" aria-label={label}>
    <g transform={graphic.transform}>
      <path d={graphic.outline} fill="#171819" stroke="#ece8e3" strokeWidth="2.2" />
      <ellipse cx={graphic.zone.cx} cy={graphic.zone.cy} rx={graphic.zone.rx} ry={graphic.zone.ry} fill={graphic.zone.color} />
      {graphic.perforations.flatMap(([y, xs]) => xs.map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.75" fill="none" stroke="#f1e8e1" strokeWidth="1.4" />))}
      <path d={graphic.neck} fill="none" stroke="#ece8e3" strokeWidth="1.8" />
    </g>
  </svg>;
}

export function MobilePremiumTechnicalPanel({ product, presentation, load }: {
  product: CommerceProduct | null; presentation: MobileProductPresentation; load: boolean;
}) {
  const values = mobileProductSpecs(product, presentation);
  const specs = [["Forma", values.shape], ["Plano", values.surface], ["Peso", values.weight.replace(/\s*g$/i, " GR")], ["Balance", values.balance]].filter(([, value]) => !!value);
  const gameType = mobilePresentationText(presentation.gameType, product);
  const name = product?.nombre ?? "producto";
  return <aside className="mobile-premium-product-page__technical" aria-label={`Datos técnicos de ${name}`}>
    {presentation.sweetSpot ? <div className="mobile-premium-product-page__sweet-spot-block">
      <MobileSweetSpotGraphic graphic={presentation.sweetSpot} productName={name} load={load} /><h2>PUNTO DULCE</h2>
    </div> : null}
    {gameType ? <p className="mobile-premium-product-page__playstyle"><span>TIPO DE JUEGO</span><strong>{gameType}</strong></p> : null}
    {specs.length ? <dl>{specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
  </aside>;
}
