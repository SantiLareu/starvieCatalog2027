import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PageFlip } from "page-flip";
import { createHardCoverPageFlipSettings } from "../data/hardCoverMotion";
import type { CatalogPage } from "../types/catalog";

type BackCoverRuntime = {
  update: () => void;
  getUI: () => { getWrapper: () => HTMLElement };
  getOrientation: () => "portrait" | "landscape";
  getRender: () => {
    orientation: "portrait" | "landscape";
    getRect: () => { left: number; top: number; height: number };
  };
  getFlipController: () => {
    flip: (point: { x: number; y: number }) => void;
  };
};

export type BackCoverHandle = {
  close: () => void;
  open: () => void;
  resetOpen: () => void;
};

type BackCoverProps = {
  coverPage: CatalogPage;
  leftPage: CatalogPage;
  rightPage: CatalogPage;
  active: boolean;
  live: boolean;
  mobileCourtPortrait?: boolean;
  onMotionEnd: (state: "open" | "closed") => void;
};

/**
 * Instancia trasera aislada de la física real de P1. Usa StPageFlip con la
 * misma configuración y tres superficies visuales, pero ninguna es
 * `.catalog-leaf`, ninguna entra al PageCollection principal y ninguna tiene
 * índice de catálogo. El renderer completo se espeja horizontalmente; el
 * contenido se contra-espeja para conservar su orientación.
 */
