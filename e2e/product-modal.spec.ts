import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { formatDisplayPrice } from "../src/commerce/displayPrice";

async function openRaptor(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Ir a una página" }).click();
  await page.locator("#page-number").fill("17");
  await page.locator(".page-picker button[type='submit']").click();
  await expect(page.getByTestId("page-indicator")).toContainText("17");
  const hotspot = page.locator('[data-product-id="raptor+"]:visible').first();
  await expect(hotspot).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Raptor+" });
  await expect(async () => {
    await hotspot.click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 12_000 });
  return dialog;
}

test("la ficha usa paleta StarVie oscura, pesos y miniaturas sin superposición", async ({ page }, testInfo) => {
  const dialog = await openRaptor(page);
  await expect(dialog).toBeVisible();
  const catalog = await (await page.request.get("/products.json")).json();
  const product = catalog.products.find((candidate: { id: string }) => candidate.id === "raptor+");
  if (product.precio != null && product.precio > 0) await expect(dialog).toContainText(formatDisplayPrice(product.precio));
  else await expect(dialog.locator(".product-prices small", { hasText: "Precio" })).toHaveCount(0);
  // El bloque de precio es propio: PRECIO LISTA con el símbolo pegado al importe.
  await expect(dialog.locator(".product-prices .product-price__amount")).toHaveCount(1);
  await expect(dialog.locator(".product-prices small")).toHaveText("Precio lista");
  await expect(dialog).not.toContainText("€");
  await expect(dialog).not.toContainText(/Pág\.\s*17/);

  const visual = dialog.locator(".product-visual");
  const main = dialog.locator(".product-main-image");
  const thumbs = dialog.getByRole("group", { name: "Imágenes del producto" });
  await expect(thumbs).toBeVisible();
  const mainImage = main.getByRole("img");
  await expect.poll(() => mainImage.evaluate((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth > 0;
  })).toBe(true);
  await expect.poll(() => thumbs.locator("img").evaluateAll((images) =>
    images.every((image) => {
      const element = image as HTMLImageElement;
      return element.complete && element.naturalWidth > 0;
    }),
  )).toBe(true);

  const background = await visual.evaluate((element) => getComputedStyle(element).backgroundColor);
  const channels = background.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
  expect(channels).toHaveLength(3);
  expect(Math.max(...channels)).toBeLessThan(40);

  const mainBox = await main.boundingBox();
  const thumbsBox = await thumbs.boundingBox();
  expect(mainBox).not.toBeNull();
  expect(thumbsBox).not.toBeNull();
  expect(thumbsBox!.y).toBeGreaterThanOrEqual(mainBox!.y + mainBox!.height - 1);

  const previous = dialog.getByRole("button", { name: "Imagen anterior" });
  const next = dialog.getByRole("button", { name: "Imagen siguiente" });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(mainImage).toHaveAttribute("alt", /imagen 1 de 4/);

  await next.click();
  await expect(mainImage).toHaveAttribute("alt", /imagen 2 de 4/);
  await expect(previous).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  await expect(mainImage).toHaveAttribute("alt", /imagen 3 de 4/);
  await page.keyboard.press("ArrowLeft");
  await expect(mainImage).toHaveAttribute("alt", /imagen 2 de 4/);

  await dialog.screenshot({ path: testInfo.outputPath("product-modal.png") });
});

test("el book aprovecha casi todo el ancho útil del viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "La medición del spread completo corresponde a desktop");
  await page.goto("/");
  const host = page.getByTestId("page-flip-engine");
  await expect(host).toBeVisible();
  const viewport = page.viewportSize();
  const hostBox = await host.boundingBox();
  const toolbarBox = await page.locator(".catalog-toolbar").boundingBox();
  expect(viewport).not.toBeNull();
  expect(hostBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(hostBox!.width / viewport!.width).toBeGreaterThan(0.95);
  expect(toolbarBox!.height).toBeLessThanOrEqual(52);
});

