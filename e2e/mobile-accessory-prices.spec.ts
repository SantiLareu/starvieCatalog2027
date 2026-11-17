import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

/**
 * Precios en las páginas mobile de accesorios (P28–37).
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

const catalog = JSON.parse(readFileSync(new URL('../public/products.json', import.meta.url), 'utf8')) as {
  products: { id: string; pagina: number; precio: number }[];
};
const PADDLE_PAGES = catalog.products
  .filter(product => product.pagina >= 15 && product.pagina <= 26)
  .sort((a, b) => a.pagina - b.pagina);

/** Precio lista vigente del catálogo (el que debe verse en la hoja). */
const LIST_PRICES: Record<string, number> = {
  'hard eva eternal': 146000,
  't-one pro': 146000,
  'pro master': 135000,
  'star': 124800,
  'm hard eva black': 110000,
  'artic sport': 105000,
  'black voltage': 110000,
  'neceser navy': 39000,
  'neceser moss': 41500,
  ...Object.fromEntries(PADDLE_PAGES.map(product => [product.id, product.precio])),
};

/** Precio NETO simulado por el servidor: distinto en cada producto. */
const NET_PRICES: Record<string, number> = {
  'hard eva eternal': 117234.56,
  't-one pro': 117234.56,
  'pro master': 108000,
  'star': 99840,
  'm hard eva black': 88000,
  'artic sport': 84000,
  'black voltage': 88000,
  'neceser navy': 31200,
  'neceser moss': 33200,
  'eternal': 297600,
  'triton+ balance': 297600,
  'kyra': 132000,
};

/** Hojas de producto único (P28–P36): producto, ficha y un solo precio. */
type SinglePage = {
  card: string;
  label: string;
  /** null = el producto vivo no tiene precio y la hoja no lleva celda. */
  productId: string | null;
  amount: string | null;
};

const SINGLE_PAGES: SinglePage[] = [
  { card: 'Paletero Hard Eva Black: ver en página 28', label: 'Página 28, HARD EVA BLACK', productId: null, amount: null },
  { card: 'Paletero Hard Eva Eternal: ver en página 29', label: 'Página 29, HARD EVA ETERNAL', productId: 'hard eva eternal', amount: '$ 146.000' },
  { card: 'Paletero T-One Pro: ver en página 30', label: 'Página 30, T-ONE PRO', productId: 't-one pro', amount: '$ 146.000' },
  { card: 'Paletero Pro Master: ver en página 31', label: 'Página 31, PRO MASTER', productId: 'pro master', amount: '$ 135.000' },
  { card: 'Paletero Star: ver en página 32', label: 'Página 32, STAR', productId: 'star', amount: '$ 124.800' },
  { card: 'Paletero Neon Strike: ver en página 33', label: 'Página 33, NEON STRIKE', productId: null, amount: null },
  { card: 'Mochila Hard Eva Black: ver en página 34', label: 'Página 34, HARD EVA BLACK', productId: 'm hard eva black', amount: '$ 110.000' },
  { card: 'Mochila Artic Sport: ver en página 35', label: 'Página 35, ARTIC SPORT', productId: 'artic sport', amount: '$ 105.000' },
  { card: 'Mochila Black Voltage: ver en página 36', label: 'Página 36, BLACK VOLTAGE', productId: 'black voltage', amount: '$ 110.000' },
];

/** Hoja P37: dos productos en la misma hoja, cada uno con su precio. */
const PAIR_PAGE = {
  card: 'Neceser Navy: ver en página 37',
  label: 'Página 37, NECESERES',
  blocks: [
    { name: 'NAVY', productId: 'neceser navy', amount: '$ 39.000', net: '$ 31.200' },
    { name: 'MOSS', productId: 'neceser moss', amount: '$ 41.500', net: '$ 33.200' },
  ],
};

const SIZES = [[320, 640], [360, 640], [390, 640], [430, 640], [320, 720], [360, 720], [390, 720], [430, 720]] as const;

/** Modos de la matriz: público, distribuidor confirmado y distribuidor pendiente. */
const MODES = ['public', 'distributor-confirmed', 'distributor-pending'] as const;
type Mode = (typeof MODES)[number];

/* ───────────────────────── geometría (pura, verificable sin navegador) ───────────────────────── */

