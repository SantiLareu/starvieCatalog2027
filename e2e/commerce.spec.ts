import { expect, test, type Page } from "@playwright/test";
import { formatPrice } from "../src/commerce/money";
import imageVariants from "../src/data/productImageVariants.json" with { type: "json" };

/**
 * Piloto comercial Raptor+: Excel → import → JSON → hotspot → modal →
 * precio/disponibilidad/imágenes → carrito → persistencia.
 *
 * Precio y disponibilidad se leen del JSON publicado (/products.json) para no
 * acoplar el test a los valores concretos del piloto: la UI muestra
 * disponibilidad ("Con stock"/"Sin stock"). No hay stock numérico ni tope
 * de cantidad asociado a inventario.
 */
type PilotProduct = { id: string; nombre: string; precio: number | null; disponible: boolean; sku: string; imagenes: string[] };

async function getPilot(page: Page): Promise<PilotProduct> {
  const response = await page.request.get("/products.json");
  expect(response.ok()).toBe(true);
  const catalog = await response.json();
  const product = catalog.products.find((p: PilotProduct) => p.id === "raptor+");
  expect(product, "el piloto raptor+ debe existir en products.json").toBeTruthy();
  expect(product.disponible, "el piloto debe estar disponible").toBe(true);
  return product;
}

async function openRaptor(page: Page) {
  await page.goto("/");

  // Ir a la página 17 con el selector de página.
  await page.getByRole("button", { name: "Ir a una página" }).click();
  await page.locator("#page-number").fill("17");
  await page.locator(".page-picker button[type='submit']").click();
  await expect(page.getByTestId("page-indicator")).toContainText("17");

  // Abrir la ficha desde el hotspot.
  const hotspot = page.locator('[data-product-id="raptor+"]:visible').first();
  await expect(hotspot).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Raptor+" });
  await expect(async () => {
    await hotspot.click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 12_000 });
  return dialog;
}

