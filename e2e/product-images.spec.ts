import { expect, test } from "@playwright/test";

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
