import { expect, test, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PAGE_PRICE_PLACEMENTS } from '../src/data/pagePriceZones';

/**
 * Precios visibles sobre las páginas desktop del catálogo (P15–26, P28–37).
 *
 * Todo es LOCAL y MOCK: el único host que se alcanza es el servidor de
 * desarrollo (127.0.0.1:5173). Cualquier otro host se aborta y queda
 * registrado, y la prueba falla si alguno se intenta. No se envían pedidos
 * reales ni hace falta ninguna cuenta: las rutas de distribuidores se
 * simulan con `page.route` y la cotización se arma con el productId y el qty
 * que pide el frontend.
 *
 * Los escenarios de distribuidor EXIGEN que el servidor de desarrollo arranque
 * con `VITE_DISTRIBUTOR_API_BASE_URL=http://127.0.0.1:9999` (la integración no
 * existe en el navegador sin esa variable). No se omiten en silencio: si la
 * variable falta, el escenario falla y lo dice.
 */

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** Precio lista vigente del catálogo (el que debe verse en la página). */
const LIST_PRICES: Record<string, number> = {
  eternal: 372000,
  'triton+ balance': 372000,
  kyra: 165000,
  'hard eva eternal': 146000,
  star: 124800,
  'neceser navy': 39000,
  'neceser moss': 39000,
};

/** Precio NETO simulado por el servidor: distinto en cada producto. */
const NET_PRICES: Record<string, number> = {
  eternal: 297600,
  'triton+ balance': 297600,
  kyra: 132000,
  'hard eva eternal': 117234.56,
  star: 99840,
  'neceser navy': 31200,
  'neceser moss': 31200,
};

const DESKTOP_SIZES = [[1366, 768], [1440, 900]] as const;

/** Páginas con producto y precio: paletas (oscuras) y accesorios (claros). */
const PADDLE_PAGES = [15, 20, 26] as const;
const ACCESSORY_PAGES = [29, 32] as const;

function displayAmount(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

async function boxOf(locator: import('@playwright/test').Locator): Promise<Rect> {
  const count = await locator.count();
  if (count !== 1) throw new Error(`selector ambiguo: ${count} elementos (${locator})`);
  const box = (await locator.boundingBox())!;
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height, width: box.width, height: box.height };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Ningún host externo: la prueba falla si algo intenta salir a la red real. */
async function blockExternalHosts(page: Page) {
  const external: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    external.push(url.href);
    await route.abort();
  });
  return external;
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()['origin'];
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

/** Sesión y cotización de distribuidor simuladas (nunca una cuenta real). */
async function mockDistributor(page: Page, options: { authenticated: boolean; pending?: boolean }) {
  const calls = { session: 0, quote: 0, orders: 0, quotes: [] as string[] };
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  await page.route('**/api/distributor/session', async route => {
    calls.session += 1;
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: 'application/json',
      body: JSON.stringify(options.authenticated
        ? { ok: true, authenticated: true, discountPercent: 20, expiresAt, sessionId: 'sesion-de-prueba-0001' }
        : { ok: true, authenticated: false }),
    });
  });
  await page.route('**/api/distributor/quote*', async route => {
    const url = new URL(route.request().url());
    const productId = url.searchParams.get('productId') ?? '';
    const qty = Number(url.searchParams.get('qty') ?? '1');
    calls.quote += 1;
    calls.quotes.push(`${productId}:${qty}`);
    const listUnitPrice = LIST_PRICES[productId] ?? 100000;
    const netUnitPrice = options.pending ? null : NET_PRICES[productId] ?? Math.round(listUnitPrice * .8);
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        currency: 'ARS',
        discountPercent: 20,
        lines: [{ productId, qty, listUnitPrice, netUnitPrice, netSubtotal: netUnitPrice }],
        listTotal: listUnitPrice,
        netTotal: netUnitPrice,
      }),
    });
  });
  await page.route('**/api/distributor/orders', async route => {
    calls.orders += 1;
    await route.abort();
  });
  return calls;
}

