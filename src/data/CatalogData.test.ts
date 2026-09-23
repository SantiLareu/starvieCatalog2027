import { describe, expect, it } from "vitest";
import { hotspots, hotspotsForPage, products, selectLiveHotspots } from "./CatalogData";

const EXPECTED_BY_PRODUCT: Record<string, string> = {
  eternal: "page-15",
  "triton t-one": "page-16",
  "raptor+": "page-17",
  "black titan": "page-18",
  "triton+ power": "page-19",
  "triton+ balance": "page-20",
  "astrum+": "page-21",
  "metheora+": "page-22",
  phantom: "page-23",
  "drax+": "page-24",
  shade: "page-25",
  kyra: "page-26",
  "hard eva black": "page-28",
  "hard eva eternal": "page-29",
  "t-one pro": "page-30",
  "pro master": "page-31",
  star: "page-32",
  "neon strike": "page-33",
  "hard eva black bag": "page-34",
  "artic sport": "page-35",
  "black voltage": "page-36",
  "neceser navy": "page-37",
  "neceser moss": "page-37",
  "black cap": "page-38",
  "power balance": "page-38",
  "overgrip premier soft": "page-38",
  "overgrip tacky touch": "page-38",
  "muñequera wristband white": "page-38",
  "muñequera wristband blue": "page-38",
  "muñequera wristband black 2 pack": "page-38",
  "protector transparent carbon": "page-38",
  "key ring": "page-38",
};

function overlaps(a: (typeof hotspots)[number], b: (typeof hotspots)[number]) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

describe("CatalogData", () => {
  it("mantiene los hotspots dentro de coordenadas porcentuales válidas", () => {
    for (const hotspot of hotspots) {
      expect(hotspot.x).toBeGreaterThanOrEqual(0);
      expect(hotspot.y).toBeGreaterThanOrEqual(0);
      expect(hotspot.x + hotspot.width).toBeLessThanOrEqual(100);
      expect(hotspot.y + hotspot.height).toBeLessThanOrEqual(100);
      expect(hotspot.type).toBe("product");
    }
  });

  it("cubre los 32 productId humanos exactos, sin duplicados y en su página", () => {
    const ids = hotspots.map((hotspot) => hotspot.productId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids).size).toBe(32);
    for (const [productId, pageId] of Object.entries(EXPECTED_BY_PRODUCT)) {
      const found = hotspots.filter((hotspot) => hotspot.productId === productId);
      expect(found).toHaveLength(1);
      expect(found[0].pageId).toBe(pageId);
    }
  });

  it("no deja ningún hotspot legacy con productId raptor-plus", () => {
    expect(hotspots.some((hotspot) => hotspot.productId === "raptor-plus")).toBe(false);
    expect(hotspotsForPage("page-17").map((hotspot) => hotspot.productId)).toEqual(["raptor+"]);
  });

  it("no superpone hotspots de la misma página", () => {
    for (const pageId of new Set(hotspots.map((hotspot) => hotspot.pageId))) {
      const pageHotspots = hotspotsForPage(pageId);
      for (let i = 0; i < pageHotspots.length; i += 1) {
        for (let j = i + 1; j < pageHotspots.length; j += 1) {
          expect(overlaps(pageHotspots[i], pageHotspots[j])).toBe(false);
        }
      }
    }
  });

  it("usa los datos editoriales reales de Raptor+ (legado)", () => {
    expect(products["raptor-plus"]).toMatchObject({
      pageNumber: 17,
      shape: "Lágrima",
      surface: "3D Carbon",
      weight: "350–370 g",
      balance: "Medio",
      reference: "PSTRP41000",
    });
  });
});

describe("selectLiveHotspots (categoría-agnóstico)", () => {
  it("conserva hotspots de cualquier categoría vigentes en el catálogo", () => {
    const candidates = [
      { ...hotspots[0], productId: "tour-bag", pageId: "page-30" },
      { ...hotspots[0], productId: "gorra-basic", pageId: "page-31" },
    ];
    const live = selectLiveHotspots(candidates, new Set(["tour-bag", "gorra-basic"]));
    expect(live).toHaveLength(2);
  });

  it("retira el hotspot del producto eliminado del Excel sin editar la tabla", () => {
    const live = selectLiveHotspots(hotspotsForPage("page-17"), {});
    expect(live).toHaveLength(0);
    const kept = selectLiveHotspots(hotspotsForPage("page-17"), { "raptor+": "Raptor+" });
    expect(kept).toHaveLength(1);
  });
});
