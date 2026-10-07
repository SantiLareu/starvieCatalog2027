import { expect, test } from "@playwright/test";
import type { Page, BrowserContext } from "@playwright/test";

test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, "Estos casos requieren navegación portrait y dispositivo mobile");
});

async function goToPage(page: Page, number: number) {
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill(String(number));
  await page.locator(".page-picker button").click();
  await expect(page.getByTestId("page-indicator")).toHaveText(`${number} / 39`);
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
}

async function gesture(page: Page, context: BrowserContext, direction: "previous" | "next", slow = false, tap = false, vertical = false) {
  const box = await page.locator(`.catalog-leaf[data-book-index="${Number((await page.getByTestId("page-indicator").textContent())!.split(" ")[0])}"]`).boundingBox();
  // Original P17 corresponds to physical index 17 after the VIDEO insert.
  expect(box).not.toBeNull();
  const x = direction === "previous" ? box!.x + 20 : box!.x + box!.width - 20;
  const y = box!.y + box!.height - 18;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  if (slow) await page.waitForTimeout(450); // Exercise StPageFlip's >250ms drag path.
  if (!tap) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: vertical ? x : direction === "previous" ? box!.x + box!.width - 20 : box!.x + 20, y: vertical ? y - 70 : y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("mobile vuelve con swipe, drag y tap, sin bloquear ni duplicar giros", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await goToPage(page, 17);
  for (const options of [{}, { slow: true }, { tap: true }]) {
    await gesture(page, context, "previous", options.slow, options.tap);
    await expect(page.getByTestId("page-indicator")).toHaveText("16 / 39");
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
    await gesture(page, context, "next", options.slow, options.tap);
    await expect(page.getByTestId("page-indicator")).toHaveText("17 / 39");
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
    await expect(page.locator(".mobile-gesture-hint")).toBeVisible();
  }
  await gesture(page, context, "previous", false, false, true);
  await expect(page.getByTestId("page-indicator")).toHaveText("17 / 39");
  const next = page.getByRole("button", { name: "Página siguiente", exact: true });
  const previous = page.getByRole("button", { name: "Página anterior", exact: true });
  await next.click();
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "flipping");
  await previous.click();
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await expect(page.getByTestId("page-indicator")).toHaveText("18 / 39");
  await previous.click();
  await expect(page.getByTestId("page-indicator")).toHaveText("17 / 39");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
});

test("mobile mantiene la pista tras interactuar, navegar y recargar sin tapar controles", async ({ page }) => {
  // A previous session's onboarding flag must no longer hide the guide.
  await page.addInitScript(() => sessionStorage.setItem("starvie-mobile-gesture-seen", "1"));
  await page.goto("/");
  const previous = page.getByRole("button", { name: "Página anterior", exact: true });
  const next = page.getByRole("button", { name: "Página siguiente", exact: true });
  await expect(previous).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  const hint = page.locator(".mobile-gesture-hint");
  await expect(hint).toBeVisible();
  expect(await hint.evaluate(el => getComputedStyle(el).pointerEvents)).toBe("none");
  const buttonBox = (await next.boundingBox())!;
  const leafBox = (await page.locator('.catalog-leaf[data-book-index="0"]').boundingBox())!;
  expect(buttonBox.width).toBeGreaterThanOrEqual(44);
  expect(buttonBox.height).toBeGreaterThanOrEqual(44);
  expect(buttonBox.y).toBeGreaterThan(leafBox.y + leafBox.height);
  await next.click();
  await expect(page.getByTestId("page-indicator")).toHaveText("14 / 39");
  await expect(page.locator("main")).toHaveAttribute("data-book-transition", "idle");
  await expect(hint).toBeVisible();
  await previous.click();
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await page.reload();
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await expect(hint).toBeVisible();
  await goToPage(page, 38);
  await next.click();
  await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "closed");
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "open");
});

test("mobile conserva la pista después del antiguo timeout y respeta movimiento reducido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const hint = page.locator(".mobile-gesture-hint");
  await expect(hint).toBeVisible();
  expect(await hint.locator("svg").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await page.waitForTimeout(5000);
  await expect(hint).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await expect(hint).toBeVisible();
});
