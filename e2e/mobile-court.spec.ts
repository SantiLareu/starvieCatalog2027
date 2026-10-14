import { expect, test, type Page } from "@playwright/test";

async function swipe(page: Page, x: number, y: number, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const fraction of [.2, .5, 1]) {
      await page.waitForTimeout(45);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * fraction, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}

test("portrait habitual: portada, carrusel, StarNews configurable y hero conservan flujo", async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "Solo portrait");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/orders**", route => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const app = page.locator(".catalog-app");
  const engine = page.getByTestId("page-flip-engine");
  await expect(app).toHaveClass(/mobile-court-experience/);
  await expect(app).toHaveClass(/cover-ready/);
  await expect(page.getByRole("article", { name: "Portada StarVie, colección 2027" })).toBeVisible();
  await expect(engine).toHaveClass(/mobile-p17-frame/);
  const handle = await engine.elementHandle();
  await page.getByRole("button", { name: "Página siguiente", exact: true }).tap();
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await expect(page.getByTestId("page-indicator")).toHaveText("14 / 39");
  const carousel = page.locator('.catalog-leaf[data-book-index="13"] .page14-coverflow');
  await expect(carousel).toHaveAttribute("data-presentation", "interactive");
  await carousel.getByRole("button", { name: "Paleta siguiente", exact: true }).tap();
  await expect(carousel.locator("h2")).toHaveText("Triton T-One");
  await expect(page.getByTestId("page-indicator")).toHaveText("14 / 39");
  await page.getByRole("button", { name: "Página siguiente", exact: true }).tap();
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  const news = page.locator('.catalog-leaf[data-book-index="14"] .mobile-star-news');
  await expect(news).toBeVisible();
  await expect.poll(() => news.locator("video").evaluate(video => !(video as HTMLVideoElement).paused)).toBe(true);
  await expect(news.getByRole("button", { name: "Pausar video de StarNews" })).toHaveCSS("opacity", "0");
  await expect(news.locator('.mobile-star-news__related')).toHaveCount(0);
  await expect(news.getByText('VER VIDEO')).toHaveCount(0);
  await news.getByRole("button", { name: "Pausar video de StarNews" }).tap();
  await expect(news.getByRole("button", { name: "Reproducir video de StarNews" })).toHaveCSS("opacity", "1");
  await news.getByRole("button", { name: "Reproducir video de StarNews" }).tap();
  await expect(news.getByRole("button", { name: "Pausar video de StarNews" })).toHaveCSS("opacity", "0");
  await page.screenshot({ path: testInfo.outputPath('news-playing.png') });
  await page.getByRole("button", { name: "Página siguiente", exact: true }).tap();
  await expect(page.getByTestId("page-indicator")).toHaveText("15 / 39");
  const hero = page.getByRole("article", { name: "Página 15, edición vertical StarVie" });
  await expect(hero).toBeVisible();
  await expect(hero.locator('.mobile-court-scene--product')).toBeVisible();
  await expect(hero.getByRole("img", { name: "Eternal", exact: true })).toHaveAttribute("data-mobile-hero-source", "products/palas/ETERNAL/ETERNAL1.4.webp");
  await hero.getByRole("button", { name: "Explorar Eternal", exact: true }).tap();
  const modal = page.getByRole("dialog", { name: "Eternal", exact: true });
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Cerrar ficha", exact: true }).tap();
  await expect(page.getByTestId("page-indicator")).toHaveText("15 / 39");
  await page.getByRole("button", { name: "Primera página", exact: true }).tap();
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await page.getByRole("button", { name: "Página siguiente", exact: true }).tap();
  await expect(page.getByTestId("page-indicator")).toHaveText("14 / 39");
  expect(await handle!.evaluate(element => element.isConnected)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("court-carousel.png") });
});

