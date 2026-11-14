import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Refinamiento visual de distribuidores (S1/S2/S3/S5):
 * - el header no muestra porcentajes y separa "Salir" del carrito;
 * - el carrito muestra el subtotal DISTRIBUIDOR (precio unitario cotizado ×
 *   cantidad), nunca el subtotal de lista;
 * - la ficha del producto y el carrito muestran el precio DISTRIBUIDOR
 *   cotizado por el servidor.
 *
 * La sesión y la cotización están simuladas en el navegador: ninguna
 * petición real sale a la red y NINGÚN endpoint de pedidos se invoca.
 */

const LIST_PRICE = 372000;
const NET_UNIT_PRICE = 297600;
const DISCOUNT_PERCENT = 20;

/**
 * Cabeceras CORS de la respuesta simulada: el cliente consulta con
 * `credentials: "include"` contra otro origen, así que la respuesta mock
 * debe permitirlo o el navegador rechaza la lectura y la sesión simulada
 * nunca se autentica.
 */
function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"];
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

async function mockDistributor(page: Page) {
  const orderCalls: string[] = [];
  // Bloqueo general: cualquier host que no sea el servidor local se corta.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
      return;
    }
    orderCalls.push(url.pathname);
    await route.abort();
  });
  // Ningún pedido, ni público ni de distribuidores.
  await page.route("**/api/orders", async (route) => {
    orderCalls.push(route.request().url());
    await route.abort();
  });
  await page.route("**/api/distributor/orders", async (route) => {
    orderCalls.push(route.request().url());
    await route.abort();
  });
  await page.route("**/api/distributor/login", async (route) => {
    orderCalls.push(route.request().url());
    await route.abort();
  });
  // Sesión del servidor: el contrato exacto del frontend es
  // { ok, authenticated, discountPercent, expiresAt } (ver types.ts y
  // fetchDistributorSession). El frontend NO espera un csrfToken en la
  // sesión: la defensa CSRF de las mutaciones es el header
  // "X-Requested-With: distributor" (ver client.ts).
  await page.route("**/api/distributor/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(route),
      body: JSON.stringify({
        ok: true,
        authenticated: true,
        discountPercent: DISCOUNT_PERCENT,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    });
  });
  // Cotización: el precio neto lo manda el servidor, para la cantidad pedida.
  await page.route("**/api/distributor/quote*", async (route) => {
    const url = new URL(route.request().url());
    const productId = url.searchParams.get("productId") ?? "";
    const qty = Number(url.searchParams.get("qty") ?? "1");
    const netSubtotal = NET_UNIT_PRICE * qty;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(route),
      body: JSON.stringify({
        ok: true,
        currency: "ARS",
        discountPercent: DISCOUNT_PERCENT,
        lines: [
          {
            productId,
            qty,
            listUnitPrice: LIST_PRICE,
            netUnitPrice: NET_UNIT_PRICE,
            netSubtotal,
          },
        ],
        listTotal: LIST_PRICE * qty,
        netTotal: netSubtotal,
      }),
    });
  });
  return orderCalls;
}

async function seedCart(page: Page, productId: string, qty: number) {
  await page.addInitScript(
    ([id, quantity]) => {
      localStorage.setItem("starvie-cart-v1", JSON.stringify([{ productId: id, qty: quantity }]));
    },
    [productId, qty] as const,
  );
}

test.describe("Refinamiento de distribuidores", () => {
  test("el header dice sólo «Distribuidor» y separa «Salir» del carrito", async ({ page }) => {
    await mockDistributor(page);
    await page.goto("/");
    const badge = page.locator(".distributor-account__badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("Distribuidor");
    await expect(page.locator(".catalog-toolbar")).not.toContainText("%");
    const logout = page.getByRole("button", { name: "Salir" });
    await expect(logout).toBeVisible();
    // "Salir" y el carrito no se pisan: el distintivo del grupo ocupa su lugar.
    const logoutBox = await logout.boundingBox();
    const cartBox = await page.locator(".cart-button").boundingBox();
    expect(logoutBox).not.toBeNull();
    expect(cartBox).not.toBeNull();
    expect(logoutBox!.x + logoutBox!.width).toBeLessThanOrEqual(cartBox!.x);
  });

  test("el carrito muestra el subtotal cotizado por el servidor, no el de lista", async ({ page }) => {
    const orderCalls = await mockDistributor(page);
    await seedCart(page, "eternal", 5);
    await page.goto("/");
    await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "Pedido" });
    await expect(drawer).toBeVisible();
    const line = drawer.locator(".cart-line").first();
    // 5 × 297.600 = 1.488.000 (el precio lista daría 1.860.000).
    await expect(line).toContainText("$ 1.488.000,00");
    await expect(line).not.toContainText("1.860.000");
    await expect(line).toContainText("Distribuidor $ 297.600,00 c/u");
    await expect(drawer).toContainText("Total lista");
    await expect(drawer).toContainText("Total distribuidor");
    expect(orderCalls).toEqual([]);
  });

  test("la ficha y el carrito muestran el precio distribuidor cotizado", async ({ page }, testInfo) => {
    // La navegación por páginas y la ficha editorial son superficies de escritorio.
    test.skip(testInfo.project.name.includes("mobile"), "la navegación por páginas es una superficie de escritorio");
    const orderCalls = await mockDistributor(page);
    await seedCart(page, "eternal", 5);
    await page.goto("/");
    /* La ficha del producto: el importe lo devuelve el servidor, nunca el
       frontend. Eternal: 372.000 de lista → 297.600 cotizados (20%). */
    await page.getByRole("button", { name: "Ir a una página" }).click();
    await page.locator("#page-number").fill("15");
    await page.locator(".page-picker button[type='submit']").click();
    await expect(page.getByTestId("page-indicator")).toContainText("15");
    await page.locator('[data-product-id="eternal"]:visible').first().click();
    const ficha = page.locator(".product-modal");
    await expect(ficha).toBeVisible();
    const priceLine = ficha.getByTestId("distributor-price-line");
    await expect(priceLine).toBeVisible();
    await expect(priceLine).toContainText("$ 297.600");
    await expect(priceLine).toContainText("20% de descuento");
    /* El precio de lista no puede aparecer como precio distribuidor. */
    await expect(priceLine).not.toContainText("$ 372.000");
    /* El carrito muestra el mismo importe cotizado, por línea. */
    await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
    const drawer = page.getByRole("dialog", { name: "Pedido" });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(".cart-line").first()).toContainText("Distribuidor $ 297.600,00 c/u");
    /* Ningún pedido: sólo lecturas. */
    expect(orderCalls).toEqual([]);
  });
});