export const BackCover = forwardRef<BackCoverHandle, BackCoverProps>(
  function BackCover(
    { coverPage, leftPage, rightPage, active, live, mobileCourtPortrait = false, onMotionEnd },
    forwardedRef,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const physicsRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<PageFlip | null>(null);
    const motionRef = useRef<"closing" | "opening" | null>(null);
    const portraitMotionRef = useRef(false);
    const courtPortraitRef = useRef(mobileCourtPortrait);
    const fittedPortraitRef = useRef(false);
    courtPortraitRef.current = mobileCourtPortrait;
    const onMotionEndRef = useRef(onMotionEnd);
    onMotionEndRef.current = onMotionEnd;

    const syncFrame = (engine: PageFlip) => {
      if (motionRef.current || (!courtPortraitRef.current && !fittedPortraitRef.current)) return;
      const host = physicsRef.current;
      if (!host?.clientWidth || !host.clientHeight) return;
      const settings = engine.getSettings();
      settings.width = 960;
      settings.height = courtPortraitRef.current ? 960 * host.clientHeight / host.clientWidth : 540;
      fittedPortraitRef.current = courtPortraitRef.current;
      const runtime = engine as unknown as BackCoverRuntime;
      runtime.update(); // Refresh the cached rect before capturing either hinge.
      runtime.getUI().getWrapper().style.paddingBottom = courtPortraitRef.current ? "0" :
        `${settings.height / settings.width * (runtime.getOrientation() === "portrait" ? 100 : 50)}%`;
    };

    const captureHinge = (engine: PageFlip) => {
      const root = rootRef.current;
      if (!root) return;
      const rect = (engine as unknown as BackCoverRuntime).getRender().getRect();
      root.style.setProperty("--back-cover-left-offset", `${rect.left}px`);
    };

    useImperativeHandle(forwardedRef, () => ({
      resetOpen: () => {
        if (!motionRef.current) engineRef.current?.turnToPage(1);
      },
      close: () => {
        const engine = engineRef.current;
        if (!engine || motionRef.current) return;
        syncFrame(engine);
        captureHinge(engine);
        motionRef.current = "closing";
        const runtime = engine as unknown as BackCoverRuntime;
        if (runtime.getOrientation() === "portrait") {
          // Mismo puente de orientación que usa closeCover() para P1.
          const render = runtime.getRender();
          render.orientation = "landscape";
          portraitMotionRef.current = true;
          // Rebuild the spread's two faces without recalculating its portrait
          // dimensions. Both native hard faces must share the same hinge.
          engine.turnToPage(1);
          const rect = render.getRect();
          runtime.getFlipController().flip({
            x: rect.left + 10,
            y: rect.top + rect.height - 2,
          });
          return;
        }
        engine.flipPrev("bottom");
      },
      open: () => {
        const engine = engineRef.current;
        if (!engine || motionRef.current) return;
        syncFrame(engine);
        captureHinge(engine);
        motionRef.current = "opening";
        const runtime = engine as unknown as BackCoverRuntime;
        if (runtime.getOrientation() === "portrait") {
          runtime.getRender().orientation = "landscape";
          portraitMotionRef.current = true;
          engine.turnToPage(0);
        }
        // P1 abre mediante esta misma operación nativa.
        engine.flipNext("bottom");
      },
    }), []);

    useEffect(() => {
      const host = physicsRef.current;
      if (!host) return;
      // Rotating a phone can remount this bridge while P39 is already closed.
      // Restore that committed surface without starting another cover motion.
      const initialPage = live ? 0 : 1;
      const engine = new PageFlip(host, {
        ...createHardCoverPageFlipSettings(
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
        startPage: initialPage,
        useMouseEvents: false,
      });
      engine.getSettings().showPageCorners = false;
      engine.on("changeState", (event) => {
        if (String(event.data) !== "read" || motionRef.current == null) return;
        const finishedMotion = motionRef.current;
        if (portraitMotionRef.current) {
          const render = (engine as unknown as BackCoverRuntime).getRender();
          render.orientation = "portrait";
          portraitMotionRef.current = false;
          engine.turnToPage(finishedMotion === "closing" ? 0 : 1);
        }
        motionRef.current = null;
        rootRef.current?.style.removeProperty("--back-cover-left-offset");
        onMotionEndRef.current(finishedMotion === "closing" ? "closed" : "open");
      });
      engine.loadFromHTML(host.querySelectorAll<HTMLElement>(".back-cover-physics-leaf"));
      engine.turnToPage(initialPage);
      engineRef.current = engine;

      return () => {
        engine.destroy();
        engineRef.current = null;
        rootRef.current?.style.removeProperty("--back-cover-left-offset");
      };
    }, []);

    useEffect(() => {
      const engine = engineRef.current;
      const host = physicsRef.current;
      if (!engine || !host) return;
      syncFrame(engine);
      if (!mobileCourtPortrait) return;
      const observer = new ResizeObserver(() => syncFrame(engine));
      observer.observe(host);
      return () => observer.disconnect();
    }, [mobileCourtPortrait]);

    return (
      <div
        ref={rootRef}
        className={`back-cover-bridge${active ? " is-active" : ""}${live ? " is-live" : ""}`}
        data-testid="back-cover"
        data-back-cover-live={live ? "true" : "false"}
        aria-label="Contratapa StarVie 2027"
      >
        <div ref={physicsRef} className="back-cover-physics" data-testid="back-cover-physics">
          <div className="back-cover-physics-leaf" data-density="hard" data-rear-bridge-page="cover">
            <div className="back-cover-mirror-content back-cover-surface">
              <img src={coverPage.src} width={coverPage.width} height={coverPage.height} alt="" draggable={false} />
              <div className="back-cover-overlay">
                <div className="back-cover-logo-overlay" data-testid="back-cover-logo" aria-hidden="true">
                  <img
                    className="back-cover-logo-source"
                    src={coverPage.src}
                    width={coverPage.width}
                    height={coverPage.height}
                    alt=""
                    draggable={false}
                    decoding="async"
                  />
                </div>
                <div className="back-cover-live" aria-hidden={live ? undefined : "true"}>
                  <strong data-testid="back-cover-title">2027</strong>
                  <span className="back-cover-collab" data-testid="back-cover-collab">StarVie x RealStep</span>
                  <span className="back-cover-license" data-testid="back-cover-license">Licenciatario Oficial</span>
                  <small data-testid="back-cover-credit">By Santiago Lareu</small>
                </div>
                <nav
                  className="back-cover-contacts"
                  aria-label="Contacto y redes de RealStep"
                  aria-hidden={live ? undefined : true}
                  inert={!live}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <a href="https://www.instagram.com/realstep.oficial/" target="_blank" rel="noopener noreferrer"
                    aria-label="Instagram de RealStep" title="Instagram de RealStep">
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                    </svg>
                  </a>
                  <a href="https://wa.me/5492235440976" target="_blank" rel="noopener noreferrer"
                    aria-label="WhatsApp comercial de RealStep" title="WhatsApp comercial de RealStep">
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
                      <path d="M20.5 11.8a8.5 8.5 0 0 1-12.6 7.5L3 21l1.7-4.8a8.5 8.5 0 1 1 15.8-4.4Z" />
                      <path d="m8.2 7.5 1.5 2.8-1 1c.8 1.8 2.1 3.1 4 3.9l1-1 2.8 1.5c-.3 1.4-1.1 1.9-2.4 1.5-4.1-1.1-6.9-3.9-8-8-.3-1 .5-1.7 2.1-1.7Z" strokeWidth="1.3" />
                    </svg>
                  </a>
                  <a href="https://www.realstep.com.ar/" target="_blank" rel="noopener noreferrer"
                    aria-label="Sitio institucional de RealStep" title="Sitio institucional de RealStep">
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <circle cx="12" cy="12" r="9" />
                      <ellipse cx="12" cy="12" rx="4" ry="9" />
                      <path d="M3 12h18" />
                    </svg>
                  </a>
                </nav>
              </div>
            </div>
          </div>
          <div className="back-cover-physics-leaf" data-density="hard" data-rear-bridge-page="right">
            <div className="back-cover-mirror-content back-cover-surface back-cover-inner-surface">
              <img src={rightPage.src} width={rightPage.width} height={rightPage.height} alt="" draggable={false} />
            </div>
          </div>
          <div className="back-cover-physics-leaf" data-density="soft" data-rear-bridge-page="left">
            <div className="back-cover-mirror-content">
              <img src={leftPage.src} width={leftPage.width} height={leftPage.height} alt="" draggable={false} />
            </div>
          </div>
        </div>
      </div>
    );
  },
);
