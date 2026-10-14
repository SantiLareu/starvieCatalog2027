import type { CommerceCatalog } from "../commerce/types";

export const EXPORT_HEADERS = ["SKU", "Nombre", "Categoría", "Subcategoría", "Precio"] as const;
export type ExportSelection =
  | { scope: "all" }
  | { scope: "category"; category: string }
  | { scope: "subcategory"; category: string; subcategory: string };
export type ExportRow = [string | null, string, string, string, number | null];

export function exportCategories(catalog: CommerceCatalog): string[] {
  return [...new Set(catalog.products.map(product => product.categoria ?? ""))].sort((a, b) => a.localeCompare(b, "es"));
}

export function exportSubcategories(catalog: CommerceCatalog, category: string): string[] {
  return [...new Set(catalog.products.filter(product => (product.categoria ?? "") === category)
    .map(product => product.subcategoria ?? ""))].sort((a, b) => a.localeCompare(b, "es"));
}

/** Every published product remains exportable, including blank SKUs and no stock. */
export function buildExportRows(catalog: CommerceCatalog, selection: ExportSelection): ExportRow[] {
  const zeroIds = catalog.zeroPriceProductIds ?? [];
  if (!Array.isArray(zeroIds) || zeroIds.some(id => typeof id !== "string" ||
    !catalog.products.some(product => product.id === id && (product.precio === null || product.precio === 0)))) {
    throw new Error("Metadatos de precios inválidos");
  }
  const zeros = new Set(zeroIds);
  return catalog.products.filter(product => selection.scope === "all" ||
    ((product.categoria ?? "") === selection.category && (selection.scope === "category" ||
      (product.subcategoria ?? "") === selection.subcategory))).map(product => [
      product.sku === "" ? null : product.sku,
      product.nombre,
      product.categoria ?? "",
      product.subcategoria ?? "",
      zeros.has(product.id) ? 0 : product.precio,
    ]);
}

function filePart(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "") || "sin-clasificar";
}

export function exportFileName(selection: ExportSelection): string {
  const parts = selection.scope === "all" ? ["productos"] : [filePart(selection.category),
    ...(selection.scope === "subcategory" ? [filePart(selection.subcategory)] : [])];
  return `starvie-2027-${parts.join("-")}.xlsx`;
}
