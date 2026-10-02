import { expect, test, type Page } from "@playwright/test";

const full = "/catalog/pages/page-17.webp";
const thumbnail = "/catalog/thumbnails/page-17.webp";
const image17 = (page: Page) => page.locator('[data-catalog-page="17"]');

async function goTo(page: Page, number: number) {
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill(String(number));
  await page.locator(".page-picker button").click();
  await expect(page.getByTestId("page-indicator")).toContainText(String(number));
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
}

async function interceptDecode(page: Page, mode: "hold" | "reject-loaded" | "reject-early" | "unavailable") {
  await page.addInitScript(mode => {
    const audit = { entries: [] as { ready: boolean; release?: () => void }[], promotions: 0, rejected: 0 };
    (window as any).pageImageAudit = audit;
    const nativeDecode = HTMLImageElement.prototype.decode;
    if (mode === "unavailable") {
      Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: undefined });
    } else {
      HTMLImageElement.prototype.decode = function () {
        if (this.isConnected || !this.src.endsWith("/catalog/pages/page-17.webp")) return nativeDecode.call(this);
        const entry: { ready: boolean; release?: () => void } = { ready: false };
        audit.entries.push(entry);
        if (mode === "reject-early") {
          audit.rejected++;
          return Promise.reject(new DOMException("Simulated decode failure", "EncodingError"));
        }
        return nativeDecode.call(this).then(() => {
          entry.ready = true;
          if (mode === "reject-loaded") {
            audit.rejected++;
            throw new DOMException("Simulated decode failure after load", "EncodingError");
          }
          return new Promise<void>(resolve => { entry.release = resolve; });
        });
      };
    }
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type !== "attributes") continue;
        const image = record.target as HTMLImageElement;
        if (image.dataset.catalogPage === "17" && image.getAttribute("src") === "/catalog/pages/page-17.webp") audit.promotions++;
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["src"] });
  }, mode);
}

async function expectPaintableThumbnail(page: Page) {
  await expect(image17(page)).toHaveAttribute("src", thumbnail);
  await expect.poll(() => image17(page).evaluate(image => {
    const img = image as HTMLImageElement;
    return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
  })).toBe(true);
}

async function expectFull(page: Page) {
  await expect(image17(page)).toHaveAttribute("src", full);
  await expect.poll(() => image17(page).evaluate(image => {
    const img = image as HTMLImageElement;
    return img.complete && img.naturalWidth === 1920 && img.naturalHeight > 0;
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).pageImageAudit.promotions)).toBe(1);
}

test("conserva el thumbnail después de load y promueve una sola vez al resolver decode", async ({ page }) => {
  await interceptDecode(page, "hold");
  await page.goto("/");
  await goTo(page, 17);
  await expect.poll(() => page.evaluate(() => {
    const entries = (window as any).pageImageAudit.entries;
    return entries.length > 0 && entries.every((entry: { ready: boolean }) => entry.ready);
  })).toBe(true);
  // La full ya cargó y el decode nativo terminó, pero la promesa pública sigue pendiente.
  await expectPaintableThumbnail(page);
  await page.evaluate(() => (window as any).pageImageAudit.entries.forEach((entry: { release: () => void }) => entry.release()));
  await expectFull(page);
  await page.screenshot({ path: test.info().outputPath("page17-ready.png") });
});

test("el cleanup invalida las promociones pendientes y una nueva visita se recupera", async ({ page }) => {
  await interceptDecode(page, "hold");
  await page.goto("/");
  await goTo(page, 17);
  await expect.poll(() => page.evaluate(() => (window as any).pageImageAudit.entries.filter((entry: { ready: boolean }) => entry.ready).length)).toBeGreaterThan(0);
  const oldCount = await page.evaluate(() => (window as any).pageImageAudit.entries.length);
  await goTo(page, 23);
  await page.evaluate(count => (window as any).pageImageAudit.entries.slice(0, count).forEach((entry: { release?: () => void }) => entry.release?.()), oldCount);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expectPaintableThumbnail(page);
  await goTo(page, 17);
  await expect.poll(() => page.evaluate(() => (window as any).pageImageAudit.entries.every((entry: { ready: boolean }) => entry.ready))).toBe(true);
  await page.evaluate(() => (window as any).pageImageAudit.entries.forEach((entry: { release?: () => void }) => entry.release?.()));
  await expectFull(page);
});

for (const mode of ["unavailable", "reject-loaded"] as const) {
  test(`promueve una full cargada utilizable cuando decode está ${mode}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await interceptDecode(page, mode);
    await page.goto("/");
    await goTo(page, 17);
    await expectFull(page);
    if (mode === "reject-loaded") expect(await page.evaluate(() => (window as any).pageImageAudit.rejected)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test("si decode rechaza antes de load, conserva el thumbnail hasta que termine la carga", async ({ page }) => {
  await interceptDecode(page, "reject-early");
  let release!: () => void;
  const loading = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${full}`, async route => { await loading; await route.continue(); });
  try {
    await page.goto("/");
    await goTo(page, 17);
    await expect.poll(() => page.evaluate(() => (window as any).pageImageAudit.rejected)).toBeGreaterThan(0);
    await expectPaintableThumbnail(page);
    release();
    await expectFull(page);
  } finally { release(); }
});

for (const status of [404, 200]) {
  test(`conserva el thumbnail si la full falla (${status === 404 ? "HTTP" : "datos inválidos"}) y recupera al reintentar`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(`**${full}`, route => route.fulfill({ status, contentType: "image/webp", body: "Invalid image" }));
    await page.goto("/");
    await goTo(page, 17);
    await expectPaintableThumbnail(page);
    await page.unroute(`**${full}`);
    await goTo(page, 23);
    await goTo(page, 17);
    await expect(image17(page)).toHaveAttribute("src", full);
    await expect.poll(() => image17(page).evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 1920)).toBe(true);
    expect(errors).toEqual([]);
  });
}
