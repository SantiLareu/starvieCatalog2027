/**
 * Carga y validación del catálogo comercial publicado
 * (public/products.json + public/products-version.json).
 */
import type { CommerceCatalog, CommerceProduct, ProductsVersionManifest } from "./types";

export const COMMERCE_SCHEMA_VERSION = 1;
export const VERSION_PATTERN = /^sha256-[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isValidProduct(value: unknown): value is CommerceProduct {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.sku === "string" &&
    typeof value.nombre === "string" &&
    typeof value.precio === "number" &&
    Number.isFinite(value.precio) &&
    typeof value.disponible === "boolean" &&
    Array.isArray(value.imagenes) &&
    (value.imagenes as unknown[]).every((i) => typeof i === "string")
  );
}

export function isValidCatalog(data: unknown): data is CommerceCatalog {
  if (!isRecord(data)) return false;
  if (data.schemaVersion !== COMMERCE_SCHEMA_VERSION) return false;
  if (!Array.isArray(data.products)) return false;
  return (data.products as unknown[]).every(isValidProduct);
}

export function isValidVersionManifest(data: unknown): data is ProductsVersionManifest {
  if (!isRecord(data)) return false;
  return (
    data.schemaVersion === COMMERCE_SCHEMA_VERSION &&
    typeof data.version === "string" &&
    VERSION_PATTERN.test(data.version) &&
    data.productsFile === "products.json"
  );
}

export function byId(catalog: CommerceCatalog): Map<string, CommerceProduct> {
  return new Map(catalog.products.map((product) => [product.id, product]));
}

/**
 * Resuelve la URL de un archivo publicado. Con base absoluta (tests) devuelve
 * URL absoluta; en el navegador devuelve path relativo al documento.
 */
export function publishedUrl(file: string, base: string = import.meta.env.BASE_URL): string {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  if (/^[a-z][a-z\d+.-]*:/i.test(normalizedBase)) {
    return new URL(file, normalizedBase).href;
  }
  const anchor =
    typeof document !== "undefined" && document.baseURI ? document.baseURI : "http://localhost/";
  const resolved = new URL(file, new URL(normalizedBase, anchor));
  if (typeof document !== "undefined") return resolved.pathname + resolved.search + resolved.hash;
  return resolved.href;
}

export function withCacheBust(url: string, nonce: string | number): string {
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(url);
  const parsed = new URL(url, "http://localhost/");
  parsed.searchParams.set("check", String(nonce));
  if (absolute) return parsed.href;
  return parsed.pathname + parsed.search + parsed.hash;
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status} al pedir ${url}`);
  return response.json() as Promise<unknown>;
}

/**
 * Descarga versión + catálogo y los valida. La versión actúa como señal:
 * el polling solo descarga el catálogo completo cuando la versión cambió.
 */
export async function loadPublishedCommerce(
  fetchImpl: typeof fetch = fetch,
  base: string = import.meta.env.BASE_URL,
): Promise<{ catalog: CommerceCatalog; version: string }> {
  const versionRaw = await fetchJson(withCacheBust(publishedUrl("products-version.json", base), Date.now()), fetchImpl);
  if (!isValidVersionManifest(versionRaw)) throw new Error("products-version.json inválido");
  const catalogRaw = await fetchJson(
    withCacheBust(publishedUrl("products.json", base), versionRaw.version),
    fetchImpl,
  );
  if (!isValidCatalog(catalogRaw)) throw new Error("products.json inválido");
  return { catalog: catalogRaw, version: versionRaw.version };
}

export async function fetchPublishedVersion(
  fetchImpl: typeof fetch = fetch,
  base: string = import.meta.env.BASE_URL,
): Promise<string> {
  const raw = await fetchJson(
    withCacheBust(publishedUrl("products-version.json", base), Date.now()),
    fetchImpl,
  );
  if (!isValidVersionManifest(raw)) throw new Error("products-version.json inválido");
  return raw.version;
}

export async function fetchPublishedCatalog(
  version: string,
  fetchImpl: typeof fetch = fetch,
  base: string = import.meta.env.BASE_URL,
): Promise<CommerceCatalog> {
  const raw = await fetchJson(
    withCacheBust(publishedUrl("products.json", base), version),
    fetchImpl,
  );
  if (!isValidCatalog(raw)) throw new Error("products.json inválido");
  return raw;
}
