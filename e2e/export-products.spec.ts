import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import published from "../generated/products.json" with { type: "json" };

async function openExport(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole("button", { name: "Abrir miniaturas", exact: true }).tap();
    await expect(page.locator('.thumbnail-drawer')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await page.locator('.mobile-export-button').tap();
    await expect(page.locator('.thumbnail-drawer')).not.toHaveClass(/is-open/);
  } else await page.locator('.desktop-export-button').click();
  await expect(page.getByRole('dialog', { name: 'Descargar productos' })).toBeVisible();
}

async function downloadWorkbook(page: Page, name: string) {
  const ready = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Descargar Excel', exact: true }).click();
  const download = await ready;
  expect(download.suggestedFilename()).toBe(name);
  const file = await download.path();
  expect(await download.failure()).toBeNull();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file!);
  expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Productos']);
  expect(workbook.worksheets[0].columnCount).toBe(5);
  expect(workbook.worksheets[0].getRow(1).values).toEqual([undefined, 'SKU', 'Nombre', 'Categoría', 'Subcategoría', 'Precio']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return { download, sheet: workbook.worksheets[0] };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/orders**', route => route.abort());
});

test('descarga el catálogo vigente completo desde desktop y mobile sin publicar el Excel administrativo', async ({ page, isMobile }, testInfo) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  const excelRequests = () => requests.filter(url => /exceljs|exceljs_min/.test(url));
  expect(excelRequests()).toHaveLength(0);
  const label = await page.getByTestId('page-indicator').textContent();
  await openExport(page, isMobile);
  expect(excelRequests()).toHaveLength(0);
  await expect(page.getByText(`${published.products.length} productos`, { exact: true })).toBeVisible();
  // Keyboard navigation cannot reach the inert book behind the modal.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('page-indicator')).toHaveText(label!);
  const { download, sheet } = await downloadWorkbook(page, 'starvie-2027-productos.xlsx');
  expect(excelRequests().length).toBeGreaterThan(0);
  expect(sheet.rowCount).toBe(published.products.length + 1);
  published.products.forEach((product, index) => {
    const row = sheet.getRow(index + 2);
    expect(row.getCell(1).value).toBe(product.sku || null);
    expect(row.getCell(2).value).toBe(product.nombre);
    expect(row.getCell(3).value).toBe(product.categoria);
    expect(row.getCell(4).value).toBe(product.subcategoria);
    const price = published.zeroPriceProductIds.includes(product.id) ? 0 : product.precio;
    expect(row.getCell(5).value).toBe(price);
    if (price !== null) expect(row.getCell(5).type).toBe(ExcelJS.ValueType.Number);
  });
  expect(requests.some(url => /\.xlsx(?:\?|$)/.test(url))).toBe(false);
  await download.saveAs(testInfo.outputPath('starvie-2027-productos.xlsx'));
  await expect(page.getByTestId('page-indicator')).toHaveText(label!);
  await expect(page.locator('.catalog-app')).not.toHaveAttribute('inert');
  await expect(page.locator(isMobile ? '.menu-button' : '.desktop-export-button')).toBeFocused();
});

test('filtros dinámicos exportan SKU como texto, precio positivo, cero y productos Sin stock', async ({ page, isMobile }) => {
  const p = published.products[0];
  const products = [
    { ...p, id: 'a', sku: '000001', nombre: 'A', categoria: 'Categoría nueva', subcategoria: 'Uno', precio: 1234.5 },
    { ...p, id: 'b', sku: '', nombre: 'B', categoria: 'Categoría nueva', subcategoria: 'Dos', precio: null, disponible: false },
    { ...p, id: 'c', sku: 'C', nombre: 'C', categoria: 'Otra', subcategoria: 'Uno', precio: null },
  ];
  await page.route('**/products.json?*', route => route.fulfill({ json: { schemaVersion: 1, products, zeroPriceProductIds: ['b'] } }));
  await page.goto('/');
  await openExport(page, isMobile);
  await page.getByLabel('Por categoría', { exact: true }).check();
  const category = page.getByLabel('Categoría', { exact: true });
  await expect(category.locator('option')).toHaveText(['Categoría nueva', 'Otra']);
  await category.selectOption('Categoría nueva');
  const { sheet } = await downloadWorkbook(page, 'starvie-2027-categoria-nueva.xlsx');
  expect(sheet.rowCount).toBe(3);
  expect(sheet.getCell('A2').value).toBe('000001');
  expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
  expect(sheet.getCell('E2').value).toBe(1234.5);
  expect(sheet.getCell('A3').value).toBeNull();
  expect(sheet.getCell('E3').value).toBe(0);
  expect(sheet.getCell('E3').type).toBe(ExcelJS.ValueType.Number);
  await openExport(page, isMobile);
  await page.getByLabel('Por categoría y subcategoría').check();
  await category.selectOption('Categoría nueva');
  await expect(page.getByLabel('Subcategoría', { exact: true }).locator('option')).toHaveText(['Dos', 'Uno']);
  await page.getByLabel('Subcategoría', { exact: true }).selectOption('Dos');
  const subset = await downloadWorkbook(page, 'starvie-2027-categoria-nueva-dos.xlsx');
  expect(subset.sheet.rowCount).toBe(2);
  expect(subset.sheet.getCell('B2').value).toBe('B');
  await openExport(page, isMobile);
  await page.getByLabel('Por categoría', { exact: true }).check();
  await category.selectOption('Otra');
  const pending = await downloadWorkbook(page, 'starvie-2027-otra.xlsx');
  expect(pending.sheet.getCell('E2').value).toBeNull();
});

