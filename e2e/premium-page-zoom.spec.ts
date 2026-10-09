import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "Premium phone portrait gesture tests");
  await page.route("**/api/orders", route => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
});
async function ready(page: Page, number: number) {
  await expect(page.getByTestId("page-indicator")).toHaveText(`${number} / 39`);
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  const article = page.getByRole("article", { name: `Página ${number}, edición vertical StarVie`, exact: true });
  await expect(article).toBeVisible();
  await article.locator(".mobile-premium-product-page__hero img").evaluate(async el => { await (el as HTMLImageElement).decode(); });
  return article.locator("..");
}
async function pinch(page: Page, context: BrowserContext, viewport: Locator, factor: number, drainLastFinger = false) {
  const box = (await viewport.boundingBox())!, x = box.x + box.width * .55, y = box.y + box.height * .42;
  const cdp = await context.newCDPSession(page);
  const points = (distance: number) => [{ id: 1, x: x - distance / 2, y }, { id: 2, x: x + distance / 2, y }];
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [points(60)[0]] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(60) });
    for (const fraction of [.2, .4, .6, .8, 1]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(60 * (1 + (factor - 1) * fraction)) });
      await page.waitForTimeout(40);
    }
    if (drainLastFinger) {
      const remaining = points(60 * factor)[1];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [remaining] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...remaining, x: remaining.x - 120 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await cdp.detach(); }
  return { x: x - box.x, y: y - box.y, width: box.width, height: box.height };
}
async function pan(page: Page, context: BrowserContext, viewport: Locator, dx: number, dy: number) {
  const box = (await viewport.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 3, x, y }] });
    for (const fraction of [.2, .5, .75, 1]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 3, x: x + dx * fraction, y: y + dy * fraction }] });
      await page.waitForTimeout(40);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await cdp.detach(); }
}
async function jump(page: Page, number: number) {
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill(String(number));
  await page.locator(".page-picker button").click();
}
const chrome = (page: Page) => page.locator(".catalog-toolbar,.page-controls,.mobile-gesture-hint")
  .evaluateAll(elements => elements.map(el => ({ html: el.outerHTML, box: el.getBoundingClientRect().toJSON() })));
const view = (viewport: Locator) => viewport.evaluate(el => ({ scale: Number((el as HTMLElement).dataset.zoom), x: Number((el as HTMLElement).dataset.panX), y: Number((el as HTMLElement).dataset.panY) }));

