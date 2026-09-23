import type { CatalogMetadata, CatalogPage } from "../types/catalog";

export const STARLAB_FIRST_PAGE = 2;
export const STARLAB_LAST_PAGE = 13;
export const COLLECTION_LINEUP_PAGE = 14;
export const COLLECTION_VIDEO_ID = "collection-2027-video";
export const COLLECTION_VIDEO_SRC = "/catalog/video/collection-2027.mp4";
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

export type BookPage = PdfBookPage | VideoBookPage;

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
  return page.kind === "video" ? "VIDEO" : String(page.originalNumber);
}
