import { expect, test } from "@playwright/test";

test("contratapa mantiene las sombras y ambas caras en el mismo plano físico", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("38");
  await page.locator(".page-picker button").click();
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  const monitor = await page.evaluateHandle(() => {
    const gaps: number[] = [];
    let running = true;
    const sample = () => {
      const root = document.querySelector<HTMLElement>(".back-cover-physics")!;
      const leaf = root.querySelector<HTMLElement>('.back-cover-physics-leaf.--hard:not(.--simple)');
      const shadow = root.querySelector<HTMLElement>(".stf__hardShadow");
      if (leaf && shadow && /^(closing|opening)$/.test(document.querySelector<HTMLElement>("main")!.dataset.backCoverState!) && Number.isFinite(parseFloat(getComputedStyle(leaf).top)) && getComputedStyle(shadow).display !== "none") {
        gaps.push(Math.abs(parseFloat(getComputedStyle(leaf).top) - (parseFloat(getComputedStyle(shadow).top) || 0)));
      }
      if (running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return { stop: () => { running = false; return gaps; } };
  });
  for (let round = 0; round < 2; round++) {
    await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "closed");
    await page.getByRole("button", { name: "Página anterior", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "open");
  }
  const gaps = await monitor.evaluate(object => object.stop());
  expect(gaps.length).toBeGreaterThan(10);
  expect(Math.max(...gaps)).toBeLessThan(1);
});

test("la página de accesorios gira como cara interior de la contratapa desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "La composición mobile conserva su configuración actual");
  await page.goto("/");
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("38");
  await page.locator(".page-picker button").click();
  const innerImage = page.locator('.back-cover-physics-leaf[data-rear-bridge-page="right"] img');
  const originalPage = page.locator('.catalog-leaf[data-rear-source]');
  for (let round = 0; round < 2; round++) {
    await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "closing");
    await expect(innerImage).toHaveCSS("opacity", "1");
    await expect(originalPage).toHaveCSS("opacity", "0");
    await page.waitForFunction(() => {
      const leaf = document.querySelector<HTMLElement>('.back-cover-physics-leaf[data-rear-bridge-page="right"]');
      if (!leaf) return false;
      const angle = new DOMMatrix(getComputedStyle(leaf).transform).m11;
      return Math.abs(angle) > 0.2 && Math.abs(angle) < 0.85;
    });
    await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "closed");
    await page.getByRole("button", { name: "Página anterior", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "open");
    await expect(originalPage).toHaveCSS("opacity", "1");
  }
});

test("menú 23 → 31 → 23 y extremos usan índices físicos sincronizados", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.includes("mobile");
  await page.goto("/");
  const indicator = page.getByTestId("page-indicator");
  for (const number of [23, 31, 23]) {
    await page.getByRole("button", { name: "Abrir miniaturas", exact: true }).click();
    await page.getByRole("button", { name: `Ir a página ${number}`, exact: true }).click();
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "flipping");
    await expect(indicator).toHaveText(mobile ? `${number} / 39` : `${number}–${number + 1} / 39`);
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  }
  const first = page.getByRole("button", { name: "Primera página", exact: true });
  const last = page.getByRole("button", { name: "Última página", exact: true });
  await expect(first).toBeVisible();
  await expect(last).toBeVisible();
  for (let round = 0; round < 2; round++) {
    await last.click();
    await expect(indicator).toHaveText("CONTRATAPA / 39");
    await expect(last).toBeDisabled();
    await first.click();
    await expect(indicator).toHaveText("1 / 39");
    await expect(first).toBeDisabled();
  }
  await last.click();
  await expect(indicator).toHaveText("CONTRATAPA / 39");
  await page.getByRole("button", { name: "Página anterior", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-back-cover-state", "opening");
  await expect(indicator).toHaveText(mobile ? "38 / 39" : "37–38 / 39");
  await expect(page.locator("main")).toHaveAttribute("data-book-transition", "idle");
  await page.getByRole("button", { name: "Abrir miniaturas", exact: true }).click();
  await page.getByRole("button", { name: "Ir a página 23", exact: true }).click();
  await expect(indicator).toHaveText(mobile ? "23 / 39" : "23–24 / 39");
});

