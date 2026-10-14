import { expect, test } from '@playwright/test';

test.beforeEach(({ isMobile }) => test.skip(!isMobile, 'Solo mobile portrait'));

test('portada: texto HTML, entrada breve, ambiente en reposo y movimiento reducido', async ({ page }, testInfo) => {
  await page.goto('/');
  const app = page.locator('.catalog-app');
  await expect(app).toHaveClass(/cover-ready/);
  const cover = page.locator('.catalog-leaf[data-book-index="0"] .mobile-portrait-cover');
  const title = cover.locator('h1');
  await expect(title).toHaveText('2027');
  await expect(title).toHaveCSS('animation-name', 'mobile-cover-type-enter');
  const year = title.locator('.mobile-portrait-cover__metal--year');
  await expect(year).toHaveCSS('animation-name', 'mobile-cover-metal-sheen');
  await expect(year).toHaveCSS('animation-duration', '3.6s');
  const smoke = cover.locator('.mobile-portrait-cover__smoke');
  await expect(smoke).toHaveAttribute('aria-hidden', 'true');
  await expect(smoke).toHaveCSS('pointer-events', 'none');
  const layers = smoke.locator('span');
  await expect(layers).toHaveCount(3);
  const haze = layers.first();
  await expect(haze).toHaveCSS('animation-name', 'mobile-cover-smoke-drift');
  for (const [index, duration] of ['10s', '8s', '12s'].entries()) {
    await expect(layers.nth(index)).toHaveCSS('animation-duration', duration);
    await expect(layers.nth(index)).toHaveCSS('filter', 'none');
  }
  await expect(cover.locator('.mobile-portrait-cover__metal')).toHaveCount(5);
  for (const word of await cover.locator('.mobile-portrait-cover__metal').all()) {
    await expect(word).toHaveCSS('background-clip', /^text(?:, text)*$/);
  }
  await expect.poll(() => title.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await expect(title).toHaveCSS('filter', 'none');
  const initialSheen = await year.evaluate(el => getComputedStyle(el).backgroundPosition);
  await expect.poll(() => year.evaluate(el => getComputedStyle(el).backgroundPosition)).not.toBe(initialSheen);
  const initialSmoke = await haze.evaluate(el => getComputedStyle(el).transform);
  await expect.poll(() => haze.evaluate(el => getComputedStyle(el).transform)).not.toBe(initialSmoke);
  for (const text of ['COLECCIÓN', 'PADEL WITHOUT LIMITS', 'STARVIE', 'CATÁLOGO OFICIAL']) {
    await expect(cover.getByText(text, { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('cover-editorial.png') });
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('14 / 39');
  await expect(app).toHaveAttribute('data-book-transition', 'idle');
  await expect(haze).toHaveCSS('animation-name', 'none');
  await expect(year).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'Página anterior', exact: true }).tap();
  await expect(app).toHaveAttribute('data-book-transition', 'idle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(title).toHaveCSS('animation-name', 'none');
  await expect(haze).toHaveCSS('animation-name', 'none');
  await expect(year).toHaveCSS('animation-name', 'none');
  await expect(title).toHaveCSS('opacity', '1');
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await expect(smoke).toHaveCSS('display', 'none');
  await expect(year).toHaveCSS('background-image', 'none');
});

test('carrusel: swipe central y flechas conservan productos; ambos bordes navegan el book', async ({ page }) => {
  await page.goto('/');
  const app = page.locator('.catalog-app');
  await expect(app).toHaveClass(/cover-ready/);
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).tap();
  await expect(app).toHaveAttribute('data-book-transition', 'idle');
  const carousel = page.locator('.catalog-leaf[data-book-index="13"] .page14-coverflow');
  const title = carousel.locator('h2');
  const initial = await title.textContent();
  const frame = (await page.locator('.page-flip-host').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (x: number, dx: number) => {
    const y = frame.y + frame.height * .55;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y }] });
      await page.waitForTimeout(35);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  try {
    await swipe(frame.x + frame.width * .7, -frame.width * .35);
    await expect(title).not.toHaveText(initial!);
    await expect(page.getByTestId('page-indicator')).toHaveText('14 / 39');
    const current = await title.textContent();
    await carousel.getByRole('button', { name: 'Paleta siguiente', exact: true }).tap();
    await expect(title).not.toHaveText(current!);
    await swipe(frame.x + 32, frame.width * .65);
    await expect(page.getByTestId('page-indicator')).toHaveText('1 / 39');
    await expect(app).toHaveAttribute('data-book-transition', 'idle');
    await page.getByRole('button', { name: 'Página siguiente', exact: true }).tap();
    await expect(app).toHaveAttribute('data-book-transition', 'idle');
    await swipe(frame.x + frame.width - 32, -frame.width * .65);
    await expect(page.getByTestId('page-indicator')).toHaveText('VIDEO / 39');
    await expect(app).toHaveAttribute('data-book-transition', 'idle');
  } finally { await cdp.detach(); }
});

test('hojas portrait: pliegue visible durante el drag en ambos sentidos, retorno corto cancela', async ({ page }, testInfo) => {
  await page.goto('/?mobile-pilot=17');
  const engine = page.locator('.page-flip-host');
  await expect(engine).toHaveAttribute('data-flip-state', 'read');
  const frame = (await engine.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  try {
    for (const [direction, start, dx, turningLeaf, result] of [
      ['previous', .15, .6, 16, '16 / 39'], ['next', .85, -.6, 16, '17 / 39'],
    ] as const) {
      const x = frame.x + frame.width * start;
      const y = frame.y + frame.height * .55;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * frame.width * .35, y }] });
      await expect(engine).toHaveAttribute('data-flip-state', 'user_fold');
      // A physically clipped, rotated face must already intersect the viewport
      // before half the swipe. Index-only assertions missed the invisible return.
      await expect.poll(() => engine.evaluate((root, index) => {
        const viewport = root.getBoundingClientRect();
        return [...root.querySelectorAll<HTMLElement>(`.catalog-leaf[data-book-index="${index}"]`)].some(leaf => {
          const style = getComputedStyle(leaf), rect = leaf.getBoundingClientRect();
          return style.display !== 'none' && style.clipPath.startsWith('polygon') &&
            Math.abs(new DOMMatrix(style.transform).b) > .001 && rect.right > viewport.left + 20 && rect.left < viewport.right;
        });
      }, turningLeaf)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`physical-${direction}.png`) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * frame.width, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.getByTestId('page-indicator')).toHaveText(result);
      await expect(engine).toHaveAttribute('data-flip-state', 'read');
    }
    const x = frame.x + 32, y = frame.y + frame.height * .55;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 25, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(engine).toHaveAttribute('data-flip-state', 'read');
    await expect(page.getByTestId('page-indicator')).toHaveText('17 / 39');
    await page.getByRole('button', { name: 'Página anterior', exact: true }).tap();
    await expect(page.getByTestId('page-indicator')).toHaveText('16 / 39');
    await expect(engine).toHaveAttribute('data-flip-state', 'read');
  } finally { await cdp.detach(); }
});
