import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import type { CommerceProduct } from "../commerce/types";
import { formatPrice } from "../commerce/money";

type ProductModalProps = {
  product: CommerceProduct;
  /** Imagen de la página del catálogo como contexto/fallback. */
  pageSrc?: string;
  pageNumber?: number | null;
  /** Unidades ya en el carrito (solo informativo: no hay tope de inventario). */
  cartQty: number;
  onAdd: (qty: number) => void;
  onClose: () => void;
};

const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#17181b"/><text x="50%" y="50%" fill="#a6a9ae" font-family="sans-serif" font-size="28" text-anchor="middle">StarVie</text></svg>`,
);

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const BUTTON_ZOOM_STEP = 0.5;
const WHEEL_ZOOM_STEP = 0.2;
const CLICK_ZOOM = 2;

type ImageView = { zoom: number; x: number; y: number };
type PointerPosition = { x: number; y: number };
type PanGesture = {
  mode: "pan";
  pointerId: number;
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
};
type PinchGesture = {
  mode: "pinch";
  startDistance: number;
  startZoom: number;
  startPanX: number;
  startPanY: number;
  startMidX: number;
  startMidY: number;
};
type ImageGesture = PanGesture | PinchGesture;

function formatZoom(zoom: number): string {
  return `${Number.isInteger(zoom) ? zoom.toFixed(0) : zoom.toFixed(1)}×`;
}

/**
 * URL HTTP de una ruta del Excel (p. ej. products/palas/RAPTOR+/RAPTOR1.3.webp).
 * Codifica cada segmento por separado para que "+", espacios y demás
 * caracteres habituales viajen como %2B, %20, etc. El valor original del
 * Excel se conserva intacto en el JSON; solo se codifica al construir la URL.
 */
export function assetUrl(relative: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const encoded = relative
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encoded, new URL(base, window.location.href)).href;
}

