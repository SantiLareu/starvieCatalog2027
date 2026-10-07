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
    await expect(image).toHaveCSS("object-fit", "cover");
    await expect(image).toHaveCSS("object-position", "15% 50%");
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    expect(heroRequests).toHaveLength(1);
    const loadedFrame = await page.locator(".checkout-modal").evaluate(el => [el.clientWidth, el.clientHeight]);
    expect(loadedFrame).toEqual(initialFrame);
  }
  await expect(page.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
});

test("el drawer conserva scroll y los cierres claros funcionan en carrito y checkout", async ({ page }, testInfo) => {
  await page.route("**/api/orders", route => route.abort());
  const catalog = await (await page.request.get("/products.json")).json();
  const lines = catalog.products.filter((product: { disponible: boolean }) => product.disponible)
    .slice(0, 12).map((product: { id: string }) => ({ productId: product.id, qty: 1 }));
  await page.addInitScript(lines => localStorage.setItem("starvie-cart-v1", JSON.stringify(lines)), lines);
  await page.goto("/");
  await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
  const drawer = page.getByRole("dialog", { name: "Pedido", exact: true });
  const list = drawer.locator(".cart-lines");
  await expect(drawer).toHaveCSS("color-scheme", "light");
  expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await list.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const close = drawer.getByRole("button", { name: "Cerrar pedido", exact: true });
  await page.keyboard.press("Tab");
  await close.focus();
  await expect(close).toHaveCSS("outline-style", "solid");
  const assertLightClose = async (button: typeof close) => {
    const colors = await button.evaluate(el => {
      const css = getComputedStyle(el);
      return [css.backgroundColor, css.color].map(color => color.match(/\d+/g)!.slice(0, 3).map(Number));
    });
    expect(Math.min(...colors[0])).toBeGreaterThan(200);
    expect(Math.max(...colors[1])).toBeLessThan(80);
  };
  await assertLightClose(close);
  await drawer.screenshot({ path: testInfo.outputPath("cart-light-controls.png") });
  await drawer.getByRole("button", { name: "Finalizar pedido", exact: true }).click();
  const checkoutClose = page.getByRole("button", { name: "Cerrar checkout", exact: true });
  await assertLightClose(checkoutClose);
  await checkoutClose.click();
  await expect(drawer).toBeVisible();
  await close.click();
  await expect(drawer).toHaveCount(0);
});
