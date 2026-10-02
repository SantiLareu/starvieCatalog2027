import { expect, test } from "@playwright/test";

test("descarta el retorno durante un flip sin bloquear ni duplicar giros", async ({ page, context }, testInfo) => {
  const mobile = testInfo.project.name.includes("mobile");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const magazine = page.locator("main.catalog-app");
  const indicator = page.getByTestId("page-indicator");
  const engine = page.getByTestId("page-flip-engine");
  const next = page.getByRole("button", { name: "Página siguiente", exact: true });
  const previous = page.getByRole("button", { name: "Página anterior", exact: true });
  // Cover both keyboard and button routes.
  const requestNext = () => mobile ? page.keyboard.press("ArrowRight") : next.click();
  const requestPrevious = () => mobile ? page.keyboard.press("ArrowLeft") : previous.click();

  await expect(indicator).toHaveText("1 / 39");
  await requestNext();
  await expect(magazine).toHaveAttribute("data-book-transition", "idle");
  await expect(indicator).toHaveText(mobile ? "14 / 39" : "14 · VIDEO / 39");

  // Request the opposite direction while the engine is actually animating.
  await requestNext();
  await expect(engine).toHaveAttribute("data-flip-state", "flipping");
  await requestPrevious();
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowLeft"]) await page.keyboard.press(key);
  await expect(magazine).toHaveAttribute("data-book-transition", "idle", { timeout: 2500 });
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await expect(indicator).toHaveText(mobile ? "VIDEO / 39" : "15–16 / 39");
  if (!mobile) {
    await expect(next).toBeEnabled();
    await expect(previous).toBeEnabled();
  }

  // A fresh request must still work after the ignored request.
  await requestPrevious();
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await expect(indicator).toHaveText(mobile ? "14 / 39" : "14 · VIDEO / 39");
  await requestPrevious();
  await expect(indicator).toHaveText("1 / 39");
  await expect(magazine).toHaveAttribute("data-book-transition", "idle");
  await requestNext();
  await expect(indicator).toHaveText(mobile ? "14 / 39" : "14 · VIDEO / 39");
  await expect(magazine).toHaveAttribute("data-book-transition", "idle");

  // The first interior spread has the same cover-return boundary. Keyboard
  // reversal must not start closing it while the forward turn is running.
  await page.getByRole("button", { name: "STARLAB", exact: true }).click();
  await expect(magazine).toHaveAttribute("data-book-transition", "idle");
  await expect(indicator).toHaveText(mobile ? "2 / 39" : "2–3 / 39");
  await page.keyboard.press("ArrowRight");
  await expect(engine).toHaveAttribute("data-flip-state", "flipping");
  await page.keyboard.press("ArrowLeft");
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await expect(indicator).toHaveText(mobile ? "3 / 39" : "4–5 / 39");

  // Start a native drag/swipe, then try a second gesture during its animation.
  // Neither the second gesture nor a keyboard reversal may replace that flip.
  const leaf = page.locator(`.catalog-leaf[data-book-index="${mobile ? 2 : 4}"]`);
  const box = await leaf.boundingBox();
  expect(box).not.toBeNull();
  const y = box!.y + box!.height - 8;
  const left = box!.x + 8;
  const right = box!.x + box!.width - 8;
  if (mobile) {
    const cdp = await context.newCDPSession(page);
    // Release just past the spine so a genuine native fold still owns its
    // completion animation. A fully traversed drag has already finished.
    for (const [start, end] of [[right, right - box!.width * .6], [left, right]]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: end, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(engine).toHaveAttribute("data-flip-state", /flipping|user_fold/);
    }
    await cdp.detach();
  } else {
    await page.mouse.move(right, y);
    await page.mouse.down();
    await page.mouse.move(box!.x - box!.width * 0.6, y, { steps: 8 });
    await page.mouse.up();
    // StPageFlip keeps user_fold during a drag's release animation.
    await expect(engine).toHaveAttribute("data-flip-state", /flipping|user_fold/);
    // Send the keyboard reversal now. The following mouse gesture can take
    // longer than the remaining animation; a reversal after it would be a
    // legitimate new turn rather than a request during the current flip.
    await page.keyboard.press("ArrowLeft");
    await page.mouse.move(left, y);
    await page.mouse.down();
    await page.mouse.move(right, y, { steps: 3 });
    await page.mouse.up();
    // Salir de la esquina evita el preview pasivo fold_corner tras el drag.
    await page.mouse.move(0, 0);
  }
  if (mobile) await page.keyboard.press("ArrowLeft");
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await expect(indicator).toHaveText(mobile ? "4 / 39" : "6–7 / 39");
  await page.keyboard.press("ArrowLeft");
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await expect(indicator).toHaveText(mobile ? "3 / 39" : "4–5 / 39");
  await expect(magazine).toHaveAttribute("data-book-transition", "idle");
  expect(errors).toEqual([]);
});
