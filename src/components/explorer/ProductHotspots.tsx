import type { ProductDetail } from '../../data/padelViewer';
export function ProductHotspots({ details, view, onOpen }: { details: ProductDetail[]; view: string; onOpen: (id: string) => void }) {
  return <div className="explorer-hotspots">{details.filter(d => d.hotspot?.view === view).map(d => <button
    type="button" key={d.id} className="explorer-hotspot" style={{ left: `${d.hotspot!.x}%`, top: `${d.hotspot!.y}%` }}
    aria-label={`Explorar ${d.title}`} onClick={() => onOpen(d.id)}><span aria-hidden="true">+</span><span className="hotspot-label">{d.title}</span></button>)}</div>;
}
