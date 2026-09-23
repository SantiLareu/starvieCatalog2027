/**
 * Importador comercial de StarVie 2027.
 *
 * Pipeline reproducible:
 *   catalog/products.xlsx → generated/products.json + generated/products-version.json
 *                            → public/products.json + public/products-version.json
 *
 * La versión es el SHA-256 de los bytes exactos escritos en products.json:
 * la misma entrada produce siempre los mismos archivos (sin timestamps).
 *
 * Uso:
 *   node scripts/import-products.mjs [catalog/products.xlsx] [--check] [--check-images]
 *   --check: valida sin escribir; falla si generated/ no está actualizado.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ExcelJS from "exceljs";
import {
  REQUIRED_HEADERS,
  buildCatalogVersion,
  serializeCatalog,
  serializeCatalogVersion,
  validateRows,
} from "./lib/products-model.mjs";

const repoRoot = process.cwd();
const DEFAULT_INPUT = path.join(repoRoot, "catalog", "products.xlsx");
const GENERATED_DIR = path.join(repoRoot, "generated");
const PUBLIC_DIR = path.join(repoRoot, "public");

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, check: false, checkImages: false };
  for (const arg of argv) {
    if (arg === "--check") options.check = true;
    else if (arg === "--check-images") options.checkImages = true;
    else if (arg.startsWith("--")) throw new Error(`Argumento desconocido: ${arg}`);
    else options.input = path.resolve(repoRoot, arg);
  }
  return options;
}

async function readRows(inputPath) {
  if (!existsSync(inputPath)) {
    throw new Error(`No existe el Excel: ${inputPath}`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);
  const sheet = workbook.getWorksheet("Productos");
  if (!sheet) {
    const names = workbook.worksheets.map((s) => s.name).join(", ") || "(ninguna)";
    throw new Error(`Falta la hoja "Productos" (hojas: ${names}).`);
  }
  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? "").trim();
  });
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(`Faltan columnas en "Productos": ${missing.join(", ")}.`);
  }
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    headers.forEach((header, col) => {
      if (!header) return;
      const value = row.getCell(col + 1).value;
      record[header] =
        value && typeof value === "object" && "text" in value ? value.text : value;
    });
    if (Object.values(record).every((v) => v === null || v === undefined || String(v).trim() === "")) {
      return; // fila totalmente vacía
    }
    rows.push(record);
  });
  return rows;
}

async function listPublicFiles() {
  const files = new Set();
  async function walk(dir, prefix) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(full, rel);
      else if (entry.isFile()) files.add(rel);
    }
  }
  await walk(PUBLIC_DIR, "");
  return files;
}

function sha256Hex(contents) {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

/**
 * Contención física: la ruta del Excel (relativa, con "/") debe resolver
 * dentro de public/products/. No depende solo de la regex del modelo:
 * normaliza contra el filesystem real y rechaza cualquier escape.
 */
function escapesProductsRoot(relativePosix) {
  const productsRoot = path.join(PUBLIC_DIR, "products");
  const resolved = path.resolve(PUBLIC_DIR, ...relativePosix.split("/"));
  return resolved !== productsRoot && !resolved.startsWith(productsRoot + path.sep);
}

async function writeIfChanged(filePath, contents) {
  let current = null;
  try {
    current = await readFile(filePath, "utf8");
  } catch {
    current = null;
  }
  if (current !== contents) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
    return true;
  }
  return false;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = await readRows(options.input);
  const existingFiles = await listPublicFiles();
  const { products, errors, warnings } = validateRows(rows, { existingFiles });
  for (const product of products) {
    for (const image of product.imagenes) {
      if (escapesProductsRoot(image)) {
        errors.push(`"${product.id}": la imagen "${image}" sale de public/products/.`);
      }
    }
  }

  for (const warning of warnings) console.warn(`advertencia: ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`error: ${error}`);
    console.error(`\nResumen: ${errors.length} error(es), ${warnings.length} advertencia(s). Importación abortada.`);
    process.exitCode = 1;
    return;
  }

  const catalogContents = serializeCatalog(products);
  const versionContents = serializeCatalogVersion(
    buildCatalogVersion(catalogContents, sha256Hex(catalogContents)),
  );

  const generatedCatalog = path.join(GENERATED_DIR, "products.json");
  const generatedVersion = path.join(GENERATED_DIR, "products-version.json");
  const publicCatalog = path.join(PUBLIC_DIR, "products.json");
  const publicVersion = path.join(PUBLIC_DIR, "products-version.json");

  if (options.check) {
    const problems = [];
    for (const [filePath, expected] of [
      [generatedCatalog, catalogContents],
      [generatedVersion, versionContents],
    ]) {
      let current = null;
      try {
        current = await readFile(filePath, "utf8");
      } catch {
        current = null;
      }
      if (current !== expected) problems.push(path.relative(repoRoot, filePath));
    }
    if (problems.length > 0) {
      console.error(`Desactualizado: ${problems.join(", ")}. Ejecutar "npm run import-products".`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `OK: ${products.length} producto(s) validados, generated/ actualizado (${warnings.length} advertencia(s)).`,
    );
    return;
  }

  await writeIfChanged(generatedCatalog, catalogContents);
  await writeIfChanged(generatedVersion, versionContents);
  await writeIfChanged(publicCatalog, catalogContents);
  await writeIfChanged(publicVersion, versionContents);
  // Mantener copias idénticas aunque writeIfChanged ya las sincronizó.
  await copyFile(generatedCatalog, publicCatalog).catch(() => {});
  console.log(
    `OK: ${products.length} producto(s) → generated/products.json + generated/products-version.json (+ copias en public/).`,
  );
  if (warnings.length > 0) console.log(`${warnings.length} advertencia(s) (ver arriba).`);
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
