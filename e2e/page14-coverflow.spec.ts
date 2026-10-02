import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const sourceCarousel = (page: Page) => page.locator('.catalog-leaf[data-book-index="13"] [data-testid="page14-coverflow"]').first();
async function goToPage(page: Page, number: number) {
  if (number === 14) {
    await page.getByRole("button", { name: "COLECCIÓN 2027", exact: true }).click();
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
    await expect(sourceCarousel(page)).toHaveAttribute("data-presentation", "interactive");
    return;
  }
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill(String(number));
  await page.locator(".page-picker button[type='submit']").click();
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
}
const playing = (page: Page) => sourceCarousel(page).evaluate((root) =>
  Boolean((root.querySelector(".swiper") as HTMLElement & { swiper?: { autoplay: { running: boolean } } } | null)?.swiper?.autoplay.running));

test("el fan conserva los vecinos en ambos sentidos durante drags largos y cambios de dirección", async ({ page, context }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await goToPage(page, 14);
  const slider = sourceCarousel(page).locator(".swiper");
  const mobile = testInfo.project.name.includes("mobile");
  const cdp = mobile ? await context.newCDPSession(page) : null;
  const box = (await slider.boundingBox())!;
  const y = box.y + box.height / 2;
  for (const direction of [-1, 1]) {
    // Mismo origen, incluso al cruzar Eternal/Kyra en el loop.
    await slider.evaluate(el => (el as any).swiper.slideToLoop(0, 0));
    await expect.poll(() => slider.evaluate(el => (el as any).swiper.realIndex)).toBe(0);
    const x = box.x + box.width / 2;
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    else { await page.mouse.move(x, y); await page.mouse.down(); }
    // Ir y volver sin soltar también ejercita el cambio de dirección de loopFix.
    for (const step of [1, 3, 6, 9, 12, 9, 6, 3]) {
      const toX = x + direction * step * box.width * .035;
      if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: toX, y }] });
      else await page.mouse.move(toX, y, { steps: 3 });
      await slider.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      const fan = await slider.evaluate(el => {
        const slides = [...el.querySelectorAll<HTMLElement>(".swiper-slide")].filter(slide => slide.style.visibility === "visible" && Number(slide.style.opacity) > .02);
        const sides = slides.map(slide => Number(slide.style.getPropertyValue("--fan-transform").match(/rotateZ\(([-.\d]+)deg\)/)![1]));
        return { left: sides.filter(angle => angle < -.1).length, right: sides.filter(angle => angle > .1).length, count: slides.length, ids: slides.map(slide => slide.dataset.swiperSlideIndex) };
      });
      expect(fan.left).toBeGreaterThanOrEqual(3);
      expect(fan.right).toBeGreaterThanOrEqual(3);
      expect(fan.count).toBeGreaterThanOrEqual(7);
      expect(new Set(fan.ids).size).toBe(fan.count);
    }
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else await page.mouse.up();
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
    await expect(sourceCarousel(page)).toHaveAttribute("data-presentation", "interactive");
  }
  await cdp?.detach();
});

