import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`contratapa revela el bloque una vez y lo oculta durante el giro (${reducedMotion})`, async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    await page.getByTestId("page-indicator").click();
    await page.locator("#page-number").fill("38");
    await page.locator(".page-picker button").click();
    const app = page.locator("main.catalog-app");
    await expect(page.getByTestId("page-indicator")).toHaveText(isMobile ? "38 / 39" : "37–38 / 39");
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    const monitor = await page.evaluateHandle(() => {
      const samples: Array<{ cycle: number; state: string; opacity: number[]; animation: string[] }> = [];
      let running = true;
      let cycle = 0;
      const read = () => {
        const styles = [...document.querySelectorAll<HTMLElement>(".back-cover-logo-overlay, .back-cover-live > *")].map(el => getComputedStyle(el));
        samples.push({ cycle, state: document.querySelector<HTMLElement>("main")!.dataset.backCoverState!,
          opacity: styles.map(css => Number(css.opacity)), animation: styles.map(css => css.animationName) });
        if (running) requestAnimationFrame(read);
      };
      requestAnimationFrame(read);
      return { setCycle: (value: number) => { cycle = value; }, stop: () => { running = false; return samples; } };
    });
    for (let cycle = 1; cycle <= 3; cycle++) {
      await monitor.evaluate((m, value) => m.setCycle(value), cycle);
      await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
      await expect(app).toHaveAttribute("data-back-cover-state", "closed");
      await expect(app).toHaveAttribute("data-book-transition", "idle");
      // The second opening interrupts the editorial entrance; neither that
      // animation nor the reduced-motion fallback may reappear during opening.
      if (cycle === 2) await page.waitForTimeout(25);
      else {
        await expect(page.getByTestId("back-cover-credit")).toHaveCSS("opacity", "1");
        await page.waitForTimeout(100);
        for (const selector of [".back-cover-logo-overlay", ".back-cover-live strong", ".back-cover-collab", ".back-cover-license", ".back-cover-live small"]) {
          await expect(page.locator(selector)).toHaveCount(1);
        }
      }
      await page.getByRole("button", { name: "Página anterior", exact: true }).click();
      await expect(app).toHaveAttribute("data-back-cover-state", "open");
      await expect(app).toHaveAttribute("data-book-transition", "idle");
      await page.waitForTimeout(100);
    }
    const samples = await monitor.evaluate(m => m.stop());
    for (const state of ["closing", "opening"]) {
      const moving = samples.filter(s => s.state === state);
      expect(moving.length).toBeGreaterThan(0);
      expect(moving.every(s => s.opacity.every(opacity => opacity === 0))).toBe(true);
    }
    expect(samples.filter(s => s.state === "open").every(s => s.opacity.every(opacity => opacity === 0))).toBe(true);
    for (let cycle = 1; cycle <= 3; cycle++) {
      const closed = samples.filter(s => s.cycle === cycle && s.state === "closed");
      expect(closed.length).toBeGreaterThan(0);
      const count = closed[0].opacity.length;
      for (let index = 0; index < count; index++) {
        let previous = 0;
        let reveals = 0;
        for (const sample of closed) {
          const opacity = sample.opacity[index];
          expect(opacity + 0.000001).toBeGreaterThanOrEqual(previous);
          if (previous <= 0.001 && opacity > 0.001) reveals++;
          previous = opacity;
          if (reducedMotion === "reduce") {
            expect(opacity).toBe(1);
            expect(sample.animation[index]).toBe("none");
          }
        }
        expect(reveals).toBeLessThanOrEqual(1);
        if (cycle !== 2) { expect(reveals).toBe(1); expect(previous).toBe(1); }
      }
    }
  });
}

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
