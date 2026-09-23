import { expect, test } from "@playwright/test";

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
  await expect(dialog).toContainText("500,00 $");
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
