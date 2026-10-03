import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PageFlip } from "page-flip";
import { createHardCoverPageFlipSettings } from "../data/hardCoverMotion";
import type { CatalogPage } from "../types/catalog";

type BackCoverRuntime = {
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
    { coverPage, leftPage, rightPage, active, live, onMotionEnd },
    forwardedRef,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const physicsRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<PageFlip | null>(null);
    const motionRef = useRef<"closing" | "opening" | null>(null);
    const portraitMotionRef = useRef(false);
    const onMotionEndRef = useRef(onMotionEnd);
    onMotionEndRef.current = onMotionEnd;

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
      const engine = new PageFlip(host, {
        ...createHardCoverPageFlipSettings(
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
        startPage: 1,
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
      engine.turnToPage(1);
      engineRef.current = engine;

      return () => {
        engine.destroy();
        engineRef.current = null;
        rootRef.current?.style.removeProperty("--back-cover-left-offset");
      };
    }, []);

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
