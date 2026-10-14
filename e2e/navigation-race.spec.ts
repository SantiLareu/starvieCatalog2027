import { expect, test } from "@playwright/test";

test("descarta el retorno durante un flip sin bloquear ni duplicar giros", async ({ page, context }, testInfo) => {
  const mobile = testInfo.project.name.includes("mobile");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Control animation frames so protocol round trips cannot turn a concurrent
  // request into a legitimate new request after the engine returns to "read".
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-02T00:00:00Z"));
  await page.goto("/");
  const magazine = page.locator("main.catalog-app");
  const indicator = page.getByTestId("page-indicator");
  const engine = page.getByTestId("page-flip-engine");
  const next = page.getByRole("button", { name: "Página siguiente", exact: true });
  const previous = page.getByRole("button", { name: "Página anterior", exact: true });
  // Advance individual animation frames until all observable navigation state
  // agrees. This waits for completion without assuming an animation duration.
  const settle = (text: string) => expect.poll(async () => {
    await page.clock.runFor(16);
    return engine.evaluate(host => ({
      state: host.getAttribute("data-flip-state"),
      transition: document.querySelector("main.catalog-app")?.getAttribute("data-book-transition"),
      text: document.querySelector('[data-testid="page-indicator"]')?.textContent,
    }));
  }, { intervals: [0] }).toEqual({ state: "read", transition: "idle", text });
  // Cover both keyboard and button routes.
  const requestNext = () => mobile ? page.keyboard.press("ArrowRight") : next.click();
  const requestPrevious = () => mobile ? page.keyboard.press("ArrowLeft") : previous.click();

  await expect(indicator).toHaveText("1 / 39");
  await requestNext();
  await settle(mobile ? "14 / 39" : "14 · VIDEO / 39");

  // Request the opposite direction while the engine is actually animating.
  await requestNext();
  await expect(engine).toHaveAttribute("data-flip-state", "flipping");
  await requestPrevious();
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowLeft"]) await page.keyboard.press(key);
  await expect(engine).toHaveAttribute("data-flip-state", "flipping");
  await settle(mobile ? "VIDEO / 39" : "15–16 / 39");
  if (!mobile) {
    await expect(next).toBeEnabled();
    await expect(previous).toBeEnabled();
  }

  // A fresh request must still work after the ignored request.
  await requestPrevious();
  await settle(mobile ? "14 / 39" : "14 · VIDEO / 39");
  await requestPrevious();
  await settle("1 / 39");
  await requestNext();
  await settle(mobile ? "14 / 39" : "14 · VIDEO / 39");

  // The first interior spread has the same cover-return boundary. Keyboard
  // reversal must not start closing it while the forward turn is running.
  await page.getByRole("button", { name: "STARLAB", exact: true }).click();
  await settle(mobile ? "2 / 39" : "2–3 / 39");
  await page.keyboard.press("ArrowRight");
  await expect(engine).toHaveAttribute("data-flip-state", "flipping");
  await page.keyboard.press("ArrowLeft");
  await expect(engine).toHaveAttribute("data-flip-state", "flipping");
  await settle(mobile ? "3 / 39" : "4–5 / 39");

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
    // Frames remain paused until settle, so the keyboard reversal and second
    // native gesture both arrive during the first gesture's release animation.
    await page.keyboard.press("ArrowLeft");
    await page.mouse.move(left, y);
    await page.mouse.down();
    await page.mouse.move(right, y, { steps: 3 });
    await page.mouse.up();
    // Salir de la esquina evita el preview pasivo fold_corner tras el drag.
    await page.mouse.move(0, 0);
  }
  if (mobile) await page.keyboard.press("ArrowLeft");
  await expect(engine).toHaveAttribute("data-flip-state", /flipping|user_fold/);
  await settle(mobile ? "4 / 39" : "6–7 / 39");
  await page.keyboard.press("ArrowLeft");
  await settle(mobile ? "3 / 39" : "4–5 / 39");
  await expect(magazine).toHaveAttribute("data-book-transition", "idle");
  expect(errors).toEqual([]);
});