/** Va a una página del libro por el selector de la barra (mismo camino que el usuario). */
async function goToPage(page: Page, number: number) {
  await page.getByRole('button', { name: 'Ir a una página' }).click();
  await page.locator('#page-number').fill(String(number));
  await page.locator(".page-picker button[type='submit']").click();
  await expect(page.getByTestId('page-indicator')).toContainText(String(number));
}

/** Hoja de catálogo (no la versión mobile) con su capa de precio. */
function pdfPage(page: Page, number: number) {
  return page.locator(`.pdf-page[data-page-number="${number}"]`);
}

for (const [width, height] of DESKTOP_SIZES) {
  test(`desktop ${width}×${height}: las páginas de producto muestran su precio lista y la capa no invade el hotspot`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'La página de catálogo es desktop');
    const external = await blockExternalHosts(page);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);

    for (const number of PADDLE_PAGES) {
      await goToPage(page, number);
      const leaf = pdfPage(page, number);
      const tag = leaf.locator('.page-price-tag');
      await expect(tag).toHaveCount(1);
      await expect(tag).toHaveAttribute('data-price-zone', 'paddle');
      await expect(tag.locator('.mobile-accessory-price__label')).toHaveText('PRECIO LISTA');
      const productId = await tag.locator('.mobile-accessory-price').getAttribute('data-price-product');
      await expect(tag.locator('.mobile-accessory-price__amount')).toHaveText(`$ ${displayAmount(LIST_PRICES[productId!])}`);
      // Sin sesión de distribuidor: sólo precio lista, sin fila de distribuidor
      // ni etiqueta de descuento.
      await expect(tag.locator('.mobile-accessory-price__net')).toHaveCount(0);
      await expect(tag.locator('.mobile-accessory-price__discount')).toHaveCount(0);

      // El precio no pisa el hotspot del producto ni sale de la hoja.
      const hotspot = leaf.locator(`.product-hotspot[data-product-id="${productId}"]`);
      const hotspotBox = await boxOf(hotspot);
      const tagBox = await boxOf(tag);
      expect(overlaps(tagBox, hotspotBox), 'el precio sobre el hotspot').toBe(false);
      const leafBox = await boxOf(leaf);
      expect(tagBox.left).toBeGreaterThanOrEqual(leafBox.left - 1);
      expect(tagBox.right).toBeLessThanOrEqual(leafBox.right + 1);
      expect(tagBox.top).toBeGreaterThanOrEqual(leafBox.top - 1);
      expect(tagBox.bottom).toBeLessThanOrEqual(leafBox.bottom + 1);
    }

    for (const number of ACCESSORY_PAGES) {
      await goToPage(page, number);
      const leaf = pdfPage(page, number);
      const tag = leaf.locator('.page-price-tag');
      await expect(tag).toHaveCount(1);
      await expect(tag).toHaveAttribute('data-price-zone', 'accessory');
      const productId = await tag.locator('.mobile-accessory-price').getAttribute('data-price-product');
      expect(productId && LIST_PRICES[productId]).toBeDefined();
      await expect(tag.locator('.mobile-accessory-price__amount')).toHaveText(`$ ${displayAmount(LIST_PRICES[productId!])}`);
    }

    // P38 es la retícula de accesorios: por decisión editorial NO lleva precio.
    await goToPage(page, 38);
    await expect(pdfPage(page, 38).locator('.page-price-tag')).toHaveCount(0);

    // P37: dos neceseres, dos precios independientes.
    await goToPage(page, 37);
    const pair = pdfPage(page, 37).locator('.page-price-tag');
    await expect(pair).toHaveCount(2);
    await expect(pair.nth(0)).toHaveAttribute('data-price-zone', 'pair-left');
    await expect(pair.nth(1)).toHaveAttribute('data-price-zone', 'pair-right');
    const ids = await pair.locator('.mobile-accessory-price').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('data-price-product')));
    expect(new Set(ids).size).toBe(2);

    expect(external).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`precios-paginas-${width}x${height}.png`) });
  });

  test(`desktop ${width}×${height}: el contraste del precio se adapta a la página clara y a la oscura`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'La página de catálogo es desktop');
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);

    await goToPage(page, 15);
    const paddle = pdfPage(page, 15).locator('.page-price-tag .mobile-accessory-price__amount');
    await expect(paddle).toHaveCount(1);
    const darkAmount = await paddle.evaluate(node => getComputedStyle(node).color);

    await goToPage(page, 29);
    const light = pdfPage(page, 29).locator('.page-price-tag .mobile-accessory-price__amount');
    await expect(light).toHaveCount(1);
    const lightAmount = await light.evaluate(node => getComputedStyle(node).color);

    const luminance = (color: string) => {
      const channels = (color.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
      return (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255;
    };
    // Página oscura: texto claro. Página clara: texto oscuro.
    expect(luminance(darkAmount)).toBeGreaterThan(0.5);
    expect(luminance(lightAmount)).toBeLessThan(0.5);
  });

  test(`desktop ${width}×${height}: el distribuidor ve el precio neto del servidor en la página`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'La página de catálogo es desktop');
    const external = await blockExternalHosts(page);
    const calls = await mockDistributor(page, { authenticated: true });
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);

    await goToPage(page, 15);
    const tag = pdfPage(page, 15).locator('.page-price-tag');
    await expect(tag.locator('.mobile-accessory-price__net-value')).toHaveText(`$ ${displayAmount(NET_PRICES.eternal)}`);
    await expect(tag.locator('.mobile-accessory-price__amount')).toHaveText(`$ ${displayAmount(LIST_PRICES.eternal)}`);
    // Opción A: la fila de distribuidor con su rótulo y la etiqueta de
    // descuento del servidor (signo menos tipográfico, texto plano).
    await expect(tag.locator('.mobile-accessory-price__net-label')).toHaveText('PRECIO DISTRIBUIDOR');
    await expect(tag.locator('.mobile-accessory-price__discount')).toHaveText('\u221220%');
    expect(calls.quotes).toContain('eternal:1');
    expect(calls.orders).toBe(0);
    expect(external).toEqual([]);
  });

  test(`desktop ${width}×${height}: la capa de precio es inerte y el hotspot sigue abriendo la ficha`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'La página de catálogo es desktop');
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);

    await goToPage(page, 15);
    const leaf = pdfPage(page, 15);
    await expect(leaf.locator('.page-price-tag')).toHaveCount(1);
    // La capa no intercepta el puntero del hotspot del motor del libro.
    const pointerEvents = await leaf.locator('.page-price-overlay').evaluate(node => getComputedStyle(node).pointerEvents);
    expect(pointerEvents).toBe('none');
    await expect(leaf.locator('.page-price-overlay [data-product-id]')).toHaveCount(0);

    const hotspot = leaf.locator('.product-hotspot[data-product-id="eternal"]');
    await expect(hotspot).toBeVisible();
    await hotspot.click();
    const dialog = page.getByRole('dialog', { name: 'Eternal' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar ficha' }).click();
    await expect(dialog).toHaveCount(0);
  });
}

