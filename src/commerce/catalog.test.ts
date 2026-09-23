import { describe, expect, it, vi } from "vitest";
import {
  fetchPublishedCatalog,
  fetchPublishedVersion,
  isValidCatalog,
  isValidVersionManifest,
  loadPublishedCommerce,
  publishedUrl,
  withCacheBust,
} from "./catalog";

const product = {
  id: "raptor-plus",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 320,
  disponible: true,
  imagenes: ["products/palas/RAPTOR+/RAPTOR1.3.webp"],
};

const catalog = { schemaVersion: 1, products: [product] };
const manifest = {
  schemaVersion: 1,
  version: `sha256-${"a".repeat(64)}`,
  productsFile: "products.json",
};

function stubFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => routes[key] };
  }) as unknown as typeof fetch;
}

describe("validación del catálogo publicado", () => {
  it("acepta catálogo y manifiesto válidos", () => {
    expect(isValidCatalog(catalog)).toBe(true);
    expect(isValidVersionManifest(manifest)).toBe(true);
  });

  it("rechaza estructuras inválidas", () => {
    expect(isValidCatalog({ schemaVersion: 1, products: [{ id: "x" }] })).toBe(false);
    expect(isValidCatalog(null)).toBe(false);
    expect(isValidVersionManifest({ ...manifest, version: "1.2.3" })).toBe(false);
    expect(isValidVersionManifest({ ...manifest, productsFile: "otro.json" })).toBe(false);
  });

  it("rechaza precio no numérico o disponible no booleano", () => {
    expect(isValidCatalog({ schemaVersion: 1, products: [{ ...product, precio: "320 €" }] })).toBe(false);
    expect(isValidCatalog({ schemaVersion: 1, products: [{ ...product, disponible: "sí" }] })).toBe(false);
    expect(isValidCatalog({ schemaVersion: 1, products: [{ ...product, disponible: 1 }] })).toBe(false);
  });
});

describe("carga publicada", () => {
  it("carga versión + catálogo y usa cache-busting", async () => {
    const fetchImpl = stubFetch({ "products-version.json": manifest, "products.json": catalog });
    const result = await loadPublishedCommerce(fetchImpl, "/");
    expect(result.version).toBe(manifest.version);
    expect(result.catalog.products[0].precio).toBe(320);
    const calledUrls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calledUrls.every((u) => u.includes("check="))).toBe(true);
  });

  it("falla si la versión es inválida", async () => {
    const fetchImpl = stubFetch({ "products-version.json": { version: "x" } });
    await expect(fetchPublishedVersion(fetchImpl, "/")).rejects.toThrow();
  });

  it("falla si el catálogo es inválido", async () => {
    const fetchImpl = stubFetch({ "products.json": { products: [] } });
    await expect(fetchPublishedCatalog(manifest.version, fetchImpl, "/")).rejects.toThrow();
  });
});

describe("urls", () => {
  it("construye urls absolutas y con cache-bust", () => {
    expect(publishedUrl("products.json", "/").endsWith("/products.json")).toBe(true);
    expect(withCacheBust("http://x/products-version.json", 123)).toBe(
      "http://x/products-version.json?check=123",
    );
  });

  it("aplica cache-busting a urls relativas sin romperlas", () => {
    expect(withCacheBust("/products-version.json", 123)).toBe("/products-version.json?check=123");
    expect(withCacheBust("products.json", 7)).toBe("/products.json?check=7");
  });
});
