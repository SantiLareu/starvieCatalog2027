import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("**/api/orders**", route => route.abort());
});

for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
  test(`preventa desktop ${width}: neón fuera de la página y sin residuo al abrir`, async ({ page, isMobile }, testInfo) => {
    test.skip(isMobile, "Composición exclusiva de desktop");
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const app = page.locator(".catalog-app");
    const claim = page.locator(".desktop-stage-presale");
    const engine = page.getByTestId("page-flip-engine");
    await expect(app).toHaveClass(/cover-ready/);
    await expect(claim).toBeVisible();
    await expect(claim).toHaveCSS("opacity", "1");
    await expect(claim).toHaveCSS("pointer-events", "none");
    await expect(claim).toHaveText("PREVENTA EXCLUSIVA");
    expect(await claim.evaluate(el => el.closest(".catalog-leaf"))).toBeNull();
    const words = await claim.locator("span").evaluateAll(spans => spans.map(span => {
      const style = getComputedStyle(span);
      return { box: span.getBoundingClientRect().toJSON(), size: parseFloat(style.fontSize),
        stroke: parseFloat(style.webkitTextStrokeWidth), fill: style.webkitTextFillColor,
        color: style.color, filter: style.filter, animation: style.animationName };
    }));
    expect(words).toHaveLength(2);
    expect(words[1].box.top).toBeGreaterThanOrEqual(words[0].box.bottom);
    expect(words[1].size).toBeGreaterThan(words[0].size);
    expect(words[1].color).toBe("rgb(230, 70, 55)");
    const cover = (await page.locator('.catalog-leaf[data-book-index="0"] .pdf-page').boundingBox())!;
    for (const word of words) {
      expect(word.stroke).toBeGreaterThan(0);
      expect(word.fill).toBe("rgba(0, 0, 0, 0)");
      expect(word.filter).toContain("drop-shadow");
      expect(word.animation).toBe("none");
      expect(word.box.right + 48).toBeLessThan(cover.x);
      expect(word.box.top).toBeGreaterThan(52);
      expect(word.box.bottom + 48).toBeLessThan(height - 50);
    }
    await page.screenshot({ path: testInfo.outputPath("preventa-desktop.png") });
    const initialFrame = await engine.boundingBox();
    const engineHandle = await engine.elementHandle();
    // Subscribe before input: a complete CSS fade may precede the first poll.
    const fade = await claim.evaluateHandle(el => {
      const properties: string[] = [];
      const listener = (event: Event) => properties.push((event as TransitionEvent).propertyName);
      el.addEventListener("transitionrun", listener);
      return { properties, dispose: () => el.removeEventListener("transitionrun", listener) };
    });
    try {
      await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
      await expect(app).toHaveAttribute("data-book-transition", "idle");
      await expect(engine).toHaveAttribute("data-flip-state", "read");
      await expect(claim).toBeHidden();
      await expect(claim).toHaveCSS("opacity", "0");
      expect(await fade.evaluate(probe => probe.properties)).toContain("opacity");
      await page.getByRole("button", { name: "Página anterior", exact: true }).click();
      await expect(app).toHaveAttribute("data-book-transition", "idle");
      await expect(claim).toHaveCSS("opacity", "1");
      expect(await engine.boundingBox()).toEqual(initialFrame);
      expect(await engineHandle!.evaluate(el => el.isConnected)).toBe(true);
      await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
      await expect(claim.locator("span").first()).toHaveCSS("filter", "none");
      await expect(claim.locator("span").first()).not.toHaveCSS("-webkit-text-fill-color", "rgba(0, 0, 0, 0)");
    } finally {
      await fade.evaluate(probe => probe.dispose());
      await fade.dispose();
    }
  });
}

for (const [width, height] of [[320, 480], [375, 667], [393, 851], [412, 915], [599, 900]]) {
  test(`preventa mobile ${width}: metalizado legible entre eslogan y marca`, async ({ page, isMobile }, testInfo) => {
    test.skip(!isMobile, "Composición exclusiva de mobile portrait");
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const app = page.locator(".catalog-app");
    const cover = page.locator('.catalog-leaf[data-book-index="0"] .mobile-portrait-cover');
    const claim = cover.locator(".mobile-portrait-cover__presale");
    const tagline = cover.getByText("PADEL WITHOUT LIMITS", { exact: true });
    const footer = cover.locator("footer");
    await expect(app).toHaveClass(/cover-ready/);
    await expect(claim).toBeVisible();
    await expect(claim).toHaveText("PREVENTA EXCLUSIVA");
    await expect(claim).toHaveCSS("opacity", "1");
    await expect(claim).toHaveCSS("filter", "none");
    await expect(page.locator(".desktop-stage-presale")).toBeHidden();
    for (const layer of [claim, claim.locator("span")]) {
      await expect(layer).toHaveCSS("background-clip", "text");
      await expect(layer).toHaveCSS("background-image", /linear-gradient/);
      await expect(layer).toHaveCSS("text-shadow", "none");
    }
    const box = (await claim.boundingBox())!;
    expect(box.y).toBeGreaterThan((await tagline.boundingBox())!.y + (await tagline.boundingBox())!.height);
    expect(box.y + box.height).toBeLessThan((await footer.boundingBox())!.y);
    const rects = await claim.evaluate(el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const result: { left: number; right: number; top: number }[] = [];
      while (walker.nextNode()) {
        const range = document.createRange(); range.selectNodeContents(walker.currentNode);
        for (const rect of range.getClientRects()) result.push({ left: rect.left, right: rect.right, top: Math.round(rect.top) });
      }
      return result;
    });
    expect(new Set(rects.map(rect => rect.top)).size).toBe(1);
    for (const rect of rects) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: testInfo.outputPath("preventa-mobile.png") });
    await page.getByRole("button", { name: "Página siguiente", exact: true }).tap();
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    await expect(page.getByTestId("page-indicator")).toHaveText("14 / 39");
    await page.getByRole("button", { name: "Página anterior", exact: true }).tap();
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    await expect(claim).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    for (const layer of [claim, claim.locator("span")]) {
      await expect(layer).toHaveCSS("background-image", "none");
      await expect(layer).not.toHaveCSS("-webkit-text-fill-color", "rgba(0, 0, 0, 0)");
    }
  });
}