/* ───────────────────── ubicación por página contra el arte original ───────────────────── */

/**
 * Rectángulo en PORCENTAJES de la caja de la página. La metadata de las
 * zonas trae sólo izquierda, arriba, ancho y alto: los bordes se calculan
 * al comparar (ver `crosses`).
 */
type PercentRect = { left: number; top: number; width: number; height: number };

/** Rectángulo del elemento en porcentajes de la caja de la página. */
function percentOf(box: Rect, page: Rect): PercentRect {
  return {
    left: ((box.left - page.left) / page.width) * 100,
    top: ((box.top - page.top) / page.height) * 100,
    width: (box.width / page.width) * 100,
    height: (box.height / page.height) * 100,
  };
}

/**
 * ¿Se cruzan dos rectángulos medidos en la misma caja?
 *
 * Los bordes (right/bottom) se calculan AQUÍ para LOS DOS rectángulos: la
 * metadata de las zonas sólo trae izquierda, arriba, ancho y alto, así que
 * comparar contra bordes inexistentes nunca detectaría un cruce real.
 */
function crosses(a: PercentRect, b: PercentRect): boolean {
  const aRight = a.left + a.width;
  const aBottom = a.top + a.height;
  const bRight = b.left + b.width;
  const bBottom = b.top + b.height;
  return a.left < bRight && b.left < aRight && a.top < bBottom && b.top < aBottom;
}

