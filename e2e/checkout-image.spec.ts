import { expect, test } from "@playwright/test";

test("completed vencido se limpia sin borrar el carrito de una compra nueva", async ({ page }) => {
  let orderRequests = 0;
  await page.route("**/api/orders", route => { orderRequests++; return route.abort(); });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const idempotencyKey = crypto.randomUUID();
    const createdAt = new Date(Date.now() - 25 * 3600_000).toISOString();
    const lines = [{ productId: "raptor+", qty: 1 }];
    localStorage.setItem("starvie-order-attempt-v2", JSON.stringify({
      version: "v2", idempotencyKey, orderId: "RS-historical", lines, createdAt,
      status: "completed", completedAt: createdAt,
    }));
    sessionStorage.setItem("starvie-order-attempt-v2-session", JSON.stringify({
      version: "v2", idempotencyKey, orderId: null, lines, createdAt,
      contact: { name: "Fixture", legalName: "Fixture", email: "fixture@example.test" },
    }));
    localStorage.setItem("starvie-cart-v1", JSON.stringify([{ productId: "raptor+", qty: 2 }]));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir pedido, 2 unidades", exact: true }).click();
  await page.getByRole("button", { name: "Finalizar pedido", exact: true }).click();
  await expect(page.getByLabel("Nombre y apellido *")).toBeEnabled();
  await expect(page.getByLabel("Nombre y apellido *")).toHaveValue("");
  await expect(page.getByText(/Venció la ventana de seguridad/)).toHaveCount(0);
  expect(await page.evaluate(() => [
    localStorage.getItem("starvie-order-attempt-v2"), sessionStorage.getItem("starvie-order-attempt-v2-session"),
  ])).toEqual([null, null]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("starvie-cart-v1")!)))
    .toEqual([{ productId: "raptor+", qty: 2 }]);
  expect(orderRequests).toBe(0);
});

test("el checkout usa el WebP precargado desde el carrito solo en desktop", async ({ page, isMobile }) => {
  const heroRequests: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/checkout/checkout-hero-raptor.")) heroRequests.push(request.url());
  });

  await page.goto("/");
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("17");
  await page.locator(".page-picker button").click();
  await page.locator('.catalog-leaf[data-book-index="17"] [data-product-id]').first().click();
  await page.getByRole("button", { name: "Agregar al pedido" }).click();
  const heroResponse = isMobile ? null : page.waitForResponse(response =>
    response.url().endsWith("/checkout/checkout-hero-raptor.webp"));
  await page.locator(".cart-button").click();

  if (heroResponse) {
    const hero = await heroResponse;
    expect(hero.ok()).toBe(true);
    expect((await hero.body()).length).toBeLessThan(200_000);
  }

  await page.getByRole("button", { name: "Finalizar pedido" }).click();
  const image = page.locator(".checkout-visual img");
  const initialFrame = await page.locator(".checkout-modal").evaluate(el => [el.clientWidth, el.clientHeight]);
  await expect(image).toHaveAttribute("src", "/checkout/checkout-hero-raptor.webp");
  if (isMobile) {
    await expect(page.locator(".checkout-visual")).toBeHidden();
    expect(heroRequests).toHaveLength(0);
  } else {
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    expect(heroRequests).toHaveLength(1);
    const loadedFrame = await page.locator(".checkout-modal").evaluate(el => [el.clientWidth, el.clientHeight]);
    expect(loadedFrame).toEqual(initialFrame);
  }
  await expect(page.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
});
