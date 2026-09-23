import { describe, expect, it } from "vitest";
import type { CatalogMetadata } from "../types/catalog";
import {
  BACK_COVER_ORIGINAL_PAGE,
  COLLECTION_VIDEO_ID,
  backCoverOpenBookIndex,
  backCoverPageForCatalog,
  bookIndexForOriginalPage,
  buildBookPages,
  isStarLabOriginalPage,
} from "./bookFlow";

function catalogWith(pageCount: number): CatalogMetadata {
  return {
    title: "StarVie 2027",
    source: "catalog.pdf",
    sourceBytes: 1,
    pageCount,
    sourcePage: { width: 1440, height: 810, aspectRatio: 16 / 9 },
    output: { format: "webp", width: 1920, quality: 84, thumbnailWidth: 480, thumbnailQuality: 68 },
    pages: Array.from({ length: pageCount }, (_, index) => ({
      id: `page-${String(index + 1).padStart(2, "0")}`,
      number: index + 1,
      src: `/page-${index + 1}.webp`,
      thumbnail: `/thumb-${index + 1}.webp`,
      width: 1920,
      height: 1080,
      bytes: 1,
      thumbnailBytes: 1,
    })),
  };
}

describe("flujo lógico del book", () => {
  it("expone P1–P38 en el recorrido abierto e inserta video después de P14", () => {
    const pages = buildBookPages(catalogWith(39));
    expect(pages).toHaveLength(39);
    expect(pages[13]).toMatchObject({ kind: "pdf", originalNumber: 14 });
    expect(pages[14]).toMatchObject({ kind: "video", id: COLLECTION_VIDEO_ID });
    expect(pages[15]).toMatchObject({ kind: "pdf", originalNumber: 15 });
    expect(pages.filter((page) => page.kind === "pdf")).toHaveLength(38);
  });

  it("resuelve Next como cierre desde el último spread abierto, no como página siguiente", () => {
    // El engine informa la hoja izquierda del spread: en landscape el
    // spread P37–P38 reporta 37 y Next debe cerrar la contratapa ahí mismo.
    expect(backCoverOpenBookIndex(38, "landscape")).toBe(37);
    expect(backCoverOpenBookIndex(38, "portrait")).toBe(38);
    expect(backCoverOpenBookIndex(0, "landscape")).toBe(0);
  });

  it("deja P39 fuera del flujo normal como contratapa dura", () => {
    expect(BACK_COVER_ORIGINAL_PAGE).toBe(39);
    const pages = buildBookPages(catalogWith(39));
    expect(pages.some((page) => page.kind === "pdf" && page.originalNumber === 39)).toBe(false);
    expect(bookIndexForOriginalPage(pages, 39)).toBe(-1);
    expect(backCoverPageForCatalog(catalogWith(39))?.number).toBe(39);
  });

  it("mantiene P2-P13 como StarLab y preserva índices físicos posteriores", () => {
    const pages = buildBookPages(catalogWith(39));
    expect(Array.from({ length: 12 }, (_, index) => index + 2).every(isStarLabOriginalPage)).toBe(true);
    expect(isStarLabOriginalPage(1)).toBe(false);
    expect(isStarLabOriginalPage(14)).toBe(false);
    expect(bookIndexForOriginalPage(pages, 2)).toBe(1);
    expect(bookIndexForOriginalPage(pages, 14)).toBe(13);
    expect(bookIndexForOriginalPage(pages, 15)).toBe(15);
    expect(bookIndexForOriginalPage(pages, 38)).toBe(38);
  });
});
