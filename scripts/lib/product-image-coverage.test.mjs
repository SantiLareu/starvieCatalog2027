import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateProductImageCoverage } from "./product-image-coverage.mjs";

let publicRoot;
let manifest;
const source = "products/bolsos/accesorio/Muñequera blanca 4.png";
const product = { id: "wristband-white", imagenes: [source] };
const catalog = { products: [product, { id: "key-ring", imagenes: [] }] };

beforeEach(async () => {
  publicRoot = await mkdtemp(path.join(os.tmpdir(), "starvie-image-coverage-"));
  await mkdir(path.join(publicRoot, "catalog/product-images"), { recursive: true });
  manifest = { schemaVersion: 1, images: { [source]: {} } };
  for (const [name, width] of Object.entries({ thumbnail: 160, standard: 768, large: 1280 })) {
    const src = `catalog/product-images/test-${width}.webp`;
    const result = await sharp({ create: { width, height: width, channels: 4,
      background: { r: 20, g: 20, b: 20, alpha: 0.5 } } }).webp().toFile(path.join(publicRoot, src));
    manifest.images[source][name] = { src, width, height: width, bytes: result.size };
  }
});
afterEach(async () => { await rm(publicRoot, { recursive: true, force: true }); });
const validate = (published = catalog) => validateProductImageCoverage({ catalog: published, manifest, publicRoot });

describe("cobertura de variantes antes de publicar", () => {
  it("valida archivos reales, deduplica fuentes y permite fallback sin imagen", async () => {
    const result = await validate({ products: [...catalog.products, { id: "shared", imagenes: [source] }] });
    expect(result).toMatchObject({ products: 3, sources: 1, covered: 1, missing: 0, assets: 3,
      withoutImages: ["key-ring"], errors: [] });
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("detecta un producto nuevo sin entrada y nombra su fuente", async () => {
    const missing = "products/bolsos/Nuevo.png";
    const result = await validate({ products: [...catalog.products, { id: "new", imagenes: [missing] }] });
    expect(result).toMatchObject({ sources: 2, covered: 1, missing: 1 });
    expect(result.errors.join("\n")).toContain(`${missing}: faltan variantes`);
  });

  it("rechaza una entrada incompleta aunque existan las otras variantes", async () => {
    delete manifest.images[source].large;
    expect((await validate()).errors.join("\n")).toContain("[large]: entrada ausente");
  });

  it("detecta un archivo eliminado aunque permanezca en el manifiesto", async () => {
    await unlink(path.join(publicRoot, manifest.images[source].thumbnail.src));
    expect((await validate()).errors.join("\n")).toContain("[thumbnail]: derivado inexistente");
  });

  it("rechaza archivos corruptos", async () => {
    await writeFile(path.join(publicRoot, manifest.images[source].standard.src), "not an image");
    expect((await validate()).missing).toBe(1);
  });

  it.each(["width", "height", "bytes"])("rechaza metadato %s desactualizado", async field => {
    manifest.images[source].standard[field] += 1;
    expect((await validate()).errors.join("\n")).toContain("no coinciden");
  });

  it("rechaza un original grande utilizado como thumbnail", async () => {
    manifest.images[source].thumbnail = { ...manifest.images[source].large };
    expect((await validate()).missing).toBe(1);
  });

  it("rechaza rutas fuera del directorio de derivados", async () => {
    manifest.images[source].standard.src = "../private.webp";
    expect((await validate()).errors.join("\n")).toContain("ruta WebP inválida");
  });

  it("rechaza versiones de manifiesto desconocidas", async () => {
    manifest.schemaVersion = 2;
    expect((await validate()).errors).toContain("productImageVariants.json: schemaVersion debe ser 1");
  });
});
