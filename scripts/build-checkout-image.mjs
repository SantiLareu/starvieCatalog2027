import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public/checkout/checkout-hero-raptor.png");
const target = path.join(root, "public/checkout/checkout-hero-raptor.webp");

const result = await sharp(source)
  .resize({ width: 768, withoutEnlargement: true })
  .webp({ quality: 84, effort: 6 })
  .toFile(target);

console.log(`${path.relative(root, target)}: ${result.width}×${result.height}, ${result.size} bytes`);