for (const product of [{ number: 15, id: "eternal", name: "Eternal", images: 5 }, { number: 17, id: "raptor+", name: "Raptor+", images: 4 }]) {
  test(`${product.name}: anchored pinch, bounded pan, no shell/browser zoom or residual click, reset restores native swipe`, async ({ page, context }, testInfo) => {
    await page.goto(`/?mobile-pilot=${product.number}`);
    const viewport = await ready(page, product.number), beforeChrome = await chrome(page);
    const originalLeaf = (await viewport.locator("article").boundingBox())!;
    const midpoint = await pinch(page, context, viewport, 2);
    await expect(viewport).toHaveAttribute("data-zoom", "2.00");
    const zoomed = await view(viewport);
    expect((midpoint.x - zoomed.x) / zoomed.scale).toBeCloseTo(midpoint.x, 0);
    expect((midpoint.y - zoomed.y) / zoomed.scale).toBeCloseTo(midpoint.y, 0);
    expect(await chrome(page)).toEqual(beforeChrome);
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
    await pan(page, context, viewport, -80, -75);
    const moved = await view(viewport);
    expect(moved.x).toBeLessThan(zoomed.x); expect(moved.y).toBeLessThan(zoomed.y);
    await viewport.locator(`[data-product-id="${product.id}"]`).first().dispatchEvent("click", { detail: 1 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("page-indicator")).toHaveText(`${product.number} / 39`);
    await pan(page, context, viewport, -120, -180);
    const bounded = await view(viewport);
    expect(bounded.x).toBeGreaterThanOrEqual(-midpoint.width); expect(bounded.y).toBeGreaterThanOrEqual(-midpoint.height);
    mkdirSync("tmp/premium-zoom-review", { recursive: true });
    const path = `tmp/premium-zoom-review/p${product.number}-zoom-pan.png`;
    await page.screenshot({ path, animations: "disabled" }); await testInfo.attach("Leaf-only zoom/pan", { path, contentType: "image/png" });
    await viewport.getByRole("button", { name: "Restablecer zoom de la hoja", exact: true }).tap();
    await expect(viewport).toHaveAttribute("data-zoom", "1.00");
    expect(await viewport.locator("article").boundingBox()).toEqual(originalLeaf);
    await expect(viewport.getByRole("button", { name: "Restablecer zoom de la hoja" })).toHaveCount(0);
    await pan(page, context, viewport, -145, 0);
    await expect(page.getByTestId("page-indicator")).toHaveText(`${product.number + 1} / 39`);
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test(`${product.name}: zoomed product/Explore/bag taps keep the original modal and reset on open/close`, async ({ page, context }) => {
    await page.goto(`/?mobile-pilot=${product.number}`);
    const viewport = await ready(page, product.number);
    const originalCart = await page.evaluate(() => localStorage.getItem("starvie-cart-v1"));
    for (const control of ["hero", "product-button", "explore"]) {
      await pinch(page, context, viewport, 2); await expect(viewport).toHaveAttribute("data-zoom", "2.00");
      if (control === "product-button") await pan(page, context, viewport, -135, 180);
      if (control === "explore") await pan(page, context, viewport, 0, -280);
      const action = viewport.locator(`.mobile-premium-product-page__${control}`);
      const box = (await action.boundingBox())!, band = (await viewport.boundingBox())!;
      const x = (Math.max(box.x, band.x + 5) + Math.min(box.x + box.width, band.x + band.width - 5)) / 2;
      const y = (Math.max(box.y, band.y + 5) + Math.min(box.y + box.height, band.y + band.height - 5)) / 2;
      await page.touchscreen.tap(x, y);
      const dialog = page.getByRole("dialog", { name: product.name, exact: true });
      await expect(dialog).toHaveClass("product-modal");
      await expect(dialog.getByRole("button", { name: /Ver imagen/ })).toHaveCount(product.images);
      await expect(dialog.locator('img[src*="/hero/"]')).toHaveCount(0);
      await expect(viewport).toHaveAttribute("data-zoom", "1.00");
      await dialog.getByRole("button", { name: "Cerrar ficha", exact: true }).tap();
      await expect(dialog).toHaveCount(0); await expect(viewport).toHaveAttribute("data-zoom", "1.00");
      expect(await page.evaluate(() => localStorage.getItem("starvie-cart-v1"))).toBe(originalCart);
    }
  });

  test(`${product.name}: clamps to 2.5x, pinch-out to 1x drains its last finger and resets across pages/devices`, async ({ page, context }) => {
    await page.goto(`/?mobile-pilot=${product.number}`);
    const viewport = await ready(page, product.number);
    await pinch(page, context, viewport, 3); await expect(viewport).toHaveAttribute("data-zoom", "2.50");
    await pinch(page, context, viewport, .25, true); await expect(viewport).toHaveAttribute("data-zoom", "1.00");
    await expect(page.getByTestId("page-indicator")).toHaveText(`${product.number} / 39`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await pinch(page, context, viewport, 2);
    await jump(page, product.number === 15 ? 17 : 15);
    const other = await ready(page, product.number === 15 ? 17 : 15);
    await expect(other).toHaveAttribute("data-zoom", "1.00");
    await jump(page, product.number); await ready(page, product.number);
    await expect(viewport).toHaveAttribute("data-zoom", "1.00");
    await pinch(page, context, viewport, 2);
    await page.getByRole("button", { name: "Página siguiente", exact: true }).tap();
    await expect.poll(() => page.getByTestId("page-flip-engine").locator("[data-premium-zoom-viewport]")
      .evaluateAll(nodes => nodes.every(el => (el as HTMLElement).dataset.zoom === "1.00"))).toBe(true);
    await expect(page.getByTestId("page-indicator")).toHaveText(`${product.number + 1} / 39`);
    await jump(page, product.number); await ready(page, product.number);
    await expect(viewport).toHaveAttribute("data-zoom", "1.00");
    await pinch(page, context, viewport, 2);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId("mobile-premium-viewport")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(await ready(page, product.number)).toHaveAttribute("data-zoom", "1.00");
  });
}

test("a second finger retracts an already-started native fold before owning pinch", async ({ page, context }) => {
  await page.goto("/?mobile-pilot=17"); const viewport = await ready(page, 17);
  const band = (await viewport.boundingBox())!, x = band.x + band.width * .6, y = band.y + band.height * .45;
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: x - 100, y }] });
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "user_fold");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: x - 100, y }, { id: 2, x: x + 20, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: x - 140, y }, { id: 2, x: x + 60, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await cdp.detach(); }
  await expect.poll(async () => Number(await viewport.getAttribute("data-zoom"))).toBeGreaterThan(1.4);
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await expect(page.getByTestId("page-indicator")).toHaveText("17 / 39");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
