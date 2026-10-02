import { expect, test } from "@playwright/test";
import variants from "../src/data/productImageVariants.json" with { type: "json" };

test("contratapa conserva caras orientadas, bisagra y estado en cierres rápidos", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("38");
  await page.locator(".page-picker button").click();
  const app = page.locator("main.catalog-app");
  const indicator = page.getByTestId("page-indicator");
  await expect(indicator).toContainText(testInfo.project.name.includes("mobile") ? "38 / 39" : "37–38 / 39");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  const monitor = await page.evaluateHandle(() => {
    const samples: Array<{ state: string; count: number; mirrored: boolean; wrongBackface: boolean; hingeGap: number }> = [];
    let running = true;
    const read = () => {
      const state = (document.querySelector("main") as HTMLElement).dataset.backCoverState!;
      if (state === "closing" || state === "opening") {
        const leaves = [...document.querySelectorAll<HTMLElement>('.back-cover-physics-leaf:not([data-rear-bridge-page="left"])')];
        const faces = leaves.filter(el => {
          const css = getComputedStyle(el);
          return css.display !== "none" && css.visibility === "visible" && Number(css.opacity) > 0;
        });
        const matrices = faces.map(el => new DOMMatrix(getComputedStyle(el).transform));
        const painted = matrices.filter(matrix => matrix.m11 > 0.001);
        const hinges = faces.map((el, i) => {
          const css = getComputedStyle(el);
          const origin = parseFloat(css.transformOrigin);
          const translate = parseFloat(css.translate) || 0;
          return origin + matrices[i].m41 + translate;
        });
        samples.push({ state, count: painted.length,
          mirrored: faces.some((el, i) => matrices[i].m11 < -0.001 && getComputedStyle(el).backfaceVisibility !== "hidden"),
          wrongBackface: faces.some(el => getComputedStyle(el).backfaceVisibility !== "hidden"),
          hingeGap: hinges.length === 2 ? Math.abs(hinges[0] - hinges[1]) : 0 });
      }
      if (running) requestAnimationFrame(read);
    }; requestAnimationFrame(read);
    return { stop: () => { running = false; return samples; } };
  });
  for (let round = 0; round < 3; round++) {
    if (round === 0) await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    else await page.keyboard.press("ArrowRight");
    await expect(app).toHaveAttribute("data-back-cover-state", "closing");
    await page.keyboard.press("ArrowLeft"); // Opposite request must not queue another turn.
    await expect(app).toHaveAttribute("data-back-cover-state", "closed");
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    await expect(indicator).toContainText("CONTRATAPA / 39");
    if (round === 0) await page.screenshot({ path: testInfo.outputPath("rear-closed.png") });
    if (round === 0) await page.keyboard.press("ArrowLeft");
    else await page.getByRole("button", { name: "Página anterior", exact: true }).click();
    await expect(app).toHaveAttribute("data-back-cover-state", "opening");
    await page.keyboard.press("ArrowRight");
    await expect(app).toHaveAttribute("data-back-cover-state", "open");
    await expect(app).toHaveAttribute("data-book-transition", "idle");
  }
  const samples = await monitor.evaluate(object => object.stop());
  expect(samples.filter(sample => sample.state === "closing").length).toBeGreaterThan(10);
  expect(samples.filter(sample => sample.state === "opening").length).toBeGreaterThan(10);
  expect(samples.every(sample => !sample.mirrored && !sample.wrongBackface && sample.count <= 1)).toBe(true);
  expect(Math.max(...samples.map(sample => sample.hingeGap))).toBeLessThan(1);
  await expect(indicator).toContainText(testInfo.project.name.includes("mobile") ? "38 / 39" : "37–38 / 39");
});