export function ProductModal({ product, pageSrc, cartQty, onAdd, onClose }: ProductModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const gestureRef = useRef<ImageGesture | null>(null);
  const suppressClickRef = useRef(false);
  const initialView: ImageView = { zoom: MIN_ZOOM, x: 0, y: 0 };
  const viewRef = useRef<ImageView>(initialView);
  const [imageView, setImageView] = useState<ImageView>(initialView);
  const [isDragging, setIsDragging] = useState(false);

  const commitImageView = useCallback((zoom: number, x: number, y: number) => {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));
    const viewport = imageViewportRef.current;
    const maxX = viewport ? viewport.clientWidth * (nextZoom - 1) / 2 : 0;
    const maxY = viewport ? viewport.clientHeight * (nextZoom - 1) / 2 : 0;
    const next: ImageView = nextZoom === MIN_ZOOM
      ? { zoom: MIN_ZOOM, x: 0, y: 0 }
      : {
          zoom: nextZoom,
          x: Math.min(maxX, Math.max(-maxX, x)),
          y: Math.min(maxY, Math.max(-maxY, y)),
        };
    viewRef.current = next;
    setImageView(next);
  }, []);

  const resetImageView = useCallback(() => {
    pointersRef.current.clear();
    gestureRef.current = null;
    suppressClickRef.current = false;
    setIsDragging(false);
    commitImageView(MIN_ZOOM, 0, 0);
  }, [commitImageView]);

  const zoomAtPoint = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
    const current = viewRef.current;
    const viewport = imageViewportRef.current;
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    if (!viewport || clientX === undefined || clientY === undefined || current.zoom === clampedZoom) {
      commitImageView(clampedZoom, current.x, current.y);
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const pointX = clientX - (rect.left + rect.width / 2);
    const pointY = clientY - (rect.top + rect.height / 2);
    const ratio = clampedZoom / current.zoom;
    commitImageView(
      clampedZoom,
      (1 - ratio) * pointX + ratio * current.x,
      (1 - ratio) * pointY + ratio * current.y,
    );
  }, [commitImageView]);

  const zoomIn = useCallback(() => {
    const current = viewRef.current;
    zoomAtPoint(current.zoom + BUTTON_ZOOM_STEP);
  }, [zoomAtPoint]);

  const zoomOut = useCallback(() => {
    const current = viewRef.current;
    zoomAtPoint(current.zoom - BUTTON_ZOOM_STEP);
  }, [zoomAtPoint]);

  // Galería construida desde el Excel; con campo vacío o asset roto se usa fallback limpio.
  const gallery = useMemo(() => {
    const fromExcel = product.imagenes.map(assetUrl);
    if (fromExcel.length > 0) return fromExcel;
    if (pageSrc) return [pageSrc];
    return [PLACEHOLDER];
  }, [product.imagenes, pageSrc]);
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());
  const [qty, setQty] = useState(1);
  const visible = useMemo(
    () => gallery
      .map((src, index) => ({ src, index }))
      .filter(({ index }) => !failed.has(index)),
    [failed, gallery],
  );
  const selectedPosition = Math.min(selected, Math.max(0, visible.length - 1));
  const current = visible[selectedPosition];
  const currentSrc = current ? current.src : pageSrc ?? PLACEHOLDER;
  const selectPrevious = useCallback(() => {
    resetImageView();
    setSelected((position) => Math.max(0, Math.min(position, visible.length - 1) - 1));
  }, [resetImageView, visible.length]);
  const selectNext = useCallback(() => {
    resetImageView();
    setSelected((position) => Math.min(Math.max(0, visible.length - 1), position + 1));
  }, [resetImageView, visible.length]);
  const selectImage = useCallback((position: number) => {
    resetImageView();
    setSelected(position);
  }, [resetImageView]);

  useEffect(() => {
    setSelected(0);
    setFailed(new Set());
    setQty(1);
    resetImageView();
  }, [product.id, resetImageView]);

  useEffect(() => {
    const handleResize = () => {
      const currentView = viewRef.current;
      commitImageView(currentView.zoom, currentView.x, currentView.y);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [commitImageView]);

  useEffect(() => {
    activeThumbRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [currentSrc, selectedPosition]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (visible.length <= 1) return;
        event.preventDefault();
        if (event.key === "ArrowLeft") selectPrevious();
        else selectNext();
        return;
      }
      const interactiveTarget = target?.closest("button, a, [role='button']");
      if (interactiveTarget) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        resetImageView();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, resetImageView, selectNext, selectPrevious, visible.length, zoomIn, zoomOut]);

  const handleImageClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (viewRef.current.zoom > MIN_ZOOM) resetImageView();
    else zoomAtPoint(CLICK_ZOOM, event.clientX, event.clientY);
  }, [resetImageView, zoomAtPoint]);

  const handleImageWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    zoomAtPoint(viewRef.current.zoom + direction * WHEEL_ZOOM_STEP, event.clientX, event.clientY);
  }, [zoomAtPoint]);

  const startPinchGesture = useCallback(() => {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return;
    const [first, second] = points;
    const currentView = viewRef.current;
    gestureRef.current = {
      mode: "pinch",
      startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      startZoom: currentView.zoom,
      startPanX: currentView.x,
      startPanY: currentView.y,
      startMidX: (first.x + second.x) / 2,
      startMidY: (first.y + second.y) / 2,
    };
    suppressClickRef.current = true;
    setIsDragging(true);
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      startPinchGesture();
      return;
    }
    const currentView = viewRef.current;
    gestureRef.current = {
      mode: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: currentView.x,
      startPanY: currentView.y,
    };
    if (currentView.zoom > MIN_ZOOM) setIsDragging(true);
  }, [startPinchGesture]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "pinch") {
      const points = [...pointersRef.current.values()];
      if (points.length < 2) return;
      event.preventDefault();
      const [first, second] = points;
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const midpointX = (first.x + second.x) / 2;
      const midpointY = (first.y + second.y) / 2;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gesture.startZoom * distance / gesture.startDistance));
      const ratio = nextZoom / gesture.startZoom;
      const viewport = imageViewportRef.current?.getBoundingClientRect();
      const centerX = viewport ? viewport.left + viewport.width / 2 : 0;
      const centerY = viewport ? viewport.top + viewport.height / 2 : 0;
      commitImageView(
        nextZoom,
        midpointX - centerX - ratio * (gesture.startMidX - centerX - gesture.startPanX),
        midpointY - centerY - ratio * (gesture.startMidY - centerY - gesture.startPanY),
      );
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (Math.hypot(deltaX, deltaY) > 4) suppressClickRef.current = true;
    if (viewRef.current.zoom <= MIN_ZOOM) return;
    event.preventDefault();
    commitImageView(viewRef.current.zoom, gesture.startPanX + deltaX, gesture.startPanY + deltaY);
  }, [commitImageView]);

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const remaining = [...pointersRef.current.entries()];
    if (remaining.length >= 2) {
      startPinchGesture();
      return;
    }
    if (remaining.length === 1 && viewRef.current.zoom > MIN_ZOOM) {
      const [pointerId, point] = remaining[0];
      const currentView = viewRef.current;
      gestureRef.current = {
        mode: "pan",
        pointerId,
        startX: point.x,
        startY: point.y,
        startPanX: currentView.x,
        startPanY: currentView.y,
      };
      return;
    }
    gestureRef.current = null;
    setIsDragging(false);
  }, [startPinchGesture]);

  const purchasable = product.disponible;
  const safeQty = Math.max(1, qty);

  // Ficha categoría-agnóstica: los campos técnicos de pala (gama, tipoJuego,
  // forma, plano, peso, balance) son opcionales y los bloques vacíos no se
  // muestran. Un paletero/bolso/accesorio sin esos campos presenta nombre,
  // referencia/SKU, precio, disponibilidad, imágenes, cantidad y compra.
  const specs: Array<[string, string]> = [
    ["Tipo de juego", product.tipoJuego],
    ["Forma", product.forma],
    ["Plano", product.plano],
    ["Peso", product.peso],
    ["Balance", product.balance],
    ["Referencia", product.sku],
  ].filter(([, value]) => value !== "") as Array<[string, string]>;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Cerrar ficha">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="product-visual">
          <div className="product-main-image">
            <div
              ref={imageViewportRef}
              className={`product-image-viewport${imageView.zoom > MIN_ZOOM ? " is-zoomed" : ""}${isDragging ? " is-dragging" : ""}`}
              data-zoom={imageView.zoom.toFixed(2)}
              onClick={handleImageClick}
              onWheel={handleImageWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              role="group"
              tabIndex={0}
              aria-label="Visor ampliable de la imagen del producto"
            >
              <img
                key={currentSrc}
                src={currentSrc}
                alt={`${product.nombre}, imagen ${selectedPosition + 1} de ${Math.max(1, visible.length)}`}
                draggable={false}
                style={{ transform: `translate3d(${imageView.x}px, ${imageView.y}px, 0) scale(${imageView.zoom})` }}
                onError={() => {
                  if (current) setFailed((prev) => new Set(prev).add(current.index));
                  else if (pageSrc && currentSrc === pageSrc) setFailed(new Set([0]));
                }}
              />
            </div>
            <div className="zoom-controls" role="group" aria-label="Controles de zoom">
              <button
                type="button"
                onClick={zoomOut}
                disabled={imageView.zoom <= MIN_ZOOM}
                aria-label="Alejar imagen"
              >
                −
              </button>
              <button
                className="zoom-level"
                type="button"
                onClick={resetImageView}
                disabled={imageView.zoom <= MIN_ZOOM}
                aria-label="Restablecer zoom"
              >
                {formatZoom(imageView.zoom)}
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={imageView.zoom >= MAX_ZOOM}
                aria-label="Acercar imagen"
              >
                +
              </button>
            </div>
            {visible.length > 1 ? (
              <>
                <button
                  className="gallery-arrow gallery-arrow-previous"
                  type="button"
                  onClick={selectPrevious}
                  disabled={selectedPosition === 0}
                  aria-label="Imagen anterior"
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  className="gallery-arrow gallery-arrow-next"
                  type="button"
                  onClick={selectNext}
                  disabled={selectedPosition === visible.length - 1}
                  aria-label="Imagen siguiente"
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="gallery-position" aria-live="polite">
                  {String(selectedPosition + 1).padStart(2, "0")} / {String(visible.length).padStart(2, "0")}
                </span>
              </>
            ) : null}
          </div>
          {visible.length > 1 ? (
            <div className="gallery-thumbs" role="group" aria-label="Imágenes del producto">
              {visible.map(({ src }, position) => (
                <button
                  key={src}
                  ref={position === selectedPosition ? activeThumbRef : undefined}
                  type="button"
                  className={position === selectedPosition ? "is-active" : ""}
                  onClick={() => selectImage(position)}
                  aria-label={`Ver imagen ${position + 1}`}
                  aria-pressed={position === selectedPosition}
                >
                  <img src={src} alt="" aria-hidden="true" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="product-details">
          {product.gama ? <p className="product-range">{product.gama}</p> : null}
          <h2 id="product-modal-title">{product.nombre}</h2>
          <dl>
            {specs.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <div className="product-prices">
            <span><small>Precio</small>{formatPrice(product.precio)}</span>
            <span className="stock-line">
              <small>Disponibilidad</small>
              {product.disponible ? (
                <em className="in-stock">Con stock</em>
              ) : (
                <em className="out-of-stock">Sin stock</em>
              )}
            </span>
          </div>
          {purchasable ? (
            <div className="purchase-row">
              <div className="qty-selector" role="group" aria-label="Cantidad">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={safeQty <= 1}
                  aria-label="Quitar una unidad"
                >
                  −
                </button>
                <span aria-live="polite">{safeQty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => q + 1)}
                  aria-label="Agregar una unidad"
                >
                  +
                </button>
              </div>
              <button
                className="order-button is-active"
                type="button"
                onClick={() => {
                  onAdd(safeQty);
                  onClose();
                }}
              >
                Agregar al pedido
              </button>
            </div>
          ) : (
            <button className="order-button" type="button" disabled title="Sin stock disponible">
              Sin stock
            </button>
          )}
          {cartQty > 0 ? <p className="future-note">Ya tenés {cartQty} u. en el pedido.</p> : null}
          <p className="future-note">SKU {product.sku}{product.ean ? ` · EAN ${product.ean}` : ""}</p>
        </div>
      </section>
    </div>,
    document.body,
  );
}
