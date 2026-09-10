import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const projectRoot = process.cwd();
const sourceDirectories = [
  path.join(projectRoot, "references", "starvie-2027"),
  path.join(projectRoot, "starvie-2027"),
];

const sourceDirectory = sourceDirectories.find(existsSync);
if (!sourceDirectory) {
  throw new Error("No se encontró references/starvie-2027/ ni starvie-2027/.");
}

const sourceFiles = await readdir(sourceDirectory);
const pdfName = sourceFiles.find((file) => file.toLowerCase().endsWith(".pdf"));
if (!pdfName) throw new Error(`No se encontró un PDF dentro de ${sourceDirectory}`);

const pdfPath = path.join(sourceDirectory, pdfName);
const publicRoot = path.join(projectRoot, "public", "catalog");
const pagesDirectory = path.join(publicRoot, "pages");
const thumbnailsDirectory = path.join(publicRoot, "thumbnails");
const temporaryDirectory = path.join(projectRoot, "tmp", "pdf-pages");

for (const target of [publicRoot, pagesDirectory, thumbnailsDirectory, temporaryDirectory]) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(projectRoot) + path.sep)) {
    throw new Error(`Ruta de salida fuera del proyecto: ${resolved}`);
  }
}

const executableCandidates = (name) => {
  const executableName = process.platform === "win32" ? `${name}.exe` : name;
  return [
    process.env[`${name.toUpperCase()}_PATH`],
    executableName,
    process.platform === "win32"
      ? path.join(
          os.homedir(),
          ".cache",
          "codex-runtimes",
          "codex-primary-runtime",
          "dependencies",
          "native",
          "poppler",
          "Library",
          "bin",
          executableName,
        )
      : undefined,
  ].filter(Boolean);
};

const findExecutable = (name) => {
  for (const candidate of executableCandidates(name)) {
    try {
      execFileSync(candidate, ["-v"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next supported location.
    }
  }
  throw new Error(`No se encontró ${name}. Instala Poppler o define ${name.toUpperCase()}_PATH.`);
};

const pdftoppm = findExecutable("pdftoppm");
const pdfinfo = findExecutable("pdfinfo");

await mkdir(pagesDirectory, { recursive: true });
await mkdir(thumbnailsDirectory, { recursive: true });
await rm(temporaryDirectory, { recursive: true, force: true });
await mkdir(temporaryDirectory, { recursive: true });

const info = execFileSync(pdfinfo, ["-box", pdfPath], { encoding: "utf8" });
const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
const dimensions = info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
if (!pageCount || !dimensions) throw new Error("No se pudo leer la metadata del PDF.");

const sourceWidth = Number(dimensions[1]);
const sourceHeight = Number(dimensions[2]);
const fullWidth = 1920;
const thumbnailWidth = 480;

execFileSync(
  pdftoppm,
  ["-png", "-scale-to-x", String(fullWidth), "-scale-to-y", "-1", pdfPath, path.join(temporaryDirectory, "page")],
  { stdio: "inherit" },
);

const renderedFiles = (await readdir(temporaryDirectory))
  .filter((file) => /^page-\d+\.png$/i.test(file))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (renderedFiles.length !== pageCount) {
  throw new Error(`Se renderizaron ${renderedFiles.length} páginas, se esperaban ${pageCount}.`);
}

const pages = [];
for (const [index, renderedName] of renderedFiles.entries()) {
  const number = index + 1;
  const fileName = `page-${String(number).padStart(2, "0")}.webp`;
  const renderedPath = path.join(temporaryDirectory, renderedName);
  const outputPath = path.join(pagesDirectory, fileName);
  const thumbnailPath = path.join(thumbnailsDirectory, fileName);

  await sharp(renderedPath)
    .webp({ quality: 84, effort: 5, smartSubsample: true })
    .toFile(outputPath);
  await sharp(renderedPath)
    .resize({ width: thumbnailWidth, withoutEnlargement: true })
    .webp({ quality: 68, effort: 4, smartSubsample: true })
    .toFile(thumbnailPath);

  const [pageStats, thumbnailStats] = await Promise.all([stat(outputPath), stat(thumbnailPath)]);
  pages.push({
    id: `page-${String(number).padStart(2, "0")}`,
    number,
    src: `/catalog/pages/${fileName}`,
    thumbnail: `/catalog/thumbnails/${fileName}`,
    width: fullWidth,
    height: Math.round((fullWidth / sourceWidth) * sourceHeight),
    bytes: pageStats.size,
    thumbnailBytes: thumbnailStats.size,
  });
}

const sourceStats = await stat(pdfPath);
const metadata = {
  title: "StarVie 2027",
  source: path.relative(projectRoot, pdfPath).replaceAll(path.sep, "/"),
  sourceBytes: sourceStats.size,
  pageCount,
  sourcePage: {
    width: sourceWidth,
    height: sourceHeight,
    aspectRatio: sourceWidth / sourceHeight,
  },
  output: {
    format: "webp",
    width: fullWidth,
    quality: 84,
    thumbnailWidth,
    thumbnailQuality: 68,
  },
  pages,
};

await writeFile(path.join(publicRoot, "catalog.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
await rm(temporaryDirectory, { recursive: true, force: true });

const totalBytes = pages.reduce((sum, page) => sum + page.bytes, 0);
const thumbnailBytes = pages.reduce((sum, page) => sum + page.thumbnailBytes, 0);
console.log(`StarVie 2027: ${pageCount} páginas generadas.`);
console.log(`Páginas: ${(totalBytes / 1024 / 1024).toFixed(2)} MB | miniaturas: ${(thumbnailBytes / 1024 / 1024).toFixed(2)} MB`);
