import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { productMasterSources } from "./lib/product-master-source.mjs";

const root = process.cwd();
const masters = await productMasterSources(root);
for (const [relative, record] of masters) {
  const target = path.resolve(root, "public", relative);
  if (!target.startsWith(path.join(root, "public/products") + path.sep)) throw new Error(`Destino inválido: ${relative}`);
  const file = await readFile(target);
  const metadata = await sharp(file).metadata();
  const checksum = createHash("sha256").update(file).digest("hex");
  if (checksum !== record.optimizedSha256 || file.length !== record.optimizedBytes || metadata.format !== "webp" ||
      metadata.width !== record.width || metadata.height !== record.height || metadata.hasAlpha !== record.alpha)
    throw new Error(`Original web distinto del aprobado: ${relative}`);
  const profile = metadata.icc ? createHash("sha256").update(metadata.icc).digest("hex") : null;
  if (profile !== record.iccSha256) throw new Error(`Perfil ICC alterado: ${relative}`);
}
console.log(`Originales web aprobados: ${masters.size}; masters de edición excluidos de public.`);
