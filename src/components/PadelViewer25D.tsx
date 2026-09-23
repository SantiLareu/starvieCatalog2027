import { eternalProduct } from '../data/padelViewer';
import { PadelExplorer } from './explorer/PadelExplorer';
// Preserve the lab's existing entry point while the explorer is reusable by product.
export function PadelViewer25D() { return <PadelExplorer product={eternalProduct} />; }
