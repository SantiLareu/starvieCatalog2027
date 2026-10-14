import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ORDER_ID = "8dc011f4-40a3-4ca6-9ce9-2e9d11a9277b";
const NEXT_ORDER_ID = "39c169ed-52e6-47c5-ae61-45ccf2540c69";
const INSTAGRAMS = [
  ["RealStep", "https://www.instagram.com/realstep.oficial/"],
  ["StarVie Argentina", "https://www.instagram.com/starvieargoficial/"],
] as const;

test.beforeEach(async ({ page, context }) => {
  // No request can reach the real orders service, including unexpected extra requests.
  await context.route("**/api/orders**", route => route.abort());
  await context.route("https://challenges.cloudflare.com/**", route => route.abort());
  await page.addInitScript(() => {
    window.turnstile = {
      render: (_node, options) => { queueMicrotask(() => options.callback("confirmation-test-token")); return "mock-widget"; },
      reset: () => {}, remove: () => {},
    };
  });
});

async function fixture(page: Page, result: "completed" | "processing" | "error" = "completed") {
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/api/orders**", async route => {
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    expect(route.request().method()).toBe("POST");
    payloads.push(route.request().postDataJSON());
    const orderId = payloads.length === 1 ? ORDER_ID : NEXT_ORDER_ID;
    return route.fulfill({ status: result === "error" ? 400 : result === "processing" ? 202 : 201, headers,
      json: result === "error" ? { error: "Datos rechazados por el servidor de prueba" } : { ok: true, orderId, status: result, duplicate: false } });
  });
  await page.addInitScript(() => localStorage.setItem("starvie-cart-v1", JSON.stringify([{ productId: "raptor+", qty: 2 }])));
  return payloads;
}

async function openAndSend(page: Page) {
  await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
  await page.getByRole("dialog", { name: "Pedido", exact: true }).getByRole("button", { name: "Finalizar pedido", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Finalizar pedido", exact: true });
  await expect(page.locator(".checkout-confirmation")).toHaveCount(0);
  await form.getByLabel("Nombre y apellido *").fill("Cliente de prueba");
  await form.getByLabel("Razón social *").fill("Empresa de prueba");
  await form.getByLabel("Correo electrónico *").fill("cliente@example.com");
  await form.getByRole("button", { name: "Enviar pedido", exact: true }).click();
}

async function assertConfirmation(page: Page) {
  const dialog = page.getByRole("dialog", { name: "¡Pedido enviado con éxito!", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("confirmed-order-id")).toHaveText(ORDER_ID);
  await expect(dialog).not.toContainText(/Finalizar pedido|Te contactaremos|Iniciar nueva compra|Seguir viendo/);
  await expect(dialog.getByText("Gracias por elegir StarVie.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Licenciatario Oficial", { exact: true })).toBeVisible();
  return dialog;
}

async function assertLayout(page: Page) {
  const geometry = await page.locator(".checkout-confirmation").evaluate(dialog => {
    const motto = dialog.querySelector<HTMLElement>(".checkout-confirmation-motto")!;
    const range = document.createRange(); range.selectNodeContents(motto);
    const text = range.getBoundingClientRect();
    const lineTops = [...new Set([...range.getClientRects()].map(rect => Math.round(rect.top)))];
    const reference = dialog.querySelector<HTMLElement>(".checkout-confirmation-id")!;
    const layers = [".checkout-confirmation-status", ".checkout-confirmation-message", ".checkout-confirmation-reference",
      ".checkout-confirmation-return", ".checkout-confirmation-social", ".checkout-confirmation-license"]
      .map(selector => dialog.querySelector(selector)!.getBoundingClientRect().toJSON());
    return { text: motto.textContent, textWidth: text.width, mottoWidth: motto.clientWidth, lineTops,
      referenceOverflow: reference.scrollWidth - reference.clientWidth,
      dialogOverflow: dialog.scrollWidth - dialog.clientWidth, documentOverflow: document.documentElement.scrollWidth - innerWidth,
      dialog: dialog.getBoundingClientRect().toJSON(), layers,
      controls: [...dialog.querySelectorAll("button, a")].map(el => el.getBoundingClientRect().toJSON()) };
  });
  expect(geometry.text).toBe("SIN RIESGO NO HAY HISTORIA");
  expect(geometry.lineTops).toHaveLength(1);
  expect(geometry.textWidth).toBeLessThanOrEqual(geometry.mottoWidth);
  expect(geometry.referenceOverflow).toBeLessThanOrEqual(1);
  expect(geometry.dialogOverflow).toBeLessThanOrEqual(1);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.dialog.left).toBeGreaterThanOrEqual(0);
  expect(geometry.dialog.right).toBeLessThanOrEqual(page.viewportSize()!.width);
  for (const control of geometry.controls) {
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
  for (let index = 1; index < geometry.layers.length; index++) {
    expect(geometry.layers[index].top).toBeGreaterThanOrEqual(geometry.layers[index - 1].bottom);
  }
}

async function assertInstagramNavigation(page: Page, context: BrowserContext) {
  await context.route("https://www.instagram.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>Instagram mock</title><p>Instagram mock</p>" }));
  for (const [index, [name, href]] of INSTAGRAMS.entries()) {
    const link = page.getByRole("link", { name: `Instagram de ${name}`, exact: true });
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await page.getByRole("button", { name: "Cerrar checkout", exact: true }).focus();
    await page.keyboard.press("Tab"); // CTA
    for (let step = 0; step <= index; step++) await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-style", "solid");
    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await expect(popup).toHaveURL(href);
    await popup.waitForLoadState();
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
  }
  const close = page.getByRole("button", { name: "Cerrar checkout", exact: true });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("link", { name: "Instagram de StarVie Argentina", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
}

for (const { name, width, height, mobile } of [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 393, height: 851, mobile: true },
  { name: "mobile-angosto", width: 320, height: 740, mobile: true },
  { name: "mobile-bajo", width: 320, height: 480, mobile: true },
  { name: "mobile-landscape", width: 667, height: 375, mobile: true },
]) {
  test(`confirmación premium ${name}: UUID, frase, enlaces y retorno`, async ({ page, context, isMobile }, testInfo) => {
    test.skip(isMobile !== mobile, "Viewport correspondiente al dispositivo");
    await page.setViewportSize({ width, height });
    const cdp = isMobile ? await context.newCDPSession(page) : null;
    await cdp?.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 20, bottom: 34 } });
    const payloads = await fixture(page);
    await page.goto("/");
    const indicator = await page.getByTestId("page-indicator").textContent();
    await openAndSend(page);
    const dialog = await assertConfirmation(page);
    await assertLayout(page);
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(isMobile ? 20 : 16);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height - (isMobile ? 34 : 16));
    await page.screenshot({ path: testInfo.outputPath(`confirmacion-${name}.png`), animations: "disabled" });
    if (height < 600) {
      await dialog.getByText("Licenciatario Oficial", { exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByText("Licenciatario Oficial", { exact: true })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`confirmacion-${name}-scroll.png`), animations: "disabled" });
    }
    await assertInstagramNavigation(page, context);
    await dialog.getByRole("button", { name: "VOLVER AL CATÁLOGO", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("page-indicator")).toHaveText(indicator!);
    expect(await page.evaluate(() => localStorage.getItem("starvie-cart-v1"))).toBeNull();
    expect(await page.evaluate(() => [localStorage.getItem("starvie-order-attempt-v2"), sessionStorage.getItem("starvie-order-attempt-v2-session")])).toEqual([null, null]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].lines).toEqual([{ productId: "raptor+", qty: 2 }]);
    expect(JSON.stringify(payloads[0])).not.toMatch(/"precio"|"total"|"subtotal"/);
    await cdp?.detach();
  });
}