for (const [width, height] of DESKTOP_SIZES) {
  test(`desktop ${width}×${height}: el precio de cada página cae en su zona libre medida y no tapa el arte`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'La página de catálogo es desktop');
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);

    for (const placement of PAGE_PRICE_PLACEMENTS) {
      await goToPage(page, placement.pageNumber);
      const leaf = pdfPage(page, placement.pageNumber);
      const tag = leaf.locator('.page-price-tag');
      await expect(tag, `la página ${placement.pageNumber} no muestra su precio`).toHaveCount(1);

      const pageBox = await boxOf(leaf);
      const chip = percentOf(await boxOf(tag), pageBox);
      const region = placement.region;

      // El chip vive DENTRO de la zona libre medida para su página.
      expect(chip.left, `P${placement.pageNumber}: el chip se sale por la izquierda`).toBeGreaterThanOrEqual(region.left - 0.5);
      expect(chip.top, `P${placement.pageNumber}: el chip se sale por arriba`).toBeGreaterThanOrEqual(region.top - 0.5);
      expect(chip.left + chip.width, `P${placement.pageNumber}: el chip se sale por la derecha`).toBeLessThanOrEqual(region.left + region.width + 0.5);
      expect(chip.top + chip.height, `P${placement.pageNumber}: el chip se sale por abajo`).toBeLessThanOrEqual(region.top + region.height + 0.5);

      // Y no toca NINGÚN elemento de arte medido (tabla, banda, firma, INCLUYE...).
      for (const avoid of placement.avoid) {
        expect(
          crosses(chip, avoid),
          `P${placement.pageNumber}: el precio pisa ${avoid.name}`,
        ).toBe(false);
      }
    }
  });

  test(`desktop ${width}×${height}: P37 conserva su distribución y P38 no lleva precios`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('mobile'), 'La página de catálogo es desktop');
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);

    // P37: un chip por neceser, con su nombre y SIN ubicación por página.
    await goToPage(page, 37);
    const pair = pdfPage(page, 37).locator('.page-price-tag');
    await expect(pair).toHaveCount(2);
    await expect(pair.nth(0)).toHaveAttribute('data-price-zone', 'pair-left');
    await expect(pair.nth(1)).toHaveAttribute('data-price-zone', 'pair-right');
    await expect(pair.nth(0)).not.toHaveAttribute('data-price-page', /.+/);

    // P38: la retícula de accesorios no lleva precios.
    await goToPage(page, 38);
    await expect(pdfPage(page, 38).locator('.page-price-tag')).toHaveCount(0);
  });
}

/**
 * Contrato de alcance (sin navegador): la contención de tamaño —la que
 * permite medir el chip respecto del ancho de la hoja— sólo se aplica a las
 * páginas con ubicación medida (P15–26, P28–36). P37 conserva la capa sin
 * contención y P38 no lleva precios.
 */
