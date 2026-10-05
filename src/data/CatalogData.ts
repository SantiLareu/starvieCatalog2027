import type { Hotspot, Product } from "../types/catalog";

/**
 * Geometría manual de hotspots comerciales sobre las páginas del catálogo.
 *
 * Principio: NINGUNA lógica comercial depende de la categoría. Un producto
 * funciona comercialmente por estar presente en products.xlsx (generado a
 * generated/products.json) y tener su campo `pagina`. Esta tabla solo aporta
 * las coordenadas manuales (% sobre la página) que NO pueden inventarse:
 * cada entrada asocia un `productId` del Excel con su `pageId` física
 * (`page-<numero>`) y su rectángulo.
 *
 * Para dar de alta un producto de CUALQUIER categoría (paletero, bolso,
 * mochila, neceser, accesorio, gorra, overgrip, muñequera, protector,
 * llavero, etc.): agregar una entrada con su productId, pageId y
 * coordenadas medidas. No hay ramas por categoría ni rangos de páginas
 * reservados a palas. Si el producto se elimina del Excel, el hotspot
 * queda inactivo vía `selectLiveHotspots` (no se muestra).
 *
 * Cobertura 2027 (32 productos, un hotspot por productId):
 * - Palas P15–P26: un producto por página (plantilla común, misma geometría
 *   de referencia que el Raptor+ original).
 * - Paleteros P28–P33: un producto por página (plantilla común).
 * - Mochilas P34–P36: un producto por página (plantilla común).
 * - Neceseres P37: dos hotspots lado a lado (navy / moss).
 * - Accesorios P38: retícula de 9 hotspots (gorra, pesos, 2 overgrips,
 *   3 muñequeras, protector, llavero).
 * - P27 es overview general (miniaturas) y NO lleva hotspots: cada producto
 *   vive en su página de detalle para mantener productId único.
 *
 * IDs exactos del Excel (mayúsculas/minúsculas, espacios y "+" tal cual):
 * ver tabla de hotspots. "hard eva black bag" (paletero, P28) y
 * "m hard eva black" (mochila, P34) son identidades distintas del Excel.
 *
 * El registro `products` es legado editorial del piloto (Raptor+) y solo
 * existe por compatibilidad con el test histórico; la fuente comercial
 * vigente es el catálogo generado (CommerceProduct).
 */
export const products: Record<string, Product> = {
  "raptor-plus": {
    id: "raptor-plus",
    name: "Raptor+",
    range: "Super Pro · Profesional y semi pro",
    playStyle: "Versátil",
    shape: "Lágrima",
    surface: "3D Carbon",
    weight: "350–370 g",
    balance: "Medio",
    price: "320 $",
    streetPrice: "288 $",
    reference: "PSTRP41000",
    ean: "8436612942025",
    pageNumber: 17,
  },
};

