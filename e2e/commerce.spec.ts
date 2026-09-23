import { expect, test, type Page } from "@playwright/test";
import { formatPrice } from "../src/commerce/money";

/**
 * Piloto comercial Raptor+: Excel → import → JSON → hotspot → modal →
 * precio/disponibilidad/imágenes → carrito → persistencia.
 *
 * Precio y disponibilidad se leen del JSON publicado (/products.json) para no
 * acoplar el test a los valores concretos del piloto: la UI muestra
 * disponibilidad ("Con stock"/"Sin stock"). No hay stock numérico ni tope
 * de cantidad asociado a inventario.
 */
type PilotProduct = { id: string; precio: number; disponible: boolean; sku: string; imagenes: string[] };

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
  test("abre desde el hotspot con datos del Excel y persiste el pedido", async ({ page }) => {
    const pilot = await getPilot(page);
    const dialog = await openRaptor(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(formatPrice(pilot.precio));
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
    await expect(drawer).toContainText(formatPrice(pilot.precio * 2));
    await drawer.getByRole("button", { name: "Cerrar pedido" }).click();

    // Persistencia tras reload: el badge sobrevive.
    await page.reload();
    await expect(page.getByRole("button", { name: /Abrir pedido, 2 unidades/ })).toBeVisible();
  });

  test("la imagen principal del Excel carga en el navegador", async ({ page }) => {
    // Data-driven: la ruta esperada sale del JSON publicado (que viene del
    // Excel), sin hardcodear carpetas ni archivos. Demuestra
    // Excel → products.json → ProductModal → asset real cargado.
    const pilot = await getPilot(page);
    expect(pilot.imagenes.length).toBeGreaterThan(0);
    const expectedPath = pilot.imagenes[0];
    const dialog = await openRaptor(page);
    await expect(dialog).toBeVisible();
    const main = dialog.getByAltText(/Raptor\+, imagen 1 de/);
    // La ruta del Excel puede viajar URL-encoded por segmento en el src
    // (+ → %2B, espacios → %20): se compara la URL lógica decodificada.
    const src = await main.getAttribute("src");
    expect(src, "el modal debe renderizar la imagen principal").not.toBeNull();
    const decodedPath = decodeURIComponent(new URL(src as string, page.url()).pathname);
    expect(decodedPath).toContain(expectedPath);
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
    const newPrice = pilot.precio + 10;
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
