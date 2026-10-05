import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkProductImageCoverage } from "./lib/product-image-coverage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const { errors, ...summary } = await checkProductImageCoverage(root);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Cobertura de imágenes OK: ${JSON.stringify(summary)}`);
} catch (error) {
  console.error(`No se puede publicar: cobertura de variantes de producto incompleta o inválida.\n${error.message}\nEjecutá npm run build:product-images y revisá los derivados antes de publicar.`);
  process.exitCode = 1;
}