test("galería mantiene imagen decodificada, fade corto y no pide originales", async ({ page }, testInfo) => {
  const originals: string[] = [];
  page.on("request", request => { if (request.url().includes("/products/palas/")) originals.push(request.url()); });
  await page.goto("/");
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill("15");
  await page.locator(".page-picker button").click();
  await expect(page.getByTestId("page-indicator")).toContainText("15");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await page.locator('.catalog-leaf[data-book-index="15"] [data-product-id="eternal"]').first().click();
  const viewport = page.locator(".product-image-viewport");
  const main = viewport.locator('img:not([aria-hidden="true"])');
  await expect.poll(() => main.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(page.locator(".product-modal")).toHaveCSS("transform", "none");
  const oldImage = await main.elementHandle();
  const layout = await page.evaluateHandle(() => {
    const selectors = [".product-visual", ".product-image-viewport", ".product-details", ".gallery-thumbs"];
    const read = () => selectors.map(selector => {
      const b = document.querySelector(selector)?.getBoundingClientRect();
      return b ? [b.x, b.y, b.width, b.height] : [];
    });
    const initial = read();
    const shifts: number[] = [];
    let running = true;
    const sample = () => {
      read().forEach((box, i) => box.forEach((value, j) => shifts.push(Math.abs(value - initial[i][j]))));
      if (running) requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
    return { stop: () => { running = false; return shifts; } };
  });
  const delayed = variants.images["products/palas/ETERNAL/ETERNAL1.3.webp"];
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const requestSeen = new Promise<void>(resolve => { requested = resolve; });
  await page.route(/catalog\/product-images\/.*-(768|1280)\.webp/, async route => {
    const url = route.request().url();
    if ([delayed.standard.src, delayed.large.src].some(src => url.endsWith(src))) { requested(); await wait; }
    await route.continue();
  });
  await page.getByRole("button", { name: "Ver imagen 2", exact: true }).click();
  await requestSeen;
  await expect(main).toHaveClass(/is-pending/);
  expect(await oldImage!.evaluate(el => el.isConnected && getComputedStyle(el).opacity === "1")).toBe(true);
  await expect(viewport.locator("img")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("gallery-waits-with-image.png") });
  await page.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>('.product-gallery-image.is-pending')!;
    image.addEventListener("load", () => {
      void image.decode().then(() => {
        const ready = performance.now();
        const record = () => {
          if (image.classList.contains("is-pending")) return;
          const result = { delay: performance.now() - ready, animation: getComputedStyle(image).animationDuration, pending: image.classList.contains("is-pending") };
          (image as HTMLImageElement & { audit?: typeof result }).audit = result;
          observer.disconnect();
        };
        // React can commit just before or just after the next rAF. Measure
        // the actual visual handoff, without assuming its scheduling phase.
        const observer = new MutationObserver(record);
        observer.observe(image, { attributes: true, attributeFilter: ["class"] });
        record();
      });
    }, { once: true });
  });
  release();
  await expect(main).not.toHaveClass(/is-pending/);
  await expect.poll(() => main.evaluate(el => (el as HTMLImageElement & { audit?: unknown }).audit != null)).toBe(true);
  const audit = await main.evaluate(el => (el as HTMLImageElement & { audit: { delay: number; animation: string; pending: boolean } }).audit);
  console.log(`GALLERY ${testInfo.project.name}`, audit);
  expect(audit.delay).toBeLessThan(120);
  expect(audit.animation).toBe("0.16s");
  expect(audit.pending).toBe(false);
  await expect(viewport.locator("img")).toHaveCount(1);
  for (const index of [3, 4, 2, 1, 5, 1]) {
    await page.getByRole("button", { name: `Ver imagen ${index}`, exact: true }).click();
    await expect(main).not.toHaveClass(/is-pending/);
    await expect(viewport.locator("img")).toHaveCount(1);
  }
  expect(originals).toEqual([]);
  const shifts = await layout.evaluate(object => object.stop());
  expect(Math.max(...shifts)).toBeLessThan(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Ver imagen 2", exact: true }).click();
  await expect(main).not.toHaveClass(/is-pending|is-entering/);
  await expect(main).toHaveCSS("animation-name", "none");
  await expect(viewport.locator("img")).toHaveCount(1);
});