test("portrait: seis perfiles conservan identidad y acciones; landscape vuelve al PDF", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Solo portrait");
  await page.goto("/");
  for (const number of [15, 16, 17, 18, 19, 20]) {
    await page.getByTestId("page-indicator").click();
    await page.locator("#page-number").fill(String(number));
    await page.locator(".page-picker button").click();
    await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
    const leaf = page.getByRole("article", { name: `Página ${number}, edición vertical StarVie`, exact: true });
    await expect(leaf).toBeVisible();
    const buttons = leaf.locator("button[data-product-id]");
    await expect(buttons).toHaveCount(3);
    await expect(buttons.first()).toBeEnabled();
  }
  await page.setViewportSize({ width: 915, height: 412 });
  await expect(page.getByTestId("mobile-editorial-page")).toHaveCount(0);
  await expect(page.locator('.mobile-court-experience')).toHaveCount(0);
  await expect(page.locator('img[data-catalog-page="20"]')).toBeVisible();
});

test('portrait: portada y carrusel vuelven por swipe y mantienen el marco durante las tapas', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Solo portrait');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const app = page.locator('.catalog-app');
  const engine = page.getByTestId('page-flip-engine');
  await expect(app).toHaveClass(/cover-ready/);
  await expect(engine).toHaveClass(/mobile-p17-frame/);
  const original = (await engine.boundingBox())!;
  const handle = await engine.elementHandle();
  const monitor = await page.evaluateHandle(() => {
    const samples: { state: string; y: number; height: number; framed: boolean }[] = [];
    let running = true;
    const read = () => {
      const app = document.querySelector<HTMLElement>('.catalog-app')!;
      const engine = document.querySelector<HTMLElement>('.page-flip-host')!;
      const rect = engine.getBoundingClientRect();
      samples.push({ state: app.dataset.bookTransition!, y: rect.y, height: rect.height,
        framed: engine.classList.contains('mobile-p17-frame') });
      if (running) requestAnimationFrame(read);
    };
    read(); return { stop: () => { running = false; return samples; } };
  });
  for (let cycle = 0; cycle < 2; cycle++) {
    await swipe(page, original.width * .85, original.y + original.height * .42, -original.width * .65);
    await expect(page.getByTestId('page-indicator')).toHaveText('14 / 39');
    await expect(app).toHaveAttribute('data-book-transition', 'idle');
    // The edge is book navigation even inside Swiper; its central drag remains a fan drag.
    // Include the arrow's hit area, rather than only the outermost 12px.
    await swipe(page, 32, original.y + original.height * .55, original.width * .65);
    await expect(page.getByTestId('page-indicator')).toHaveText('1 / 39');
    await expect(app).toHaveAttribute('data-book-transition', 'idle');
  }
  for (const name of ['Página siguiente', 'Página anterior']) {
    await page.getByRole('button', { name, exact: true }).tap();
    await expect(app).toHaveAttribute('data-book-transition', 'idle');
  }
  const samples = await monitor.evaluate(value => value.stop());
  for (const state of ['initial-cover-open', 'close-to-cover']) {
    const moving = samples.filter(sample => sample.state === state);
    expect(moving.length).toBeGreaterThan(0);
    expect(moving.every(sample => sample.framed && Math.abs(sample.y - original.y) < 1 &&
      Math.abs(sample.height - original.height) < 1)).toBe(true);
  }
  expect(await handle!.evaluate(node => node.isConnected)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('silver-cover.png') });
});

