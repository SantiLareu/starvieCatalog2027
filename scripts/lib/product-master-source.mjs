import { readFile } from "node:fs/promises";
import path from "node:path";

/** Runtime paths remain real public URLs; high-quality build inputs live outside
 * public so Vite never copies editing masters into the production artifact. */
export async function productMasterSources(root) {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "source-assets/product-masters/manifest.json"), "utf8"));
    return new Map(manifest.files.filter(file => file.runtimePath).map(file => [file.runtimePath, file]));
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

export function productBuildSource(root, relative, masters) {
  const master = masters.get(relative);
  const allowedRoot = path.resolve(root, master ? "source-assets/product-masters" : "public");
  const target = path.resolve(root, master ? master.masterPath : path.join("public", relative));
  if (!target.startsWith(allowedRoot + path.sep)) throw new Error(`Imagen fuente fuera de su directorio: ${relative}`);
  return { target, identity: master?.canonicalSource ?? relative };
}