export const hotspots: Hotspot[] = [
  // Palas P15–P26 (plantilla común: producto centrado).
  { id: "eternal-page-15", pageId: "page-15", type: "product", productId: "eternal", x: 28, y: 13, width: 38, height: 78 },
  { id: "triton t-one-page-16", pageId: "page-16", type: "product", productId: "triton t-one", x: 28, y: 13, width: 38, height: 78 },
  { id: "raptor+-page-17", pageId: "page-17", type: "product", productId: "raptor+", x: 28, y: 13, width: 38, height: 78 },
  { id: "black titan-page-18", pageId: "page-18", type: "product", productId: "black titan", x: 28, y: 13, width: 38, height: 78 },
  { id: "triton+ power-page-19", pageId: "page-19", type: "product", productId: "triton+ power", x: 28, y: 13, width: 38, height: 78 },
  { id: "triton+ balance-page-20", pageId: "page-20", type: "product", productId: "triton+ balance", x: 28, y: 13, width: 38, height: 78 },
  { id: "astrum+-page-21", pageId: "page-21", type: "product", productId: "astrum+", x: 28, y: 13, width: 38, height: 78 },
  { id: "metheora+-page-22", pageId: "page-22", type: "product", productId: "metheora+", x: 28, y: 13, width: 38, height: 78 },
  { id: "phantom-page-23", pageId: "page-23", type: "product", productId: "phantom", x: 28, y: 13, width: 38, height: 78 },
  { id: "drax+-page-24", pageId: "page-24", type: "product", productId: "drax+", x: 28, y: 13, width: 38, height: 78 },
  { id: "shade-page-25", pageId: "page-25", type: "product", productId: "shade", x: 28, y: 13, width: 38, height: 78 },
  { id: "kyra-page-26", pageId: "page-26", type: "product", productId: "kyra", x: 28, y: 13, width: 38, height: 78 },
  // Paleteros P28–P33 (plantilla común: producto centrado).
  { id: "hard eva black-page-28", pageId: "page-28", type: "product", productId: "hard eva black bag", x: 34, y: 23, width: 34, height: 44 },
  { id: "hard eva eternal-page-29", pageId: "page-29", type: "product", productId: "hard eva eternal", x: 34, y: 23, width: 34, height: 44 },
  { id: "t-one pro-page-30", pageId: "page-30", type: "product", productId: "t-one pro", x: 34, y: 23, width: 34, height: 44 },
  { id: "pro master-page-31", pageId: "page-31", type: "product", productId: "pro master", x: 34, y: 23, width: 34, height: 44 },
  { id: "star-page-32", pageId: "page-32", type: "product", productId: "star", x: 34, y: 23, width: 34, height: 44 },
  { id: "neon strike-page-33", pageId: "page-33", type: "product", productId: "neon strike", x: 34, y: 23, width: 34, height: 44 },
  // Mochilas P34–P36 (plantilla común: producto centrado, alto).
  { id: "hard eva black bag-page-34", pageId: "page-34", type: "product", productId: "m hard eva black", x: 35, y: 16, width: 30, height: 68 },
  { id: "artic sport-page-35", pageId: "page-35", type: "product", productId: "artic sport", x: 35, y: 16, width: 30, height: 68 },
  { id: "black voltage-page-36", pageId: "page-36", type: "product", productId: "black voltage", x: 35, y: 16, width: 30, height: 68 },
  // Neceseres P37 (dos productos lado a lado).
  { id: "neceser navy-page-37", pageId: "page-37", type: "product", productId: "neceser navy", x: 4, y: 36, width: 31, height: 30 },
  { id: "neceser moss-page-37", pageId: "page-37", type: "product", productId: "neceser moss", x: 37, y: 36, width: 30, height: 30 },
  // Accesorios P38 (retícula: fila superior 4 + fila inferior 5).
  { id: "black cap-page-38", pageId: "page-38", type: "product", productId: "black cap", x: 3, y: 21, width: 16, height: 26 },
  { id: "power balance-page-38", pageId: "page-38", type: "product", productId: "power balance", x: 25, y: 21, width: 12, height: 26 },
  { id: "overgrip premier soft-page-38", pageId: "page-38", type: "product", productId: "overgrip premier soft", x: 46, y: 21, width: 14, height: 26 },
  { id: "overgrip tacky touch-page-38", pageId: "page-38", type: "product", productId: "overgrip tacky touch", x: 61, y: 21, width: 12, height: 26 },
  { id: "muñequera wristband white-page-38", pageId: "page-38", type: "product", productId: "muñequera Wristband white", x: 7, y: 56, width: 9, height: 30 },
  { id: "muñequera wristband blue-page-38", pageId: "page-38", type: "product", productId: "muñequera Wristband blue", x: 23, y: 56, width: 9, height: 30 },
  { id: "muñequera wristband black 2 pack-page-38", pageId: "page-38", type: "product", productId: "muñequera Wristband black x2", x: 38, y: 56, width: 10, height: 32 },
  { id: "protector transparent carbon-page-38", pageId: "page-38", type: "product", productId: "protector transparent carbon", x: 52, y: 56, width: 18, height: 32 },
  { id: "key ring-page-38", pageId: "page-38", type: "product", productId: "key ring", x: 72, y: 56, width: 23, height: 32 },
];

export const hotspotsForPage = (pageId: string) =>
  hotspots.filter((hotspot) => hotspot.pageId === pageId);

