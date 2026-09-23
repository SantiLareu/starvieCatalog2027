import { describe, expect, it, vi } from "vitest";
import { createAppChecker, createCatalogChecker } from "./polling";

const versionA = `sha256-${"a".repeat(64)}`;
const versionB = `sha256-${"b".repeat(64)}`;
const product = {
  id: "raptor-plus",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "",
  precio: 320,
  disponible: true,
  imagenes: [],
};
const catalogOf = (precio: number) => ({
  schemaVersion: 1 as const,
  products: [{ ...product, precio }],
});

describe("polling de catálogo", () => {
  it("detecta versión nueva y descarga el catálogo actualizado", async () => {
    let published = { version: versionA, catalog: catalogOf(320) };
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("products-version.json")) {
        return { ok: true, json: async () => ({ schemaVersion: 1, version: published.version, productsFile: "products.json" }) };
      }
      return { ok: true, json: async () => published.catalog };
    }) as unknown as typeof fetch;
    let current: string | null = versionA;
    const check = createCatalogChecker({ getCurrentVersion: () => current, fetchImpl, base: "/" });

    expect(await check()).toMatchObject({ status: "current" });

    published = { version: versionB, catalog: catalogOf(350) };
    const result = await check();
    expect(result.status).toBe("updated");
    if (result.status === "updated") {
      expect(result.version).toBe(versionB);
      expect(result.catalog.products[0].precio).toBe(350);
      current = result.version;
    }
    expect(await check()).toMatchObject({ status: "current" });
  });

  it("reporta no disponible ante fallos de red", async () => {
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    const check = createCatalogChecker({ getCurrentVersion: () => versionA, fetchImpl, base: "/" });
    expect(await check()).toMatchObject({ status: "unavailable" });
  });
});

describe("polling de app", () => {
  const manifestOf = (version: string) => ({ schemaVersion: 1, version, files: [] });
  const fetchFor = (version: string) =>
    (async () => ({ ok: true, json: async () => manifestOf(version) })) as unknown as typeof fetch;

  it("recarga automáticamente cuando cambia el frontend y es seguro", async () => {
    const reload = vi.fn();
    const check = createAppChecker({
      loadedVersion: versionA,
      fetchImpl: fetchFor(versionB),
      versionUrl: "http://x/app-version.json",
      reload,
      storage: null,
      isReloadSafe: () => true,
    });
    const result = await check();
    expect(result).toMatchObject({ status: "reload_requested", reloaded: true });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("difiere la recarga si el usuario tiene el modal o el carrito abiertos", async () => {
    const reload = vi.fn();
    const check = createAppChecker({
      loadedVersion: versionA,
      fetchImpl: fetchFor(versionB),
      versionUrl: "http://x/app-version.json",
      reload,
      storage: null,
      isReloadSafe: () => false,
    });
    expect(await check()).toMatchObject({ status: "deferred", reloaded: false });
    expect(reload).not.toHaveBeenCalled();
  });

  it("no hace nada si la versión es la misma", async () => {
    const reload = vi.fn();
    const check = createAppChecker({
      loadedVersion: versionA,
      fetchImpl: fetchFor(versionA),
      versionUrl: "http://x/app-version.json",
      reload,
      storage: null,
    });
    expect(await check()).toMatchObject({ status: "current", reloaded: false });
    expect(reload).not.toHaveBeenCalled();
  });

  it("construye la url desde base sin window", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(String(url).split("?")[0]);
      return { ok: true, json: async () => manifestOf(versionA) };
    }) as unknown as typeof fetch;
    const check = createAppChecker({
      loadedVersion: versionA,
      fetchImpl,
      base: "http://x/base/",
      storage: null,
    });
    await check();
    expect(seen).toEqual(["http://x/base/app-version.json"]);
  });
});
