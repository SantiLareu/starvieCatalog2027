import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// The published catalog remains the only product source. This manifest only
// maps existing image paths to assets; it contains no commercial information.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const outputRelative = "catalog/product-images";
const output = path.join(publicRoot, outputRelative);
const catalog = JSON.parse(await readFile(path.join(root, "generated/products.json"), "utf8"));
const sources = [...new Set(catalog.products.flatMap(product => product.imagenes))].sort();
const widths = { thumbnail: 160, standard: 768, large: 1280 };
const encoding = { quality: 88, alphaQuality: 100, effort: 5 };
const images = {};
const totals = { original: 0, thumbnail: 0, standard: 0, large: 0 };
await mkdir(output, { recursive: true });

for (const relative of sources) {
  const source = path.resolve(publicRoot, relative);
  if (!source.startsWith(publicRoot + path.sep)) throw new Error(`Imagen fuera de public: ${relative}`);
  const input = await readFile(source);
  const metadata = await sharp(input).metadata();
  const id = createHash("sha256").update(relative).update(input)
    .update(JSON.stringify({ widths, encoding })).digest("hex").slice(0, 16);
  const variants = {};
  totals.original += input.length;
  for (const [variant, size] of Object.entries(widths)) {
    const filename = `${id}-${size}.webp`;
    const target = path.join(output, filename);
    await sharp(input).rotate().resize(size, size, { fit: "inside", withoutEnlargement: true })
      .webp(encoding).toFile(target);
    const result = await sharp(target).metadata();
    const bytes = (await stat(target)).size;
    if (metadata.hasAlpha && !result.hasAlpha) throw new Error(`Canal alfa perdido: ${relative}`);
    variants[variant] = { src: `${outputRelative}/${filename}`, width: result.width, height: result.height, bytes };
    totals[variant] += bytes;
  }
  images[relative] = variants;
}

await writeFile(path.join(root, "src/data/productImageVariants.json"),
  JSON.stringify({ schemaVersion: 1, images }, null, 2) + "\n");
console.log(JSON.stringify({ images: sources.length, assets: sources.length * 3, bytes: totals,
  derivedTotal: totals.thumbnail + totals.standard + totals.large }, null, 2));