test("zoom desktop permite rueda, pan limitado, reset y reinicio al cambiar imagen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "La interacción de mouse corresponde a desktop");
  const dialog = await openRaptor(page);
  const viewport = dialog.locator(".product-image-viewport");
  const image = viewport.getByRole("img");
  const reset = dialog.getByRole("button", { name: "Restablecer zoom" });
  await expect(viewport).toHaveAttribute("data-zoom", "1.00");
  await expect(reset).toBeDisabled();

  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await viewport.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect(viewport).toHaveAttribute("data-zoom", "2.00");
  await expect(reset).toBeEnabled();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -240);
  await expect.poll(async () => Number(await viewport.getAttribute("data-zoom"))).toBeGreaterThan(2);

  const transformBefore = await image.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 1.7, box!.y - box!.height, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => image.evaluate((element) => getComputedStyle(element).transform)).not.toBe(transformBefore);
  const bounded = await viewport.evaluate((element) => {
    const imageElement = element.querySelector("img");
    if (!imageElement) return false;
    const zoom = Number((element as HTMLElement).dataset.zoom);
    const matrix = new DOMMatrix(getComputedStyle(imageElement).transform);
    const limitX = element.clientWidth * (zoom - 1) / 2;
    const limitY = element.clientHeight * (zoom - 1) / 2;
    return Math.abs(matrix.m41) <= limitX + 1 && Math.abs(matrix.m42) <= limitY + 1;
  });
  expect(bounded).toBe(true);

  await reset.click();
  await expect(viewport).toHaveAttribute("data-zoom", "1.00");
  await dialog.getByRole("button", { name: "Acercar imagen" }).click();
  await expect(viewport).toHaveAttribute("data-zoom", "1.50");
  await dialog.getByRole("button", { name: "Imagen siguiente" }).click();
  await expect(image).toHaveAttribute("alt", /imagen 2 de 4/);
  await expect(viewport).toHaveAttribute("data-zoom", "1.00");
});

