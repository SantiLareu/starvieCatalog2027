import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { ProductDetail } from '../../data/padelViewer';
import { decodeImage } from './images';
export function ProductDetailViewer({ name, details, index, onChange, onClose }: { name: string; details: ProductDetail[]; index: number; onChange: (index: number) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const [loaded, setLoaded] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(false);
  const detail = details[index];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setFailed(false); setZoom(false);
    viewport.current?.scrollTo?.(0, 0);
    decodeImage(detail.src).then(() => { if (!cancelled) setLoaded(detail.src); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [detail.src, attempt]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (!p || p.id !== event.pointerId || !viewport.current) return;
    viewport.current.scrollLeft = p.left + p.x - event.clientX;
    viewport.current.scrollTop = p.top + p.y - event.clientY;
  };
  return <dialog ref={dialog} className="explorer-detail-dialog" aria-labelledby="explorer-detail-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="explorer-detail-shell">
      <header><span>{name} / DETALLES</span><button type="button" onClick={onClose} aria-label="Cerrar detalle" autoFocus>×</button></header>
      <div ref={viewport} className={`explorer-detail-image-area ${zoom ? 'is-zoomed' : ''}`} data-testid="detail-image-area"
        onPointerDown={event => { if (!zoom || event.pointerType !== 'mouse') return; const v = event.currentTarget; pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: v.scrollLeft, top: v.scrollTop }; v.setPointerCapture(event.pointerId); }}
        onPointerMove={move} onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }}>
        {loaded === detail.src && !failed ? <div className="explorer-detail-image-canvas"><img src={detail.src} alt={detail.title} draggable={false} /></div> : <div className="explorer-detail-status" role="status">{failed ? <><p>No se pudo cargar este detalle.</p><button type="button" onClick={() => setAttempt(a => a + 1)}>Reintentar</button></> : 'Cargando detalle…'}</div>}
      </div>
      <footer><div className="explorer-detail-copy"><span className="explorer-eyebrow">{String(index + 1).padStart(2, '0')} / {String(details.length).padStart(2, '0')}</span><h2 id="explorer-detail-title">{detail.title}</h2><p>{detail.description}</p></div>
        <div className="explorer-detail-actions"><button type="button" disabled={loaded !== detail.src || failed} onClick={() => setZoom(z => !z)} aria-pressed={zoom}>{zoom ? 'Alejar' : 'Ampliar 2×'}</button><div><button type="button" aria-label="Detalle anterior" onClick={() => onChange((index - 1 + details.length) % details.length)}>←</button><button type="button" aria-label="Detalle siguiente" onClick={() => onChange((index + 1) % details.length)}>→</button></div></div>
      </footer>
    </div>
  </dialog>;
}
