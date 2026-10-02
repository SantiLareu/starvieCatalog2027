import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

// Run npm run build before using this configuration.
export default defineConfig(config, {
  metadata: { productionPreview: true },
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
