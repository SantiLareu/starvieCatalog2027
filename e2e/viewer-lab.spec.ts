import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/viewer-lab');
  await expect(page.getByTestId('padel-viewer-stage')).toHaveAttribute('aria-busy', 'false');
}
async function state(page: Page, view: string) {
  await expect(page.getByTestId('padel-viewer-stage')).toHaveAttribute('data-view-state', view);
  await expect(page.locator('.explorer-product-image')).toHaveCount(1);
  await expect(page.locator('.explorer-product-image')).toHaveAttribute('data-view', view);
}
async function gesture(page: Page, distance: number, pointerType: 'mouse' | 'touch', duration: number, vertical = 0) {
  const stage = page.getByTestId('padel-viewer-stage');
  // Synthetic pointer stream gives deterministic timing; real CDP touch is tested separately.
  await stage.evaluate((element, args) => {
    const box = element.getBoundingClientRect(), x = box.x + box.width * .8, y = box.y + box.height * .4;
    const start = performance.now();
    const send = (type: string, dx: number, dy: number, elapsed: number) => {
      const event = new PointerEvent(type, { bubbles: true, pointerId: 991, pointerType: args.pointerType, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x - dx, clientY: y - dy });
      Object.defineProperty(event, 'timeStamp', { value: start + elapsed });
      element.dispatchEvent(event);
    };
    // Synthetic pointers are not registered with the browser's capture manager.
    const original = element.setPointerCapture;
    element.setPointerCapture = () => {};
    send('pointerdown', 0, 0, 0);
    for (let i = 1; i <= 5; i++) send('pointermove', args.distance * i / 5, args.vertical * i / 5, args.duration * i / 5);
    send('pointerup', args.distance, args.vertical, args.duration + 10);
    element.setPointerCapture = original;
  }, { distance, pointerType, duration, vertical });
}

test('initial assets are decoded, only full views preload, no macro requests or console errors', async ({ page }) => {
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  await ready(page);
  await state(page, 'front');
  expect(requests.some(url => url.endsWith('/perspective.webp'))).toBe(true);
  expect(requests.filter(url => /\/details\/.*(?<!-thumb)\.webp$/.test(url))).toHaveLength(0);
  expect(await page.locator('.explorer-product-image').evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth === 4612)).toBe(true);
  expect(errors).toEqual([]);
});

test('short controlled mouse drag, reversal, hysteresis and quick flick', async ({ page }) => {
  await ready(page);
  await gesture(page, 105, 'mouse', 800); await state(page, 'perspective');
  await gesture(page, -105, 'mouse', 800); await state(page, 'front');
  await gesture(page, 60, 'mouse', 800); await state(page, 'front');
  await gesture(page, 26, 'mouse', 30); await state(page, 'perspective');
  await gesture(page, -26, 'mouse', 30); await state(page, 'front');
});

test('real mouse drag and keyboard navigation', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse-specific input');
  await ready(page);
  const stage = page.getByTestId('padel-viewer-stage'), box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width * .85, box.y + box.height * .5);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .85 - 110, box.y + box.height * .5, { steps: 10 }); await page.mouse.up();
  await state(page, 'perspective');
  await stage.focus(); await page.keyboard.press('ArrowLeft'); await state(page, 'front');
  await page.keyboard.press('ArrowRight'); await state(page, 'perspective');
});

test('touch sensitivity, flick and vertical intent', async ({ page }) => {
  await ready(page);
  await gesture(page, 67, 'touch', 700); await state(page, 'perspective');
  await gesture(page, -25, 'touch', 25); await state(page, 'front');
  await gesture(page, 80, 'touch', 700, 200); await state(page, 'front');
});

test('real mobile touch drag, scroll and no horizontal overflow', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch device behavior');
  await ready(page);
  const session = await page.context().newCDPSession(page);
  const box = (await page.getByTestId('padel-viewer-stage').boundingBox())!;
  const x = box.x + box.width * .8, y = box.y + box.height * .55;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 10, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await state(page, 'perspective');
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 25 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('.eternal-lab').evaluate(e => e.scrollTop)).toBeGreaterThan(20);
  await state(page, 'perspective');
  expect(await page.locator('.eternal-lab').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
});

test('hotspots, all six details, zoom, pan, Escape and focus restoration', async ({ page }) => {
  await ready(page);
  const trigger = page.getByRole('button', { name: 'Explorar Superficie y textura', exact: true });
  await trigger.click();
  const titles = ['Superficie y textura', 'Puente', 'Perfil del marco', 'Power Balance', 'Grip y muñequera', 'Accesorios Power Balance'];
  for (let i = 0; i < titles.length; i++) {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: titles[i], exact: true })).toBeVisible();
    await expect(page.locator('.explorer-detail-image-canvas img')).toHaveAttribute('alt', titles[i]);
    await expect.poll(() => page.locator('.explorer-detail-image-canvas img').evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 3000)).toBe(true);
    if (i < titles.length - 1) await page.getByRole('button', { name: 'Detalle siguiente' }).click();
  }
  await page.getByRole('button', { name: 'Ampliar 2×' }).click();
  expect(await page.getByTestId('detail-image-area').evaluate(e => e.scrollWidth > e.clientWidth && e.scrollHeight > e.clientHeight)).toBe(true);
  await page.getByTestId('detail-image-area').evaluate(e => e.scrollTo(100,100));
  expect(await page.getByTestId('detail-image-area').evaluate(e => e.scrollTop)).toBe(100);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Explorar Puente', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar detalle' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('autoplay waits, pauses during inspection and resumes after idle', async ({ page }) => {
  await page.clock.install();
  await ready(page);
  await page.clock.runFor(7500); await state(page, 'front');
  await page.clock.runFor(1000); await state(page, 'perspective');
  await page.getByTestId('viewer-control-front').click();
  await page.clock.runFor(15000); await state(page, 'front');
  await page.getByRole('button', { name: 'Explorar Puente', exact: true }).click();
  await page.clock.runFor(15000); await state(page, 'front');
  await page.getByRole('button', { name: 'Cerrar detalle' }).click();
  await page.mouse.move(1, 1);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.clock.runFor(8500); await state(page, 'perspective');
  await page.getByRole('button', { name: 'Pausar movimiento automático' }).click();
  await page.mouse.move(1, 1); await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.clock.runFor(20000); await state(page, 'perspective');
});

test('reduced motion suppresses autoplay and visual animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install(); await ready(page);
  await page.clock.runFor(20000); await state(page, 'front');
  await expect(page.getByRole('button', { name: 'Activar movimiento automático' })).toBeDisabled();
  expect(await page.locator('.explorer-product-image').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
  await page.getByTestId('viewer-control-perspective').click(); await state(page, 'perspective');
});

test('failed detail can retry without a stale image', async ({ page }) => {
  let fail = true;
  await page.route('**/details/bridge.webp', route => fail ? route.abort() : route.continue());
  await ready(page);
  await page.getByRole('button', { name: 'Explorar Puente', exact: true }).click();
  await expect(page.getByText('No se pudo cargar este detalle.')).toBeVisible();
  await expect(page.locator('.explorer-detail-image-canvas img')).toHaveCount(0);
  fail = false; await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.locator('.explorer-detail-image-canvas img')).toHaveAttribute('alt', 'Puente');
});