test("P14 conserva instancia y geometría y las flechas empiezan desde la pose actual", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await page.keyboard.press("ArrowRight");
  const carousel = sourceCarousel(page);
  await expect(carousel).toHaveAttribute("data-presentation", "interactive");
  const slider = carousel.locator(".swiper");
  await carousel.getByRole("button", { name: "Paleta anterior" }).focus();
  await expect.poll(() => playing(page)).toBe(false);
  const startingPose = await slider.evaluate(el => {
    const swiper = (el as any).swiper;
    (window as any).savedP14Swiper = swiper;
    const current = swiper.slides[swiper.activeIndex];
    const pose = () => {
      const box = current.querySelector("img").getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, zIndex: current.style.zIndex };
    };
    document.querySelector('[data-book-index="13"] .page14-coverflow__arrow--prev')!.addEventListener("click", () => {
      queueMicrotask(() => {
        (window as any).firstArrowPose = pose();
      });
    }, { once: true });
    return pose();
  });
  // Previous from the first item also exercises the loop's wrap boundary.
  await carousel.getByRole("button", { name: "Paleta anterior" }).click();
  const firstPose = await page.evaluate(() => (window as any).firstArrowPose);
  expect(firstPose.zIndex).toBe(startingPose.zIndex);
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(firstPose[key]-startingPose[key])).toBeLessThan(1);
  await expect(carousel.locator("h2")).toHaveText("Kyra");
  await expect.poll(() => slider.evaluate(el => !(el as any).swiper.animating)).toBe(true);
  await carousel.getByRole("button", { name: "Paleta anterior" }).focus();
  await expect.poll(() => playing(page)).toBe(false);
  const geometry = await carousel.evaluate(root => {
    const origin = root.getBoundingClientRect();
    const boxes: Record<string, number[]> = {};
    root.querySelectorAll<HTMLImageElement>(".swiper-slide img").forEach(img => {
      if (Number((img.closest(".swiper-slide") as HTMLElement).style.opacity) < .1) return;
      const box = img.getBoundingClientRect();
      boxes[img.alt] = [box.x-origin.x, box.y-origin.y, box.width, box.height];
    });
    const angles = [...root.querySelectorAll<HTMLElement>(".swiper-slide")].filter(slide => Number(slide.style.opacity) > .1)
      .map(slide => Number(slide.style.getPropertyValue("--fan-transform").match(/rotateY\(([-.\d]+)deg\)/)![1]));
    return { boxes, angles: angles.sort((a, b) => a-b), width: origin.width, height: origin.height };
  });
  expect(Object.keys(geometry.boxes)).toHaveLength(7);
  expect(geometry.angles[0]).toBeCloseTo(-60, 0);
  expect(geometry.angles[3]).toBeCloseTo(0, 0);
  expect(geometry.angles[6]).toBeCloseTo(60, 0);
  const layout = await carousel.evaluate(root => {
    const arrows = [...root.querySelectorAll<HTMLElement>(".page14-coverflow__arrow")].map(button => {
      const box = button.getBoundingClientRect();
      const path = button.querySelector("path")!.getBBox();
      return { width: box.width, height: box.height, centerX: path.x+path.width/2, centerY: path.y+path.height/2 };
    });
    const box = root.getBoundingClientRect();
    const product = root.querySelector(".page14-coverflow__product")!.getBoundingClientRect();
    return { arrows, bottomGap: (box.bottom-product.bottom)/box.height };
  });
  expect(layout.arrows[0].width).toBeCloseTo(layout.arrows[0].height, 1);
  expect(layout.arrows[0]).toEqual(layout.arrows[1]);
  expect(layout.arrows[0].centerX).toBe(12);
  expect(layout.arrows[0].centerY).toBe(12);
  expect(layout.bottomGap).toBeGreaterThan(.04);

  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("ArrowLeft");
  const bridge = page.locator('[data-cover-bridge="lineup"] .page14-coverflow');
  await expect(bridge).toHaveAttribute("data-presentation", "snapshot");
  await expect(bridge.locator(".swiper")).toHaveCount(0);
  const staticBoxes = await bridge.evaluate((root, size) => {
    // Measure the same static artwork without the page-turn transform.
    const copy = root.cloneNode(true) as HTMLElement;
    Object.assign(copy.style, { position: "fixed", left: "0", top: "0", width: size.width+"px", height: size.height+"px" });
    document.body.append(copy);
    const boxes: Record<string, number[]> = {};
    copy.querySelectorAll<HTMLImageElement>(".page14-coverflow__snapshot img").forEach(img => {
      const box = img.getBoundingClientRect();
      boxes[img.alt] = [box.x, box.y, box.width, box.height];
    });
    copy.remove();
    return boxes;
  }, { width: geometry.width, height: geometry.height });
  for (const [name, box] of Object.entries(geometry.boxes)) {
    expect(staticBoxes[name]).toBeDefined();
    box.forEach((coordinate, index) => expect(Math.abs(staticBoxes[name][index]-coordinate)).toBeLessThan(1));
  }
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
  expect(await slider.evaluate(el => (el as any).swiper === (window as any).savedP14Swiper && !(el as any).swiper.autoplay.running)).toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect(carousel).toHaveAttribute("data-presentation", "interactive");
  expect(await slider.evaluate(el => (el as any).swiper === (window as any).savedP14Swiper)).toBe(true);
  await expect(carousel.locator("h2")).toHaveText("Kyra");
  await carousel.screenshot({ path: testInfo.outputPath("p14-final.png") });
});

