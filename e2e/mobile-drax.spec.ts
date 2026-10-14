import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.route('**/api/orders**', route => route.abort()); });

test('P24 Drax+: plantilla portrait, datos reales y las tres acciones conservan el modal original', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Solo portrait');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await page.getByTestId('page-indicator').click();
  await page.locator('#page-number').fill('24');
  await page.locator('.page-picker button').click();
  const engine = page.getByTestId('page-flip-engine');
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition', 'idle');
  await expect(page.getByTestId('page-indicator')).toHaveText('24 / 39');
  const originalEngine = await engine.elementHandle();
  // Native corner previews may add temporary copies; keep the mounted source.
  const sourceLeaf = page.locator('.catalog-leaf[data-book-index="24"]').first();
  const leaf = sourceLeaf.getByRole('article', { name: 'Página 24, edición vertical StarVie', exact: true });
  await expect(leaf.getByRole('heading', { name: 'DRAX+', exact: true })).toBeVisible();
  await expect(leaf.locator('.mobile-premium-product-page__masthead strong')).toHaveText('GAMA PREMIUM');
  await expect(leaf.locator('.mobile-premium-product-page__masthead > span')).toHaveText('INTERMEDIO');
  for (const text of ['BREAK THE RULES', 'REF: PSTDP31000', 'EAN: 8436612941073']) {
    await expect(leaf.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(leaf.locator('.mobile-premium-product-page__folio')).toContainText('ECOFRIENDLY GYMSACK');
  await expect(leaf.locator('.mobile-premium-product-page__technologies li')).toHaveText([
    '12K Carbon Hyper', 'M-Eva Balance', 'Spin Boost Tech', 'Hepta Bridge', 'Shock Shield', 'Reactive Holes', 'Longer Handgrip', 'Air Flow Design', 'Z-shock',
  ]);
  await expect(leaf.locator('.mobile-premium-product-page__technology-new')).toHaveCount(0);
  const technologyRows = await leaf.locator('.mobile-premium-product-page__technologies li').all();
  const features = (await leaf.locator('.mobile-premium-product-page__features').boundingBox())!;
  let previousBottom = 0;
  for (const row of technologyRows) {
    await expect(row).toBeVisible();
    const bounds = (await row.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(previousBottom - 1);
    expect(bounds.y + bounds.height).toBeLessThan(features.y);
    previousBottom = bounds.y + bounds.height;
  }
  await expect(leaf.locator('.mobile-premium-product-page__technical dd')).toHaveText(['LÁGRIMA', '12K CARBON HYPER', '350–370 GR', 'MEDIO']);
  const surface = leaf.locator('.mobile-premium-product-page__technical dd').nth(1);
  await expect(surface).toHaveCSS('white-space', 'normal');
  expect(await surface.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(leaf.locator('.mobile-premium-product-page__playstyle strong')).toHaveText('CONTROL');
  const hero = leaf.getByRole('img', { name: 'Drax+', exact: true });
  await expect(hero).toHaveAttribute('data-mobile-hero-source', 'products/palas/DRAX/DRAX1.5.webp');
  await expect.poll(() => hero.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const sweetSpot = leaf.getByRole('img', { name: 'Punto dulce de Drax+' });
  await expect(sweetSpot).toHaveAttribute('src', /mobile\/drax-sweetspot\.png$/);
  await expect.poll(() => sweetSpot.evaluate(img => [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight])).toEqual([139,249]);
  await expect(leaf.locator('.mobile-court-scene--product')).toBeVisible();
  await expect(leaf.locator('.mobile-premium-product-page__scene')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('drax-portrait.png') });
  const frame = await engine.boundingBox();
  for (const name of ['Abrir ficha de Drax+', 'Ver ficha y opciones de pedido de Drax+', 'Explorar Drax+']) {
    await leaf.getByRole('button', { name, exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Drax+', exact: true });
    await expect(dialog).toHaveClass(/product-modal/);
    await expect(dialog.getByRole('button', { name: /Ver imagen/ })).toHaveCount(5);
    await expect(dialog.locator('img[src*="/hero/"]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cerrar ficha', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('page-indicator')).toHaveText('24 / 39');
    expect(await engine.boundingBox()).toEqual(frame);
  }
  const viewport = sourceLeaf.getByTestId('mobile-premium-viewport');
  const box = (await viewport.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const midpoint = box.x + box.width * .5, y = box.y + box.height * .55;
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { id: 1, x: midpoint - box.width * .12, y }, { id: 2, x: midpoint + box.width * .12, y },
    ] });
    for (const separation of [.16,.2,.24]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
        { id: 1, x: midpoint - box.width * separation, y }, { id: 2, x: midpoint + box.width * separation, y },
      ] });
      await page.waitForTimeout(35);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
  await expect(viewport).toHaveAttribute('data-zoom', '2.00');
  await expect(page.getByRole('dialog', { name: 'Drax+', exact: true })).toHaveCount(0);
  await sourceLeaf.getByRole('button', { name: 'Restablecer zoom de la hoja' }).tap();
  await expect(viewport).toHaveAttribute('data-zoom', '1.00');
  await expect(page.getByTestId('page-indicator')).toHaveText('24 / 39');
  await page.getByRole('button', { name: 'Página anterior', exact: true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('23 / 39');
  await expect(engine).toHaveAttribute('data-flip-state', 'read');
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('24 / 39');
  await expect(engine).toHaveAttribute('data-flip-state', 'read');
  expect(await originalEngine!.evaluate(node => node.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('25 / 39');
  await expect(engine).toHaveAttribute('data-flip-state', 'read');
  await page.getByRole('button', { name: 'Página anterior', exact: true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('24 / 39');
  await expect(engine).toHaveAttribute('data-flip-state', 'read');
  const guide = await page.locator('.mobile-gesture-hint').boundingBox();
  const action = await leaf.getByRole('button', { name: 'Explorar Drax+', exact: true }).boundingBox();
  expect(action!.y + action!.height).toBeLessThan(guide!.y);
  await page.getByRole('button', { name: 'Abrir pedido' }).tap();
  await expect(page.getByRole('dialog', { name: 'Pedido', exact: true })).toContainText('Todavía no agregaste productos');
  expect(errors).toEqual([]);
});

test('P24 conserva el PDF en desktop y landscape', async ({ page, isMobile }, testInfo) => {
  if (isMobile) await page.setViewportSize({ width: 915, height: 412 });
  await page.goto('/?mobile-pilot=24');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','read');
  await expect(page.locator('img[data-catalog-page="24"]')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Página 24, edición vertical StarVie', exact: true })).toHaveCount(0);
  await expect(page.locator('.mobile-court-experience')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('drax-original-pdf.png') });
});