/**
 * Rectángulo REALMENTE dibujado por una imagen con `object-fit: contain`
 * dentro de su caja, respetando `object-position`.
 *
 * `rect.bottom - naturalHeight * scale` devuelve el borde SUPERIOR de la
 * imagen dibujada: usarlo como si fuera el inferior daba por bueno (o
 * reprobaba) un solapamiento equivocado.
 */
export function containedRect(
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  natural: { width: number; height: number },
  objectPosition: string,
): Rect {
  if (!natural.width || !natural.height) return { ...rect, width: 0, height: 0 };
  const scale = Math.min(rect.width / natural.width, rect.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const [xToken = '50%', yToken = '50%'] = objectPosition.split(' ');
  const offset = (token: string, free: number) => {
    if (token.endsWith('%')) return free * (parseFloat(token) / 100);
    if (token === 'left' || token === 'top') return 0;
    if (token === 'right' || token === 'bottom') return free;
    return free / 2;
  };
  const left = rect.left + offset(xToken, rect.width - width);
  const top = rect.top + offset(yToken, rect.height - height);
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/** ¿Se cruzan dos rectángulos? (Solapamiento real, no un orden suposisto.) */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** ¿El rectángulo `inner` está contenido dentro de `outer`? (texto sin desbordar) */
export function contains(outer: Rect, inner: Rect, tolerance = 1): boolean {
  return inner.left >= outer.left - tolerance
    && inner.right <= outer.right + tolerance
    && inner.top >= outer.top - tolerance
    && inner.bottom <= outer.bottom + tolerance;
}

/** ¿`first` termina antes de que empiece `second`? (orden vertical real) */
export function above(first: Rect, second: Rect, tolerance = 1): boolean {
  return first.bottom <= second.top + tolerance;
}

test('geometría de imagen contenida: el borde inferior real, no el borde superior', () => {
  const box = { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 };
  const natural = { width: 400, height: 100 };

  // object-position center bottom: la imagen queda pegada abajo.
  const bottom = containedRect(box, natural, '50% 100%');
  expect(bottom.top).toBe(50);
  expect(bottom.bottom).toBe(100);
  // La fórmula anterior devolvía el borde superior y daba el mismo valor.
  const previousWrongEdge = box.bottom - natural.height * 0.5;
  expect(previousWrongEdge).toBe(bottom.top);
  expect(previousWrongEdge).not.toBe(bottom.bottom);

  // object-position center: centrado en vertical.
  const centered = containedRect(box, natural, '50% 50%');
  expect(centered.top).toBe(25);
  expect(centered.bottom).toBe(75);

  // object-position left top: pegada arriba a la izquierda.
  const topLeft = containedRect(box, natural, '0% 0%');
  expect(topLeft.top).toBe(0);
  expect(topLeft.bottom).toBe(50);

  // Una imagen más ancha que su caja no se sale de la caja.
  const wide = containedRect(box, { width: 800, height: 100 }, '50% 50%');
  expect(wide.width).toBe(200);
  expect(wide.left).toBe(0);
  expect(wide.right).toBe(200);
});

/* ───────────────────────────────────── navegación y mocks ───────────────────────────────────── */

async function settled(page: Page) {
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition', 'idle');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state', 'read');
}

async function goTo(page: Page, number: number) {
  await page.getByTestId('page-indicator').click();
  await page.locator('#page-number').fill(String(number));
  await page.locator('.page-picker button').click();
  await settled(page);
}

/** Desliza hacia la hoja siguiente (mismo gesto que el usuario). */
async function swipeForward(page: Page) {
  const box = (await page.getByTestId('page-flip-engine').boundingBox())!;
  const x = box.x + box.width * .9, y = box.y + box.height * .55;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
    for (const fraction of [.2, .5, 1]) {
      await page.waitForTimeout(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - box.width * .6 * fraction, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
  await settled(page);
}

/** Abre un accesorio desde el índice mobile (P27), igual que el usuario. */
async function openProduct(page: Page, card: string, label: string): Promise<Locator> {
  await goTo(page, 27);
  await page.getByRole('button', { name: card, exact: true }).tap();
  await settled(page);
  const leaf = page.getByRole('article', { name: label, exact: true }).first();
  // Las hojas con editorial (P29, P30) muestran primero la introducción.
  if (!(await leaf.isVisible().catch(() => false))) await swipeForward(page);
  await expect(leaf).toBeVisible();
  return leaf;
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

/** Catálogo simulado con precios DISTINTOS para cada neceser de P37. */
async function mockCatalogWithDistinctNeceseres(page: Page) {
  await page.route('**/products.json*', async route => {
    const response = await route.fetch();
    const body = await response.json() as { products: Array<Record<string, unknown>> };
    body.products = body.products.map(product =>
      product.id === 'neceser moss' ? { ...product, precio: 41500 } : product,
    );
    await route.fulfill({ response, json: body });
  });
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

/**
 * Sesión y cotización de distribuidor simuladas (nunca una cuenta real).
 * La cotización se arma con el productId y el qty que pide el frontend: cada
 * producto recibe SU precio neto y ninguna respuesta se aplica a otro.
 */
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

/* ───────────────────────────────────── medición de cajas ───────────────────────────────────── */

/**
 * Texto REF/EAN del pie de una hoja de producto: el PRIMER span del pie.
 * El pie tiene dos spans (el texto REF/EAN y el folio de página, oculto por
 * CSS), así que un selector `footer span` sería ambiguo y `boundingBox()`
 * fallaría por modo estricto. El folio nunca se usa para medir.
 */
const REF_EAN_SELECTOR = 'footer > span:first-child';

async function boxOf(locator: Locator): Promise<Rect> {
  // Una caja medida sobre un selector ambiguo no es una medida: se rechaza.
  const count = await locator.count();
  if (count !== 1) throw new Error(`selector ambiguo: ${count} elementos (${locator})`);
  const box = (await locator.boundingBox())!;
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height, width: box.width, height: box.height };
}

/** Datos de la imagen en el navegador; el rectángulo dibujado se calcula acá. */
async function imageGeometry(locator: Locator) {
  return locator.evaluate(node => {
    const img = node as HTMLImageElement;
    const rect = img.getBoundingClientRect();
    return {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      natural: { width: img.naturalWidth, height: img.naturalHeight },
      objectPosition: getComputedStyle(img).objectPosition,
    };
  });
}

/** Rectángulo REALMENTE dibujado por la imagen (borde inferior incluido). */
async function drawnRect(locator: Locator): Promise<Rect> {
  const geometry = await imageGeometry(locator);
  return containedRect(geometry.rect, geometry.natural, geometry.objectPosition);
}

/** Cajas del texto del precio (rótulo, importe, rótulo y neto de distribuidor,
 *  importe neto y etiqueta de descuento). */
async function priceTextBoxes(price: Locator): Promise<Rect[]> {
  const texts = price.locator('.mobile-accessory-price__label, .mobile-accessory-price__amount, .mobile-accessory-price__net-label, .mobile-accessory-price__net-value, .mobile-accessory-price__discount');
  const boxes: Rect[] = [];
  for (const text of await texts.all()) boxes.push(await boxOf(text));
  return boxes;
}

/**
 * El texto del precio no se cruza con las características, la fotografía, el
 * CTA ni el pie REF/EAN, y tampoco se sale de la hoja. Se comparan rectángulos
 * REALES (no un orden supuesto) y el texto no desborda su propia caja.
 */
async function expectPriceTextClear(price: Locator, regions: {
  features?: Rect[]; photo?: Rect; cta?: Rect; footer?: Rect; leaf?: Rect;
}) {
  const boxes = await priceTextBoxes(price);
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    for (const feature of regions.features ?? []) {
      expect(overlaps(box, feature), `precio ${JSON.stringify(box)} sobre característica ${JSON.stringify(feature)}`).toBe(false);
    }
    if (regions.photo) expect(overlaps(box, regions.photo), 'precio sobre la fotografía').toBe(false);
    if (regions.cta) expect(overlaps(box, regions.cta), 'precio sobre el CTA').toBe(false);
    if (regions.footer) expect(overlaps(box, regions.footer), 'precio sobre REF/EAN').toBe(false);
    if (regions.leaf) {
      expect(box.left).toBeGreaterThanOrEqual(regions.leaf.left - 1);
      expect(box.right).toBeLessThanOrEqual(regions.leaf.right + 1);
      expect(box.top).toBeGreaterThanOrEqual(regions.leaf.top - 1);
      expect(box.bottom).toBeLessThanOrEqual(regions.leaf.bottom + 1);
    }
  }
  for (const text of await price.locator('.mobile-accessory-price__label, .mobile-accessory-price__amount, .mobile-accessory-price__net-label, .mobile-accessory-price__net-value, .mobile-accessory-price__discount').all()) {
    const overflow = await text.evaluate(node => ({ text: node.textContent, width: node.clientWidth, scrollWidth: node.scrollWidth }));
    expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width + 1);
  }
}

/** Formato del importe en la hoja (mismo que `formatDisplayPrice`). */
function displayAmount(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* ───────────────────────────────────────── matriz completa ───────────────────────────────────────── */

test('contrato de selectores: el texto REF/EAN de la ficha tiene su propio span', async () => {
  // Sin navegador y sin framework de DOM: se lee el marcado real del
  // componente y se comprueba que el selector del texto no puede ser ambiguo.
  const source = await readFile(new URL('../src/components/mobile/MobileAccessories.tsx', import.meta.url), 'utf8');
  const footers = [...source.matchAll(/<footer>([\s\S]*?)<\/footer>/g)].map(match => match[1]);
  const productFooter = footers.find(markup => markup.includes('REF:'));
  expect(productFooter).toBeDefined();
  // El pie del producto tiene DOS spans: REF/EAN y el folio de página.
  expect(productFooter!.match(/<span/g) ?? []).toHaveLength(2);
  expect(productFooter!.indexOf('<span>REF:')).toBe(0);
  expect(productFooter!.indexOf('<span>REF:')).toBeLessThan(productFooter!.indexOf('<span>{presentation.pageId}'));
});

for (const [width, height] of SIZES) {
  for (const mode of MODES) {
    test(`portrait ${width}×${height} · ${mode}: P28–P37 con su precio propio, sin cruces ni desbordes`, async ({ page, isMobile }, testInfo) => {
      test.skip(!isMobile, 'Mobile portrait only');
      test.setTimeout(240_000);
      const external = await blockExternalHosts(page);
      await mockCatalogWithDistinctNeceseres(page);
      const calls = await mockDistributor(page, {
        authenticated: mode !== 'public',
        pending: mode === 'distributor-pending',
      });
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);

      for (const item of SINGLE_PAGES) {
        const leaf = await openProduct(page, item.card, item.label);
        const price = leaf.locator('.mobile-accessory-price');

        if (item.productId === null || item.amount === null) {
          // Sin precio vivo: ni celda, ni línea de distribuidor, ni petición.
          await expect(leaf.getByText('PRECIO LISTA')).toHaveCount(0);
          await expect(price).toHaveCount(0);
          await expect(leaf.locator('.mobile-accessory-product__facts')).not.toHaveAttribute('data-has-price', 'true');
          expect(calls.quotes).not.toContain('hard eva black bag:1');
          expect(calls.quotes).not.toContain('neon strike:1');
          continue;
        }

        await expect(price).toHaveCount(1);
        await expect(price).toHaveAttribute('data-price-product', item.productId);
        await expect(price.locator('.mobile-accessory-price__amount')).toHaveText(item.amount);
        await expect(price.locator('.mobile-accessory-price__label')).toHaveText('PRECIO LISTA');
        // El precio tiene su PROPIA zona de ancho completo: ya no es una
        // tercera columna de la ficha (que dejaba las especificaciones
        // apretadas y empujaba el bloque inferior hacia arriba).
        await expect(leaf.locator('.mobile-accessory-product__price')).toHaveCount(1);
        await expect(leaf.locator('.mobile-accessory-product__facts .mobile-accessory-price')).toHaveCount(0);

        if (mode === 'public') {
          // Sin sesión de distribuidor no hay línea de distribuidor ni precio neto.
          await expect(price.locator('.mobile-accessory-price__net')).toHaveCount(0);
          await expect(price.locator('.mobile-accessory-price__discount')).toHaveCount(0);
          expect(calls.quotes).not.toContain(`${item.productId}:1`);
        } else if (mode === 'distributor-pending') {
          // Una cotización pendiente no presenta ningún importe como final.
          await expect(price.locator('.mobile-accessory-price__net-value')).toHaveText('A confirmar');
          await expect(price.locator('.mobile-accessory-price__net-value')).not.toContainText('$');
          await expect(price.locator('.mobile-accessory-price__discount')).toHaveCount(0);
          await expect(price).toHaveAttribute('data-has-net', 'false');
        } else {
          await expect(price.locator('.mobile-accessory-price__net-value')).toHaveText(`$ ${displayAmount(NET_PRICES[item.productId])}`);
          // Opción A: rótulo de distribuidor y etiqueta de descuento del
          // servidor (signo menos tipográfico, texto plano).
          await expect(price.locator('.mobile-accessory-price__net-label')).toHaveText('PRECIO DISTRIBUIDOR');
          await expect(price.locator('.mobile-accessory-price__discount')).toHaveText('\u221220%');
          await expect(price).toHaveAttribute('data-has-net', 'true');
          expect(calls.quotes).toContain(`${item.productId}:1`);
        }

        // Cajas reales de la hoja: características, fotografía, CTA y REF/EAN.
        const features: Rect[] = [];
        for (const itemFeature of await leaf.locator('.mobile-accessory-product__features li').all()) features.push(await boxOf(itemFeature));
        const hero = await boxOf(leaf.locator('.mobile-accessory-product__hero'));
        const photo = await drawnRect(leaf.locator('.mobile-accessory-product__hero img'));
        const facts = await boxOf(leaf.locator('.mobile-accessory-product__facts'));
        const priceZone = await boxOf(leaf.locator('.mobile-accessory-product__price'));
        const cta = await boxOf(leaf.locator('.mobile-accessory-product__explore'));
        const footer = await boxOf(leaf.locator(REF_EAN_SELECTOR));
        await expectPriceTextClear(price, {
          features,
          photo,
          cta,
          footer,
          leaf: await boxOf(leaf),
        });
        // El texto del precio está CONTENIDO en su propia zona: la zona
        // inferior es un flujo y el texto no puede desbordar su caja.
        for (const textBox of await priceTextBoxes(price)) {
          expect(contains(priceZone, textBox), `el texto del precio sale de su zona: ${JSON.stringify(textBox)}`).toBe(true);
        }
        // La zona de precio es propia: no pisa la ficha de especificaciones.
        expect(overlaps(facts, priceZone), 'la zona de precio sobre la ficha').toBe(false);
        // ORDEN VERTICAL real: el precio va por encima del CTA EXPLORAR.
        const priceBox = await boxOf(price);
        expect(above(priceBox, cta), 'el precio no está por encima del CTA').toBe(true);
        // La ficha y el CTA no se pisan, y el CTA no pisa el REF/EAN.
        expect(overlaps(facts, cta), 'la ficha sobre el CTA').toBe(false);
        expect(overlaps(cta, footer), 'el CTA sobre REF/EAN').toBe(false);
        // La ficha completa tampoco invade el CTA ni el pie.
        expect(overlaps(facts, footer), 'la ficha sobre REF/EAN').toBe(false);
        // El título y la foto no quedan debajo de la ficha.
        const title = await boxOf(leaf.getByRole('heading', { level: 1 }));
        expect(overlaps(facts, title), 'la ficha sobre el título').toBe(false);
        expect(overlaps(facts, photo), 'la ficha sobre la fotografía').toBe(false);
      }

      // P37: dos productos, dos celdas y dos netos propios.
      const p37 = await openProduct(page, PAIR_PAGE.card, PAIR_PAGE.label);
      await expect(p37.locator('.mobile-accessory-price')).toHaveCount(2);
      for (const block of PAIR_PAGE.blocks) {
        const region = p37.getByRole('region', { name: block.name, exact: true });
        const price = region.locator('.mobile-accessory-price');
        await expect(price).toHaveCount(1);
        await expect(price).toHaveAttribute('data-price-product', block.productId);
        await expect(price.locator('.mobile-accessory-price__amount')).toHaveText(block.amount);
        // Ningún neceser muestra el precio del otro.
        for (const other of PAIR_PAGE.blocks.filter(item => item !== block)) {
          await expect(price.locator('.mobile-accessory-price__amount')).not.toHaveText(other.amount);
        }
        if (mode === 'public') {
          await expect(price.locator('.mobile-accessory-price__net')).toHaveCount(0);
          await expect(price.locator('.mobile-accessory-price__discount')).toHaveCount(0);
          expect(calls.quotes).not.toContain(`${block.productId}:1`);
        } else if (mode === 'distributor-pending') {
          await expect(price.locator('.mobile-accessory-price__net-value')).toHaveText('A confirmar');
          await expect(price.locator('.mobile-accessory-price__net-value')).not.toContainText('$');
          await expect(price.locator('.mobile-accessory-price__discount')).toHaveCount(0);
        } else {
          await expect(price.locator('.mobile-accessory-price__net-value')).toHaveText(block.net);
          await expect(price.locator('.mobile-accessory-price__net-label')).toHaveText('PRECIO DISTRIBUIDOR');
          await expect(price.locator('.mobile-accessory-price__discount')).toHaveText('\u221220%');
          for (const other of PAIR_PAGE.blocks.filter(item => item !== block)) {
            await expect(price.locator('.mobile-accessory-price__net-value')).not.toHaveText(other.net);
          }
          expect(calls.quotes).toContain(`${block.productId}:1`);
        }

        // La ficha del bloque crece hacia arriba (con neto) sin pisar la foto.
        const photo = await drawnRect(region.locator('.mobile-accessory-pair__hero img'));
        const details = await boxOf(region.locator('.mobile-accessory-pair__details'));
        const cta = await boxOf(region.locator('.mobile-accessory-product__explore'));
        const ref = await boxOf(region.locator('.mobile-accessory-pair__details p'));
        expect(overlaps(photo, details), 'la fotografía del bloque sobre su ficha').toBe(false);
        expect(photo.bottom).toBeLessThanOrEqual(details.top + 1);
        expect(overlaps(details, cta), 'la ficha del bloque sobre el CTA').toBe(false);
        // El texto del precio está contenido en la ficha del bloque y NO
        // pisa el REF/EAN (que vive dentro de la misma ficha).
        const priceBox = await boxOf(price);
        for (const textBox of await priceTextBoxes(price)) {
          expect(contains(details, textBox), `el texto del precio sale de la ficha: ${JSON.stringify(textBox)}`).toBe(true);
          expect(overlaps(textBox, ref), 'el texto del precio sobre REF/EAN').toBe(false);
        }
        // ORDEN VERTICAL real: el precio va por encima del CTA de su bloque.
        expect(above(priceBox, cta), 'el precio no está por encima del CTA').toBe(true);
        await expectPriceTextClear(price, { cta, footer: ref, leaf: await boxOf(p37) });
      }
      // Cada neceser pidió su propia cotización.
      if (mode !== 'public') {
        expect(calls.quotes).toContain('neceser navy:1');
        expect(calls.quotes).toContain('neceser moss:1');
      }
      expect(calls.orders).toBe(0);

      await page.screenshot({ path: testInfo.outputPath(`precio-${mode}-${width}x${height}.png`) });
      expect(external).toEqual([]);
    });
  }
}

test('portrait: la navegación y el hotspot de producto siguen funcionando con la celda de precio', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile portrait only');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  const star = await openProduct(page, 'Paletero Star: ver en página 32', 'Página 32, STAR');

  await expect(star.locator('.mobile-accessory-price__amount')).toHaveText('$ 124.800');
  // El hotspot abre la ficha nativa del producto.
  await star.getByRole('button', { name: 'Ver ficha y opciones de pedido de Paletero Star', exact: true }).tap();
  const modal = page.getByRole('dialog', { name: 'Paletero Star', exact: true });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Cerrar ficha', exact: true }).tap();
  await expect(modal).toHaveCount(0);
  // La navegación avanza y la celda refleja el producto siguiente (sin precio).
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('33 / 39');
  const next = page.getByRole('article', { name: 'Página 33, NEON STRIKE', exact: true }).first();
  await expect(next).toBeVisible();
  await expect(next.locator('.mobile-accessory-price')).toHaveCount(0);
  await page.getByRole('button', { name: 'Página anterior', exact: true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('32 / 39');
  await expect(page.getByRole('article', { name: 'Página 32, STAR', exact: true }).first().locator('.mobile-accessory-price__amount')).toHaveText('$ 124.800');
});

/**
 * Las hojas de paletas (P15–26) muestran su precio en una zona propia: no
 * tapan la pala, las tecnologías, las especificaciones ni las características,
 * y el precio queda por ENCIMA del CTA de la hoja.
 *
 * Matriz: 360 / 390 / 430 px × 640 / 844 px × visitante / distribuidor.
 */
const PADDLE_WIDTHS = [360, 390, 430] as const;
const PADDLE_VIEWPORTS = [640, 844].flatMap(height => PADDLE_WIDTHS.map(width => ({ width, height })));
const PADDLE_MODES = ['public', 'distributor-confirmed'] as const;

for (const { width, height } of PADDLE_VIEWPORTS) {
  for (const mode of PADDLE_MODES) {
    test(`portrait ${width}×${height} · ${mode}: precio y EXPLORAR caben en las hojas de paletas`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'Mobile portrait only');
      test.setTimeout(120_000);
      const external = await blockExternalHosts(page);
      const calls = await mockDistributor(page, {
        authenticated: mode !== 'public',
        pending: false,
      });
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);

      for (const { pagina: number, id: productId } of PADDLE_PAGES) {
        const description = `P${number} · ${width}×${height} · ${mode}`;
        await goTo(page, number);
        const leaf = page.getByRole('article', { name: `Página ${number}, edición vertical StarVie` }).first();
        await expect(leaf).toBeVisible();

        const zone = leaf.locator('[data-mobile-price-zone="premium"]');
        await expect(zone).toHaveCount(1);
        await expect(leaf.locator('.mobile-premium-product-page__rail [data-mobile-price-zone="premium"]')).toHaveCount(1);
        await expect(leaf.locator('.mobile-premium-product-page__lower [data-mobile-price-zone="premium"]')).toHaveCount(0);
        await expect(zone.locator('.mobile-accessory-price')).toHaveAttribute('data-price-product', productId);
        await expect(zone.locator('.mobile-accessory-price__label')).toHaveText('PRECIO LISTA');
        await expect(zone.locator('.mobile-accessory-price__amount')).toHaveText(`$ ${displayAmount(LIST_PRICES[productId])}`);

        if (mode === 'public') {
          await expect(zone.locator('.mobile-accessory-price__net')).toHaveCount(0);
          await expect(zone.locator('.mobile-accessory-price__discount')).toHaveCount(0);
          expect(calls.quotes).not.toContain(`${productId}:1`);
        } else {
          await expect(zone.locator('.mobile-accessory-price__net-value')).toHaveText(`$ ${displayAmount(NET_PRICES[productId] ?? Math.round(LIST_PRICES[productId] * .8))}`);
          await expect(zone.locator('.mobile-accessory-price__net-label')).toHaveText('PRECIO DISTRIBUIDOR');
          await expect(zone.locator('.mobile-accessory-price__discount')).toHaveText('\u221220%');
          await expect(zone.locator('.mobile-accessory-price')).toHaveAttribute('data-has-net', 'true');
          expect(calls.quotes).toContain(`${productId}:1`);
        }

        // El texto del precio está contenido en su propia zona.
        const price = zone.locator('.mobile-accessory-price');
        const priceBox = await boxOf(price);
        const zoneBox = await boxOf(zone);
        for (const textBox of await priceTextBoxes(price)) {
          expect(contains(zoneBox, textBox), `el texto del precio sale de su zona: ${JSON.stringify(textBox)}`).toBe(true);
        }

        const hero = leaf.locator('.mobile-premium-product-page__hero img');
        await hero.evaluate(img => (img as HTMLImageElement).decode());
        const paddle = await drawnRect(hero);
        // La foto tiene márgenes transparentes. Medir su caja completa
        // daría falsos positivos aunque el precio no cubra la pala.
        if (overlaps(zoneBox, paddle)) {
          const coversPaddle = await hero.evaluate((img, { paddle, zoneBox }) => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(zoneBox.width);
            canvas.height = Math.ceil(zoneBox.height);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img as HTMLImageElement, paddle.left - zoneBox.left, paddle.top - zoneBox.top, paddle.width, paddle.height);
            return ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((value, i) => i % 4 === 3 && value > 16);
          }, { paddle, zoneBox });
          expect(coversPaddle, `${description}: el precio sobre la pala`).toBe(false);
        }

        const technical = await boxOf(leaf.locator('.mobile-premium-product-page__technical'));
        const technologies = await boxOf(leaf.locator('.mobile-premium-product-page__technologies'));
        const features = await boxOf(leaf.locator('.mobile-premium-product-page__features'));
        const exploreButton = leaf.getByRole('button', { name: /^Explorar / });
        const explore = await boxOf(exploreButton);
        const footer = await boxOf(leaf.locator('.mobile-premium-product-page__folio'));
        const pageBox = await boxOf(leaf);
        expect(above(technical, priceBox), `${description}: precio debajo de la ficha`).toBe(true);
        expect(priceBox.right).toBeCloseTo(technical.right, 0);
        expect(above(priceBox, features), `${description}: precio encima de los atributos`).toBe(true);
        expect(overlaps(priceBox, technologies), `${description}: precio sobre las tecnologías`).toBe(false);
        await expectPriceTextClear(price, { cta: explore, footer, leaf: pageBox });

        expect(contains(pageBox, features, 0), `${description}: atributos dentro de la hoja`).toBe(true);
        expect(above(features, explore, 0), `${description}: botón debajo de los atributos`).toBe(true);
        expect(explore.top - features.bottom, `${description}: separación del botón`).toBeGreaterThanOrEqual(1);
        expect(contains(pageBox, explore, 0), `${description}: botón dentro de la hoja`).toBe(true);
        expect(pageBox.bottom - explore.bottom).toBeGreaterThanOrEqual(4);
        expect(explore.height).toBeGreaterThanOrEqual(44);
        expect((explore.left + explore.right) / 2).toBeCloseTo((pageBox.left + pageBox.right) / 2, 0);
        const footerColumns = leaf.locator('.mobile-premium-product-page__folio > span');
        for (const column of await footerColumns.all()) {
          const columnBox = await boxOf(column);
          expect(overlaps(explore, columnBox), `${description}: botón sobre REF/EAN o folio`).toBe(false);
          expect(overlaps(features, columnBox), `${description}: atributos sobre REF/EAN o folio`).toBe(false);
        }
        expect(await leaf.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(Math.ceil(pageBox.width));
        await exploreButton.tap({ trial: true });

        if (number === 17 || number === 24) {
          await leaf.screenshot({ path: test.info().outputPath(`paleta-${number}-${width}x${height}-${mode}.png`) });
        }
        if (number === 17) {
          await exploreButton.tap();
          const modal = page.getByRole('dialog', { name: 'Raptor+', exact: true });
          await expect(modal).toBeVisible();
          await modal.getByRole('button', { name: 'Cerrar ficha', exact: true }).tap();
          await expect(modal).toHaveCount(0);
        }
      }
      expect(calls.orders).toBe(0);
      expect(external).toEqual([]);
    });
  }
}

