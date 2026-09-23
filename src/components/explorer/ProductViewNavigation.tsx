import type { ProductView } from '../../data/padelViewer';
export function ProductViewNavigation({ views, index, onChange, autoplay, onToggle, reduced }: {
  views: ProductView[]; index: number; onChange: (index: number) => void; autoplay: boolean; onToggle: () => void; reduced: boolean;
}) {
  return <div className="explorer-navigation"><div className="explorer-angles" aria-label="Ángulos de la pala">{views.map((view, i) =>
    <button type="button" key={view.id} data-testid={`viewer-control-${view.id}`} aria-pressed={index === i} onClick={() => onChange(i)}><span aria-hidden="true" className={index === i ? 'angle-dot active' : 'angle-dot'} />{view.label}</button>)}</div>
    <button type="button" className="explorer-auto" aria-label={autoplay ? 'Pausar movimiento automático' : 'Activar movimiento automático'} aria-pressed={autoplay} onClick={onToggle} disabled={reduced} title={reduced ? 'Movimiento reducido activado' : undefined}>{autoplay ? 'Ⅱ' : '▷'} <span>Auto</span></button>
  </div>;
}
