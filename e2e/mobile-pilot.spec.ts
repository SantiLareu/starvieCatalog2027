import { expect, test, type BrowserContext, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test.beforeEach(async ({ page }) => { await page.route("**/api/orders", route => route.abort()); });
async function settled(page: Page, number = 17) {
  await expect(page.getByTestId("page-indicator")).toHaveText(`${number} / 39`);
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
}
async function ready(page: Page) {
  await settled(page);
  const image = page.locator(".mobile-p17-page__hero img");
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(page.locator(".mobile-p17-frame")).toBeVisible();
}
async function goTo(page: Page, number: number) {
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill(String(number));
  await page.locator(".page-picker button").click();
  await settled(page, number);
}
async function swipe(page: Page, context: BrowserContext, target: Locator, dx: number, dy = 0) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x, y }] });
  for (const fraction of [.2, .5, 1]) {
    await page.waitForTimeout(50);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: x + dx * fraction, y: y + dy * fraction }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
async function openProduct(page: Page, explore = false) {
  await page.locator(explore ? ".mobile-p17-page__explore" : ".mobile-p17-page__hero").tap();
  const dialog = page.getByRole("dialog", { name: "Raptor+", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass("product-modal");
  await expect(page.locator(".mobile-v2-sheet")).toHaveCount(0);
  return dialog;
}

async function verticalTouchSwipe(page: Page, context: BrowserContext, dialog: Locator, upward: boolean) {
  // Start on a visible specification, never on an offscreen element's centre
  // or the image stage. Native touch scrolling is the behaviour under test.
  const start = await dialog.locator(".product-details dl").evaluate(el => {
    const specs = el.getBoundingClientRect();
    const modal = el.closest(".product-modal")!.getBoundingClientRect();
    const top = Math.max(specs.top, modal.top + 20);
    const bottom = Math.min(specs.bottom, modal.bottom - 20);
    return { x: specs.left + specs.width / 4, top, bottom };
  });
  expect(start.bottom - start.top).toBeGreaterThan(45);
  const y = upward ? start.bottom - 5 : start.top + 5;
  const dy = upward ? -160 : 160;
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: start.x, y }] });
    for (const fraction of [.15, .3, .5, .75, 1]) {
      await page.waitForTimeout(60); // Real finger movement, not a scroll workaround.
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: start.x, y: y + dy * fraction }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