/**
 * Índice editorial de P27 (overview): zonas transparentes sobre los
 * productos impresos que saltan a su página de detalle.
 *
 * Mapa P27 → página destino, independiente del catálogo comercial
 * (los bolsos aún no existen en generated/products.json). Destinos
 * deducidos por nombre impreso vs. página de detalle conocida:
 * paleteros P28–P33, mochilas P34–P36, neceseres P37.
 * Coordenadas medidas sobre el render 1920×1080 de P27 (%); cada
 * zona cubre etiqueta + ilustración del producto.
 */
export type SectionIndexHotspot = {
  id: string;
  pageId: "page-27";
  /** Nombre tal como está impreso en P27 (etiqueta, no dato comercial). */
  label: string;
  targetPage: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const sectionIndexHotspots: SectionIndexHotspot[] = [
  // Paleteros (fila superior, etiquetas + ilustración).
  { id: "p27-hard-eva-eternal", pageId: "page-27", label: "Padel Bag Hard Eva Eternal", targetPage: 29, x: 4, y: 22, width: 15.5, height: 28 },
  { id: "p27-t-one-pro", pageId: "page-27", label: "Padel Bag T-One Pro", targetPage: 30, x: 20.5, y: 22, width: 14, height: 28 },
  { id: "p27-hard-eva-black", pageId: "page-27", label: "Padel Bag Hard Eva Black", targetPage: 28, x: 35, y: 22, width: 15, height: 28 },
  { id: "p27-pro-master", pageId: "page-27", label: "Padel Bag Pro Master", targetPage: 31, x: 52.5, y: 22, width: 15, height: 28 },
  { id: "p27-star", pageId: "page-27", label: "Padel Bag Star", targetPage: 32, x: 69, y: 22, width: 14, height: 28 },
  { id: "p27-neon-strike", pageId: "page-27", label: "Padel Bag Neon Strike", targetPage: 33, x: 84, y: 22, width: 12.5, height: 28 },
  // Mochilas (fila inferior izquierda).
  { id: "p27-back-pack-hard-eva-black", pageId: "page-27", label: "Back Pack Hard Eva Black", targetPage: 34, x: 6.5, y: 58, width: 9, height: 31 },
  { id: "p27-back-pack-black-voltage", pageId: "page-27", label: "Back Pack Black Voltage", targetPage: 36, x: 20, y: 58, width: 10.5, height: 31 },
  { id: "p27-back-pack-artic-sport", pageId: "page-27", label: "Back Pack Artic Sport", targetPage: 35, x: 34, y: 58, width: 10, height: 31 },
  // Neceseres (fila inferior derecha; ambos comparten página de detalle).
  { id: "p27-wash-bag-navy", pageId: "page-27", label: "Wash Bag Navy", targetPage: 37, x: 53.5, y: 58, width: 11, height: 22 },
  { id: "p27-wash-bag-moss", pageId: "page-27", label: "Wash Bag Moss", targetPage: 37, x: 67.5, y: 58, width: 11.5, height: 22 },
];

export const sectionIndexForPage = (pageId: string) =>
  sectionIndexHotspots.filter((hotspot) => hotspot.pageId === pageId);

/**
 * Filtra hotspots manuales contra el catálogo comercial vigente.
 * Categoría-agnóstico: conserva el hotspot si y solo si su productId existe
 * en el catálogo (esté disponible o no; disponible=false sigue visible como
 * "Sin stock" en el modal). Los productos retirados del Excel dejan de
 * mostrar hotspot sin necesidad de editar esta tabla.
 */
export function selectLiveHotspots(
  candidates: Hotspot[],
  liveProductIds: ReadonlySet<string> | Record<string, unknown>,
): Hotspot[] {
  const has =
    typeof (liveProductIds as ReadonlySet<string>).has === "function"
      ? (id: string) => (liveProductIds as ReadonlySet<string>).has(id)
      : (id: string) => Object.hasOwn(liveProductIds as Record<string, unknown>, id);
  return candidates.filter((hotspot) => has(hotspot.productId));
}
