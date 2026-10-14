import { describe, expect, it } from "vitest";
import type { CommerceCatalog, CommerceProduct } from "../commerce/types";
import { buildExportRows, EXPORT_HEADERS, exportCategories, exportFileName, exportSubcategories } from "./catalogExport";

const product = (id: string, overrides: Partial<CommerceProduct> = {}): CommerceProduct => ({
  id, sku: "000123", nombre: id, categoria: "palas", subcategoria: "super-pro", precio: 199.5,
  disponible: true, imagenes: [], gama: "", tipoJuego: "", forma: "", plano: "", peso: "", balance: "", ean: "", pagina: null, ...overrides,
});
const catalog: CommerceCatalog = { schemaVersion: 1, products: [
  product("first"), product("zero", { sku: "", precio: null, disponible: false }),
  product("pending", { categoria: "bolsos", subcategoria: "", precio: null }),
  product("legacy-zero", { categoria: "palas", subcategoria: "pro", precio: 0 }),
], zeroPriceProductIds: ["zero"] };

describe("export selection", () => {
  it("exports one row per published product including no stock, blank SKU and zero", () => {
    expect(EXPORT_HEADERS).toEqual(["SKU", "Nombre", "Categoría", "Subcategoría", "Precio"]);
    expect(buildExportRows(catalog, { scope: "all" })).toEqual([
      ["000123", "first", "palas", "super-pro", 199.5],
      [null, "zero", "palas", "super-pro", 0],
      ["000123", "pending", "bolsos", "", null],
      ["000123", "legacy-zero", "palas", "pro", 0],
    ]);
  });
  it("filters by category and subcategory without mutating input", () => {
    const original = JSON.stringify(catalog);
    expect(buildExportRows(catalog, { scope: "category", category: "palas" })).toHaveLength(3);
    expect(buildExportRows(catalog, { scope: "subcategory", category: "palas", subcategory: "super-pro" })).toHaveLength(2);
    expect(buildExportRows(catalog, { scope: "category", category: "missing" })).toEqual([]);
    expect(JSON.stringify(catalog)).toBe(original);
  });
  it("derives current categories, preserves empty classifications and handles updates", () => {
    expect(exportCategories(catalog)).toEqual(["bolsos", "palas"]);
    expect(exportSubcategories(catalog, "palas")).toEqual(["pro", "super-pro"]);
    expect(exportSubcategories(catalog, "bolsos")).toEqual([""]);
    const updated: CommerceCatalog = { schemaVersion: 1, products: [product("new", { categoria: "nueva", subcategoria: "otra" })] };
    expect(exportCategories(updated)).toEqual(["nueva"]);
    expect(exportSubcategories(updated, "nueva")).toEqual(["otra"]);
    expect(exportCategories({ schemaVersion: 1, products: [] })).toEqual([]);
  });
  it("supports blank category and subcategory as actual values", () => {
    const blank: CommerceCatalog = { schemaVersion: 1, products: [product("blank", { categoria: "", subcategoria: "" })] };
    expect(buildExportRows(blank, { scope: "subcategory", category: "", subcategory: "" })).toHaveLength(1);
    expect(exportCategories(blank)).toEqual([""]);
  });
  it("does not infer zero from null in legacy catalog data", () => {
    expect(buildExportRows({ ...catalog, zeroPriceProductIds: undefined }, { scope: "all" })[1][4]).toBeNull();
    expect(() => buildExportRows({ ...catalog, zeroPriceProductIds: ["first"] }, { scope: "all" })).toThrow();
  });
  it("normalizes safe file names, including accents and hostile path characters", () => {
    expect(exportFileName({ scope: "all" })).toBe("starvie-2027-productos.xlsx");
    expect(exportFileName({ scope: "category", category: "Palás" })).toBe("starvie-2027-palas.xlsx");
    expect(exportFileName({ scope: "subcategory", category: "../../Palás", subcategory: "Super / Pro:*?" })).toBe("starvie-2027-palas-super-pro.xlsx");
    expect(exportFileName({ scope: "category", category: "" })).toBe("starvie-2027-sin-clasificar.xlsx");
  });
});
