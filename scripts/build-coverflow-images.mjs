import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const catalog = JSON.parse(await readFile(path.join(root, "generated/products.json"), "utf8"));
const output = path.join(root, "public/catalog/coverflow");
await mkdir(output, { recursive: true });

const palas = catalog.products.filter((product) =>
  product.categoria.toLowerCase() === "palas" &&
  product.pagina >= 15 && product.pagina <= 26 && product.imagenes[0]
);

for (const product of palas) {
  const sourceName = product.imagenes[0].split("/").at(-1).replace(/\.[^.]+$/, "");
  const slug = `${product.id}--${sourceName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const source = path.resolve(root, "public", product.imagenes[0]);
  const publicRoot = path.resolve(root, "public") + path.sep;
  if (!source.startsWith(publicRoot)) throw new Error(`Ruta de imagen fuera de public: ${product.id}`);
  await sharp(source)
    .resize(820, 820, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80, effort: 5, alphaQuality: 90 })
    .toFile(path.join(output, `${slug}.webp`));
}

console.log(`Coverflow: ${palas.length} imágenes optimizadas.`);
