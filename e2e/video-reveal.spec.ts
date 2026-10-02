import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function enterVideo(page: Page, mobile: boolean) {
  await page.goto("/");
  await page.getByRole("button", { name: "COLECCIÓN 2027", exact: true }).click();
  await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
  if (mobile) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
  await expect.poll(() => page.locator('.catalog-leaf > .video-page video').evaluate(video => !(video as HTMLVideoElement).paused)).toBe(true);
}

async function observeDeparture(page: Page) {
  await page.evaluate(() => {
    const source = document.querySelector<HTMLVideoElement>('.catalog-leaf > .video-page video')!;
    const engine = document.querySelector<HTMLElement>('[data-testid="page-flip-engine"]')!;
    const observations = { source, starts: [] as boolean[][][], playsDuringExit: 0 };
    (window as any).videoDeparture = observations;
    const observer = new MutationObserver(() => {
      if (engine.dataset.flipState !== "flipping" && engine.dataset.flipState !== "user_fold") return;
      if (observations.starts.length) return;
      // El original se conserva incluso si React lo desmontó. Observar el
      // evento del motor verifica el corte antes de esperar el final del flip.
      observations.starts.push([source, ...engine.querySelectorAll<HTMLVideoElement>("video")]
        .map(video => [video.paused, video.muted, video.defaultMuted]));
    });
    observer.observe(engine, { attributes: true, attributeFilter: ["data-flip-state"] });
    engine.addEventListener("play", () => {
      if (engine.dataset.flipState === "flipping" || engine.dataset.flipState === "user_fold") observations.playsDuringExit++;
    }, true);
  });
}

async function expectDeparturePaused(page: Page) {
  const observations = await page.evaluate(() => {
    const { starts, playsDuringExit } = (window as any).videoDeparture;
    return { starts, playsDuringExit };
  });
  expect(observations.starts).toHaveLength(1);
  for (const video of observations.starts[0]) expect(video).toEqual([true, true, true]);
  expect(observations.playsDuringExit).toBe(0);
}

for (const method of ["flecha", "tap"] as const) {
  for (const direction of ["next", "previous"] as const) {
    test(`pausa inmediatamente al salir del video con ${method} (${direction})`, async ({ page }, testInfo) => {
      const mobile = testInfo.project.name.includes("mobile");
      await enterVideo(page, mobile);
      await observeDeparture(page);
      const engine = page.getByTestId("page-flip-engine");
      if (method === "flecha") await page.keyboard.press(direction === "next" ? "ArrowRight" : "ArrowLeft");
      else {
        const button = page.getByRole("button", { name: direction === "next" ? "Página siguiente" : "Página anterior", exact: true });
        if (mobile) await button.tap();
        else await button.click();
      }
      await expect(engine).toHaveAttribute("data-flip-state", "flipping");
      await expectDeparturePaused(page);
      await expect(engine).toHaveAttribute("data-flip-state", "read");
      await expect(page.locator("video")).toHaveCount(0);
      if (direction === "next") {
        // Volver desde la página siguiente conserva la entrada temprana.
        await page.keyboard.press("ArrowLeft");
        await expect(page.locator('.catalog-leaf > .video-page video')).toHaveCount(1);
        await expect(engine).toHaveAttribute("data-flip-state", "flipping");
        await expect(engine).toHaveAttribute("data-flip-state", "read");
        await expect.poll(() => page.locator('.catalog-leaf > .video-page video').evaluate(video => !(video as HTMLVideoElement).paused)).toBe(true);
      }
    });
  }
}

