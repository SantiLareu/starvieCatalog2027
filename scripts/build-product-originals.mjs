import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { productMasterSources, productBuildSource } from "./lib/product-master-source.mjs";

// Rebuild only archived 16-bit masters' web originals. Existing responsive
// 160/768/1280 variants are rebuilt separately by build-product-images.mjs.
const root = process.cwd();
const masters = await productMasterSources(root);
if (masters.size === 0) throw new Error("No hay masters registrados en source-assets/product-masters/manifest.json");
sharp.concurrency(2);
for (const [relative, master] of masters) {
  const { target: source } = productBuildSource(root, relative, masters);
  const input = await readFile(source);
  if (createHash("sha256").update(input).digest("hex") !== master.sha256) throw new Error(`Master modificado: ${source}`);
  const output = await sharp(input).keepIccProfile().webp({ lossless: true, quality: 75, effort: 3, alphaQuality: 100 }).toBuffer();
  const target = path.resolve(root, "public", relative);
  if (!target.startsWith(path.join(root, "public/products") + path.sep)) throw new Error(`Destino inválido: ${relative}`);
  // Keep the source ICC rather than indiscriminately converting AdobeRGB or
  // untagged originals to sRGB. Every output keeps dimensions and all alpha.
  const original = await sharp(input).keepIccProfile().raw().toBuffer({ resolveWithObject: true });
  const encoded = await sharp(output).keepIccProfile().raw().toBuffer({ resolveWithObject: true });
  if (original.info.width !== encoded.info.width || original.info.height !== encoded.info.height || original.info.channels !== encoded.info.channels)
    throw new Error(`Geometría alterada: ${relative}`);
  const channels = original.info.channels;
  for (let p = 0; p < original.data.length; p += channels) {
    const alpha = channels === 4 ? original.data[p + 3] : 255;
    if (channels === 4 && alpha !== encoded.data[p + 3]) throw new Error(`Alpha alterado: ${relative}`);
    if (alpha > 0) for (let c = 0; c < 3; c++) {
      if (original.data[p + c] !== encoded.data[p + c]) throw new Error(`Píxel visible alterado: ${relative}`);
    }
  }
  if (createHash("sha256").update(output).digest("hex") !== master.optimizedSha256)
    throw new Error(`La codificación difiere del original web aprobado: ${relative}`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, output);
  console.log(`${relative}: ${input.length} → ${output.length} bytes`);
}
