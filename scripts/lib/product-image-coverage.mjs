import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const widths = { thumbnail: 160, standard: 768, large: 1280 };

/** Read-only validation: every published source must have three usable assets.
 * Products with no images keep their existing PDF fallback.
 */
export async function validateProductImageCoverage({ catalog, manifest, publicRoot }) {
  const sources = [...new Set(catalog.products.flatMap(product => product.imagenes))].sort();
  const errors = [];
  let covered = 0;
  let assets = 0;
  let bytes = 0;
  if (manifest.schemaVersion !== 1) errors.push("productImageVariants.json: schemaVersion debe ser 1");

  for (const source of sources) {
    const variants = manifest.images?.[source];
    if (!variants) {
      errors.push(`${source}: faltan variantes thumbnail, standard y large`);
      continue;
    }
    const previousErrors = errors.length;
    for (const [name, maxWidth] of Object.entries(widths)) {
      const variant = variants[name];
      const label = `${source} [${name}]`;
      if (!variant || typeof variant.src !== "string" ||
          !/^catalog\/product-images\/[^/\\]+\.webp$/.test(variant.src)) {
        errors.push(`${label}: entrada ausente o ruta WebP inválida`);
        continue;
      }
      try {
        const target = path.join(publicRoot, variant.src);
        // Read a buffer so libvips does not retain file handles on Windows.
        const [file, contents] = await Promise.all([stat(target), readFile(target)]);
        const metadata = await sharp(contents).metadata();
        if (!file.isFile() || metadata.format !== "webp" ||
            !metadata.width || !metadata.height ||
            Math.max(metadata.width, metadata.height) > maxWidth ||
            variant.width !== metadata.width || variant.height !== metadata.height ||
            variant.bytes !== file.size || file.size === 0) {
          errors.push(`${label}: archivo, dimensiones o peso no coinciden con el manifiesto (${variant.src})`);
          continue;
        }
        assets += 1;
        bytes += file.size;
      } catch {
        errors.push(`${label}: derivado inexistente o ilegible (${variant.src})`);
      }
    }
    if (errors.length === previousErrors) covered += 1;
  }
  return { products: catalog.products.length, sources: sources.length, covered,
    missing: sources.length - covered, assets, bytes,
    withoutImages: catalog.products.filter(product => product.imagenes.length === 0).map(product => product.id), errors };
}

export async function checkProductImageCoverage(root) {
  const [catalog, manifest] = await Promise.all([
    readFile(path.join(root, "generated/products.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "src/data/productImageVariants.json"), "utf8").then(JSON.parse),
  ]);
  return validateProductImageCoverage({ catalog, manifest, publicRoot: path.join(root, "public") });
}
