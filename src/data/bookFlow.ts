import type { CatalogMetadata, CatalogPage } from "../types/catalog";

export const STARLAB_FIRST_PAGE = 2;
export const STARLAB_LAST_PAGE = 13;
export const COLLECTION_LINEUP_PAGE = 14;
/** P27: overview de "Bolsos & Accesorios" con índice clickeable (sin overlay). */
export const SECTION_COVER_ORIGINAL_PAGE = 27;
export const COLLECTION_VIDEO_ID = "collection-2027-video";
export const COLLECTION_VIDEO_SRC = "/videos/news.mp4";
/**
 * P39 es exclusivamente la contratapa física. Nunca forma parte del array
 * normal de StPageFlip: el último spread abierto es siempre P37|P38 y P39
 * sólo existe como superficie visual del overlay de contratapa.
 */
export const BACK_COVER_ORIGINAL_PAGE = 39;

export type PdfBookPage = {
  kind: "pdf";
  id: string;
  originalNumber: number;
  page: CatalogPage;
};

export type VideoBookPage = {
  kind: "video";
  id: typeof COLLECTION_VIDEO_ID;
  src: typeof COLLECTION_VIDEO_SRC;
};

export type EditorialBookPage = {
  kind: "editorial";
  id: string;
  /** Etiqueta editorial (indicador, miniaturas): nunca número de PDF. */
  label: string;
};

export type BookPage = PdfBookPage | VideoBookPage | EditorialBookPage;

/** P29 (Hard Eva Eternal, modelo de Sanyo) y su página editorial. */
export const SANYO_ORIGINAL_PAGE = 29;
export const SANYO_EDITORIAL_ID = "sanyo-2027-editorial";
export const SANYO_EDITORIAL_LABEL = "SANYO";

/** P30 (T-One Pro, modelo de Tamara) y su página editorial. */
export const TAMARA_ORIGINAL_PAGE = 30;
export const TAMARA_EDITORIAL_ID = "tamara-2027-editorial";
export const TAMARA_EDITORIAL_LABEL = "TAMARA";

export function buildBookPages(catalog: CatalogMetadata): BookPage[] {
  // La contratapa (P39) queda fuera del recorrido abierto: sólo P1–P38
  // alimentan a StPageFlip, por lo que la paridad del book no cambia.
  const pages: BookPage[] = catalog.pages
    .filter((page) => page.number !== BACK_COVER_ORIGINAL_PAGE)
    .map((page) => ({
      kind: "pdf",
      id: page.id,
      originalNumber: page.number,
      page,
    }));
  const lineupIndex = pages.findIndex(
    (page) => page.kind === "pdf" && page.originalNumber === COLLECTION_LINEUP_PAGE,
  );
  if (lineupIndex < 0) return pages;
  pages.splice(lineupIndex + 1, 0, {
    kind: "video",
    id: COLLECTION_VIDEO_ID,
    src: COLLECTION_VIDEO_SRC,
  });
  // Editorial Sanyo inmediatamente después de P29: en landscape forma el
  // spread P29|SANYO por paridad (impar, par). P30+ se desplaza +1 hasta
  // incorporar la virtual de Tamara. Sin P29 no se inserta nada.
  const sanyoIndex = pages.findIndex(
    (page) => page.kind === "pdf" && page.originalNumber === SANYO_ORIGINAL_PAGE,
  );
  if (sanyoIndex >= 0) {
    pages.splice(sanyoIndex + 1, 0, {
      kind: "editorial",
      id: SANYO_EDITORIAL_ID,
      label: SANYO_EDITORIAL_LABEL,
    });
  }
  // Editorial Tamara inmediatamente después de P30: con Sanyo ya
  // insertada, el desplazamiento total es +2 (par) y P31+ conserva su
  // paridad. En landscape forma el spread P30|TAMARA. Sin P30 no se
  // inserta nada.
  const tamaraIndex = pages.findIndex(
    (page) => page.kind === "pdf" && page.originalNumber === TAMARA_ORIGINAL_PAGE,
  );
  if (tamaraIndex >= 0) {
    pages.splice(tamaraIndex + 1, 0, {
      kind: "editorial",
      id: TAMARA_EDITORIAL_ID,
      label: TAMARA_EDITORIAL_LABEL,
    });
  }
  return pages;
}

/** Superficie visual de la contratapa dura. No tiene índice de book. */
export function backCoverPageForCatalog(catalog: CatalogMetadata): CatalogPage | undefined {
  return catalog.pages.find((page) => page.number === BACK_COVER_ORIGINAL_PAGE);
}

/**
 * Índice desde el cual Next significa CLOSE_BACK_COVER. En landscape el
 * engine informa la hoja izquierda del spread abierto, así que el último
 * spread (P37–P38) reporta lastBookIndex - 1 — el mismo ajuste que ya usa
 * el límite de StarLab. En portrait la hoja visible es el propio índice.
 */
export function backCoverOpenBookIndex(
  lastBookIndex: number,
  orientation: "portrait" | "landscape",
): number {
  return orientation === "landscape" ? Math.max(0, lastBookIndex - 1) : lastBookIndex;
}

export function bookIndexForOriginalPage(pages: BookPage[], originalNumber: number): number {
  return pages.findIndex(
    (page) => page.kind === "pdf" && page.originalNumber === originalNumber,
  );
}

export function isStarLabOriginalPage(originalNumber: number): boolean {
  return originalNumber >= STARLAB_FIRST_PAGE && originalNumber <= STARLAB_LAST_PAGE;
}

export function bookPageLabel(page: BookPage | undefined): string {
  if (!page) return "";
  if (page.kind === "video") return "VIDEO";
  if (page.kind === "editorial") return page.label;
  return String(page.originalNumber);
}
