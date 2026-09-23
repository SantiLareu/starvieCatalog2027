import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { ExplorerProduct } from '../../data/padelViewer';
import { ProductHotspots } from './ProductHotspots';
import { bound, dragIndex, gestureSettings as settings, releaseIndex } from './gestures';
type Drag = { pointer: number; x: number; y: number; start: number; current: number; lastX: number; lastTime: number; velocity: number; axis: 'pending' | 'horizontal' | 'vertical'; step: number };
export function ProductViewStage({ product, index, ready, reduced, onChange, onInteract, onOpen }: {
  product: ExplorerProduct; index: number; ready: boolean; reduced: boolean; onChange: (index: number) => void; onInteract: () => void; onOpen: (id: string) => void;
}) {
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const view = product.views[index];
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!ready || drag.current || (event.pointerType === 'mouse' && event.button !== 0) || (event.target as HTMLElement).closest('button')) return;
    onInteract();
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: index, current: index, lastX: event.clientX, lastTime: event.timeStamp, velocity: 0, axis: 'pending', step: event.pointerType === 'touch' ? settings.touchStep : settings.mouseStep };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    const dx = d.x - event.clientX, dy = d.y - event.clientY;
    if (d.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= settings.axisSlop) {
      d.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'horizontal' : 'vertical';
      if (d.axis === 'horizontal') { event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }
    }
    if (d.axis !== 'horizontal') return;
    onInteract();
    const dt = event.timeStamp - d.lastTime;
    if (dt > 0) d.velocity = (d.lastX - event.clientX) / dt;
    d.lastX = event.clientX; d.lastTime = event.timeStamp;
    d.current = dragIndex(d.start, d.current, dx, d.step, product.views.length);
    onChange(d.current);
    setOffset(reduced ? 0 : Math.max(-3, Math.min(3, dx / d.step * 3)));
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    drag.current = null;
    if (!cancelled && d.axis === 'horizontal') onChange(releaseIndex(d.start, d.current, d.x - event.clientX, d.velocity, event.timeStamp - d.lastTime, product.views.length));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setOffset(0); setDragging(false); onInteract();
  };
  return <div className={`explorer-stage ${dragging ? 'is-dragging' : ''}`} data-testid="padel-viewer-stage" data-view-state={view.id}
    tabIndex={0} role="region" aria-label={`Explorar ${product.name}. Usá las flechas izquierda y derecha para cambiar de ángulo.`} aria-busy={!ready}
    onPointerDown={down} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => { if (drag.current) finish(event, true); }}
    onKeyDown={event => { if ((event.target as HTMLElement).closest('button')) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onInteract(); onChange(bound(index + (event.key === 'ArrowRight' ? 1 : -1), product.views.length)); } }}>
    <span className="explorer-stage-word" aria-hidden="true">{product.name}</span>
    <span className="explorer-stage-caption">{String(index + 1).padStart(2, '0')} / {String(product.views.length).padStart(2, '0')} <span>{view.label}</span></span>
    <div className="explorer-product-plane" style={{ transform: `translateX(${-offset}px)` }}>
      {ready && <img key={view.id} className="explorer-product-image" src={view.src} alt={view.alt} draggable={false} data-view={view.id} />}
      {ready && !dragging && <ProductHotspots details={product.details} view={view.id} onOpen={onOpen} />}
    </div>
    {!ready && <span className="explorer-loading" role="status">Preparando las vistas…</span>}
    <span className="explorer-gesture-hint" aria-hidden="true">← <span>Arrastrá para explorar</span> →</span>
  </div>;
}
