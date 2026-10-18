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
    type Sample = { kind: string; at: number; id: number; original: boolean; state: string; inExit: boolean;
      paused: boolean; currentTime: number; baseline: number | null; pausedAt: number | null; readyState: number; muted: boolean;
      defaultMuted: boolean; autoplay: boolean; totalVideoFrames: number; droppedVideoFrames: number;
      eventTimeStamp?: number; mediaTime?: number; presentedFrames?: number; presentationTime?: number; expectedDisplayTime?: number };
    const observations = { source, starts: [] as boolean[][][], receivedPlayEvents: 0, playsDuringExit: 0,
      unpausedSamples: 0, advancingSamples: 0, advancingPresentedFrames: 0, frameChecks: 0,
      completed: false, samples: [] as Sample[] };
    let started = false, stopped = false, frame = 0;
    const baselines = new Map<HTMLVideoElement, number>();
    const pauseBoundaries = new Map<HTMLVideoElement, number>();
    const tracked = new Map<HTMLVideoElement, { id: number; callback: number; cleanup: () => void }>();
    const turning = () => engine.dataset.flipState === "flipping" || engine.dataset.flipState === "user_fold";
    const begin = () => {
      started = true;
      for (const video of tracked.keys()) baselines.set(video, video.currentTime);
      // Preserve the original immediate pause/mute assertion, including clones.
      observations.starts.push([source, ...engine.querySelectorAll<HTMLVideoElement>("video")]
        .map(video => [video.paused, video.muted, video.defaultMuted]));
    };
    const record = (video: HTMLVideoElement, kind: string, extra: Partial<Sample> = {}) => {
      if (stopped) return;
      if (!started && turning()) begin();
      const quality = video.getVideoPlaybackQuality();
      const sample: Sample = { kind, at: performance.now(), id: tracked.get(video)!.id, original: video === source,
        state: engine.dataset.flipState!, inExit: started && turning(), paused: video.paused,
        currentTime: video.currentTime, baseline: baselines.get(video) ?? null, pausedAt: pauseBoundaries.get(video) ?? null, readyState: video.readyState,
        muted: video.muted, defaultMuted: video.defaultMuted, autoplay: video.autoplay,
        totalVideoFrames: quality.totalVideoFrames, droppedVideoFrames: quality.droppedVideoFrames, ...extra };
      observations.samples.push(sample);
      if (!sample.inExit) return;
      if (kind === "play") {
        // A queued notification can arrive after pause(). Keep its raw count,
        // but do not confuse it with a video that is actually unpaused.
        observations.receivedPlayEvents++;
        if (!sample.paused) observations.playsDuringExit++;
      }
      if (!sample.paused) observations.unpausedSamples++;
      if (sample.currentTime > sample.baseline!) observations.advancingSamples++;
      // mediaTime is a frame timestamp, not the playback clock. A callback can
      // deliver a frame submitted before pause(); classify by submission time,
      // never by callback delivery time. Missing pause evidence fails closed.
      if (sample.mediaTime !== undefined && sample.mediaTime > sample.baseline! &&
        (sample.pausedAt === null || sample.presentationTime! >= sample.pausedAt)) observations.advancingPresentedFrames++;
      if (kind === "raf") observations.frameChecks++;
    };
    const track = (video: HTMLVideoElement) => {
      if (tracked.has(video)) return;
      const entry = { id: tracked.size + 1, callback: 0, cleanup: () => {} };
      tracked.set(video, entry);
      if (video.paused) pauseBoundaries.set(video, performance.now());
      if (started) baselines.set(video, video.currentTime);
      const listener = (event: Event) => record(video, event.type, { eventTimeStamp: event.timeStamp });
      const events = ["play", "playing", "pause", "timeupdate", "canplay"];
      events.forEach(event => video.addEventListener(event, listener));
      const play = video.play, pause = video.pause;
      const wrappedPlay = () => { record(video, "play-call-before"); const result = play.call(video); record(video, "play-call-after"); return result; };
      const wrappedPause = () => {
        record(video, "pause-call-before");
        const wasPlaying = !video.paused, calledAt = performance.now();
        pause.call(video);
        // Repeated pause() calls must not move the boundary forward and hide
        // a frame submitted after the original pause.
        if (wasPlaying && video.paused) pauseBoundaries.set(video, calledAt);
        record(video, "pause-call-after");
      };
      video.play = wrappedPlay;
      video.pause = wrappedPause;
      const presented: VideoFrameRequestCallback = (_now, metadata) => {
        record(video, "presented", { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames,
          presentationTime: metadata.presentationTime, expectedDisplayTime: metadata.expectedDisplayTime });
        if (!stopped) entry.callback = video.requestVideoFrameCallback(presented);
      };
      entry.callback = video.requestVideoFrameCallback(presented);
      entry.cleanup = () => {
        events.forEach(event => video.removeEventListener(event, listener));
        video.cancelVideoFrameCallback(entry.callback);
        if (video.play === wrappedPlay) video.play = play;
        if (video.pause === wrappedPause) video.pause = pause;
      };
      record(video, "tracked");
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      tracked.forEach(entry => entry.cleanup());
    };
    const update = () => {
      if (started && engine.dataset.flipState === "read") {
        observations.completed = true;
        stop(); // Returning/drag cancellation may legitimately resume playback.
        return;
      }
      [source, ...engine.querySelectorAll<HTMLVideoElement>("video")].forEach(track);
      if (turning()) for (const video of tracked.keys()) record(video, "state");
    };
    const observer = new MutationObserver(update);
    observer.observe(engine, { attributes: true, attributeFilter: ["data-flip-state"], childList: true, subtree: true });
    update();
    const sampleFrame = () => {
      if (stopped) return;
      update();
      if (stopped) return;
      if (turning()) for (const video of tracked.keys()) record(video, "raf");
      frame = requestAnimationFrame(sampleFrame);
    };
    frame = requestAnimationFrame(sampleFrame);
    const dump = () => {
      const { source: _source, ...audit } = observations;
      return audit;
    };
    (window as any).videoDeparture = { ...observations, source, dump, stop };
    ((window as any).videoDepartureAudits ??= []).push({ dump, stop });
  });
}