test('contrato: el precio mobile de accesorios tiene su propia zona ancha', async () => {
  const accessories = await readFile(new URL('../src/components/mobile/mobile-accessories.css', import.meta.url), 'utf8');
  // Accesorios: la zona de precio es de ancho completo y la ficha ya no
  // declara una tercera columna para el precio.
  expect(accessories).toMatch(/\.mobile-accessory-product__price\s*\{[^}]*width:\s*100%/);
  expect(accessories).not.toMatch(/\.mobile-accessory-product__facts\[data-has-price="true"\]\s*\{[^}]*max-content/);
});

/**
 * Contrato de la Opción A en las hojas mobile (SIN navegador): escalas de
 * teléfono por contexto, dos filas con filete de 1 px y etiqueta de
 * descuento en texto plano (sin pastilla, sin borde, sin fondo).
 *
 */
test('contrato: la Opción A en las hojas mobile (escalas, filete y etiqueta plana)', async () => {
  const accessories = await readFile(new URL('../src/components/mobile/mobile-accessories.css', import.meta.url), 'utf8');
  const premium = await readFile(new URL('../src/components/mobile/mobile-premium-product.css', import.meta.url), 'utf8');

  const cell = /\.mobile-accessory-price\s*\{([^}]*)\}/.exec(accessories);
  expect(cell).not.toBeNull();
  expect(cell![1]).toMatch(/--pv-label-size:\s*max\(8px,\s*calc\(2\.1 \* var\(--accessory-unit\)\)\)/);
  expect(cell![1]).toMatch(/--pv-list-size:\s*max\(11px,\s*calc\(3\.1 \* var\(--accessory-unit\)\)\)/);
  expect(cell![1]).toMatch(/--pv-net-size:\s*max\(12px,\s*calc\(3\.6 \* var\(--accessory-unit\)\)\)/);
  expect(cell![1]).toMatch(/--pv-save-size:\s*max\(8px,\s*calc\(1\.9 \* var\(--accessory-unit\)\)\)/);
  for (const css of [accessories, premium]) {
    expect(css).not.toMatch(/mobile-accessory-price__discount[^{]*\{[^}]*border/);
  }

  // El carril de precio de las paletas no lleva placa (Opción A).
  const rail = /\.mobile-premium-product-page__price\s+\.mobile-accessory-price\s*\{([^}]*)\}/.exec(premium);
  expect(rail, 'no se encuentra la celda de precio del carril de paletas').not.toBeNull();
  expect(rail![1]).not.toMatch(/background/);
  expect(rail![1]).not.toMatch(/border-radius/);
  expect(rail![1]).not.toMatch(/backdrop-filter/);
});
