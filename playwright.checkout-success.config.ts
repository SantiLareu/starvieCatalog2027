import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Isolated UI fixture: public Turnstile test key, mocked widget and intercepted orders.
export default defineConfig({
  ...base,
  testMatch: "checkout-success.spec.ts",
  outputDir: "./test-results/checkout-confirmation",
  use: { ...base.use, baseURL: "http://127.0.0.1:5185" },
  webServer: {
    command: "npm run dev -- --port 5185 --strictPort",
    url: "http://127.0.0.1:5185",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_TURNSTILE_ENABLED: "true", VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" },
  },
});