test('portrait: contratapa alinea sus caras con el marco y deja el texto sobre los controles', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Solo portrait');
  await page.goto('/');
  await page.getByTestId('page-indicator').click();
  await page.locator('#page-number').fill('38');
  await page.locator('.page-picker button').click();
  const app = page.locator('.catalog-app');
  await expect(app).toHaveAttribute('data-book-transition', 'idle');
  const engine = page.getByTestId('page-flip-engine');
  const original = (await engine.boundingBox())!;
  const monitor = await page.evaluateHandle(() => {
    const samples: { state: string; y: number; physicsY: number; shiftY: number; height: number }[] = [];
    let running = true;
    const read = () => {
      const state = document.querySelector<HTMLElement>('.catalog-app')!.dataset.backCoverState!;
      const root = document.querySelector<HTMLElement>('.page-flip-host')!.getBoundingClientRect();
      const physicsY = document.querySelector<HTMLElement>('.back-cover-physics')!.getBoundingClientRect().y;
      const faces = [...document.querySelectorAll<HTMLElement>('.back-cover-physics-leaf[data-rear-bridge-page="cover"], .back-cover-physics-leaf[data-rear-bridge-page="right"]')];
      faces.filter(el => getComputedStyle(el).display !== 'none').forEach(el =>
        samples.push({ state, y: root.y, physicsY, shiftY: new DOMMatrix(getComputedStyle(el).transform).m42, height: root.height }));
      if (running) requestAnimationFrame(read);
    };
    read(); return { stop: () => { running = false; return samples; } };
  });
  for (let cycle = 0; cycle < 2; cycle++) {
    await swipe(page, original.x + original.width * .85, original.y + original.height * .55, -original.width * .65);
    await expect(app).toHaveAttribute('data-back-cover-state', 'closed');
    await expect(page.getByTestId('back-cover-credit')).toHaveCSS('opacity', '1');
    for (const selector of ['.back-cover-physics-leaf[data-rear-bridge-page="cover"]', '.back-cover-surface']) {
      await expect(page.locator(selector).first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(page.locator(selector).first()).toHaveCSS('background-image', 'none');
      await expect(page.locator(selector).first()).toHaveCSS('box-shadow', 'none');
    }
    const credit = (await page.getByTestId('back-cover-credit').boundingBox())!;
    const logo = (await page.getByTestId('back-cover-logo').boundingBox())!;
    const title = (await page.getByTestId('back-cover-title').boundingBox())!;
    expect(logo.y + logo.height).toBeLessThan(title.y - 4);
    const guide = (await page.locator('.mobile-gesture-hint').boundingBox())!;
    expect(credit.y + credit.height).toBeLessThan(guide.y);
    expect(credit.y + credit.height).toBeLessThan(page.viewportSize()!.height * .65);
    if (cycle === 0) await page.screenshot({ path: testInfo.outputPath('back-cover-raised.png') });
    await swipe(page, original.x + original.width * .15, original.y + original.height * .55, original.width * .65);
    await expect(app).toHaveAttribute('data-back-cover-state', 'open');
    await expect(app).toHaveAttribute('data-book-transition', 'idle');
    await expect(page.getByTestId('page-indicator')).toHaveText('38 / 39');
  }
  const samples = await monitor.evaluate(value => value.stop());
  for (const state of ['closing', 'opening', 'closed']) {
    const moving = samples.filter(sample => sample.state === state);
    expect(moving.length).toBeGreaterThan(0);
    // Perspective changes the projected bounding box during rotateY; the
    // physical frame and native hinge's vertical translation must stay fixed.
    expect(moving.every(sample => Math.abs(sample.y - original.y) < 1 && Math.abs(sample.physicsY - original.y) < 1 && Math.abs(sample.shiftY) < 1 &&
      Math.abs(sample.height - original.height) < 1)).toBe(true);
  }
});

test('portrait: contenido principal de StarNews admite galería sin bloques inferiores', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Solo portrait');
  await page.route('**/src/data/starNewsContent.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const starNewsArticles = [{ id: 'gallery', category: 'STARNEWS', title: 'Eternal', description: 'Detalles de la pala',
      media: {kind:'gallery', images: [
        {src:'products/palas/ETERNAL/ETERNAL1.4.webp', alt:'Eternal frontal'},
        {src:'products/palas/ETERNAL/ETERNAL1.3.webp', alt:'Eternal detalle'}]}}];` }));
  await page.goto('/?mobile-pilot=15');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','read');
  await page.getByRole('button', { name:'Página anterior', exact:true }).tap();
  const news = page.locator('.catalog-leaf[data-book-index="14"] .mobile-star-news');
  await expect(news.getByRole('img', { name:'Eternal frontal' })).toBeVisible();
  await news.getByRole('button', { name:'Imagen siguiente' }).tap();
  await expect(news.getByRole('img', { name:'Eternal detalle' })).toBeVisible();
  await expect(page.getByTestId('page-indicator')).toHaveText('VIDEO / 39');
  await expect(news.locator('aside, .mobile-star-news__story button')).toHaveCount(0);
});