test('contrato: la contención de tamaño sólo alcanza a las páginas con ubicación medida', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  const shared = /\.page-price-overlay\s*\{([^}]*)\}/.exec(css);
  expect(shared, 'no se encuentra la regla de la capa de precio').not.toBeNull();
  // La capa compartida NO declara contención: P37 y P38 quedan fuera.
  expect(shared![1]).not.toMatch(/container-type/);

  const measured = /\.page-price-overlay\[data-price-measured="true"\]\s*\{([^}]*)\}/.exec(css);
  expect(measured, 'no se encuentra la regla de la capa medida').not.toBeNull();
  expect(measured![1]).toMatch(/container-type:\s*size/);

  // El tamaño relativo a la hoja (cqw) sólo existe en reglas de páginas
  // medidas: los chips de P37 no reciben ningún override de tamaño.
  const relative = [...css.matchAll(/([^{}]*)\{([^}]*cqw[^}]*)\}/g)].map(match => ({ selector: match[1], body: match[2] }));
  expect(relative.length).toBeGreaterThan(0);
  for (const rule of relative) expect(rule.selector).toContain('[data-price-page]');
  const pairRules = [...css.matchAll(/\.page-price-tag\[data-price-zone="pair-[^"]+"\][^{]*\{([^}]*)\}/g)].map(match => match[1]);
  expect(pairRules.length).toBeGreaterThan(0);
  for (const rule of pairRules) expect(rule).not.toMatch(/cqw/);
});

/**
 * Contrato de la Opción A (SIN navegador): filete de 1 px entre las filas,
 * importe lista apagado, neto destacado, etiqueta de descuento en texto plano
 * (sin pastilla, sin borde, sin fondo) y las escalas aprobadas por contexto.
 *
 * Esto NO prueba el dibujo: la geometría real y el contraste se comprueban en
 * el navegador, que no se pudo ejecutar en este entorno.
 */
