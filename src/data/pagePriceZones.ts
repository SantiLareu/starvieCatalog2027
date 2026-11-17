/**
 * ZONAS LIBRES POR PÁGINA para el precio de catálogo (desktop).
 *
 * Cada entrada es una MEDIDA sobre el arte original de la página
 * (`public/catalog/pages/page-NN.webp`, 1920×1080): `region` es la zona libre
 * donde el chip de precio puede vivir y `avoid` son los elementos de arte que
 * esa zona NO puede tapar (tabla de especificaciones, banda gris, firma,
 * título/referencias, INCLUYE, menú, puntos del carrusel).
 *
 * Las coordenadas son PORCENTAJES de la caja de la página (0–100): no
 * dependen del tamaño de la hoja ni de la resolución, así que el chip cae en
 * el mismo sitio en cualquier monitor.
 *
 * PLANTILLA FIJA (P15–26): las doce páginas de paletas comparten plantilla
 * (`scripts/clean-pala-pages.py`: "P15-P26 (palas, plantilla fija)"), por eso
 * su zona libre es la misma; la cota superior se toma del caso más
 * desfavorable (la tabla más baja, 47.3 %) y deja 0.7 puntos de aire.
 *
 * P37 NO tiene entrada: su distribución (un chip por neceser, con su nombre)
 * ya está aprobada y se conserva tal cual. P38 tampoco: es la retícula de
 * accesorios y no lleva precios.
 */

/** Rectángulo en porcentajes de la caja de la página. */
export type PagePriceRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Zona de precio medida + el arte que no puede tapar. */
export type PagePricePlacement = {
  pageNumber: number;
  /** Familia visual del chip (página oscura o clara). */
  family: "paddle" | "accessory";
  /** Zona libre medida donde vive el chip. */
  region: PagePriceRect;
  /** Arte impreso que la zona libre respeta. */
  avoid: Array<PagePriceRect & { name: string }>;
  /** De dónde sale la medida. */
  note: string;
};

/* ── Paletas P15–26: columna derecha libre, bajo la ficha técnica ───────────── */

const PADDLE_REGION: PagePriceRect = { left: 70.5, top: 48, width: 18.5, height: 38 };

const PADDLE_AVOID: Array<PagePriceRect & { name: string }> = [
  { name: "tabla de especificaciones", left: 70.6, top: 35.2, width: 18.2, height: 12.1 },
  { name: "ficha de la pala", left: 33, top: 22, width: 31, height: 59 },
  { name: "INCLUYE / ECOFRIENDLY GYMSACK", left: 85.7, top: 88, width: 8.6, height: 4 },
  { name: "firma", left: 44, top: 89, width: 12.5, height: 9 },
  { name: "titulo y REF/EAN", left: 12.5, top: 88, width: 34.5, height: 5 },
];

/* ── Accesorios P28–36: franja libre bajo la banda gris de especificaciones ──── */

const ACCESSORY_REGION_TOP = 61;
const ACCESSORY_REGION_HEIGHT = 26;

const ACCESSORY_AVOID_COMMON: Array<PagePriceRect & { name: string }> = [
  { name: "titulo y REF/EAN", left: 9, top: 88, width: 33, height: 7 },
];

function accessoryPlacement(
  pageNumber: number,
  left: number,
  bandLeft: number,
  extraAvoid: Array<PagePriceRect & { name: string }> = [],
  note = "franja libre bajo la banda gris de especificaciones",
): PagePricePlacement {
  return {
    pageNumber,
    family: "accessory",
    region: { left, top: ACCESSORY_REGION_TOP, width: Math.round((100 - left) * 100) / 100, height: ACCESSORY_REGION_HEIGHT },
    avoid: [
      { name: "banda gris de especificaciones", left: bandLeft, top: 44.4, width: Math.round((100 - bandLeft) * 100) / 100, height: 15.8 },
      ...ACCESSORY_AVOID_COMMON,
      ...extraAvoid,
    ],
    note,
  };
}

/**
 * Una entrada por página de catálogo con precio: P15–26 (paletas) y P28–36
 * (paleteros y mochilas). P37 conserva su distribución propia y P38 no lleva
 * precios.
 */
export const PAGE_PRICE_PLACEMENTS: PagePricePlacement[] = [
  { pageNumber: 15, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 16, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 17, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 18, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 19, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 20, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 21, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 22, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 23, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 24, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 25, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },
  { pageNumber: 26, family: "paddle", region: PADDLE_REGION, avoid: PADDLE_AVOID, note: "columna derecha libre bajo la ficha técnica (plantilla fija)" },

  accessoryPlacement(28, 67, 63, [
    { name: "puntos del carrusel", left: 48.4, top: 74.4, width: 4.3, height: 3.6 },
    { name: "pastilla MENU", left: 83.6, top: 6.5, width: 6, height: 2.6 },
  ], "franja libre bajo la banda gris, a la derecha de la fotografía"),
  accessoryPlacement(29, 77, 63, [
    { name: "firma", left: 67.2, top: 73, width: 9.4, height: 8.5 },
  ], "franja libre a la derecha de la firma"),
  accessoryPlacement(30, 73, 63, [
    { name: "firma", left: 61, top: 70, width: 11.7, height: 8 },
  ], "franja libre a la derecha de la firma"),
  accessoryPlacement(31, 71.5, 68.2, [], "franja libre bajo la banda gris (banda más corta en esta página)"),
  accessoryPlacement(32, 66.5, 63, [], "franja libre bajo la banda gris"),
  accessoryPlacement(33, 67.5, 63, [], "franja libre bajo la banda gris"),
  accessoryPlacement(34, 64.6, 63, [], "franja libre bajo la banda gris"),
  accessoryPlacement(35, 66.5, 63, [], "franja libre bajo la banda gris"),
  accessoryPlacement(36, 63.5, 63, [], "franja libre bajo la banda gris"),
];

/** Zona medida de una página; null si la página no tiene override (P37, P38). */
export function pagePricePlacement(pageNumber: number): PagePricePlacement | null {
  return PAGE_PRICE_PLACEMENTS.find(placement => placement.pageNumber === pageNumber) ?? null;
}

/**
 * ¿La página tiene ubicación medida? Sólo esas páginas usan la capa de
 * precio con contención de tamaño (para medir el chip respecto de la hoja).
 * P37 (distribución aprobada) y P38 (sin precios) NO la tienen.
 */
export function hasPagePricePlacement(pageNumber: number): boolean {
  return PAGE_PRICE_PLACEMENTS.some(placement => placement.pageNumber === pageNumber);
}
