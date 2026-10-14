import { expect, test } from "@playwright/test";

test("desktop: desprendimiento, vuelo inverso, reapertura y navegación", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "La animación solo se habilita en desktop");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/orders**", route => route.abort());
  await page.goto("/");
  const app = page.locator(".catalog-app");
  const scene = page.locator(".desktop-stage-background");
  const wall = page.locator(".desktop-stage-background__wall-logo");
  const flying = page.locator(".desktop-logo-flight__logo");
  const engine = page.getByTestId("page-flip-engine");
  await expect(app).toHaveClass(/cover-ready/);
  await expect(scene).toHaveAttribute("data-logo-state", "closed");
  await expect(wall).toHaveCSS("opacity", "0");
  const engineHandle = await engine.elementHandle();
  const initialBox = await engine.boundingBox();

  for (const direction of ["opening", "closing", "opening"] as const) {
    await page.getByRole("button", { name: direction === "opening" ? "Página siguiente" : "Página anterior", exact: true }).click();
    await expect(app).toHaveAttribute("data-desktop-logo-flight", direction);
    await expect(flying).toHaveCSS("will-change", "transform, opacity");
    const audit = await flying.evaluate(element => {
      const animation = element.getAnimations()[0];
      const effect = animation.effect as KeyframeEffect;
      const coverMask = document.querySelector('.catalog-leaf[data-book-index="0"] .cover-base-image')!;
      // Sample the trajectory in one browser task. A loaded screenshot worker
      // can otherwise read the second box after the native turn hid the flight.
      const currentTime = animation.currentTime;
      animation.pause();
      animation.currentTime = 200;
      const box = element.getBoundingClientRect().toJSON();
      animation.currentTime = 440;
      const moved = element.getBoundingClientRect().toJSON();
      animation.currentTime = currentTime;
      animation.play();
      return { direction: effect.getTiming().direction, frames: effect.getKeyframes(), box, moved,
        coverMaskOpacity: getComputedStyle(coverMask).opacity };
    });
    // Check while the native opening class is active, without retrying past
    // the flip: a CSS specificity regression would duplicate the printed logo.
    expect(audit.coverMaskOpacity).toBe("1");
    expect(audit.direction).toBe(direction === "opening" ? "normal" : "reverse");
    expect(new Set(audit.frames.map(frame => frame.transform)).size).toBeGreaterThan(3);
    expect(Math.abs(audit.moved.y - audit.box.y) + Math.abs(audit.moved.x - audit.box.x)).toBeGreaterThan(15);
    await page.screenshot({ path: testInfo.outputPath(`logo-${direction}.png`) });
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    expect(await scene.getAttribute("data-logo-state")).toBe(direction === "opening" ? "wall" : "closed");
    await expect(app).not.toHaveAttribute("data-desktop-logo-flight");
    await expect(flying).not.toHaveAttribute("style");
    expect(await flying.evaluate(element => element.getAnimations().length)).toBe(0);
    await expect(wall).toHaveCSS("opacity", direction === "opening" ? "0.62" : "0");
  }
  await page.screenshot({ path: testInfo.outputPath("logo-wall.png") });
  const wallBox = await wall.boundingBox();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("page-indicator")).toContainText("15");
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await expect(scene).toHaveAttribute("data-logo-state", "wall");
  expect(await wall.boundingBox()).toEqual(wallBox);
  expect(await engine.boundingBox()).toEqual(initialBox);
  expect(await engineHandle!.evaluate(element => element.isConnected)).toBe(true);
  expect(errors).toEqual([]);
});

