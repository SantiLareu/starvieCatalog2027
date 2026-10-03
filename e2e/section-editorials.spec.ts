import { expect, test, type Page, type BrowserContext } from "@playwright/test";

async function settled(page: Page) {
  await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
}

async function goToPage(page: Page, number: number) {
  await page.mouse.move(12, 12);
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill(String(number));
  await page.locator(".page-picker button").click();
  await settled(page);
}

async function swipe(page: Page, context: BrowserContext, index: number) {
  const box = (await page.locator(`.catalog-leaf[data-book-index="${index}"]`).boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const y = box.y + box.height * .4;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width * .92, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width * .08, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("P27 conserva el PDF, muestra sólo Ver y navega por mouse/touch y teclado", async ({ page, isMobile }) => {
  await page.goto("/");
  await goToPage(page, 27);
  const layer = page.locator('.catalog-leaf[data-book-index="27"] .section-index-layer');
  await expect(layer).toHaveAttribute("data-live", "true");
  await expect(page.locator('.catalog-leaf[data-book-index="27"] img[data-catalog-page="27"]')).toBeVisible();
  const eternal = layer.getByRole("button", { name: /hard eva eternal:/i });
  if (!isMobile) {
    await eternal.hover();
    await expect(eternal.locator(".section-index-tag")).toHaveCSS("opacity", "1");
    await expect(eternal).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(eternal).toHaveCSS("border-top-width", "0px");
  }
  if (isMobile) await eternal.tap();
  else await eternal.click();
  await settled(page);
  await expect(page.getByTestId("page-indicator")).toHaveText(isMobile ? "29 / 39" : "29–SANYO / 39");
  await expect(layer).toHaveAttribute("inert", "");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await goToPage(page, 27);
  const tOne = layer.getByRole("button", { name: /t-one pro:/i });
  await eternal.focus();
  await page.keyboard.press("Tab");
  await expect(tOne).toBeFocused();
  if (!isMobile) await expect(tOne.locator(".section-index-tag")).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await settled(page);
  await expect(page.getByTestId("page-indicator")).toHaveText(isMobile ? "30 / 39" : "30–TAMARA / 39");
});

test("editoriales: carga diferida, spreads, accesibilidad y movimiento reducido", async ({ page, isMobile }) => {
  const bannerRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/banners/")) bannerRequests.push(request.url()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await expect(page.locator('.catalog-leaf[data-book-index="0"] img[data-catalog-page]')).toBeVisible();
  await page.waitForTimeout(300);
  expect(bannerRequests).toEqual([]);
  await goToPage(page, 29);
  await expect(page.getByTestId("page-indicator")).toHaveText(isMobile ? "29 / 39" : "29–SANYO / 39");
  if (isMobile) { await page.keyboard.press("ArrowRight"); await settled(page); }
  const sanyo = page.locator('.catalog-leaf[data-book-index="30"] .sanyo-editorial');
  await expect(sanyo).toHaveAttribute("data-live", "true");
  await expect(sanyo.getByRole("img", { name: /sanyo/i })).toBeVisible();
  await expect(sanyo.locator("img")).toHaveCSS("animation-name", "none");
  await expect(sanyo.locator("img")).toHaveCSS("opacity", "1");
  await expect(sanyo.locator("img")).toHaveCSS("object-fit", "contain");
  await goToPage(page, 30);
  await expect(page.getByTestId("page-indicator")).toHaveText(isMobile ? "30 / 39" : "30–TAMARA / 39");
  if (isMobile) { await page.keyboard.press("ArrowRight"); await settled(page); }
  const tamara = page.locator('.catalog-leaf[data-book-index="32"] .tamara-editorial');
  await expect(tamara).toHaveAttribute("data-live", "true");
  await expect(tamara.getByRole("img", { name: /tamara/i })).toBeVisible();
  await expect(tamara.locator("img")).toHaveCSS("animation-name", "none");
  await expect(tamara.locator("img")).toHaveCSS("opacity", "1");
  await expect(tamara.locator("img")).toHaveCSS("object-fit", "contain");
  await expect.poll(() => tamara.locator("img").evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(1672);
  await expect(page.locator(".sanyo-editorial button, .tamara-editorial button")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await settled(page);
  await expect(page.getByTestId("page-indicator")).toHaveText(isMobile ? "31 / 39" : "31–32 / 39");
  await goToPage(page, 38);
  await expect(page.getByTestId("page-indicator")).toHaveText(isMobile ? "38 / 39" : "37–38 / 39");
  await expect(page.locator('.catalog-leaf[data-book-index="39"] img[data-catalog-page="37"]')).toHaveCount(1);
  await expect(page.locator('.catalog-leaf[data-book-index="40"] img[data-catalog-page="38"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "closed");
  await page.getByRole("button", { name: "Página anterior", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "open");
});

test("P27 limita el corner preview y restaura el comportamiento nativo al salir", async ({ page, isMobile }) => {
  test.skip(isMobile, "El preview de esquinas es exclusivo del puntero con hover");
  await page.goto("/");
  await goToPage(page, 27);
  const engine = page.getByTestId("page-flip-engine");
  const leaf = page.locator('.catalog-leaf[data-book-index="27"]');
  const box = (await leaf.boundingBox())!;
  // Fuera del rectángulo aprobado, pero dentro del radio diagonal/5 nativo.
  await page.mouse.move(box.x + box.width * .02, box.y + box.height * .18);
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await page.mouse.move(box.x + box.width * .02, box.y + box.height * .02);
  await expect(engine).toHaveAttribute("data-flip-state", "fold_corner");
  await page.mouse.move(box.x + box.width * .02, box.y + box.height * .18);
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await page.mouse.move(12, 12);
  await goToPage(page, 25);
  const normal = (await page.locator('.catalog-leaf[data-book-index="25"]').boundingBox())!;
  await page.mouse.move(normal.x + normal.width * .02, normal.y + normal.height * .18);
  await expect(engine).toHaveAttribute("data-flip-state", "fold_corner");
  await page.mouse.move(12, 12);
  await expect(engine).toHaveAttribute("data-flip-state", "read");
});

test("portrait recorre P27, P29, SANYO, P30, TAMARA y P31 con swipe", async ({ page, context, isMobile }) => {
  test.skip(!isMobile, "Recorrido de una hoja en portrait");
  await page.goto("/");
  await goToPage(page, 27);
  // El gesto empieza sobre Neon Strike, no necesita hover ni dispara el hotspot.
  await swipe(page, context, 27);
  await settled(page);
  await expect(page.getByTestId("page-indicator")).toHaveText("28 / 39");
  await goToPage(page, 29);
  for (const [index, label] of [[29, "SANYO"], [30, "30"], [31, "TAMARA"], [32, "31"]] as const) {
    await swipe(page, context, index);
    await settled(page);
    await expect(page.getByTestId("page-indicator")).toHaveText(`${label} / 39`);
  }
});

test("las editoriales y las copias portrait permanecen estáticas durante el giro", async ({ page, isMobile }) => {
  await page.goto("/");
  await goToPage(page, 29);
  if (isMobile) { await page.keyboard.press("ArrowRight"); await settled(page); }
  for (const [name, productPage] of [["sanyo", 29], ["tamara", 30]] as const) {
    if (productPage === 30) {
      await goToPage(page, 30);
      if (isMobile) { await page.keyboard.press("ArrowRight"); await settled(page); }
    }
    const source = page.locator(`.catalog-leaf > .${name}-editorial[data-live="true"] img`);
    await expect(source).toHaveCount(1);
    await expect.poll(() => source.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(source).toHaveCSS("animation-name", `${name}-editorial-in`);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "flipping");
    const moving = page.locator(`.catalog-leaf > .${name}-editorial img`);
    const samples = await moving.evaluateAll(nodes => nodes.map(node => {
      const css = getComputedStyle(node);
      return { animation: css.animationName, opacity: css.opacity, loaded: (node as HTMLImageElement).naturalWidth > 0 };
    }));
    expect(samples.length).toBeGreaterThanOrEqual(isMobile ? 2 : 1);
    for (const sample of samples) expect(sample).toEqual({ animation: "none", opacity: "1", loaded: true });
    await settled(page);
  }
});

test("P27 descarta la activación de hotspots durante una transición", async ({ page, isMobile }) => {
  await page.goto("/");
  await goToPage(page, 27);
  const layer = page.locator('.catalog-leaf[data-book-index="27"] .section-index-layer');
  const hotspot = layer.locator('[data-section-target="33"]');
  await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "flipping");
  await expect.poll(() => layer.evaluateAll(nodes => nodes.map(node => ({
    inert: (node as HTMLElement).inert,
    live: (node as HTMLElement).dataset.live,
    hidden: node.getAttribute("aria-hidden"),
  })))).toEqual(Array.from({ length: isMobile ? 2 : 1 }, () => ({ inert: true, live: "false", hidden: "true" })));
  // Un evento tardío tampoco puede encolar un salto, aunque el emisor
  // ignore el inert nativo (por ejemplo, una copia de la hoja).
  await hotspot.last().dispatchEvent("click", { detail: 0 });
  await settled(page);
  await expect(page.getByTestId("page-indicator")).toHaveText(isMobile ? "28 / 39" : "29–SANYO / 39");
});

test("un drag desktop sobre un hotspot de P27 gira la hoja sin activar su destino", async ({ page, isMobile }) => {
  test.skip(isMobile, "El swipe touch ya se verifica en el recorrido portrait");
  await page.goto("/");
  await goToPage(page, 27);
  const box = (await page.locator('.catalog-leaf[data-book-index="27"]').boundingBox())!;
  const x = box.x + box.width * .92, y = box.y + box.height * .4;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(box.x - box.width * .3, y, { steps: 8 });
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "user_fold");
  await page.mouse.up();
  await settled(page);
  await expect(page.getByTestId("page-indicator")).toHaveText("29–SANYO / 39");
});