test('el polling actualiza opciones y filas sin cerrar el modal ni recrear el libro', async ({ page, isMobile }) => {
  await page.clock.install();
  let version = 'a';
  let products = [{ ...published.products[0], id: 'a', categoria: 'Original', subcategoria: 'Anterior', precio: 0 }];
  await page.route('**/products-version.json?*', route => route.fulfill({ json: { schemaVersion: 1, version: `sha256-${version.repeat(64)}`, productsFile: 'products.json' } }));
  await page.route('**/products.json?*', route => route.fulfill({ json: { schemaVersion: 1, products, zeroPriceProductIds: [] } }));
  await page.goto('/');
  await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  const book = await page.getByTestId('page-flip-engine').elementHandle();
  await openExport(page, isMobile);
  await page.getByLabel('Por categoría y subcategoría').check();
  await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('Original');
  version = 'b';
  products = [{ ...products[0], categoria: 'Nueva', subcategoria: 'Actual', precio: 42 }];
  await page.clock.fastForward(61_000);
  await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('Nueva');
  await expect(page.getByLabel('Subcategoría', { exact: true })).toHaveValue('Actual');
  const result = await downloadWorkbook(page, 'starvie-2027-nueva-actual.xlsx');
  expect(result.sheet.getCell('E2').value).toBe(42);
  expect(await book!.evaluate(el => el.isConnected)).toBe(true);
});

test('menú, miniaturas, contacto y navegación conservan su comportamiento después de exportar', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Menú mobile');
  await page.goto('/');
  await openExport(page, true);
  await page.getByRole('button', { name: 'Cerrar exportación' }).tap();
  await page.getByRole('button', { name: 'Abrir miniaturas', exact: true }).tap();
  await expect(page.locator('.thumbnail-drawer')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  const excel = page.locator('.mobile-export-button'), contact = page.locator('.mobile-contact-footer button').filter({ hasText: /^Contacto$/ });
  const before = await excel.boundingBox();
  expect(before!.height).toBeGreaterThanOrEqual(44);
  const thumbnail = page.getByRole('button', { name: 'Ir a página 38', exact: true });
  await thumbnail.scrollIntoViewIfNeeded();
  expect(await excel.boundingBox()).toEqual(before);
  await expect(contact).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('export-mobile-menu.png') });
  await thumbnail.tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('38 / 39');
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition', 'idle');
  await page.getByRole('button', { name: 'Abrir miniaturas', exact: true }).tap();
  await contact.tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('CONTRATAPA / 39');
  await openExport(page, true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('page-indicator')).toHaveText('CONTRATAPA / 39');
  await expect(page.getByRole('link', { name: 'Instagram de RealStep', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Página anterior', exact: true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('38 / 39');
});

for (const viewport of [
  { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 },
  { width: 320, height: 480 }, { width: 393, height: 851 }, { width: 667, height: 375 },
]) {
  test(`modal y controles sin desbordes ${viewport.width}×${viewport.height}`, async ({ page, context, isMobile }, testInfo) => {
    test.skip(isMobile !== (viewport.width < 1024), 'Presentación correspondiente al dispositivo');
    const cdp = isMobile ? await context.newCDPSession(page) : null;
    if (cdp) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } });
    await page.setViewportSize(viewport);
    await page.goto('/');
    await openExport(page, isMobile);
    await page.getByLabel('Por categoría y subcategoría').check();
    await expect(page.getByLabel('Subcategoría', { exact: true })).toBeVisible();
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
      return { dialog: box('.catalog-export-dialog'), actions: box('.catalog-export-actions'),
        header: [box('.toolbar-left'), box('.page-picker-wrap'), box('.toolbar-right')],
        download: box('.catalog-export-download') };
    });
    expect(geometry.dialog.left).toBeGreaterThanOrEqual(0);
    expect(geometry.dialog.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.dialog.top).toBeGreaterThanOrEqual(0);
    expect(geometry.dialog.bottom).toBeLessThanOrEqual(viewport.height);
    if (isMobile) expect(geometry.dialog.bottom).toBeLessThanOrEqual(viewport.height - 34);
    expect(geometry.download.bottom).toBeLessThanOrEqual(geometry.dialog.bottom);
    expect(geometry.download.height).toBeGreaterThanOrEqual(44);
    if (!isMobile) {
      const [left, center, right] = geometry.header;
      expect(left.right).toBeLessThanOrEqual(center.left);
      expect(center.right).toBeLessThanOrEqual(right.left);
    }
    await page.screenshot({ path: testInfo.outputPath('export-modal.png') });
    await page.getByRole('button', { name: 'Cerrar exportación' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await cdp?.detach();
  });
}
