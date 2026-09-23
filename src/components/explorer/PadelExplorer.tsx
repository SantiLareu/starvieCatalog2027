import { useEffect, useRef, useState } from 'react';
import type { ExplorerProduct } from '../../data/padelViewer';
import { ProductViewStage } from './ProductViewStage';
import { ProductViewNavigation } from './ProductViewNavigation';
import { ProductDetailViewer } from './ProductDetailViewer';
import { decodeImage } from './images';
import './explorer.css';
export const AUTOPLAY_IDLE = 8000;
export const AUTOPLAY_INTERVAL = 5000;
export function PadelExplorer({ product }: { product: ExplorerProduct }) {
  const [index, setIndex] = useState(0);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [automatic, setAutomatic] = useState(true);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const interacted = useRef(Date.now());
  const interact = () => { interacted.current = Date.now(); };
  const featured = product.details.find(d => d.id === product.featuredDetail);
  useEffect(() => {
    const release = () => { setHeld(false); interact(); };
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setReady(false); setFailed(false);
    Promise.all(product.views.map(view => decodeImage(view.src))).then(() => { if (!cancelled) setReady(true); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [product, retry]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    const visibility = () => { setVisible(!document.hidden); interact(); };
    media.addEventListener('change', change); document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', change); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!ready || !automatic || reduced || focused || hovered || held || detailIndex !== null || !visible || product.views.length < 2) return;
    let lastAdvance = 0;
    let direction = 1;
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now - interacted.current < AUTOPLAY_IDLE || now - lastAdvance < AUTOPLAY_INTERVAL) return;
      lastAdvance = now;
      setIndex(current => { if (current === product.views.length - 1) direction = -1; if (current === 0) direction = 1; return current + direction; });
    }, 250);
    return () => window.clearInterval(timer);
  }, [ready, automatic, reduced, focused, hovered, held, detailIndex, visible, product.views.length]);
  const open = (id: string) => { interact(); const i = product.details.findIndex(detail => detail.id === id); if (i >= 0) setDetailIndex(i); };
  return <section className="padel-explorer" aria-label={`Explorador de ${product.name}`} data-testid="padel-viewer" onPointerDownCapture={() => { interact(); setHeld(true); }} onKeyDownCapture={interact}
    onFocusCapture={() => { setFocused(true); interact(); }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocused(false); interact(); } }}>
    <div className="explorer-main" onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); interact(); }}>
      <ProductViewStage product={product} index={index} ready={ready} reduced={reduced} onChange={setIndex} onInteract={interact} onOpen={open} />
      {failed && <div className="explorer-error" role="alert">No se pudieron cargar las vistas. <button type="button" onClick={() => setRetry(r => r + 1)}>Reintentar</button></div>}
      <ProductViewNavigation views={product.views} index={index} onChange={i => { interact(); setIndex(i); }} autoplay={automatic && !reduced} onToggle={() => { interact(); setAutomatic(a => !a); }} reduced={reduced} />
    </div>
    <aside className="explorer-inspect"><p className="explorer-eyebrow">STARVIE / PRODUCT LAB</p><h1>{product.name}</h1><p className="explorer-intro">Explorá la pala.</p><p className="explorer-instruction">Cambiá de ángulo con un gesto.<br />Acercate a cada detalle con <span>+</span>.</p>
      <div className="explorer-details-heading"><h2>En detalle</h2><span>{String(product.details.length).padStart(2, '0')}</span></div>
      <div className="explorer-detail-list">{product.details.map((detail, i) => <button type="button" className="explorer-detail-link" key={detail.id} onClick={() => open(detail.id)}><span className="explorer-detail-number">{String(i + 1).padStart(2, '0')}</span><span>{detail.title}</span><span aria-hidden="true">↗</span></button>)}</div>
      {featured && <button type="button" className="explorer-featured" onClick={() => open(featured.id)}><img src={featured.thumbnail} alt="" loading="lazy" decoding="async" /><span><small>UNA MIRADA MÁS CERCA</small>{featured.title}<span className="explorer-featured-action">Explorar ↗</span></span></button>}
    </aside>
    {detailIndex !== null && <ProductDetailViewer name={product.name} details={product.details} index={detailIndex} onChange={i => { interact(); setDetailIndex(i); }} onClose={() => { interact(); setDetailIndex(null); }} />}
  </section>;
}