test("volver al catálogo permite agregar productos y completar otra compra con referencia nueva", async ({ page }) => {
  const payloads = await fixture(page);
  await page.goto("/");
  await openAndSend(page);
  const confirmed = await assertConfirmation(page);
  await confirmed.getByRole("button", { name: "VOLVER AL CATÁLOGO", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("17");
  await page.locator(".page-picker button[type='submit']").click();
  await expect(page.getByTestId("page-indicator")).toHaveText(/17/);
  await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
  await page.locator('[data-product-id="raptor+"]:visible').first().click();
  await page.getByRole("dialog", { name: "Raptor+", exact: true }).getByRole("button", { name: "Agregar al pedido", exact: true }).click();
  await openAndSend(page);
  await expect(page.getByTestId("confirmed-order-id")).toHaveText(NEXT_ORDER_ID);
  expect(payloads).toHaveLength(2);
  expect(payloads[1].idempotencyKey).not.toBe(payloads[0].idempotencyKey);
  expect(payloads[1].lines).toEqual([{ productId: "raptor+", qty: 1 }]);
});

for (const result of ["processing", "error"] as const) {
  test(`${result} conserva su pantalla y no anuncia un pedido confirmado`, async ({ page }) => {
    const payloads = await fixture(page, result);
    await page.goto("/");
    await openAndSend(page);
    await expect(page.locator(".checkout-confirmation")).toHaveCount(0);
    const dialog = page.getByRole("dialog", { name: "Finalizar pedido", exact: true });
    if (result === "processing") {
      await expect(dialog).toContainText("Pedido recibido — en proceso.");
      await expect(dialog).toContainText(`N° ${ORDER_ID}`);
      await expect(dialog.getByRole("button", { name: "Consultar estado", exact: true })).toBeVisible();
    } else {
      await expect(dialog.getByRole("alert")).toContainText("Datos rechazados por el servidor de prueba");
    }
    expect(payloads).toHaveLength(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("starvie-cart-v1")!))).toEqual([{ productId: "raptor+", qty: 2 }]);
  });
}