test("desktop: mural amplio en la pared, entrega sin salto y geometría intacta", async ({ page, isMobile }) => {
  test.skip(isMobile, "Solo desktop");
  await page.goto("/");
  const app = page.locator(".catalog-app");
  await expect(app).toHaveClass(/cover-ready/);
  const before = await page.getByTestId("page-flip-engine").boundingBox();
  await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
  const handoff = await page.locator(".desktop-logo-flight__logo").evaluate(element => {
    const flight = element.getAnimations()[0];
    const wall = document.querySelector('.desktop-stage-background__wall-logo')!;
    const mark = document.querySelector('.desktop-stage-background__wall-mark')!;
    const ink = wall.getAnimations()[0];
    flight.pause(); ink.pause();
    const duration = Number(flight.effect!.getTiming().duration);
    flight.currentTime = ink.currentTime = duration * 0.9;
    return { flying: element.getBoundingClientRect().toJSON(), mural: mark.getBoundingClientRect().toJSON(),
      flightOpacity: Number(getComputedStyle(element).opacity), wallOpacity: Number(getComputedStyle(wall).opacity) };
  });
  // Both marks occupy the same projected rectangle before the material changes.
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(handoff.flying[key]).toBeCloseTo(handoff.mural[key], 1);
  }
  expect(handoff.flightOpacity).toBeGreaterThan(0);
  expect(handoff.wallOpacity).toBeGreaterThan(0);
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await expect(page.locator(".desktop-stage-background")).toHaveAttribute("data-logo-state", "wall");
  const wall = await page.locator(".desktop-stage-background__wall-logo").boundingBox();
  expect(wall!.width).toBeGreaterThan(1440 * 0.6);
  expect(await page.getByTestId("page-flip-engine").boundingBox()).toEqual(before);
  await expect(page.locator(".desktop-stage-background__court")).toHaveCSS("background-size", "cover");
});

test("desktop: atajos, movimiento reducido y cambio de viewport limpian el vuelo", async ({ page, isMobile }) => {
  test.skip(isMobile, "Solo desktop");
  await page.goto("/");
  const app = page.locator(".catalog-app");
  const scene = page.locator(".desktop-stage-background");
  await expect(app).toHaveClass(/cover-ready/);
  await page.getByRole("button", { name: "STARLAB", exact: true }).click();
  await expect(app).toHaveAttribute("data-desktop-logo-flight", "opening");
  await expect(scene).toHaveAttribute("data-logo-state", "wall");
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await page.getByRole("button", { name: "Primera página", exact: true }).click();
  await expect(app).toHaveAttribute("data-desktop-logo-flight", "closing");
  await expect(scene).toHaveAttribute("data-logo-state", "closed");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await expect(scene).toHaveAttribute("data-logo-state", "wall");
  await expect(page.locator(".desktop-logo-flight")).toBeHidden();
  await page.getByRole("button", { name: "Página anterior", exact: true }).click();
  await expect(scene).toHaveAttribute("data-logo-state", "closed");
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(app).toHaveAttribute("data-desktop-logo-flight", "opening");
  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.locator(".desktop-logo-flight")).toBeHidden();
  await expect(app).not.toHaveAttribute("data-desktop-logo-flight");
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(scene).toHaveAttribute("data-logo-state", "wall");
});

test("desktop: contratapa no deja mural residual y reabre sin reiniciar el libro", async ({ page, isMobile }) => {
  test.skip(isMobile, "Solo desktop");
  await page.goto("/");
  const app = page.locator(".catalog-app");
  const scene = page.locator(".desktop-stage-background");
  await expect(app).toHaveClass(/cover-ready/);
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("38");
  await page.locator(".page-picker button").click();
  await expect(app).toHaveAttribute("data-book-transition", "idle");
  await expect(scene).toHaveAttribute("data-logo-state", "wall");
  for (const opening of [false, true]) {
    await page.getByRole("button", { name: opening ? "Página anterior" : "Página siguiente", exact: true }).click();
    await expect(app).toHaveAttribute("data-desktop-logo-cover", "back");
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    expect(await scene.getAttribute("data-logo-state")).toBe(opening ? "wall" : "closed");
    await expect(app).not.toHaveAttribute("data-desktop-logo-flight");
    await expect(page.locator(".desktop-logo-flight__logo")).not.toHaveAttribute("style");
  }
  await expect(page.getByTestId("page-indicator")).toContainText("37–38");
});

test("mobile: comparte el asset mural sin activar capas de vuelo desktop", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Control de mobile");
  const logoRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("starvie-wall-logo")) logoRequests.push(request.url()); });
  await page.goto("/");
  const app = page.locator(".catalog-app");
  await expect(app).toHaveClass(/cover-ready/);
  for (const name of ["Página siguiente", "Página anterior", "Página siguiente"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    await expect(page.locator(".desktop-stage-background")).toBeHidden();
    await expect(page.locator(".desktop-logo-flight")).toBeHidden();
    await expect(app).not.toHaveAttribute("data-desktop-logo-flight");
  }
  await expect(page.locator('.mobile-court-scene--lineup')).toBeVisible();
  expect(logoRequests).toHaveLength(1); // One cached decorative asset shared by portrait leaves.
});
