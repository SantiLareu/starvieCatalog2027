/**
 * Versión de la app (frontend): SHA-256 sobre el contenido de los archivos
 * fuente. Cambia cuando cambia JS/CSS/componentes/lógica, no con datos.
 * Concepto tomado de Head (scripts/app-version.mjs), adaptado a StarVie.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_DIRS = ["src"];
const SOURCE_FILES = ["index.html", "package.json", "vite.config.ts"];

async function collect(dir, files) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test") continue;
      await collect(full, files);
    } else if (entry.isFile() && !full.endsWith(".test.ts") && !full.endsWith(".test.tsx")) {
      files.push(full);
    }
  }
}

export async function createAppVersion(repoRoot) {
  const files = [];
  for (const dir of SOURCE_DIRS) await collect(path.join(repoRoot, dir), files);
  for (const file of SOURCE_FILES) files.push(path.join(repoRoot, file));
  const rels = files.map((f) => path.relative(repoRoot, f)).sort();
  const hash = createHash("sha256");
  for (const rel of rels) {
    const contents = await readFile(path.join(repoRoot, rel));
    hash.update(rel.replaceAll(path.sep, "/"));
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}