async function originalDialogFingerprint(dialog: Locator) {
  // Compare the original modal at rest, rather than at different instants of
  // its existing entrance animation (which changes measured scale/position).
  await dialog.evaluate(async el => {
    const backdrop = el.closest(".modal-backdrop") ?? el;
    await Promise.all(backdrop.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
  });
  const image = dialog.locator(".product-image-viewport img");
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(image).not.toHaveClass(/is-pending/);
  return dialog.evaluate(el => {
    const clone = el.cloneNode(true) as HTMLElement;
    // Image decode/loading classes are transient; markup, controls, sources
    // and layout must match the original entry on the same device.
    clone.querySelectorAll("img").forEach(img => img.classList.remove("is-pending", "is-retained"));
    return { html: clone.outerHTML, boxes: [el, ...el.querySelectorAll(".product-image-viewport, .gallery-thumbs, .product-details, .zoom-controls, .purchase-row")].map(node => node.getBoundingClientRect().toJSON()) };
  });
}

async function originalEntryProduct(page: Page) {
  await page.goto("/");
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("17");
  await page.locator(".page-picker button").click();
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await page.locator('[data-product-id="raptor+"]:visible').first().click();
  const dialog = page.getByRole("dialog", { name: "Raptor+", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("same native viewer; custom P17 only on portrait phones, rotation without remount", async ({ page, isMobile }) => {
  await page.goto("/?mobile-pilot=17");
  await expect(page.getByTestId("page-flip-engine")).toBeVisible();
  await page.getByTestId("page-flip-engine").evaluate(el => el.setAttribute("data-instance-probe", "same"));
  if (isMobile) {
    await ready(page);
    await expect(page.locator(".catalog-toolbar, .experience-nav, .page-controls, .mobile-gesture-hint")).toHaveCount(4);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId("mobile-editorial-page")).toHaveCount(0);
    await expect(page.locator(".mobile-p17-frame")).toHaveCount(0);
    await expect(page.locator('img[data-catalog-page="17"]')).toHaveCount(1);
    await expect(page.locator('img[data-catalog-page="17"]')).toHaveAttribute("src", "/catalog/pages/page-17.webp");
    await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
    await page.setViewportSize({ width: 600, height: 900 });
  }
  await expect(page.getByTestId("mobile-editorial-page")).toHaveCount(0);
  await expect(page.locator('img[data-catalog-page="17"]')).toHaveAttribute("data-full-src", "/catalog/pages/page-17.webp");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-instance-probe", "same");
  await page.goto("/?mobile-pilot=27");
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
});

test("no hero request on approved entry, tablet, desktop or phone landscape", async ({ page }) => {
  const heroes: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/hero/")) heroes.push(request.url()); });
  await page.goto("/"); await expect(page.getByTestId("page-flip-engine")).toBeVisible();
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("17");
  await page.locator(".page-picker button").click();
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await expect(page.getByTestId("mobile-editorial-page")).toHaveCount(0);
  await expect(page.locator('img[data-catalog-page="17"]')).toHaveAttribute("data-full-src", "/catalog/pages/page-17.webp");
  for (const viewport of [{ width: 844, height: 390 }, { width: 800, height: 1000 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport); await page.goto("/?mobile-pilot=17");
    await expect(page.getByTestId("page-flip-engine")).toBeVisible();
    await expect(page.getByTestId("mobile-editorial-page")).toHaveCount(0);
  }
  expect(heroes).toEqual([]);
});

test("desktop, tablet and landscape keep the original product markup and geometry", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 1000 }, { width: 600, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    const original = await originalDialogFingerprint(await originalEntryProduct(page));
    await page.goto("/?mobile-pilot=17");
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
    await expect(page.getByTestId("mobile-editorial-page")).toHaveCount(0);
    await page.locator('[data-product-id="raptor+"]:visible').first().click();
    const dialog = page.getByRole("dialog", { name: "Raptor+", exact: true });
    await expect(dialog).toHaveClass("product-modal");
    expect(await dialog.locator(".product-image-viewport").evaluate(el => ({ background: getComputedStyle(el).backgroundColor, radius: getComputedStyle(el).borderRadius })))
      .toEqual({ background: "rgb(241, 242, 242)", radius: "14px" });
    expect(await originalDialogFingerprint(dialog)).toEqual(original);
  }
});

test.describe("P17 leaf in the approved portrait viewer", () => {
  test.use({ deviceScaleFactor: 3 });
  test.beforeEach(({ isMobile }) => { test.skip(!isMobile, "Portrait phones only"); });
  for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 412, height: 915 }]) {
    test(`P17 fills the reading band without changing chrome or overflowing at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto("/"); await goTo(page, 17);
      const exterior = () => page.locator(".catalog-toolbar, .experience-nav, .page-controls, .mobile-gesture-hint")
        .evaluateAll(elements => elements.map(el => ({ html: el.outerHTML, box: el.getBoundingClientRect().toJSON() })));
      const originalExterior = await exterior();
      await page.goto("/?mobile-pilot=17"); await ready(page);
      const header = (await page.locator(".catalog-toolbar").boundingBox())!;
      const guide = (await page.locator(".mobile-gesture-hint").boundingBox())!;
      // Both axes independently fill the measured viewer, regardless of ratio.
      const maximumHeight = guide.y - header.y - header.height;
      const leaf = page.getByTestId("mobile-editorial-page");
      await expect.poll(async () => Math.abs((await leaf.boundingBox())!.height - maximumHeight)).toBeLessThan(1.1);
      const box = (await leaf.boundingBox())!;
      expect(Math.abs(box.x)).toBeLessThan(1.1);
      expect(Math.abs(box.width - viewport.width)).toBeLessThan(1.1);
      expect(Math.abs(box.y - header.y - header.height)).toBeLessThan(1.1);
      expect(Math.abs(box.y + box.height - guide.y)).toBeLessThan(1.1);
      // Individual assets keep their own proportions; all data/CTA remain
      // inside the leaf and the technical rows do not overlap the footer.
      const content = await leaf.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return [...el.querySelectorAll<HTMLElement>("h1, .mobile-p17-page__masthead, .mobile-p17-page__technologies li, .mobile-p17-page__technical, .mobile-p17-page__features, .mobile-p17-page__explore, .mobile-p17-page__folio")]
          .every(node => { const b = node.getBoundingClientRect(); return b.left >= rect.left && b.right <= rect.right + 1 && b.top >= rect.top && b.bottom <= rect.bottom + 1; });
      });
      expect(content).toBe(true);
      const technical = (await leaf.locator(".mobile-p17-page__technical").boundingBox())!;
      const features = (await leaf.locator(".mobile-p17-page__features").boundingBox())!;
      const explore = (await leaf.locator(".mobile-p17-page__explore").boundingBox())!;
      expect(technical.y + technical.height).toBeLessThanOrEqual(features.y);
      expect(features.y + features.height).toBeLessThanOrEqual(explore.y);
      const icon = (await leaf.locator(".mobile-p17-page__technology-icon").first().boundingBox())!;
      expect(icon.width).toBeCloseTo(icon.height, 1);
      const sweetSpot = (await leaf.locator(".mobile-p17-page__sweet-spot").boundingBox())!;
      expect(sweetSpot.width / sweetSpot.height).toBeCloseTo(100 / 156, 2);
      expect(await leaf.locator(".mobile-p17-page__hero img").evaluate(el => ({ fit: getComputedStyle(el).objectFit, transform: getComputedStyle(el).transform })))
        .toEqual({ fit: "contain", transform: "matrix(1, 0, 0, 1, 0, 0)" });
      expect(await exterior()).toEqual(originalExterior);
      expect(await page.evaluate(() => {
        const root = document.scrollingElement!;
        return { vertical: root.scrollHeight > root.clientHeight, horizontal: root.scrollWidth > root.clientWidth };
      })).toEqual({ vertical: false, horizontal: false });
      mkdirSync("tmp/p17-fill-review", { recursive: true });
      const path = `tmp/p17-fill-review/p17-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path });
      await testInfo.attach("P17 fills available size", { path, contentType: "image/png" });
      const metrics = { viewport, dpr: 3, headerBottom: header.y + header.height, pageTop: box.y, pageBottom: box.y + box.height, guideTop: guide.y, leaf: box };
      writeFileSync(`tmp/p17-fill-review/bounds-${viewport.width}x${viewport.height}.json`, JSON.stringify(metrics, null, 2));
      await page.evaluate(({ headerBottom, pageTop, pageBottom, guideTop }) => {
        const overlay = document.createElement("div"); overlay.id = "p17-review-bounds"; overlay.setAttribute("aria-hidden", "true"); overlay.inert = true;
        for (const [label, y, color, side, above] of [
          ["HEADER bottom", headerBottom, "#ff7b73", "left", true],
          ["P17 top", pageTop, "#6de6ff", "right", false],
          ["P17 bottom", pageBottom, "#ffd36e", "left", true],
          ["GUÍA top", guideTop, "#76ffa2", "right", false],
        ] as const) {
          const line = document.createElement("div");
          line.style.cssText = `position:fixed;left:0;right:0;top:${y}px;border-top:1px dashed ${color};z-index:1000;pointer-events:none;`;
          const caption = document.createElement("span"); caption.textContent = `${label}: ${y.toFixed(1)}px`;
          caption.style.cssText = `position:absolute;${side}:4px;${above ? "bottom:2px" : "top:2px"};font:9px/12px monospace;padding:2px 4px;color:${color};background:#000e;white-space:nowrap;`;
          line.append(caption); overlay.append(line);
        }
        document.body.append(overlay);
      }, metrics);
      const marked = `tmp/p17-fill-review/p17-${viewport.width}x${viewport.height}-bounds.png`;
      await page.screenshot({ path: marked });
      await testInfo.attach("Header / P17 / guide boundaries", { path: marked, contentType: "image/png" });
      await page.locator("#p17-review-bounds").evaluate(el => el.remove());
    });
  }
  test("P17 sizing respects top, bottom and asymmetric side safe areas", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mobile-pilot=17"); await ready(page);
    // Emulate browser env() values locally, without changing the production
    // header/guide/controls or relying on a desktop browser to expose a notch.
    await page.addStyleTag({ content: `
      .mobile-p17-frame { --p17-safe-top: 64px; --p17-safe-bottom: 34px; --p17-safe-left: 18px; --p17-safe-right: 10px; }
      .mobile-gesture-hint { bottom: 98px !important; }
      .page-controls { bottom: 34px !important; }
    ` });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    const leaf = page.getByTestId("mobile-editorial-page");
    await expect.poll(async () => Math.abs((await leaf.boundingBox())!.height - (844 - 64 - 98 - 46))).toBeLessThan(1.1);
    const box = (await leaf.boundingBox())!;
    const guide = (await page.locator(".mobile-gesture-hint").boundingBox())!;
    expect(Math.abs(box.x - 18)).toBeLessThan(1.1);
    expect(Math.abs(box.x + box.width - 380)).toBeLessThan(1.1);
    expect(Math.abs(box.y - 64)).toBeLessThan(1.1);
    expect(Math.abs(box.y + box.height - guide.y)).toBeLessThan(1.1);
  });
  test("P17 reflows on viewport resize and restores the original leaf geometry on P18", async ({ page }) => {
    const initialViewport = page.viewportSize()!;
    await page.goto("/"); await goTo(page, 18);
    const original = (await page.locator('.catalog-leaf[data-book-index="18"]').boundingBox())!;
    await page.goto("/?mobile-pilot=17"); await ready(page);
    for (const viewport of [{ width: 360, height: 780 }, { width: 412, height: 915 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => {
        const box = (await page.getByTestId("mobile-editorial-page").boundingBox())!;
        return Math.abs(box.width - viewport.width) + Math.abs(box.height - (viewport.height - 48 - 126));
      }).toBeLessThan(2);
    }
    await page.setViewportSize(initialViewport);
    await page.getByRole("button", { name: "Página siguiente", exact: true }).click(); await settled(page, 18);
    await expect(page.locator(".mobile-p17-frame")).toHaveCount(0);
    const restored = (await page.locator('.catalog-leaf[data-book-index="18"]').boundingBox())!;
    expect(restored).toEqual(original);
  });
  test("native swipe from hero has no residual click; buttons and page picker retain reading state", async ({ page, context }) => {
    await page.goto("/?mobile-pilot=17"); await ready(page);
    await page.getByTestId("page-flip-engine").evaluate(el => el.setAttribute("data-instance-probe", "same"));
    await swipe(page, context, page.locator(".mobile-p17-page__hero"), -145);
    await settled(page, 18); await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".mobile-p17-frame")).toHaveCount(0);
    await page.getByRole("button", { name: "Página anterior", exact: true }).click(); await ready(page);
    await swipe(page, context, page.locator(".mobile-p17-page__hero"), 2, 70);
    await settled(page); await expect(page.getByRole("dialog")).toHaveCount(0);
    // From the left edge, cross the spine far enough to commit the native fold.
    await swipe(page, context, page.locator(".mobile-p17-page__technologies"), 220);
    await settled(page, 16); await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Página siguiente", exact: true }).click(); await ready(page);
    await goTo(page, 27);
    await expect(page.locator('.section-index-layer [data-section-target]')).toHaveCount(11);
    await goTo(page, 17); await ready(page);
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-instance-probe", "same");
  });
  test("hero and Explore open the original mobile modal, preserve zoom and return, and share cart/checkout", async ({ page, context }) => {
    const originalDialog = await originalEntryProduct(page);
    const original = await originalDialogFingerprint(originalDialog);
    await page.goto("/?mobile-pilot=17"); await ready(page);
    const leaf = page.getByTestId("mobile-editorial-page"), before = await leaf.boundingBox(), beforeHTML = await leaf.evaluate(el => el.outerHTML);
    const dialog = await openProduct(page);
    expect(await originalDialogFingerprint(dialog)).toEqual(original);
    await expect(dialog.locator('img[src*="/hero/"]')).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /Ver imagen/ })).toHaveCount(4);
    await expect(dialog).not.toContainText(/NaN|\$0|Consultar precio/);
    const gallery = dialog.locator(".product-image-viewport");
    await gallery.tap(); await expect(gallery).toHaveAttribute("data-zoom", "2.00");
    for (let step = 0; step < 4; step++) await dialog.getByRole("button", { name: "Acercar imagen" }).click();
    await expect(gallery).toHaveAttribute("data-zoom", "4.00");
    const image = gallery.getByRole("img"), beforePan = await image.evaluate(el => getComputedStyle(el).transform);
    await swipe(page, context, gallery, -60);
    await expect.poll(() => image.evaluate(el => getComputedStyle(el).transform)).not.toBe(beforePan);
    await settled(page);
    await dialog.getByRole("button", { name: "Restablecer zoom" }).click();
    await expect(gallery).toHaveAttribute("data-zoom", "1.00");
    await dialog.getByRole("button", { name: "Ver imagen 2" }).click();
    await expect(dialog.getByRole("button", { name: "Ver imagen 2" })).toHaveAttribute("aria-pressed", "true");
    await expect(gallery).toHaveAttribute("data-zoom", "1.00");
    await dialog.getByRole("button", { name: "Cerrar ficha" }).click(); await expect(dialog).toHaveCount(0);
    await settled(page); expect(await leaf.boundingBox()).toEqual(before);
    expect(await leaf.evaluate(el => el.outerHTML)).toEqual(beforeHTML);
    const exploreDialog = await openProduct(page, true);
    expect(await originalDialogFingerprint(exploreDialog)).toEqual(original);
    await exploreDialog.getByRole("button", { name: "Agregar una unidad" }).click();
    await exploreDialog.getByRole("button", { name: "Agregar al pedido", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); await settled(page);
    expect(await leaf.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("starvie-cart-v1")!))).toEqual([{ productId: "raptor+", qty: 2 }]);
    await page.locator(".catalog-toolbar .cart-button").click();
    const drawer = page.locator(".cart-drawer");
    await expect(drawer).toContainText("Raptor+");
    await expect(drawer).not.toContainText(/NaN|\$0|Consultar precio/);
    await drawer.getByRole("button", { name: "Finalizar pedido" }).click();
    const checkout = page.getByRole("dialog", { name: "Finalizar pedido", exact: true });
    await expect(checkout).toContainText("Raptor+"); await expect(checkout).toContainText("2 unidades");
    await expect(checkout).not.toContainText(/NaN|\$0|Consultar precio/);
    await checkout.getByRole("button", { name: "Cerrar checkout", exact: true }).click();
  });
  test("P17 bag button opens the same modal without adding, supports focus and native swipe", async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/?mobile-pilot=17"); await ready(page);
    const initialCart = await page.evaluate(() => localStorage.getItem("starvie-cart-v1"));
    const explore = await openProduct(page, true), fingerprint = await originalDialogFingerprint(explore);
    await explore.getByRole("button", { name: "Cerrar ficha" }).click();
    const button = page.getByRole("button", { name: "Ver ficha y opciones de pedido de Raptor+", exact: true });
    await expect(button).toHaveAttribute("data-product-id", "raptor+");
    await expect(page.locator(".mobile-p17-page__explore")).toHaveAttribute("data-product-id", "raptor+");
    await expect(page.locator(".mobile-p17-page__hero")).toHaveAttribute("data-product-id", "raptor+");
    await expect(button).toHaveAttribute("aria-haspopup", "dialog");
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    const technical = (await page.locator(".mobile-p17-page__technical").boundingBox())!;
    expect(box.y + box.height).toBeLessThan(technical.y);
    await page.keyboard.press("Tab"); await button.focus();
    expect(await button.evaluate(el => getComputedStyle(el).outlineWidth)).toBe("2px");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Raptor+", exact: true });
    expect(await originalDialogFingerprint(dialog)).toEqual(fingerprint);
    expect(await page.evaluate(() => localStorage.getItem("starvie-cart-v1"))).toEqual(initialCart);
    await dialog.getByRole("button", { name: "Cerrar ficha" }).click(); await settled(page);
    await button.tap(); await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("starvie-cart-v1"))).toEqual(initialCart);
    await dialog.getByRole("button", { name: "Cerrar ficha" }).click();
    await swipe(page, context, button, -220); await settled(page, 18);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("starvie-cart-v1"))).toEqual(initialCart);
  });
  for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 412, height: 915 }]) {
    test(`portrait specs touch scroll survives underlying book hover and image zoom at ${viewport.width}x${viewport.height}`, async ({ page, context }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto("/?mobile-pilot=17"); await ready(page);
      const leaf = page.getByTestId("mobile-editorial-page");
      const approvedLeaf = await leaf.evaluate(el => el.outerHTML), leafBox = (await leaf.boundingBox())!;
      mkdirSync("tmp/p17-scroll-fix", { recursive: true });
      if (viewport.width === 360) await page.screenshot({ path: "tmp/p17-scroll-fix/p17-button-repositioned.png", animations: "disabled" });
      const dialog = await openProduct(page, true);
      await originalDialogFingerprint(dialog);
      const scrollTop = () => dialog.evaluate(el => el.scrollTop);
      const maxScroll = await dialog.evaluate(el => el.scrollHeight - el.clientHeight);
      expect(maxScroll).toBeGreaterThan(30);
      // Reproduce a compatibility mouse move over the modal, in a corner
      // of the underlying full-area P17. StPageFlip's global hover listener
      // must not steal this interaction and cancel the subsequent touchmove.
      await page.mouse.move(leafBox.x + leafBox.width - 23, leafBox.y + leafBox.height - 13);
      await verticalTouchSwipe(page, context, dialog, true);
      await expect.poll(scrollTop).toBeGreaterThan(30);
      await settled(page);
      for (let attempt = 0; attempt < 5 && await scrollTop() < maxScroll - 2; attempt++) {
        await verticalTouchSwipe(page, context, dialog, true);
      }
      await expect.poll(scrollTop).toBeGreaterThanOrEqual(maxScroll - 2);
      const add = dialog.getByRole("button", { name: "Agregar al pedido", exact: true });
      await expect(add).toBeInViewport({ ratio: 1 }); await expect(add).toBeEnabled();
      await expect(dialog.locator(".qty-selector")).toBeInViewport();
      await expect(dialog.locator(".stock-line")).toBeInViewport();
      if (viewport.width === 360) {
        const path = "tmp/p17-scroll-fix/modal-scrolled-bottom.png";
        await page.screenshot({ path, animations: "disabled" });
        await testInfo.attach("Touch scroll reaches availability, quantity and order CTA", { path, contentType: "image/png" });
      }
      for (let attempt = 0; attempt < 5 && await scrollTop() > 1; attempt++) {
        await verticalTouchSwipe(page, context, dialog, false);
      }
      await expect.poll(scrollTop).toBeLessThanOrEqual(1);
      const stage = dialog.locator(".product-image-viewport"), image = stage.getByRole("img");
      await expect(stage).toHaveAttribute("data-zoom", "1.00");
      await stage.tap(); await expect(stage).toHaveAttribute("data-zoom", "2.00");
      for (let step = 0; step < 4; step++) await dialog.getByRole("button", { name: "Acercar imagen" }).tap();
      await expect(stage).toHaveAttribute("data-zoom", "4.00");
      const transform = await image.evaluate(el => getComputedStyle(el).transform);
      await swipe(page, context, stage, -35, 45);
      await expect.poll(() => image.evaluate(el => getComputedStyle(el).transform)).not.toBe(transform);
      expect(await scrollTop()).toBeLessThanOrEqual(1);
      // Leave zoom active: only gestures begun inside the stage belong to pan.
      await verticalTouchSwipe(page, context, dialog, true);
      await expect.poll(scrollTop).toBeGreaterThan(30);
      await expect(stage).toHaveAttribute("data-zoom", "4.00");
      for (let attempt = 0; attempt < 5 && await scrollTop() > 1; attempt++) await verticalTouchSwipe(page, context, dialog, false);
      await expect.poll(scrollTop).toBeLessThanOrEqual(1);
      await dialog.getByRole("button", { name: "Restablecer zoom" }).tap();
      await dialog.getByRole("button", { name: "Ver imagen 2" }).tap();
      await expect(stage).toHaveAttribute("data-zoom", "1.00");
      await expect(dialog.getByRole("button", { name: "Ver imagen 2" })).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.getByRole("button", { name: /Ver imagen/ })).toHaveCount(4);
      await dialog.getByRole("button", { name: "Cerrar ficha" }).tap(); await settled(page);
      expect(await leaf.evaluate(el => el.outerHTML)).toEqual(approvedLeaf);
      expect(await leaf.boundingBox()).toEqual(leafBox);
    });
  }
  test("gallery survives rotation without changing the page or making hero a gallery item", async ({ page }) => {
    await page.goto("/?mobile-pilot=17"); await ready(page); const dialog = await openProduct(page);
    await dialog.getByRole("button", { name: "Ver imagen 3" }).click();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(dialog.getByRole("button", { name: "Ver imagen 3" })).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Cerrar ficha" }).click(); await expect(dialog).toHaveCount(0);
    await expect(page.locator('img[data-catalog-page="17"]')).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
  });
  test("failed hero fallback; reduced motion and compact viewport keep ordering usable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 }); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/hero/raptor-mobile.webp", route => route.abort());
    await page.goto("/?mobile-pilot=17"); await ready(page);
    await expect(page.locator(".mobile-p17-page__hero img")).not.toHaveAttribute("src", /\/hero\//);
    const dialog = await openProduct(page);
    await dialog.getByRole("button", { name: "Agregar al pedido", exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Agregar al pedido", exact: true })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Cerrar ficha" })).toBeVisible();
  });
  test("Galaxy S25: unchanged exterior, larger portrait leaf, one hero, real gallery", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 780 }); mkdirSync("tmp/p17-original-detail-review", { recursive: true });
    await page.goto("/"); await goTo(page, 17);
    const exterior = async () => page.locator(".catalog-toolbar, .page-controls, .mobile-gesture-hint").evaluateAll(elements => elements.map(el => ({ html: el.outerHTML, box: el.getBoundingClientRect().toJSON() })));
    const originalExterior = await exterior();
    const originalBox = (await page.locator('.catalog-leaf[data-book-index="17"]').boundingBox())!;
    await page.screenshot({ path: "tmp/p17-editorial-review/p17-original-galaxy-s25.png" });
    const heroes: string[] = [], productImages: string[] = [], iconArtwork: string[] = [];
    page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith("/hero/")) heroes.push(path); if (path.startsWith("/catalog/product-images/")) productImages.push(path); if (path === "/catalog/pages/page-17.webp") iconArtwork.push(path); });
    await page.goto("/?mobile-pilot=17"); await ready(page);
    expect(await exterior()).toEqual(originalExterior);
    const newBox = (await page.getByTestId("mobile-editorial-page").boundingBox())!;
    const guideBox = (await page.locator(".mobile-gesture-hint").boundingBox())!;
    expect(newBox.y + newBox.height).toBeLessThanOrEqual(guideBox.y);
    expect(newBox.height / newBox.width).toBeGreaterThan(1.6); expect(newBox.height).toBeGreaterThan(originalBox.height * 2);
    expect(heroes).toEqual(["/hero/raptor-mobile.webp"]); expect(productImages.filter(path => path.includes("raptor"))).toEqual([]);
    expect(iconArtwork).toEqual(["/catalog/pages/page-17.webp"]);
    const leaf = page.getByTestId("mobile-editorial-page");
    await expect(leaf.locator(".mobile-p17-page__technologies li")).toHaveCount(9);
    await expect(leaf.getByRole("img", { name: "Punto dulce de Raptor+" })).toBeVisible();
    const cta = leaf.getByRole("button", { name: "Explorar Raptor+" });
    await expect(cta).toBeInViewport();
    expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: "tmp/p17-original-detail-review/p17-final.png", animations: "disabled" });
    await testInfo.attach("P17 original", { path: "tmp/p17-editorial-review/p17-original-galaxy-s25.png", contentType: "image/png" });
    await testInfo.attach("P17 final", { path: "tmp/p17-original-detail-review/p17-final.png", contentType: "image/png" });
    const dialog = await openProduct(page, true);
    for (let position = 1; position <= 4; position++) {
      await dialog.getByRole("button", { name: `Ver imagen ${position}` }).click();
      const image = dialog.getByRole("img", { name: `Raptor+, imagen ${position} de 4`, exact: true });
      await expect(image).toHaveAttribute("src", /\/catalog\/product-images\//);
      await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await expect(image).not.toHaveClass(/is-pending/);
    }
    await dialog.getByRole("button", { name: "Ver imagen 1" }).click();
    await expect(dialog.getByRole("img", { name: "Raptor+, imagen 1 de 4", exact: true })).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Raptor+, imagen 1 de 4", exact: true })).not.toHaveClass(/is-pending/);
    await dialog.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: "tmp/p17-original-detail-review/product-mobile-original.png", animations: "disabled" });
    await testInfo.attach("Original mobile product modal", { path: "tmp/p17-original-detail-review/product-mobile-original.png", contentType: "image/png" });
    await dialog.getByRole("button", { name: "Cerrar ficha" }).click();
    await expect(dialog).toHaveCount(0); await settled(page);
    expect(await leaf.boundingBox()).toEqual(newBox);
    expect(heroes).toEqual(["/hero/raptor-mobile.webp"]);
  });
  test("portrait image area is dark, larger and contained; captures P17, product and 4x", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/?mobile-pilot=17"); await ready(page);
    mkdirSync("tmp/p17-visual-polish", { recursive: true });
    await page.screenshot({ path: "tmp/p17-visual-polish/p17-with-button.png", animations: "disabled" });
    const dialog = await openProduct(page);
    await originalDialogFingerprint(dialog);
    const viewport = dialog.locator(".product-image-viewport");
    expect(await viewport.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, radius: getComputedStyle(el).borderRadius, shadow: getComputedStyle(el).boxShadow })))
      .toEqual({ background: "rgba(0, 0, 0, 0)", radius: "0px", shadow: "none" });
    const image = viewport.getByRole("img");
    expect(await image.evaluate(el => getComputedStyle(el).objectFit)).toBe("contain");
    await expect(viewport).toHaveAttribute("data-zoom", "1.00");
    const box = (await viewport.boundingBox())!, thumbs = (await dialog.locator(".gallery-thumbs").boundingBox())!;
    const legacyHeight = Math.min(780 * .47, 390) - thumbs.height - 24;
    expect(Math.min(box.width, box.height)).toBeGreaterThan(legacyHeight * 1.2);
    await expect(dialog.getByRole("button", { name: /Ver imagen/ })).toHaveCount(4);
    await expect(dialog.getByRole("group", { name: "Controles de zoom" })).toBeInViewport();
    await page.screenshot({ path: "tmp/p17-visual-polish/product-clean.png", animations: "disabled" });
    await viewport.tap(); await expect(viewport).toHaveAttribute("data-zoom", "2.00");
    for (let step = 0; step < 4; step++) await dialog.getByRole("button", { name: "Acercar imagen" }).click();
    await expect(viewport).toHaveAttribute("data-zoom", "4.00");
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: "tmp/p17-visual-polish/product-zoom-4x.png", animations: "disabled" });
    for (const name of ["p17-with-button", "product-clean", "product-zoom-4x"]) await testInfo.attach(name, { path: `tmp/p17-visual-polish/${name}.png`, contentType: "image/png" });
  });
});