test("pausa durante el drag, recupera el video al cancelar y corta al completar el swipe", async ({ page, context }, testInfo) => {
  const mobile = testInfo.project.name.includes("mobile");
  await enterVideo(page, mobile);
  await observeDeparture(page);
  const engine = page.getByTestId("page-flip-engine");
  const box = (await page.locator('.catalog-leaf[data-book-index="14"]').boundingBox())!;
  const x = box.x + box.width * .9, y = box.y + box.height * .92;
  const cdp = mobile ? await context.newCDPSession(page) : null;
  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    // Superar el umbral nativo de hold permite cancelar un fold real.
    await page.waitForTimeout(300);
  } else { await page.mouse.move(x, y); await page.mouse.down(); }
  for (const travel of [.08, .12, .16]) {
    const toX = x - box.width * travel;
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: toX, y }] });
    else await page.mouse.move(toX, y, { steps: 3 });
  }
  await expect(engine).toHaveAttribute("data-flip-state", "user_fold");
  await expectDeparturePaused(page);
  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else { await page.mouse.move(x, y, { steps: 3 }); await page.mouse.up(); }
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await expect.poll(() => page.evaluate(() => {
    const source = (window as any).videoDeparture.source as HTMLVideoElement;
    return source === document.querySelector('.catalog-leaf > .video-page video') && !source.paused && source.muted && source.autoplay;
  })).toBe(true);
  await observeDeparture(page);
  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width * .1, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(box.x - box.width * .3, y, { steps: 8 });
    await expect(engine).toHaveAttribute("data-flip-state", "user_fold");
    await page.mouse.up();
  }
  await expectDeparturePaused(page);
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await expect(page.locator("video")).toHaveCount(0);
  await cdp?.detach();
});

test("el video sólo reproduce en la superficie revelada por la apertura", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.includes("mobile");
  await page.addInitScript(() => {
    const observations = { maximumVideos: 0, starts: [] as { bridge: boolean; phase: string | undefined; drawn: boolean; coverMoved: boolean }[] };
    (window as any).videoRevealObservations = observations;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const leaf = this.closest<HTMLElement>(".catalog-leaf");
      const cover = document.querySelector<HTMLElement>('.catalog-leaf[data-book-index="0"]');
      observations.starts.push({
        bridge: this.closest('[data-cover-bridge="video"]') != null,
        phase: document.querySelector<HTMLElement>("main.catalog-app")?.dataset.bookTransition,
        drawn: leaf?.style.display === "block",
        coverMoved: !!cover?.style.transform && new DOMMatrixReadOnly(cover.style.transform).m11 < 1,
      });
      return play.call(this);
    };
    new MutationObserver(() => {
      observations.maximumVideos = Math.max(observations.maximumVideos, document.querySelectorAll("video").length);
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  const engine = page.getByTestId("page-flip-engine");
  const source = page.locator('.catalog-leaf > .video-page');
  await expect(page.getByRole("button", { name: "Página siguiente", exact: true })).toBeEnabled();
  await expect(page.locator("video")).toHaveCount(0);
  const cover = page.locator('.catalog-leaf[data-book-index="0"]');
  const box = (await cover.boundingBox())!;
  // Mantener el contacto sin desplazar la tapa no revela el destino.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator("video")).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.press("ArrowRight");
  if (!mobile) {
    const bridge = page.locator('[data-cover-bridge="video"] video');
    await expect(bridge).toHaveCount(1);
    await expect(engine).toHaveAttribute("data-flip-state", "flipping");
    await expect(source.locator("video")).toHaveCount(0);
  }
  await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
  if (mobile) {
    await expect(page.locator("video")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
  }
  await expect(source.locator("video")).toHaveCount(1);
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  const observations = await page.evaluate(() => (window as any).videoRevealObservations);
  expect(observations.maximumVideos).toBe(1);
  const bridgeStarts = observations.starts.filter((start: { bridge: boolean }) => start.bridge);
  if (mobile) expect(bridgeStarts).toHaveLength(0);
  else {
    expect(bridgeStarts.length).toBeGreaterThan(0);
    for (const start of bridgeStarts) expect(start).toEqual({ bridge: true, phase: "initial-cover-open", drawn: true, coverMoved: true });
  }
  const video = source.locator("video");
  expect(await video.evaluate(el => {
    const media = el as HTMLVideoElement;
    return [media.muted, media.autoplay, media.loop, media.playsInline];
  })).toEqual([true, true, true, true]);
  await page.getByRole("button", { name: "STARLAB", exact: true }).click();
  await expect(engine).toHaveAttribute("data-flip-state", "read");
  await expect(page.locator("video")).toHaveCount(0);
});