test("zoom touch admite pinch y pan sin overflow horizontal", async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "La interacción táctil corresponde a mobile");
  const dialog = await openRaptor(page);
  const viewport = dialog.locator(".product-image-viewport");
  const image = viewport.getByRole("img");
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  const cdp = await context.newCDPSession(page);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: centerX - 32, y: centerY },
      { id: 2, x: centerX + 32, y: centerY },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { id: 1, x: centerX - 88, y: centerY },
      { id: 2, x: centerX + 88, y: centerY },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => Number(await viewport.getAttribute("data-zoom"))).toBeGreaterThan(1.5);

  const transformBefore = await image.evaluate((element) => getComputedStyle(element).transform);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 3, x: centerX, y: centerY }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ id: 3, x: centerX + 44, y: centerY + 28 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => image.evaluate((element) => getComputedStyle(element).transform)).not.toBe(transformBefore);
  await expect(dialog.getByRole("group", { name: "Imágenes del producto" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("una galería de diez imágenes usa tira desplazable sin límites implícitos", async ({ page }) => {
  const tenImages = [
    "products/palas/RAPTOR/RAPTOR1.1.webp",
    "products/palas/RAPTOR/RAPTOR1.2.webp",
    "products/palas/RAPTOR/RAPTOR1.3.webp",
    "products/palas/RAPTOR/RAPTOR1.4.webp",
    "products/palas/RAPTOR/RAPTOR1.5.webp",
    "products/palas/RAPTOR/MANGO.webp",
    "products/palas/RAPTOR/ACCESORIO.webp",
    "products/palas/ETERNAL/ETERNAL1.1.webp",
    "products/palas/ETERNAL/ETERNAL1.2.webp",
    "products/palas/ETERNAL/ETERNAL1.3.webp",
  ];
  await page.route("**/products.json*", async (route) => {
    const response = await route.fetch();
    const catalog = await response.json();
    catalog.products = (catalog.products as Array<Record<string, unknown>>).map((product) =>
      product.id === "raptor+" ? { ...product, imagenes: tenImages } : product,
    );
    await route.fulfill({ response, json: catalog });
  });

  const dialog = await openRaptor(page);
  const thumbs = dialog.getByRole("group", { name: "Imágenes del producto" });
  const viewport = dialog.locator(".product-image-viewport");
  await expect(thumbs.getByRole("button", { name: /Ver imagen/ })).toHaveCount(10);
  expect(await thumbs.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  await dialog.getByRole("button", { name: "Ver imagen 10" }).click();
  await expect(viewport.getByRole("img")).toHaveAttribute("alt", /imagen 10 de 10/);
  await expect.poll(() => thumbs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(dialog.getByRole("button", { name: "Imagen siguiente" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Acercar imagen" }).click();
  await expect(viewport).toHaveAttribute("data-zoom", "1.50");
  await page.keyboard.press("ArrowLeft");
  await expect(viewport.getByRole("img")).toHaveAttribute("alt", /imagen 9 de 10/);
  await expect(viewport).toHaveAttribute("data-zoom", "1.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

/* ───────────────────────────── matriz del modal (desktop y teléfono) ───────────────────────────── */

/**
 * El modal tiene que caber EN ANCHO: nombre, atributos, precios y
 * disponibilidad se leen sin desplazamiento horizontal.
 *
 * Las comprobaciones son sobre el MODAL y su contenido (no sólo el ancho del
 * documento): scrollWidth <= clientWidth del modal, ninguna caja interna fuera
 * del modal, ningún texto recortado en su propia caja y el bloque de precio
 * por ENCIMA del CTA de pedido.
 *
 * Todo es local y simulado: el catálogo y la sesión de distribuidor se
 * mockean con `page.route`; no hay pedidos ni cuentas reales.
 */

type Scenario = {
  label: string;
  productId: string;
  page: number;
  /** Sesión de distribuidor simulada. */
  distributor: boolean;
  /** Producto sin stock. */
  noStock?: boolean;
  /** Nombre, SKU y precio largos (contenido extremo). */
  longContent?: boolean;
};

const SCENARIOS: Scenario[] = [
  { label: "pala · visitante", productId: "raptor+", page: 17, distributor: false },
  { label: "pala · distribuidor", productId: "raptor+", page: 17, distributor: true },
  { label: "pala · sin stock", productId: "raptor+", page: 17, distributor: false, noStock: true },
  { label: "pala · atributos y precio largos", productId: "raptor+", page: 17, distributor: true, longContent: true },
  { label: "paletero · visitante", productId: "star", page: 32, distributor: false },
  { label: "paletero · distribuidor", productId: "star", page: 32, distributor: true },
];

const LONG_NAME = "Paletero StarVie Edition Limitada Harpa XL Pro con Bolsa de Transporte";
const LONG_SKU = "BSTSTAR51000-EDICION-LIMITADA-HARPA-XL-PRO-TRANSPORTE";
const LONG_EAN = "84366129421240000000123456789012345678901234";
const LONG_PRICE = 1234567.89;

async function mockCatalog(page: import("@playwright/test").Page, mutate: (products: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) {
  await page.route("**/products.json*", async route => {
    const response = await route.fetch();
    const body = await response.json() as { products: Array<Record<string, unknown>> };
    body.products = mutate(body.products);
    await route.fulfill({ response, json: body });
  });
}

function corsHeaders(route: import("@playwright/test").Route): Record<string, string> {
  const origin = route.request().headers()["origin"];
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

/** Sesión y cotización simuladas (nunca una cuenta real). */
async function mockDistributor(page: import("@playwright/test").Page, prices: Record<string, { list: number; net: number }>) {
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  await page.route("**/api/distributor/session", async route => {
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({ ok: true, authenticated: true, discountPercent: 20, expiresAt, sessionId: "sesion-de-prueba-0001" }),
    });
  });
  await page.route("**/api/distributor/quote*", async route => {
    // La cotización responde al productId que pide el frontend: el precio
    // neto de un producto nunca se aplica a otro.
    const url = new URL(route.request().url());
    const productId = url.searchParams.get("productId") ?? "";
    const price = prices[productId] ?? { list: 100000, net: 80000 };
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        currency: "ARS",
        discountPercent: 20,
        lines: [{ productId, qty: 1, listUnitPrice: price.list, netUnitPrice: price.net, netSubtotal: price.net }],
        listTotal: price.list,
        netTotal: price.net,
      }),
    });
  });
  await page.route("**/api/distributor/orders", route => route.abort());
}

/** Va a una página por el selector de la barra (el mismo camino que el usuario). */
async function goToPage(page: import("@playwright/test").Page, number: number) {
  await page.getByRole("button", { name: "Ir a una página" }).click();
  await page.locator("#page-number").fill(String(number));
  await page.locator(".page-picker button[type='submit']").click();
  await expect(page.getByTestId("page-indicator")).toContainText(String(number));
}

/**
 * Abre la ficha con el control REAL de la hoja (el botón del producto), tanto
 * en desktop (hotspot del libro) como en teléfono (el artículo vertical
 * reemplaza al PDF: no existe `.pdf-page`).
 */
async function openProductModal(page: import("@playwright/test").Page, productId: string) {
  const control = page.locator(`[data-product-id="${productId}"]:visible`).first();
  await expect(control).toBeVisible();
  await control.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  return dialog;
}

/** El modal cabe en el ancho: sin scroll horizontal y sin contenido recortado. */
async function expectModalFitsInWidth(dialog: import("@playwright/test").Locator) {
  const scroll = await dialog.evaluate(node => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
  expect(scroll.scrollWidth, "el modal tiene scroll horizontal").toBeLessThanOrEqual(scroll.clientWidth + 1);

  const outside = await dialog.evaluate(node => {
    const modal = node.getBoundingClientRect();
    return [...node.querySelectorAll("*")]
      .filter(child => {
        const rect = child.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.right > modal.right + 1 || rect.left < modal.left - 1);
      })
      .map(child => `${child.tagName}.${child.className}`);
  });
  expect(outside, "contenido fuera del ancho del modal").toEqual([]);

  const clipped = await dialog.evaluate(node => {
    return [...node.querySelectorAll("*")]
      .filter(child => {
        const element = child as HTMLElement;
        if (element.clientWidth === 0) return false;
        const overflowX = getComputedStyle(element).overflowX;
        // Las tiras con scroll propio (miniaturas) no son contenido recortado.
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") return false;
        return element.scrollWidth > element.clientWidth + 1;
      })
      .map(child => `${child.tagName}.${child.className}`);
  });
  expect(clipped, "texto recortado dentro del modal").toEqual([]);
}

/**
 * El importe es una CAJA ATÓMICA: el símbolo $ y los dígitos se dibujan en
 * UNA sola línea y no se separan. La sonda usa un Range sobre el texto: cada
 * rectángulo del Range es una línea dibujada, así que más de uno significa
 * que el importe se partió.
 */
async function expectAmountIsOneAtomicLine(dialog: import("@playwright/test").Locator) {
  const amounts = dialog.locator(".product-price__amount");
  const count = await amounts.count();
  for (let index = 0; index < count; index += 1) {
    const amount = amounts.nth(index);
    const info = await amount.evaluate(node => {
      const element = node as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = Array.from(range.getClientRects()).map(rect => ({ height: rect.height }));
      const style = getComputedStyle(element);
      return {
        text: element.textContent ?? "",
        lines: rects.length,
        maxLineHeight: rects.reduce((max, rect) => Math.max(max, rect.height), 0),
        fontSize: Number.parseFloat(style.fontSize),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        whiteSpace: style.whiteSpace,
        overflowWrap: style.overflowWrap,
      };
    });
    // El importe completo, con el símbolo pegado a los dígitos.
    expect(info.text, "el importe no es un monto completo con su símbolo").toMatch(/^\$ [\d.,]+$/);
    expect(info.lines, `el importe se partió en varias líneas: ${info.text}`).toBe(1);
    // La línea dibujada es una sola línea tipográfica.
    expect(info.maxLineHeight).toBeLessThanOrEqual(info.fontSize * 1.6);
    // No está recortado y la regla atómica está activa.
    expect(info.scrollWidth, `el importe está recortado: ${info.text}`).toBeLessThanOrEqual(info.clientWidth + 1);
    expect(info.whiteSpace).toBe("nowrap");
    expect(info.overflowWrap).not.toBe("anywhere");
  }
}

/** El bloque de precio va POR ENCIMA del CTA de pedido. */
async function expectPriceBeforeCta(dialog: import("@playwright/test").Locator) {
  const price = await dialog.locator(".product-prices").boundingBox();
  if (!price) return;
  const cta = await dialog.getByRole("button", { name: "Agregar al pedido" }).boundingBox();
  if (!cta) return;
  expect(price.y + price.height, "el precio no está por encima del CTA").toBeLessThanOrEqual(cta.y + 1);
}

async function runScenario(page: import("@playwright/test").Page, scenario: Scenario) {
  if (scenario.noStock) {
    await mockCatalog(page, products => products.map(product =>
      product.id === scenario.productId ? { ...product, disponible: false } : product));
  }
  if (scenario.longContent) {
    await mockCatalog(page, products => products.map(product =>
      product.id === scenario.productId
        ? { ...product, nombre: LONG_NAME, sku: LONG_SKU, ean: LONG_EAN, precio: LONG_PRICE }
        : product));
  }
  if (scenario.distributor) {
    const list = scenario.longContent ? LONG_PRICE : scenario.productId === "star" ? 124800 : 372000;
    const net = scenario.longContent ? 987654.32 : scenario.productId === "star" ? 99840 : 297600;
    await mockDistributor(page, { [scenario.productId]: { list, net } });
  }
  await page.goto("/");
  await expect(page.locator(".catalog-app")).toHaveClass(/cover-ready/);
  await goToPage(page, scenario.page);
  const dialog = await openProductModal(page, scenario.productId);

  await expectModalFitsInWidth(dialog);
  await expectPriceBeforeCta(dialog);
  await expectAmountIsOneAtomicLine(dialog);

  // El contenido esencial se ve y es legible.
  await expect(dialog.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(dialog.locator(".stock-line")).toBeVisible();
  if (scenario.noStock) {
    await expect(dialog.getByRole("button", { name: "Sin stock" })).toBeDisabled();
  } else {
    await expect(dialog.getByRole("button", { name: "Agregar al pedido" })).toBeVisible();
  }
  if (scenario.distributor) {
    await expect(dialog.getByText("Precio distribuidor")).toBeVisible();
    // Signo menos tipográfico (U+2212) del prototipo aprobado.
    await expect(dialog.locator(".product-price__discount")).toHaveText("\u221220%");
  } else {
    await expect(dialog.getByText("Precio distribuidor")).toHaveCount(0);
    await expect(dialog.locator(".product-price__discount")).toHaveCount(0);
  }
  if (scenario.longContent) {
    await expect(dialog).toContainText(LONG_NAME);
    await expect(dialog).toContainText(LONG_SKU);
    await expect(dialog.locator(".product-price__amount").first()).toContainText("1.234.567,89");
  }

  await dialog.getByRole("button", { name: "Cerrar ficha" }).click();
  await expect(dialog).toHaveCount(0);
}

for (const [width, height] of [[1366, 768], [1440, 900]] as const) {
  test(`desktop ${width}×${height}: la ficha cabe en el ancho en todos los estados comerciales`, async ({ page, isMobile }) => {
    test.skip(isMobile, "La matriz desktop se corre en el proyecto desktop");
    await page.setViewportSize({ width, height });
    for (const scenario of SCENARIOS) {
      await runScenario(page, scenario);
    }
  });
}

for (const width of [360, 390, 430] as const) {
  test(`mobile ${width}×844: la ficha cabe en el ancho en todos los estados comerciales`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "La matriz de teléfono se corre en el proyecto mobile");
    await page.setViewportSize({ width, height: 844 });
    for (const scenario of SCENARIOS) {
      await runScenario(page, scenario);
    }
  });
}

/**
 * Contrato de atomicidad del importe (sin navegador): el símbolo $ y los
 * dígitos no se separan ni se parten en NINGÚN tamaño de pantalla. La regla
 * que lo garantiza es `white-space: nowrap` y la ausencia de
 * `overflow-wrap: anywhere` DENTRO del importe; los que bajan de línea son el
 * rótulo y la etiqueta de descuento.
 *
 * Esto NO prueba el dibujo: la prueba de "una sola línea dibujada" es la
 * sonda de navegador `expectAmountIsOneAtomicLine`, que no se pudo ejecutar
 * en este entorno.
 */
test("contrato: el importe del modal es una caja atómica en todos los estilos", async () => {
  const mobile = await readFile(new URL("../src/components/product-modal-mobile.css", import.meta.url), "utf8");
  const mobileAmount = /\.product-modal \.product-price__amount\s*\{([^}]*)\}/.exec(mobile);
  expect(mobileAmount, "no se encuentra la regla del importe en el modal de teléfono").not.toBeNull();
  expect(mobileAmount![1]).toMatch(/white-space:\s*nowrap/);
  expect(mobileAmount![1]).not.toMatch(/overflow-wrap:\s*anywhere/);

  const base = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const baseAmount = /\.product-price__amount\s*\{([^}]*)\}/.exec(base);
  expect(baseAmount, "no se encuentra la regla del importe en el modal base").not.toBeNull();
  expect(baseAmount![1]).toMatch(/white-space:\s*nowrap/);
  expect(baseAmount![1]).not.toMatch(/overflow-wrap:\s*anywhere/);

  // El formateador no cambia: el símbolo sigue adelante del importe.
  expect(formatDisplayPrice(1234567.89)).toBe("$ 1.234.567,89");
});

/**
 * Contrato de la Opción A en el modal (sin navegador): dos filas con filete
 * de 1 px, importe lista apagado, neto destacado y etiqueta de descuento en
 * TEXTO PLANO (sin pastilla, sin borde, sin fondo), con las escalas
 * aprobadas del modal.
 *
 * Esto NO prueba el dibujo: la sonda de "una sola línea dibujada" es la
 * prueba de navegador `expectAmountIsOneAtomicLine`, que no se pudo ejecutar
 * en este entorno.
 */
test("contrato: la Opción A del modal (filete, jerarquía y etiqueta en texto plano)", async () => {
  const base = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  /** Declaraciones de una regla CSS, como mapa propiedad → valor. */
  function declarations(body: string): Record<string, string> {
    const map: Record<string, string> = {};
    for (const part of body.split(";")) {
      const [property, ...rest] = part.split(":");
      if (property && rest.length) map[property.trim()] = rest.join(":").trim();
    }
    return map;
  }

  // El filete de 1 px va en la fila de DISTRIBUIDOR.
  const net = /\.product-price--net\s*\{([^}]*)\}/.exec(base);
  expect(net, "no se encuentra la fila de distribuidor del modal").not.toBeNull();
  expect(net![1]).toMatch(/border-top:\s*1px\s+solid\s*rgba\(255,\s*255,\s*255,\s*\.16\)/);

  // La etiqueta de descuento es texto plano: sin pastilla, sin borde visible,
  // sin fondo y sin relleno.
  const discount = /\.product-price__discount\s*\{([^}]*)\}/.exec(base);
  expect(discount, "no se encuentra la etiqueta de descuento del modal").not.toBeNull();
  const declared = declarations(discount![1]);
  expect(declared.border ?? "0").toBe("0");
  expect(declared["border-radius"] ?? "0").toBe("0");
  expect(declared.background ?? "none").toBe("none");
  expect(declared.padding ?? "0").toBe("0");

  // La piel compartida de las páginas tampoco declara pastilla ni fondo.
  const shared = [...base.matchAll(/([^{}]*\.mobile-accessory-price__discount[^{}]*)\{([^}]*)\}/g)];
  expect(shared.length).toBeGreaterThan(0);
  for (const [, selector, body] of shared) {
    const sharedDeclarations = declarations(body);
    expect(sharedDeclarations.border ?? "0", selector).toBe("0");
    expect(sharedDeclarations.background ?? "none", selector).toBe("none");
    expect(sharedDeclarations["border-radius"] ?? "0", selector).toBe("0");
    expect(sharedDeclarations.padding ?? "0", selector).toBe("0");
  }

  // Escala del modal: rótulo .67rem, lista 1.35rem, neto 1.6rem, porcentaje .66rem.
  const label = /\.product-price small\s*\{([^}]*)\}/.exec(base);
  expect(label, "no se encuentra el rótulo del modal").not.toBeNull();
  expect(label![1]).toMatch(/font-size:\s*0\.67rem/);
  const list = /\.product-price__amount\s*\{([^}]*)\}/.exec(base);
  expect(list, "no se encuentra el importe lista del modal").not.toBeNull();
  expect(list![1]).toMatch(/font-size:\s*1\.35rem/);
  expect(list![1]).toMatch(/font-weight:\s*600/);
  const netAmount = /\.product-price--net\s+\.product-price__amount\s*\{([^}]*)\}/.exec(base);
  expect(netAmount, "no se encuentra el importe neto del modal").not.toBeNull();
  expect(netAmount![1]).toMatch(/font-size:\s*1\.6rem/);
  expect(netAmount![1]).toMatch(/font-weight:\s*720/);
  expect(discount![1]).toMatch(/font-size:\s*0\.66rem/);
});
