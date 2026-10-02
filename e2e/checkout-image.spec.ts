import { expect, test } from "@playwright/test";

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