test('contrato: la Opción A (filete, jerarquía y etiqueta en texto plano)', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  // 1 · El filete de 1 px va en la fila de DISTRIBUIDOR.
  const netRow = /\.mobile-accessory-price__row--net\s*\{([^}]*)\}/.exec(css);
  expect(netRow, 'no se encuentra la regla de la fila de distribuidor').not.toBeNull();
  expect(netRow![1]).toMatch(/border-top:\s*1px\s+solid\s+var\(--pv-hairline\)/);
  expect(netRow![1]).toMatch(/padding-top:\s*6px/);

  // 2 · El visitante (una sola fila) no ve ninguna línea: la celda completa
  //     no declara filete superior.
  for (const body of [...css.matchAll(/\.mobile-accessory-price\s*\{([^}]*)\}/g)].map(match => match[1])) {
    expect(body).not.toMatch(/border-top/);
  }

  // 3 · La etiqueta de descuento es TEXTO PLANO: sin pastilla, sin borde, sin
  //     fondo y sin relleno.
  const discounts = [...css.matchAll(/([^{}]*\.mobile-accessory-price__discount[^{}]*)\{([^}]*)\}/g)];
  expect(discounts.length).toBeGreaterThan(0);
  for (const [, selector, body] of discounts) {
    expect(body, selector).not.toMatch(/border/);
    expect(body, selector).not.toMatch(/background/);
    expect(body, selector).not.toMatch(/border-radius/);
    expect(body, selector).not.toMatch(/padding/);
  }

  // 4 · El chip de la página no lleva placa: ni fondo ni recuadro redondeado.
  for (const [, selector, body] of [...css.matchAll(/([^{}]*\.page-price-tag[^{}]*)\{([^}]*)\}/g)]) {
    if (!selector.includes('mobile-accessory-price')) continue;
    expect(body, selector).not.toMatch(/background/);
    expect(body, selector).not.toMatch(/border-radius/);
  }

  // 5 · Jerarquía: la lista apagada con peso 600 y el neto destacado con 720.
  const amountRules = [...css.matchAll(/([^{}]*\.mobile-accessory-price__(?:amount|net-value)[^{}]*)\{([^}]*)\}/g)];
  const list = amountRules.find(([, selector]) => selector.includes('__amount') && !selector.includes('__net'));
  expect(list, 'no se encuentra la regla del importe lista').toBeDefined();
  expect(list![2]).toMatch(/font-weight:\s*600/);
  expect(list![2]).toMatch(/color:\s*var\(--pv-muted\)/);
  const net = amountRules.find(([, selector]) => selector.includes('__net-value'));
  expect(net, 'no se encuentra la regla del importe neto').toBeDefined();
  expect(net![2]).toMatch(/font-weight:\s*720/);
  expect(net![2]).toMatch(/color:\s*var\(--pv-amount\)/);

  // 6 · Tokens de color: fondo oscuro y fondo claro.
  const tone = /:is\([^)]*\)\s+\.mobile-accessory-price\s*\{([^}]*)\}/.exec(css);
  expect(tone, 'no se encuentra la piel compartida de los precios').not.toBeNull();
  expect(tone![1]).toMatch(/--pv-label:\s*#f0a49c/);
  expect(tone![1]).toMatch(/--pv-accent:\s*#f0a49c/);
  expect(tone![1]).toMatch(/--pv-amount:\s*#fff/);
  expect(tone![1]).toMatch(/--pv-muted:\s*#b6b9bf/);
  expect(tone![1]).toMatch(/--pv-hairline:\s*rgba\(255,\s*255,\s*255,\s*\.16\)/);
  const light = /\.page-price-tag\[data-price-zone="accessory"\][^{]*\.mobile-accessory-price\s*\{([^}]*)\}/.exec(css);
  expect(light, 'no se encuentra el contraste de las páginas claras').not.toBeNull();
  expect(light![1]).toMatch(/--pv-label:\s*#a5342b/);
  expect(light![1]).toMatch(/--pv-accent:\s*#a5342b/);
  expect(light![1]).toMatch(/--pv-amount:\s*#17181b/);
  expect(light![1]).toMatch(/--pv-muted:\s*#5c5f66/);
  expect(light![1]).toMatch(/--pv-hairline:\s*rgba\(0,\s*0,\s*0,\s*\.16\)/);

  // 7 · Escalas aprobadas de la página (medidas respecto del ancho de la hoja).
  const measured = /\.page-price-tag\[data-price-page\]\s+\.mobile-accessory-price\s*\{([^}]*)\}/.exec(css);
  expect(measured, 'no se encuentra la escala de las páginas medidas').not.toBeNull();
  expect(measured![1]).toMatch(/--pv-label-size:\s*clamp\(7px,\s*0\.62cqw,\s*11px\)/);
  expect(measured![1]).toMatch(/--pv-list-size:\s*clamp\(10px,\s*1\.05cqw,\s*17px\)/);
  expect(measured![1]).toMatch(/--pv-net-size:\s*clamp\(12px,\s*1\.35cqw,\s*21px\)/);
  expect(measured![1]).toMatch(/--pv-save-size:\s*clamp\(7px,\s*0\.58cqw,\s*10px\)/);
});

/**
 * Sonda de regresión SIN navegador: el cruce de rectángulos tiene que
 * DETECTAR un solapamiento real. Con la metadata de las zonas (izquierda,
 * arriba, ancho y alto, sin bordes) una comparación que use `right`/`bottom`
 * sin calcularlos jamás detectaría un cruce: la comprobación del chip contra
 * el arte sería vacua.
 */
test('contrato: el cruce de rectángulos detecta un solapamiento real', async () => {
  const region = { left: 70.5, top: 48, width: 18.5, height: 38 };
  // Un rectángulo se cruza consigo mismo.
  expect(crosses(region, region)).toBe(true);
  // Con un hueco de un punto no hay cruce.
  expect(crosses(region, { ...region, left: region.left + region.width + 1 })).toBe(false);
  // Con un solapamiento de un punto SÍ hay cruce.
  expect(crosses(region, { ...region, left: region.left + region.width - 1 })).toBe(true);
  // El cruce tampoco depende del orden de los argumentos.
  expect(crosses({ ...region, left: region.left + region.width - 1 }, region)).toBe(true);
  // Y el arte que la zona libre no puede tapar está medido y DISJUNTO de la
  // zona: la comprobación del chip contra el arte tiene sobre qué trabajar.
  for (const placement of PAGE_PRICE_PLACEMENTS) {
    for (const avoid of placement.avoid) {
      expect(
        crosses(placement.region, avoid),
        `P${placement.pageNumber}: la zona libre pisa ${avoid.name}`,
      ).toBe(false);
    }
  }
});
