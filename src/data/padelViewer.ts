export type ProductView = { id: string; label: string; src: string; alt: string };
export type ProductDetail = {
  id: string; title: string; description: string; src: string; thumbnail: string;
  hotspot?: { view: string; x: number; y: number };
};
export type ExplorerProduct = { id: string; name: string; views: ProductView[]; details: ProductDetail[]; featuredDetail?: string };
const detail = (file: string) => `/viewer-lab/padel/details/${file}.webp`;
const thumb = (file: string) => `/viewer-lab/padel/details/${file}-thumb.webp`;
export const eternalProduct: ExplorerProduct = {
  id: 'eternal', name: 'ETERNAL', featuredDetail: 'accessories',
  views: [
    { id: 'front', label: 'Frente', src: '/viewer-lab/padel/front.webp', alt: 'Pala ETERNAL completa de frente' },
    { id: 'perspective', label: 'Perspectiva', src: '/viewer-lab/padel/perspective.webp', alt: 'Pala ETERNAL completa en perspectiva' },
  ],
  details: [
    { id: 'surface', title: 'Superficie y textura', description: 'Una mirada cercana al relieve, el dibujo y las perforaciones de la cara.', src: detail('surface'), thumbnail: thumb('surface'), hotspot: { view: 'front', x: 49, y: 34 } },
    { id: 'bridge', title: 'Puente', description: 'El encuentro entre la cara, el puente dorado y el mango.', src: detail('bridge'), thumbnail: thumb('bridge'), hotspot: { view: 'front', x: 50, y: 64 } },
    { id: 'edge', title: 'Perfil del marco', description: 'Vista lateral del canto, sus aberturas y la firma. La fotografía muestra un recorte de la pala.', src: detail('edge'), thumbnail: thumb('edge') },
    { id: 'balance', title: 'Power Balance', description: 'Detalle de las piezas con inscripciones +4 y +2 sobre el canto.', src: detail('balance'), thumbnail: thumb('balance'), hotspot: { view: 'front', x: 75, y: 28 } },
    { id: 'grip', title: 'Grip y muñequera', description: 'El acabado del grip, la base del mango y la muñequera STARVIE.', src: detail('grip'), thumbnail: thumb('grip'), hotspot: { view: 'front', x: 50, y: 83 } },
    { id: 'accessories', title: 'Accesorios Power Balance', description: 'Las cuatro piezas y la etiqueta que acompañan al producto.', src: detail('accessories'), thumbnail: thumb('accessories') },
  ],
};
