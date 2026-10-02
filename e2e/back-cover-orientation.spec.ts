import { expect, test } from "@playwright/test";

test("contratapa conserva el espejo exterior al cerrar y reabrir", async ({ page, isMobile }, testInfo) => {
  await page.goto("/");
  if (testInfo.config.metadata.productionPreview) {
    await expect(page.locator('link[rel="stylesheet"][href^="/assets/"]')).toHaveCount(1);
    await expect(page.locator('script[src*="/@vite/client"]')).toHaveCount(0);
  }

  const app = page.locator("main.catalog-app");
  const physics = page.getByTestId("back-cover-physics");
  const expectMirror = async () => {
    await expect(physics).toHaveClass(/stf__parent/);
    await expect.poll(() => physics.evaluate(element => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return [matrix.m11, matrix.m22, matrix.m33, matrix.m44, matrix.m41, matrix.m42, matrix.m43];
    })).toEqual([-1, 1, 1, 1, 0, 0, 0]);
  };

  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("38");
  await page.locator(".page-picker button").click();
  await expect(page.getByTestId("page-indicator")).toHaveText(isMobile ? "38 / 39" : "37–38 / 39");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await expectMirror();

  await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(app).toHaveAttribute("data-back-cover-state", "closing");
  await expectMirror();
  await expect(app).toHaveAttribute("data-back-cover-state", "closed");
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await expectMirror();

  await page.getByRole("button", { name: "Página anterior", exact: true }).click();
  await expect(app).toHaveAttribute("data-back-cover-state", "opening");
  await expectMirror();
  await expect(app).toHaveAttribute("data-back-cover-state", "open");
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await expectMirror();
});