test("P14 muestra siete paletas, conserva el abanico durante los flips y navega al producto", async ({ page, context }, testInfo) => {
  test.setTimeout(70_000);
  const mobile = testInfo.project.name.includes("mobile");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("page-indicator")).toContainText("1 / 39");
  // Observe the entire task, including temporary DOM clones created by StPageFlip.
  await page.evaluate(() => {
    const result = { oldPdf: false, maximumInstances: 0 };
    (window as unknown as { coverflowCheck: typeof result }).coverflowCheck = result;
    const observer = new MutationObserver(() => {
      result.oldPdf ||= !!document.querySelector('img[data-catalog-page="14"]');
      result.maximumInstances = Math.max(result.maximumInstances, [...document.querySelectorAll(".page14-coverflow .swiper")].filter(el =>
        !!(el as HTMLElement & { swiper?: { destroyed: boolean } }).swiper && !(el as HTMLElement & { swiper: { destroyed: boolean } }).swiper.destroyed).length);
    });
    observer.observe(document.querySelector('[data-testid="page-flip-engine"]')!, { childList: true, subtree: true, attributes: true });
  });
  await page.keyboard.press("ArrowRight");
  const bridge = page.locator('[data-cover-bridge="lineup"] [data-testid="page14-coverflow"]');
  await expect(bridge).toHaveAttribute("data-presentation", "snapshot");
  await expect(bridge.locator(".swiper")).toHaveCount(0);
  await expect(bridge.locator(".page14-coverflow__snapshot img")).toHaveCount(7);
  const carousel = sourceCarousel(page);
  await expect(carousel).toHaveAttribute("data-presentation", "interactive");
  await expect(page.getByTestId("page-indicator")).toHaveText(mobile ? "14 / 39" : "14 · VIDEO / 39");
  // Hold the carousel stable for geometry and explicit navigation checks.
  await carousel.getByRole("button", { name: "Paleta siguiente" }).focus();
  await expect.poll(() => playing(page)).toBe(false);
  await expect(carousel.locator(".page14-coverflow__slide")).toHaveCount(12);
  await expect.poll(() => carousel.locator(".page14-coverflow__slide").evaluateAll(slides =>
    slides.filter(slide => Number((slide as HTMLElement).style.opacity) > .1).length)).toBe(7);
  await expect.poll(() => carousel.locator(".swiper-slide-active img").evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await carousel.screenshot({ path: testInfo.outputPath(mobile ? "page14-mobile.png" : "page14-desktop.png") });

  const slider = carousel.locator(".swiper");
  const box = await slider.boundingBox();
  expect(box).not.toBeNull();
  const y = box!.y + box!.height * .5;
  const startX = box!.x + box!.width * .7;
  const endX = box!.x + box!.width * .4;
  const before = await carousel.locator("h2").textContent();
  if (mobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
    for (let step = 1; step <= 8; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX + (endX-startX)*step/8, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(endX, y, { steps: 10 });
    await page.mouse.up();
  }
  await expect(carousel.locator("h2")).not.toHaveText(before);
  await expect(page.getByTestId("page-indicator")).toContainText("14");
  await expect.poll(() => slider.evaluate(el => !(el as HTMLElement & { swiper: { animating: boolean } }).swiper.animating)).toBe(true);
  await page.mouse.move(0, 0);
  await carousel.getByRole("button", { name: "Paleta siguiente" }).focus();
  // Check real catalog page mapping for every item, including the inserted VIDEO.
  const products = (await (await page.request.get("/products.json")).json()).products.filter((p: { categoria: string; pagina: number }) => p.categoria.toLowerCase() === "palas" && p.pagina >= 15 && p.pagina <= 26).sort((a: { pagina: number }, b: { pagina: number }) => a.pagina-b.pagina);
  for (const product of products) {
    await slider.evaluate((el, index) => new Promise<void>(resolve => {
      (el as HTMLElement & { swiper: { slideToLoop: (index: number, speed: number) => void } }).swiper.slideToLoop(index, 0);
      // slideToLoop schedules its final position on the next frame, after its
      // temporary loopFix indices. Wait for that position and React's label.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }), products.indexOf(product));
    await expect(carousel.locator("h2")).toHaveText(product.nombre);
    await carousel.getByRole("button", { name: /VER PRODUCTO/ }).click();
    const left = product.pagina % 2 ? product.pagina : product.pagina - 1;
    await expect(page.getByTestId("page-indicator")).toHaveText(mobile ? product.pagina + " / 39" : left + "–" + (left+1) + " / 39");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => playing(page)).toBe(false);
    await goToPage(page, 14);
    await expect(carousel).toHaveAttribute("data-presentation", "interactive");
    await carousel.getByRole("button", { name: "Paleta siguiente" }).focus();
  }

  // Exit P14 through the book's margin, not through the interactive surface.
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  const pageBox = await carousel.boundingBox();
  const edgeY = pageBox!.y + pageBox!.height * .025;
  const fromX = pageBox!.x + pageBox!.width * .15;
  const toX = pageBox!.x + pageBox!.width * .65;
  if (mobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y: edgeY }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: toX, y: edgeY }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(fromX, edgeY); await page.mouse.down();
    await page.mouse.move(toX, edgeY, { steps: 8 }); await page.mouse.up();
  }
  await expect(bridge).toHaveAttribute("data-presentation", "snapshot");
  await expect(bridge.locator("h2")).toHaveText("Kyra");
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 39");
  await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
  await expect.poll(() => playing(page)).toBe(false);
  await page.keyboard.press("ArrowRight");
  await expect(carousel).toHaveAttribute("data-presentation", "interactive");
  await expect(carousel.locator("h2")).toHaveText("Kyra");
  expect(await page.evaluate(() => (window as unknown as { coverflowCheck: object }).coverflowCheck)).toEqual({ oldPdf: false, maximumInstances: 1 });
  expect(errors).toEqual([]);
});

test("las flechas del teclado controlan el carrusel y el foco pausa y reanuda autoplay", async ({ page }, testInfo) => {
  await page.goto("/");
  await goToPage(page, 14);
  const carousel = sourceCarousel(page);
  await expect(carousel).toHaveAttribute("data-presentation", "interactive");
  await carousel.getByRole("button", { name: "Paleta siguiente" }).focus();
  await expect.poll(() => playing(page)).toBe(false);
  await page.keyboard.press("ArrowRight");
  await expect(carousel.locator("h2")).toHaveText("Triton T-One");
  await expect(page.getByTestId("page-indicator")).toHaveText(testInfo.project.name.includes("mobile") ? "14 / 39" : "14 · VIDEO / 39");
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await expect.poll(() => playing(page)).toBe(true);
});

test("autoplay arranca solo cada 1500 ms y conserva las pausas en la instancia persistente", async ({ page, context }, testInfo) => {
  await page.goto("/");
  const carousel = sourceCarousel(page);
  await expect(carousel.locator(".swiper")).toHaveCount(0);
  await goToPage(page, 14);
  await expect(carousel).toHaveAttribute("data-presentation", "interactive");
  await expect.poll(() => playing(page)).toBe(true);
  await expect(carousel.locator("h2")).not.toHaveText("Eternal", { timeout: 3500 });
  expect(await carousel.locator(".swiper").evaluate(el => (el as HTMLElement & { swiper: { params: { autoplay: { delay: number } } } }).swiper.params.autoplay.delay)).toBe(1500);
  if (!testInfo.project.name.includes("mobile")) {
    await carousel.locator(".page14-coverflow__interactive").hover();
    await expect.poll(() => playing(page)).toBe(false);
    const name = await carousel.locator("h2").textContent();
    await page.waitForTimeout(2200);
    await expect(carousel.locator("h2")).toHaveText(name);
    await page.mouse.move(0, 0);
    await expect.poll(() => playing(page)).toBe(true);
  } else {
    const cdp = await context.newCDPSession(page);
    const box = await carousel.locator(".swiper").boundingBox();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box!.x+box!.width/2, y: box!.y+box!.height/2 }] });
    await expect.poll(() => playing(page)).toBe(false);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => playing(page)).toBe(true);
    await cdp.detach();
  }
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => playing(page)).toBe(false);
  await page.evaluate(() => { Reflect.deleteProperty(document, "hidden"); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => playing(page)).toBe(true);
  await page.getByRole("button", { name: "Abrir pedido" }).click();
  await expect.poll(() => playing(page)).toBe(false);
  await page.getByRole("button", { name: "Cerrar pedido" }).click();
  await expect.poll(() => playing(page)).toBe(true);
  await goToPage(page, 17);
  await expect.poll(() => playing(page)).toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await goToPage(page, 14);
  await expect(carousel).toHaveAttribute("data-presentation", "interactive");
  await expect.poll(() => playing(page)).toBe(false);
  const name = await carousel.locator("h2").textContent();
  await page.waitForTimeout(2200);
  await expect(carousel.locator("h2")).toHaveText(name);
});
