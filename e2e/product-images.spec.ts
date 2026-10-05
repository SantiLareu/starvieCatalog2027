import { expect, test } from "@playwright/test";

const newProducts = [
  { id: "hard eva black bag", name: "Paletero Hard Eva Black", page: 28 },
  { id: "hard eva eternal", name: "Paletero Hard Eva Eternal", page: 29 },
  { id: "t-one pro", name: "Paletero T-One Pro", page: 30 },
  { id: "m hard eva black", name: "Mochila Hard Eva Black", page: 34 },
  { id: "black cap", name: "Black Cap", page: 38 },
  { id: "muñequera Wristband white", name: "WristBand White", page: 38 },
];

for (const product of newProducts) {
  test(`${product.name}: apertura en frío sin originales`, async ({ page }, testInfo) => {
    const originals: string[] = [];
    const requested: string[] = [];
    page.on("request", request => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith("/products/")) originals.push(request.url());
      if (pathname.startsWith("/catalog/product-images/")) requested.push(request.url());
    });
    // These tests only view products; never allow commercial traffic.
    await page.route("https://api.real-step.com.ar/**", route => route.abort());
    await page.goto("/");
    await page.getByTestId("page-indicator").click();
    await page.locator("#page-number").fill(String(product.page));
    await page.locator(".page-picker button[type='submit']").click();
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
    const hotspot = page.locator(`[data-product-id="${product.id}"]:visible`).first();
    const dialog = page.getByRole("dialog", { name: product.name, exact: true });
    await page.evaluate(() => performance.clearResourceTimings());
    await expect(async () => {
      await hotspot.click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 12_000 });
    const main = dialog.locator('.product-image-viewport img:not([aria-hidden="true"])');
    await expect.poll(() => main.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(main).toHaveAttribute("srcset", /-768\.webp 768w, .*?-1280\.webp 1280w/);
    await expect.poll(() => dialog.locator(".gallery-thumbs img").evaluateAll(images => images.length > 0 && images.every(img => {
      const image = img as HTMLImageElement;
      return image.complete && image.naturalWidth > 0 && new URL(image.currentSrc).pathname.endsWith("-160.webp");
    }))).toBe(true);
    const resources = await page.evaluate(() => (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter(entry => new URL(entry.name).pathname.startsWith("/catalog/product-images/"))
      .map(entry => ({ asset: new URL(entry.name).pathname.split("/").at(-1), bytes: entry.encodedBodySize, transfer: entry.transferSize })));
    const initialBytes = resources.reduce((sum, resource) => sum + resource.bytes, 0);
    console.log(`NEW PRODUCT IMAGE ${testInfo.project.name} ${product.name}: ${JSON.stringify({ initialBytes, resources })}`);
    expect(resources.length).toBeGreaterThan(1);
    expect(initialBytes).toBeGreaterThan(0);
    expect(initialBytes).toBeLessThan(1_000_000);
    expect(originals).toEqual([]);
    expect(requested.filter(url => /-(768|1280)\.webp$/.test(url))).toHaveLength(1);
    await expect.poll(() => main.evaluate(img => (img as HTMLImageElement).currentSrc)).toMatch(/-(768|1280)\.webp$/);
    await dialog.screenshot({ path: testInfo.outputPath("new-product-derivatives.png") });

    // Selecting a second view loads one more responsive image, not its original.
    await dialog.getByRole("button", { name: "Ver imagen 2", exact: true }).click();
    await expect(main).toHaveAttribute("alt", /imagen 2 de/);
    await expect.poll(() => main.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect.poll(() => requested.filter(url => /-(768|1280)\.webp$/.test(url)).length).toBe(2);
    expect(originals).toEqual([]);
  });
}

test("ficha en frío usa derivados; originales solo para zoom y fallback", async ({ page, context }, testInfo) => {
  const originalRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (request.url().includes("/products/palas/")) originalRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("15");
  await page.locator(".page-picker button").click();
  await expect(page.getByTestId("page-indicator")).toContainText("15");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: 500000, uploadThroughput: 500000 });
  await page.evaluate(() => { performance.clearResourceTimings(); (window as any).imageAuditStart = performance.now(); });
  const hotspot = page.locator('.catalog-leaf[data-book-index="15"] [data-product-id="eternal"]').first();
  await hotspot.click();
  const main = page.locator('.product-image-viewport img:not([aria-hidden="true"])');
  await expect.poll(() => main.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await main.evaluate(img => (img as HTMLImageElement).decode());
  const result = await page.evaluate(() => ({
    ms: Math.round(performance.now() - (window as any).imageAuditStart),
    source: (document.querySelector(".product-image-viewport img") as HTMLImageElement).currentSrc,
    requests: (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter(entry => entry.name.includes("/catalog/product-images/"))
      .map(entry => ({ asset: entry.name.split("/").at(-1), bytes: entry.encodedBodySize, ms: Math.round(entry.duration) })),
  }));
  console.log(`PRODUCT IMAGE ${testInfo.project.name}: ${JSON.stringify(result)}`);
  expect(result.source).toMatch(/-(768|1280)\.webp$/);
  expect(result.source).toContain("/catalog/product-images/");
  await expect.poll(() => page.locator(".gallery-thumbs img").evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0 && (img as HTMLImageElement).naturalWidth <= 160))).toBe(true);
  expect(originalRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("product-derivatives.png") });

  // Gallery changes select only another responsive main, never an original.
  await page.getByRole("button", { name: "Ver imagen 2", exact: true }).click();
  await expect(main).toHaveAttribute("alt", /imagen 2 de 5/);
  await expect.poll(() => main.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
  expect(originalRequests).toEqual([]);
  await page.getByRole("button", { name: "Acercar imagen", exact: true }).click();
  await expect.poll(() => main.evaluate(img => (img as HTMLImageElement).currentSrc)).toContain("/products/palas/ETERNAL/ETERNAL1.3.webp");
  // naturalWidth is density-corrected for responsive sources on mobile.
  // Validate the loaded original URL and decode, rather than CSS-pixel size.
  await expect.poll(() => main.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0), { timeout: 20000 }).toBe(true);
  await main.evaluate(img => (img as HTMLImageElement).decode());
  expect(originalRequests).toHaveLength(1);
  await page.getByRole("button", { name: "Cerrar ficha", exact: true }).click();

  // Missing assets: main and thumbnail must still recover independently.
  await page.route("**/catalog/product-images/**", route => route.fulfill({ status: 404, body: "Missing derivative" }));
  await hotspot.click();
  await expect.poll(() => main.evaluate(img => (img as HTMLImageElement).currentSrc)).toContain("/products/palas/ETERNAL/ETERNAL1.4.webp");
  await expect.poll(() => main.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0), { timeout: 20000 }).toBe(true);
  await main.evaluate(img => (img as HTMLImageElement).decode());
  await expect.poll(() => page.locator(".gallery-thumbs img").evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)), { timeout: 25000 }).toBe(true);
  expect(await main.evaluate(img => (img as HTMLImageElement).currentSrc)).toContain("/products/palas/ETERNAL/ETERNAL1.4.webp");
  expect(errors).toEqual([]);
});