async function expectDeparturePaused(page: Page, completed = false) {
  const observations = await page.evaluate(() => (window as any).videoDeparture.dump());
  expect(observations.starts).toHaveLength(1);
  for (const video of observations.starts[0]) expect(video).toEqual([true, true, true]);
  expect(observations.playsDuringExit).toBe(0);
  expect(observations.unpausedSamples).toBe(0);
  expect(observations.advancingSamples).toBe(0);
  expect(observations.advancingPresentedFrames).toBe(0);
  if (completed) {
    expect(observations.completed).toBe(true);
    expect(observations.frameChecks).toBeGreaterThan(0);
  }
}

test.afterEach(async ({ page }, testInfo) => {
  const audits = await page.evaluate(() => ((window as any).videoDepartureAudits ?? []).map((probe: any) => {
    probe.stop(); return probe.dump();
  }));
  if (audits.length) await testInfo.attach("video-departure-audits", { body: JSON.stringify(audits), contentType: "application/json" });
});

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
      await expectDeparturePaused(page, true);
      await expect(page.locator("video")).toHaveCount(0);
      if (direction === "next") {
        // Volver desde la página siguiente conserva la entrada temprana.
        const returnProbe = await page.evaluateHandle(() => {
          const host = document.querySelector<HTMLElement>('[data-testid="page-flip-engine"]')!;
          const samples: { at: number; state: string; videos: number }[] = [];
          const record = () => samples.push({ at: performance.now(), state: host.dataset.flipState!,
            videos: host.querySelectorAll('.catalog-leaf > .video-page video').length });
          const observer = new MutationObserver(record);
          observer.observe(host, { attributes: true, attributeFilter: ["data-flip-state"], childList: true, subtree: true });
          record();
          return { history: () => samples, disconnect: () => observer.disconnect() };
        });
        try {
          await page.keyboard.press("ArrowLeft");
          await expect(page.locator('.catalog-leaf > .video-page video')).toHaveCount(1);
          await expect.poll(() => returnProbe.evaluate(probe => probe.history().some(sample =>
            sample.state === "flipping" && sample.videos === 1,
          ))).toBe(true);
        } finally {
          await returnProbe.evaluate(probe => probe.disconnect());
          await testInfo.attach("retorno-video", {
            body: JSON.stringify(await returnProbe.evaluate(probe => probe.history())), contentType: "application/json",
          });
          await returnProbe.dispose();
        }
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
  await expectDeparturePaused(page, true);
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
  await expectDeparturePaused(page, true);
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