test("VER PRODUCTO de P14 conserva el giro físico hasta la ficha real", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("14");
  await page.locator(".page-picker button").click();
  const carousel = page.locator(".page14-coverflow__interactive");
  await expect(page.locator('.catalog-leaf[data-book-index="13"] [data-testid="page14-coverflow"]')).toHaveAttribute("data-presentation", "interactive");
  await carousel.getByRole("button", { name: /VER PRODUCTO/ }).click();
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "flipping");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await expect(page.getByTestId("page-indicator")).not.toContainText("14 / 39");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("portada mobile conserva su marco y centrado al abrir y cerrar", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Geometría portrait");
  await page.goto("/");
  const engine = page.getByTestId("page-flip-engine");
  await expect(page.locator("main")).toHaveClass(/cover-ready/);
  const initial = (await engine.boundingBox())!;
  const cover = (await page.locator('.catalog-leaf[data-book-index="0"]').boundingBox())!;
  const monitor = await page.evaluateHandle(() => {
    let running = true;
    const boxes: number[][] = [];
    const coverAngles: number[] = [];
    const hinges: number[] = [];
    const sample = () => {
      const b = document.querySelector(".page-flip-host")!.getBoundingClientRect();
      boxes.push([b.x, b.y, b.width, b.height]);
      const faces = [...document.querySelectorAll<HTMLElement>('.catalog-leaf.--hard:not(.--simple)')]
        .filter(el => getComputedStyle(el).display !== "none");
      if (faces.length === 2) {
        const positions = faces.map(el => {
          const css = getComputedStyle(el), m = new DOMMatrix(css.transform);
          coverAngles.push(m.m11);
          return parseFloat(css.transformOrigin) + m.m41 + (parseFloat(css.translate) || 0);
        });
        hinges.push(Math.abs(positions[0] - positions[1]));
      }
      if (running) requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
    return { stop: () => { running = false; return { boxes, coverAngles, hinges }; } };
  });
  for (let round = 0; round < 2; round++) {
    await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("14 / 39");
    await expect(page.locator("main")).toHaveAttribute("data-book-transition", "idle");
    const inside = (await page.locator('.catalog-leaf[data-book-index="13"]').boundingBox())!;
    expect(Math.abs(inside.y - cover.y)).toBeLessThan(1);
    expect(Math.abs(inside.x - cover.x)).toBeLessThan(1);
    await page.getByRole("button", { name: "Página anterior", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
    await expect(page.locator("main")).toHaveAttribute("data-book-transition", "idle");
  }
  const { boxes, coverAngles, hinges } = await monitor.evaluate(object => object.stop());
  for (const b of boxes) b.forEach((v, i) => expect(Math.abs(v - [initial.x, initial.y, initial.width, initial.height][i])).toBeLessThan(1));
  expect(coverAngles.length).toBeGreaterThan(10);
  expect(Math.max(...coverAngles) - Math.min(...coverAngles)).toBeGreaterThan(1);
  expect(Math.max(...hinges)).toBeLessThan(1);
});

test("swipe desde el centro y espacio del visor conduce un fold en ambos sentidos", async ({ page, context, isMobile }) => {
  test.skip(!isMobile, "Gestos táctiles portrait");
  await page.goto("/");
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("17");
  await page.locator(".page-picker button").click();
  const indicator = page.getByTestId("page-indicator");
  const engine = page.getByTestId("page-flip-engine");
  const box = (await engine.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  for (const y of [box.y + box.height / 2, box.y - 35]) {
    for (const direction of ["next", "previous"]) {
      const x = box.x + box.width / 2;
      const sign = direction === "next" ? -1 : 1;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (const travel of [.08, .15, .28]) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + sign * box.width * travel, y }] });
        await expect(engine).toHaveAttribute("data-flip-state", "user_fold");
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(engine).toHaveAttribute("data-flip-state", "read");
      await expect(indicator).toHaveText(direction === "next" ? "18 / 39" : "17 / 39");
    }
  }
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 4, y: y - 80 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(indicator).toHaveText("17 / 39");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const [name, number] of [["Página anterior", 16], ["Página siguiente", 17]] as const) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(engine).toHaveAttribute("data-flip-state", "flipping");
    await expect(engine).toHaveAttribute("data-flip-state", "read");
    await expect(indicator).toHaveText(`${number} / 39`);
  }
  await cdp.detach();
});
