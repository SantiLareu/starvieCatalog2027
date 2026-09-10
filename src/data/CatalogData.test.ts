import { describe, expect, it } from "vitest";
import { hotspots, products } from "./CatalogData";

describe("CatalogData", () => {
  it("mantiene los hotspots dentro de coordenadas porcentuales válidas", () => {
    for (const hotspot of hotspots) {
      expect(hotspot.x).toBeGreaterThanOrEqual(0);
      expect(hotspot.y).toBeGreaterThanOrEqual(0);
      expect(hotspot.x + hotspot.width).toBeLessThanOrEqual(100);
      expect(hotspot.y + hotspot.height).toBeLessThanOrEqual(100);
      expect(products[hotspot.productId]).toBeDefined();
    }
  });

  it("usa los datos editoriales reales de Raptor+", () => {
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