test.describe("Comercio piloto Raptor+", () => {
  for (const { id, pagina } of [
    { id: "hard eva black bag", pagina: 28 },
    { id: "hard eva eternal", pagina: 29 },
    { id: "m hard eva black", pagina: 34 },
    { id: "muñequera Wristband white", pagina: 38 },
    { id: "muñequera Wristband blue", pagina: 38 },
    { id: "muñequera Wristband black x2", pagina: 38 },
  ]) {
    test(`${id}: datos actuales permiten pedir sin precio desde su hotspot`, async ({ page }) => {
      const catalog = await (await page.request.get("/products.json")).json();
      const product = catalog.products.find((candidate: PilotProduct) => candidate.id === id);
      expect(product).toBeTruthy();
      expect(product.disponible).toBe(true);
      expect(product.precio).toBeNull();
      await page.route("**/api/orders", route => route.abort());
      await page.goto("/");
      await page.getByRole("button", { name: "Ir a una página" }).click();
      await page.locator("#page-number").fill(String(pagina));
      await page.locator(".page-picker button[type='submit']").click();
      const hotspot = page.locator(`[data-product-id="${id}"]:visible`).first();
      const dialog = page.getByRole("dialog", { name: product.nombre, exact: true });
      await expect(async () => {
        await hotspot.click();
        await expect(dialog).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 12_000 });
      await expect(dialog.getByRole("group", { name: "Cantidad" })).toBeVisible();
      await expect(dialog.locator(".product-prices small", { hasText: "Precio" })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Agregar al pedido" }).click();
      await expect(page.getByRole("button", { name: /Abrir pedido, 1 unidades/ })).toBeVisible();
      expect(JSON.parse(await page.evaluate(() => localStorage.getItem("starvie-cart-v1")) ?? "[]"))
        .toEqual([{ productId: id, qty: 1 }]);
    });
  }
  for (const precio of [null, 0]) {
    test(`precio pendiente ${precio}: hotspot y ficha sin precio ni SKU, carrito seguro`, async ({ page }) => {
      const response = await page.request.get("/products.json");
      const catalog = await response.json();
      catalog.products = catalog.products.map((product: PilotProduct) => product.id === "raptor+"
        ? { ...product, precio, sku: "", ean: "" } : product);
      await page.route("**/products.json?*", route => route.fulfill({ json: catalog }));
      let orders = 0;
      await page.route("**/api/orders", route => { orders++; return route.abort(); });
      await page.addInitScript(() => {
        if (!sessionStorage.getItem("commerce-test-seeded")) {
          localStorage.setItem("starvie-cart-v1", JSON.stringify([{ productId: "raptor+", qty: 2 }]));
          sessionStorage.setItem("commerce-test-seeded", "true");
        }
      });
      const dialog = await openRaptor(page);
      await expect(dialog).not.toContainText(/NaN|\$|SKU|Consultar precio/);
      await expect(dialog.locator(".product-prices small", { hasText: "Precio" })).toHaveCount(0);
      await expect(dialog.getByRole("group", { name: "Cantidad" })).toBeVisible();
      await dialog.getByRole("button", { name: "Agregar una unidad" }).click();
      await dialog.getByRole("button", { name: "Agregar al pedido" }).click();
      await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
      const drawer = page.getByRole("dialog", { name: "Pedido" });
      await expect(drawer.locator(".cart-line")).toHaveCount(1);
      await expect(drawer.locator(".qty-selector span")).toHaveText("4");
      await expect(drawer.locator(".cart-total, .cart-line-subtotal")).toHaveCount(0);
      await expect(drawer).not.toContainText(/NaN|\$/);
      await drawer.getByRole("button", { name: "Agregar una unidad" }).click();
      await drawer.getByRole("button", { name: "Cerrar pedido" }).click();
      await page.reload();
      await expect(page.getByRole("button", { name: /Abrir pedido, 5 unidades/ })).toBeVisible();
      expect(JSON.parse(await page.evaluate(() => localStorage.getItem("starvie-cart-v1")) ?? "[]"))
        .toEqual([{ productId: "raptor+", qty: 5 }]);
      await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
      await drawer.getByRole("button", { name: "Finalizar pedido" }).click();
      const checkout = page.getByRole("dialog", { name: "Finalizar pedido" });
      await expect(checkout).toContainText("Raptor+");
      await expect(checkout).toContainText("5 unidades");
      await expect(checkout.locator(".checkout-total, .checkout-line-subtotal")).toHaveCount(0);
      await expect(checkout).not.toContainText(/NaN|\$/);
      expect(orders).toBe(0);
    });
  }
  test("abre desde el hotspot con datos del Excel y persiste el pedido", async ({ page }) => {
    const pilot = await getPilot(page);
    const dialog = await openRaptor(page);
    await expect(dialog).toBeVisible();
    if (pilot.precio != null && pilot.precio > 0) await expect(dialog).toContainText(formatPrice(pilot.precio));
    else await expect(dialog.locator(".product-prices small", { hasText: "Precio" })).toHaveCount(0);
    await expect(dialog).toContainText("Con stock");
    await expect(dialog).not.toContainText(/En stock ·/);
    await expect(dialog).toContainText(pilot.sku);

    // Agregar 2 unidades al pedido.
    await dialog.getByRole("button", { name: "Agregar una unidad" }).click();
    await dialog.getByRole("button", { name: "Agregar al pedido" }).click();

    // El botón del toolbar muestra el badge con 2 unidades.
    await expect(page.getByRole("button", { name: /Abrir pedido, 2 unidades/ })).toBeVisible();

    // El drawer muestra línea, subtotal y total.
    await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "Pedido" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Raptor+");
    if (pilot.precio != null && pilot.precio > 0) await expect(drawer).toContainText(formatPrice(pilot.precio * 2));
    else await expect(drawer.locator(".cart-total")).toHaveCount(0);
    await drawer.getByRole("button", { name: "Cerrar pedido" }).click();

    // Persistencia tras reload: el badge sobrevive.
    await page.reload();
    await expect(page.getByRole("button", { name: /Abrir pedido, 2 unidades/ })).toBeVisible();
  });

  test("la imagen principal del Excel carga en el navegador", async ({ page }) => {
    // Data-driven: la ruta esperada sale del JSON publicado (que viene del
    // Excel), sin hardcodear carpetas ni archivos. Demuestra
    // Excel → products.json → derivado de la imagen → asset real cargado.
    const pilot = await getPilot(page);
    expect(pilot.imagenes.length).toBeGreaterThan(0);
    const expectedPath = pilot.imagenes[0];
    const variants = Object.entries(imageVariants.images).find(([source]) => source === expectedPath)?.[1];
    expect(variants, "la imagen del Excel debe tener derivados generados").toBeDefined();
    const dialog = await openRaptor(page);
    await expect(dialog).toBeVisible();
    const main = dialog.getByAltText(/Raptor\+, imagen 1 de/);
    await expect.poll(() => main.evaluate(image => {
      const img = image as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    })).toBe(true);
    // The browser chooses 768/1280 according to display size and density.
    // Assert the exact source mapping rather than accepting any small image.
    const src = await main.evaluate(image => (image as HTMLImageElement).currentSrc);
    const decodedPath = decodeURIComponent(new URL(src as string, page.url()).pathname);
    expect([variants!.standard.src, variants!.large.src].some(path => decodedPath.endsWith("/" + path))).toBe(true);
    await expect.poll(() => main.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => main.evaluate((image) => (image as HTMLImageElement).naturalHeight)).toBeGreaterThan(0);
  });

  test("la cantidad no tiene tope de inventario ni mensajes de máximo", async ({ page }) => {
    await getPilot(page);
    const dialog = await openRaptor(page);
    await expect(dialog).toBeVisible();
    // Mismo test reutilizable para desktop y mobile (sin skip por proyecto).
    const qtyGroup = dialog.getByRole("group", { name: "Cantidad" });
    const qtyValue = qtyGroup.locator("span");
    const more = dialog.getByRole("button", { name: "Agregar una unidad" });
    await expect(qtyValue).toHaveText("1");
    for (let expected = 2; expected <= 10; expected += 1) {
      await expect(more).toBeEnabled();
      await more.click();
      await expect(qtyValue).toHaveText(String(expected));
    }
    await expect(more).toBeEnabled();
    await expect(dialog).not.toContainText(/Cantidad máxima disponible/);
    await expect(dialog).not.toContainText(/Stock máximo/);
    await expect(dialog).toContainText("Con stock");

    // Agregar 10 unidades al pedido: el badge refleja el total.
    await dialog.getByRole("button", { name: "Agregar al pedido" }).click();
    await expect(page.getByRole("button", { name: /Abrir pedido, 10 unidades/ })).toBeVisible();
  });

  test("el cambio de precio actualiza el total en silencio, sin avisos", async ({ page }) => {
    const pilot = await getPilot(page);
    const dialog = await openRaptor(page);
    await expect(dialog).toBeVisible();

    // Agrego 2 unidades al pedido.
    await dialog.getByRole("button", { name: "Agregar una unidad" }).click();
    await dialog.getByRole("button", { name: "Agregar al pedido" }).click();
    await expect(page.getByRole("button", { name: /Abrir pedido, 2 unidades/ })).toBeVisible();

    // Catálogo simulado con precio nuevo, data-driven y sin hardcodear.
    const newPrice = (pilot.precio ?? 0) + 10;
    const catalog = await (await page.request.get("/products.json")).json();
    const versionManifest = await (await page.request.get("/products-version.json")).json();
    const hex: string = (versionManifest.version as string).replace("sha256-", "");
    const flipped = hex.split("").reverse().join("");
    const nextVersion = `sha256-${flipped === hex ? `${"0".repeat(63)}1` : flipped}`;
    const nextCatalog = {
      ...catalog,
      products: (catalog.products as Array<Record<string, unknown>>).map((p) =>
        p.id === "raptor+" ? { ...p, precio: newPrice } : p,
      ),
    };
    await page.route("**/products-version.json*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...versionManifest, version: nextVersion }),
      }),
    );
    await page.route("**/products.json*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(nextCatalog),
      }),
    );

    // Disparo un chequeo de polling en vivo (la app escucha focus).
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    // El total refleja el precio nuevo…
    await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "Pedido" });
    await expect(drawer).toContainText(formatPrice(newPrice * 2));
    // …y no hay ningún aviso de precio: ni banner, ni toast, ni mención.
    await expect(drawer.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".commerce-toast")).toHaveCount(0);
    await expect(drawer).not.toContainText(/cambió de/);
  });
});
