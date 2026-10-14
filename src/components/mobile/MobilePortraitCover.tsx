import { MobileCourtBackground } from "./MobileCourtBackground";
import "./mobile-portrait-cover.css";

export function MobilePortraitCover() {
  return <article className="mobile-portrait-cover" aria-label="Portada StarVie, colección 2027">
    <MobileCourtBackground variant="cover" />
    <div className="mobile-portrait-cover__ambience mobile-portrait-cover__smoke" aria-hidden="true">
      <span className="mobile-portrait-cover__smoke-layer mobile-portrait-cover__smoke-layer--floor" />
      <span className="mobile-portrait-cover__smoke-layer mobile-portrait-cover__smoke-layer--middle" />
      <span className="mobile-portrait-cover__smoke-layer mobile-portrait-cover__smoke-layer--wall" />
    </div>
    <div className="mobile-portrait-cover__title">
      <span className="mobile-portrait-cover__metal">COLECCIÓN</span>
      <h1><span className="mobile-portrait-cover__metal mobile-portrait-cover__metal--year">2027</span></h1><i aria-hidden="true" />
      <p className="mobile-portrait-cover__metal">PADEL WITHOUT LIMITS</p>
    </div>
    <footer><strong className="mobile-portrait-cover__metal">STARVIE</strong><i aria-hidden="true" />
      <span className="mobile-portrait-cover__metal">CATÁLOGO OFICIAL</span></footer>
  </article>;
}
