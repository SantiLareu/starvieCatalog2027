import { describe, expect, it } from "vitest";
import type { CatalogMetadata } from "../types/catalog";
import {
  BACK_COVER_ORIGINAL_PAGE,
  COLLECTION_VIDEO_ID,
  SANYO_EDITORIAL_ID,
  SANYO_EDITORIAL_LABEL,
  SANYO_ORIGINAL_PAGE,
  TAMARA_EDITORIAL_ID,
  TAMARA_EDITORIAL_LABEL,
  TAMARA_ORIGINAL_PAGE,
  backCoverOpenBookIndex,
  backCoverPageForCatalog,
  bookIndexForOriginalPage,
  bookPageLabel,
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
    expect(pages).toHaveLength(41);
    expect(pages[13]).toMatchObject({ kind: "pdf", originalNumber: 14 });
    expect(pages[14]).toMatchObject({ kind: "video", id: COLLECTION_VIDEO_ID });
    expect(pages[15]).toMatchObject({ kind: "pdf", originalNumber: 15 });
    expect(pages.filter((page) => page.kind === "pdf")).toHaveLength(38);
  });

  it("inserta la editorial Sanyo inmediatamente después de P29 (spread P29|SANYO)", () => {
    const pages = buildBookPages(catalogWith(39));
    const p29 = bookIndexForOriginalPage(pages, SANYO_ORIGINAL_PAGE);
    expect(p29).toBe(29);
    expect(pages[p29 + 1]).toMatchObject({ kind: "editorial", id: SANYO_EDITORIAL_ID });
    expect(bookPageLabel(pages[p29 + 1])).toBe(SANYO_EDITORIAL_LABEL);
    // Paridad (impar, par): en landscape forman el spread P29|SANYO.
    expect(p29 % 2).toBe(1);
    // P30 queda en 31 por la virtual Sanyo previa; su propia editorial
    // se verifica en el test de Tamara.
    expect(pages[p29 + 2]).toMatchObject({ kind: "pdf", originalNumber: 30 });
  });

  it("inserta la editorial Tamara inmediatamente después de P30 (spread P30|TAMARA)", () => {
    const pages = buildBookPages(catalogWith(39));
    const p30 = bookIndexForOriginalPage(pages, TAMARA_ORIGINAL_PAGE);
    expect(p30).toBe(31);
    expect(pages[p30 + 1]).toMatchObject({ kind: "editorial", id: TAMARA_EDITORIAL_ID });
    expect(bookPageLabel(pages[p30 + 1])).toBe(TAMARA_EDITORIAL_LABEL);
    // Paridad (impar, par): en landscape forman el spread P30|TAMARA.
    expect(p30 % 2).toBe(1);
    // Desplazamiento total +2 (par): P31+ conserva su paridad.
    expect(pages[p30 + 2]).toMatchObject({ kind: "pdf", originalNumber: 31 });
    expect(bookIndexForOriginalPage(pages, 29)).toBe(29);
    expect(bookIndexForOriginalPage(pages, 38)).toBe(40);
  });

  it("resuelve Next como cierre desde el último spread abierto, no como página siguiente", () => {
    // El engine informa la hoja izquierda del spread: en landscape el
    // spread P37–P38 reporta 37 y Next debe cerrar la contratapa ahí mismo.
    expect(backCoverOpenBookIndex(38, "landscape")).toBe(37);
    expect(backCoverOpenBookIndex(38, "portrait")).toBe(38);
    expect(backCoverOpenBookIndex(0, "landscape")).toBe(0);
    // Con ambas editoriales el último spread P37–P38 queda en (39, 40).
    const pages = buildBookPages(catalogWith(39));
    const last = pages.length - 1;
    expect(bookIndexForOriginalPage(pages, 37)).toBe(backCoverOpenBookIndex(last, "landscape"));
    expect(bookIndexForOriginalPage(pages, 38)).toBe(last);
  });

  it("conserva el orden completo y los spreads posteriores a las dos editoriales", () => {
    const pages = buildBookPages(catalogWith(39));
    expect(pages.slice(27).map(bookPageLabel)).toEqual([
      "27", "28", "29", "SANYO", "30", "TAMARA", "31", "32", "33", "34", "35", "36", "37", "38",
    ]);
    expect(pages).toHaveLength(41);
    for (const left of [31, 33, 35, 37]) {
      const index = bookIndexForOriginalPage(pages, left);
      expect(index % 2).toBe(1);
      expect(pages[index + 1]).toMatchObject({ kind: "pdf", originalNumber: left + 1 });
    }
    expect(bookIndexForOriginalPage(pages, 37)).toBe(39);
    expect(backCoverOpenBookIndex(pages.length - 1, "landscape")).toBe(39);
    expect(backCoverOpenBookIndex(pages.length - 1, "portrait")).toBe(40);
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
    expect(bookIndexForOriginalPage(pages, 38)).toBe(40);
  });
});
