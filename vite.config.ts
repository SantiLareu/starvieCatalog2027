import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Connect } from "vite";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createAppVersion } from "./scripts/lib/app-version.mjs";

type DevResponse = Parameters<Connect.NextHandleFunction>[1];
type DevNext = Parameters<Connect.NextHandleFunction>[2];

const projectRoot = process.cwd();
const appVersion = await createAppVersion(projectRoot);

/**
 * Publica el catálogo comercial generado con caché desactivada en dev
 * y emite copias frescas en dist durante el build.
 */
function publishedCommercePlugin(): Plugin {
  const files = new Map([
    ["/products.json", "generated/products.json"],
    ["/products-version.json", "generated/products-version.json"],
  ]);
  return {
    name: "starvie-commerce",
    configureServer(server) {
      for (const [publicPath, relative] of files) {
        server.middlewares.use(publicPath, async (_request, response: DevResponse, next: DevNext) => {
          try {
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(await readFile(path.join(projectRoot, relative)));
          } catch (error) {
            next(error);
          }
        });
      }
    },
    async generateBundle() {
      for (const [, relative] of files) {
        this.emitFile({
          type: "asset",
          fileName: path.basename(relative),
          source: await readFile(path.join(projectRoot, relative)),
        });
      }
    },
  };
}

/**
 * Manifiesto app-version.json: cambia cuando cambia el frontend.
 * En dev se sirve dinámico; en build se escribe con hashes reales.
 */
function appVersionPlugin(): Plugin {
  return {
    name: "starvie-app-version",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { name: "starvie-app-version", content: appVersion },
          injectTo: "head",
        },
      ];
    },
    configureServer(server) {
      server.middlewares.use("/app-version.json", (_request, response: DevResponse) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(`${JSON.stringify({ schemaVersion: 1, version: appVersion, files: [] })}\n`);
      });
    },
    async writeBundle(options, bundle) {
      const outputRoot = path.resolve(options.dir ?? "dist");
      const readiness = ["index.html"];
      for (const item of Object.values(bundle)) {
        const fileName = item.fileName;
        if (item.type === "chunk" || fileName.endsWith(".css")) readiness.push(fileName);
      }
      readiness.sort();
      const files = [];
      for (const fileName of readiness) {
        const contents = await readFile(path.join(outputRoot, fileName));
        files.push({
          path: fileName,
          size: contents.length,
          sha256: createHash("sha256").update(contents).digest("hex"),
        });
      }
      await writeFile(
        path.join(outputRoot, "app-version.json"),
        `${JSON.stringify({ schemaVersion: 1, version: appVersion, files }, null, 2)}\n`,
        "utf8",
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), publishedCommercePlugin(), appVersionPlugin()],
  define: {
    __STARVIE_APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
