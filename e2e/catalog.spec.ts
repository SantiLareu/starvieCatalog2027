import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

test.describe("Catálogo StarVie 2027", () => {
  test("abre, navega y conserva el spread al cerrar el producto", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "El flujo de doble página corresponde a desktop");
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");

    const cover = page.getByRole("img", { name: "Página 1 del catálogo StarVie 2027", exact: true }).first();
    await expect(cover).toBeVisible();
    await expect.poll(() => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByTestId("page-indicator")).toContainText("1 / 39");
    const coverTitle = page.locator(".cover-title-overlay");
    await expect(coverTitle).toBeVisible();
    await expect.poll(() => coverTitle.evaluate((title) => getComputedStyle(title).opacity)).toBe("1");

    const coverLeaf = page.locator(".catalog-leaf").filter({ has: cover }).first();
    const coverRest = await coverLeaf.evaluate((leaf) => ({
      className: leaf.className,
      style: leaf.getAttribute("style"),
      transform: getComputedStyle(leaf).transform,
    }));
    const coverSurface = coverLeaf.locator(".pdf-page");
    const coverSurfaceRest = await coverSurface.evaluate((surface) => getComputedStyle(surface).transform);
    const coverBox = await cover.boundingBox();
    expect(coverBox).not.toBeNull();
    await page.mouse.move(coverBox!.x + coverBox!.width * 0.5, coverBox!.y + coverBox!.height * 0.5);
    await page.mouse.move(coverBox!.x + coverBox!.width - 8, coverBox!.y + coverBox!.height - 8);
    await page.waitForTimeout(180);
    await expect.poll(() => coverLeaf.evaluate((leaf) => ({
      className: leaf.className,
      style: leaf.getAttribute("style"),
      transform: getComputedStyle(leaf).transform,
    }))).toEqual(coverRest);
    const coverSurfaceEngaged = await coverSurface.evaluate((surface) => {
      const leaf = surface.closest<HTMLElement>(".catalog-leaf");
      const rect = leaf?.getBoundingClientRect();
      return {
        transform: getComputedStyle(surface).transform,
        leafRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      };
    });
    expect(coverSurfaceEngaged.transform).not.toBe(coverSurfaceRest);
    expect(coverSurfaceEngaged.leafRect).not.toBeNull();
    expect(Math.abs(coverSurfaceEngaged.leafRect!.x - coverBox!.x)).toBeLessThan(0.5);
    expect(Math.abs(coverSurfaceEngaged.leafRect!.y - coverBox!.y)).toBeLessThan(0.5);
    expect(Math.abs(coverSurfaceEngaged.leafRect!.width - coverBox!.width)).toBeLessThan(0.5);
    expect(Math.abs(coverSurfaceEngaged.leafRect!.height - coverBox!.height)).toBeLessThan(0.5);
    const coverLight = await page.getByTestId("page-flip-engine").evaluate((host) => {
      const page = host.querySelector<HTMLElement>(".catalog-leaf:first-child .pdf-page");
      return {
        engaged: host.classList.contains("is-cover-engaged"),
        opacity: page ? getComputedStyle(page, "::before").opacity : "0",
      };
    });
    expect(coverLight.engaged).toBe(true);
    expect(Number(coverLight.opacity)).toBeGreaterThan(0);
    await page.mouse.move(12, 12);
    await expect.poll(() => page.getByTestId("page-flip-engine").evaluate((host) => {
      const page = host.querySelector<HTMLElement>(".catalog-leaf:first-child .pdf-page");
      return {
        engaged: host.classList.contains("is-cover-engaged"),
        opacity: page ? getComputedStyle(page, "::before").opacity : "0",
        transform: page ? getComputedStyle(page).transform : "none",
      };
    })).toEqual({ engaged: false, opacity: "0", transform: coverSurfaceRest });

    const bookRest = await page.getByTestId("page-flip-engine").boundingBox();
    expect(bookRest).not.toBeNull();
    const closedCoverBox = await coverLeaf.boundingBox();
    expect(closedCoverBox).not.toBeNull();
    const spreadMidX = bookRest!.x + bookRest!.width / 2;
    expect(Math.abs(closedCoverBox!.x - spreadMidX)).toBeLessThan(3);
    expect(Math.abs(closedCoverBox!.x + closedCoverBox!.width - (bookRest!.x + bookRest!.width))).toBeLessThan(3);

    const openingCoverCenters: number[] = [];
    const openingInteriorTops: number[] = [];
    const openingHardShadowOpacities: number[] = [];
    const openingHardInnerShadowOpacities: number[] = [];
    const openingTitleOpacities: number[] = [];
    const openingLabels: string[] = [];
    const bridgeCoverage: boolean[] = [];
    const coverForMeasure = page.locator('img[data-catalog-page="1"]').first();
    const interiorRightForMeasure = page.locator('img[data-catalog-page="3"]').first();
    const nextAction = page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    for (let sample = 0; sample < 14; sample += 1) {
      await page.waitForTimeout(50);
      const box = await coverForMeasure.evaluate((image) => {
        const leaf = image.closest<HTMLElement>(".catalog-leaf");
        if (!leaf) return null;
        const rect = leaf.getBoundingClientRect();
        return { y: rect.y, height: rect.height };
      });
      if (box && box.height > 0) openingCoverCenters.push(box.y + box.height / 2);
      const interiorBox = await interiorRightForMeasure.evaluate((image) => {
        const leaf = image.closest<HTMLElement>(".catalog-leaf");
        if (!leaf) return null;
        const rect = leaf.getBoundingClientRect();
        return { y: rect.y, height: rect.height };
      });
      if (interiorBox && interiorBox.height > 0) openingInteriorTops.push(interiorBox.y);
      const shadowState = await page.getByTestId("page-flip-engine").evaluate((host) => {
        const shadow = host.querySelector<HTMLElement>(".stf__hardShadow");
        const innerShadow = host.querySelector<HTMLElement>(".stf__hardInnerShadow");
        return {
          opening: host.classList.contains("is-cover-opening"),
          opacity: shadow ? Number.parseFloat(getComputedStyle(shadow).opacity) : 0,
          innerOpacity: innerShadow ? Number.parseFloat(getComputedStyle(innerShadow).opacity) : 0,
        };
      });
      if (shadowState.opening && shadowState.opacity > 0) openingHardShadowOpacities.push(shadowState.opacity);
      if (shadowState.opening && shadowState.innerOpacity > 0) openingHardInnerShadowOpacities.push(shadowState.innerOpacity);
      if (shadowState.opening) {
        openingLabels.push(await page.getByTestId("page-indicator").innerText());
        bridgeCoverage.push(await page.getByTestId("page-flip-engine").evaluate((host) => {
          return ["lineup", "video"].every((name) => {
            const bridge = host.querySelector<HTMLElement>(`[data-cover-bridge="${name}"]`);
            const leaf = bridge?.closest<HTMLElement>(".catalog-leaf");
            if (!bridge || !leaf) return false;
            const bridgeRect = bridge.getBoundingClientRect();
            const leafRect = leaf.getBoundingClientRect();
            return getComputedStyle(bridge).display !== "none" &&
              bridgeRect.width > 0 && bridgeRect.height > 0 &&
              Math.abs(bridgeRect.width - leafRect.width) < 2 &&
              Math.abs(bridgeRect.height - leafRect.height) < 2;
          });
        }));
      }
      const titleOpacity = await coverTitle.evaluate((title) => Number.parseFloat(getComputedStyle(title).opacity));
      if (shadowState.opening) openingTitleOpacities.push(titleOpacity);
    }
    await nextAction;
    expect(openingCoverCenters.length).toBeGreaterThan(2);
    expect(openingCoverCenters.every((center) => Number.isFinite(center))).toBe(true);
    expect(openingInteriorTops.length).toBeGreaterThan(2);
    expect(Math.max(...openingInteriorTops) - Math.min(...openingInteriorTops)).toBeLessThan(4);
    expect(openingHardShadowOpacities.length).toBeGreaterThan(2);
    expect(Math.max(...openingHardShadowOpacities)).toBeLessThan(0.7);
    expect(openingHardInnerShadowOpacities.length).toBeGreaterThan(2);
    expect(Math.max(...openingHardInnerShadowOpacities)).toBeLessThan(0.7);
    expect(openingTitleOpacities.length).toBeGreaterThan(2);
    expect(Math.min(...openingTitleOpacities)).toBeGreaterThan(0.95);
    expect(openingLabels).not.toContain("2–3 / 39");
    expect(bridgeCoverage.length).toBeGreaterThan(2);
    expect(bridgeCoverage.filter(Boolean).length).toBeGreaterThan(2);
    expect(bridgeCoverage.at(-1)).toBe(true);
    await expect(page.getByTestId("page-indicator")).toContainText("14 · VIDEO / 39");
    const bookOpen = await page.getByTestId("page-flip-engine").boundingBox();
    expect(bookOpen).not.toBeNull();
    expect(Math.abs(bookOpen!.x - bookRest!.x)).toBeLessThan(2);
    expect(Math.abs(bookOpen!.width - bookRest!.width)).toBeLessThan(2);
    const lineupPage = page.getByRole("img", { name: "Página 14 del catálogo StarVie 2027", exact: true }).first();
    const interiorOpenBox = await lineupPage.boundingBox();
    expect(interiorOpenBox).not.toBeNull();
    expect(Math.abs(interiorOpenBox!.y - closedCoverBox!.y)).toBeLessThan(3);
    expect(Math.abs(interiorOpenBox!.y + interiorOpenBox!.height - (closedCoverBox!.y + closedCoverBox!.height))).toBeLessThan(3);

    const closingCoverCenters: number[] = [];
    const closingMotions: string[] = [];
    const previousAction = page.getByRole("button", { name: "Página anterior", exact: true }).click();
    for (let sample = 0; sample < 14; sample += 1) {
      await page.waitForTimeout(50);
      const box = await coverForMeasure.evaluate((image) => {
        const leaf = image.closest<HTMLElement>(".catalog-leaf");
        if (!leaf) return null;
        const rect = leaf.getBoundingClientRect();
        return { y: rect.y, height: rect.height };
      });
      if (box && box.height > 0) closingCoverCenters.push(box.y + box.height / 2);
      const motion = await page.getByTestId("page-flip-engine").getAttribute("data-cover-motion");
      if (motion) closingMotions.push(motion);
    }
    await previousAction;
    expect(closingCoverCenters.length).toBeGreaterThan(2);
    expect(closingCoverCenters.every((center) => Number.isFinite(center))).toBe(true);
    expect(closingMotions).toContain("closing");
    await expect(page.getByTestId("page-indicator")).toContainText("1 / 39");

    await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toContainText("14 · VIDEO / 39");
    await page.getByRole("button", { name: "STARLAB", exact: true }).click();
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "section");
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-transition-direction", "backward");
    await expect(page.getByRole("button", { name: "COLECCIÓN 2027", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Página siguiente", exact: true })).toBeDisabled();
    await expect(page.getByTestId("page-indicator")).toContainText("2–3");
    const upcomingPage = page.locator('img[data-catalog-page="4"]').first();
    const upcomingFullSrc = await upcomingPage.getAttribute("data-full-src");
    expect(upcomingFullSrc).not.toBeNull();
    await expect(upcomingPage).toHaveAttribute("src", upcomingFullSrc!);
    await expect.poll(() => upcomingPage.evaluate((image) => {
      const pageImage = image as HTMLImageElement;
      return pageImage.complete && pageImage.naturalWidth > 0;
    })).toBe(true);
    const rightPage = page.getByRole("img", { name: "Página 3 del catálogo StarVie 2027", exact: true }).first();
    const rightPageBox = await rightPage.boundingBox();
    expect(rightPageBox).not.toBeNull();
    await page.mouse.move(rightPageBox!.x + rightPageBox!.width - 8, rightPageBox!.y + rightPageBox!.height - 8);
    await page.mouse.down();
    await page.mouse.move(rightPageBox!.x - rightPageBox!.width * 0.65, rightPageBox!.y + rightPageBox!.height * 0.72, { steps: 18 });
    await page.mouse.up();
    await expect(page.getByTestId("page-indicator")).toContainText("4–5");
    await page.getByRole("button", { name: "Primera página", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toContainText("2–3");
    await page.getByRole("button", { name: "COLECCIÓN 2027", exact: true }).click();
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-transition-direction", "forward");
    await expect(page.getByTestId("page-indicator")).toContainText("14 · VIDEO / 39");
    await page.getByRole("button", { name: "Primera página", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toContainText("1 / 39");

    await page.getByTestId("page-indicator").click();
    await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("17");
    await page.getByRole("button", { name: "Ir", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toContainText("17");
    const directPage = page.locator('img[data-catalog-page="17"]').first();
    const directFullSrc = await directPage.getAttribute("data-full-src");
    expect(directFullSrc).not.toBeNull();
    await expect(directPage).toHaveAttribute("src", directFullSrc!);
    await expect.poll(() => directPage.evaluate((image) => {
      const pageImage = image as HTMLImageElement;
      return pageImage.complete && pageImage.naturalWidth > 0;
    })).toBe(true);

    const indicatorBeforeModal = await page.getByTestId("page-indicator").innerText();
    await page.getByRole("button", { name: "Abrir ficha de Raptor+" }).first().click({ force: true });
    await expect(page.getByRole("dialog", { name: "Raptor+" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Raptor+" }).getByText("PSTRP41000", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cerrar ficha" }).click();
    await expect(page.getByRole("dialog", { name: "Raptor+" })).toBeHidden();
    await expect(page.getByTestId("page-indicator")).toHaveText(indicatorBeforeModal);

    expect(consoleErrors).toEqual([]);
  });

  test("organiza portada, colección, video virtual y StarLab sin perder páginas", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name.includes("mobile");
    await page.goto("/");
    const indicator = page.getByTestId("page-indicator");
    const leaves = page.locator(".catalog-leaf");
    const physicalPages = page.locator('.catalog-leaf > .pdf-page > img[data-catalog-page]');
    const videoLeaves = page.locator('.catalog-leaf > .video-page[data-virtual-page="collection-2027-video"]');
    await expect(leaves).toHaveCount(39);
    await expect(physicalPages).toHaveCount(38);
    await expect(videoLeaves).toHaveCount(1);
    expect(await leaves.evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLElement).dataset.bookIndex)))).toEqual(
      Array.from({ length: 39 }, (_, index) => index),
    );
    // P39 nunca es hoja del book: sólo existe como overlay de contratapa.
    await expect(page.locator(".catalog-leaf.back-cover-leaf")).toHaveCount(0);
    await expect(page.locator('.catalog-leaf img[data-catalog-page="39"]')).toHaveCount(0);
    const backCoverBridge = page.getByTestId("back-cover");
    await expect(backCoverBridge).toHaveCount(1);
    await expect(backCoverBridge).not.toHaveClass(/catalog-leaf/);
    await expect(backCoverBridge).not.toHaveAttribute("data-book-index");
    await expect(indicator).toContainText("1 / 39");
    await expect(page.getByRole("img", { name: "Página 1 del catálogo StarVie 2027", exact: true }).first()).toBeVisible();
    await expect(page.locator('img[data-catalog-page="2"], img[data-catalog-page="3"], img[data-catalog-page="4"], img[data-catalog-page="5"], img[data-catalog-page="6"], img[data-catalog-page="7"], img[data-catalog-page="8"], img[data-catalog-page="9"], img[data-catalog-page="10"], img[data-catalog-page="11"], img[data-catalog-page="12"], img[data-catalog-page="13"]')).toHaveCount(12);

    if (mobile) await page.keyboard.press("ArrowRight");
    else await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "initial-cover-open");
    await expect(page.locator('[data-cover-bridge="lineup"]')).toBeVisible();
    if (mobile) await expect(page.locator('[data-cover-bridge="video"]')).toHaveCount(1);
    else await expect(page.locator('[data-cover-bridge="video"]')).toBeVisible();
    if (mobile) {
      await expect(indicator).toContainText("14 / 39");
      await page.keyboard.press("ArrowRight");
      await expect(indicator).toContainText("VIDEO / 39");
    } else {
      await expect(indicator).toContainText("14 · VIDEO / 39");
    }

    const lineup = page.getByRole("img", { name: "Página 14 del catálogo StarVie 2027", exact: true }).first();
    const videoPage = page.locator('[data-virtual-page="collection-2027-video"]');
    await expect(videoPage).toBeVisible();
    await expect(videoPage.getByText("COLLECTION 2027", { exact: true })).toBeVisible();
    const videoBox = await videoPage.boundingBox();
    expect(videoBox).not.toBeNull();
    expect(videoBox!.width / videoBox!.height).toBeCloseTo(16 / 9, 1);
    if (!mobile) {
      const lineupBox = await lineup.boundingBox();
      expect(lineupBox).not.toBeNull();
      expect(Math.abs(lineupBox!.width - videoBox!.width)).toBeLessThan(2);
      expect(Math.abs(lineupBox!.height - videoBox!.height)).toBeLessThan(2);
    }
    await page.screenshot({ path: testInfo.outputPath("book-flow.png") });

    await page.getByRole("button", { name: "STARLAB", exact: true }).click();
    await expect(indicator).toContainText(mobile ? "2 / 39" : "2–3 / 39");
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
    await expect(page.getByRole("img", { name: "Página 2 del catálogo StarVie 2027", exact: true }).first()).toBeVisible();
    await expect(videoPage).toHaveAttribute("data-video-visible", "false");
    await expect(videoPage.locator("video")).toHaveCount(0);

    if (mobile) {
      await page.keyboard.press("ArrowLeft");
      await expect(indicator).toContainText("1 / 39");
      await page.getByRole("button", { name: "STARLAB", exact: true }).click();
      await expect(indicator).toContainText("2 / 39");
    } else {
      await expect(page.getByRole("button", { name: "Página anterior", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Última página", exact: true }).click();
      await expect(indicator).toContainText("12–13 / 39");
      await expect(page.getByRole("button", { name: "Página siguiente", exact: true })).toBeEnabled();
    }

    await page.getByRole("button", { name: "COLECCIÓN 2027", exact: true }).click();
    await expect(indicator).toContainText(mobile ? "14 / 39" : "14 · VIDEO / 39");
    if (mobile) {
      await page.keyboard.press("ArrowLeft");
      await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "close-to-cover");
      await expect(indicator).toContainText("1 / 39");
      await page.keyboard.press("ArrowRight");
      await expect(indicator).toContainText("14 / 39");
    } else {
      await page.getByRole("button", { name: "Página anterior", exact: true }).click();
      await expect(indicator).toContainText("1 / 39");
      await page.getByRole("button", { name: "Última página", exact: true }).click();
      await expect(indicator).toContainText("37–38 / 39");
      await page.getByRole("button", { name: "Primera página", exact: true }).click();
      await expect(indicator).toContainText("1 / 39");
    }
  });

  test("adapta el libro a una sola página y responde al swipe en mobile", async ({ page, context }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Sólo corresponde al proyecto mobile");
    await page.goto("/");
    await expect(page.getByTestId("page-indicator")).toContainText("1 / 39");
    const mobileCoverTitle = page.locator(".cover-title-overlay");
    await expect(mobileCoverTitle).toBeVisible();
    await expect.poll(() => mobileCoverTitle.evaluate((title) => getComputedStyle(title).opacity)).toBe("1");
    await expect(page.getByRole("button", { name: "Página siguiente", exact: true })).toBeHidden();

    await page.getByTestId("page-indicator").click();
    await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("17");
    await page.getByRole("button", { name: "Ir", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toContainText("17 / 39");
    await expect(page.getByRole("button", { name: "Abrir ficha de Raptor+" }).first()).toBeVisible();

    const book = await page.getByTestId("page-flip-engine").boundingBox();
    expect(book).not.toBeNull();
    const cdp = await context.newCDPSession(page);
    const y = book!.y + book!.height * 0.82;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: book!.x + book!.width - 12, y }] });
    for (let step = 1; step <= 8; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: book!.x + book!.width - 12 - step * ((book!.width - 30) / 8), y }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.getByTestId("page-indicator")).toContainText("18 / 39");
  });

  test("navega con flechas del teclado y la barra queda abajo sin tapar contenido", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "La barra de navegación corresponde a desktop");
    await page.goto("/");
    await expect(page.getByTestId("page-indicator")).toContainText("1 / 39");

    // La barra inferior no tapa el contenido: queda en el tercio inferior.
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    for (const name of ["Primera página", "Página anterior", "Página siguiente", "Última página"]) {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThan(viewport!.height * 0.66);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
    }

    // Flechas del teclado: siguiente y anterior.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("page-indicator")).not.toContainText("1 / 39");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("page-indicator")).toContainText("1 / 39");
  });

  test("el teclado no navega con modal, carrito o inputs enfocados", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("page-indicator").click();
    await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("17");
    await page.getByRole("button", { name: "Ir", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toContainText("17");

    // Con el modal abierto, las flechas no mueven el catálogo.
    await page.getByRole("button", { name: "Abrir ficha de Raptor+" }).first().click({ force: true });
    const dialog = page.getByRole("dialog", { name: "Raptor+" });
    await expect(dialog).toBeVisible();
    const beforeModal = await page.getByTestId("page-indicator").innerText();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(900);
    await expect(page.getByTestId("page-indicator")).toHaveText(beforeModal);
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "Cerrar ficha" }).click();
    await expect(dialog).toBeHidden();

    // Con el carrito abierto, tampoco.
    await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Pedido" })).toBeVisible();
    const beforeCart = await page.getByTestId("page-indicator").innerText();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(900);
    await expect(page.getByTestId("page-indicator")).toHaveText(beforeCart);
    await page.getByRole("button", { name: "Cerrar pedido" }).click();

    // Con el foco en el input del selector de página, tampoco.
    await page.getByTestId("page-indicator").click();
    const spin = page.getByRole("spinbutton", { name: "Ir a", exact: true });
    await spin.focus();
    const beforeInput = await page.getByTestId("page-indicator").innerText();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(900);
    await expect(page.getByTestId("page-indicator")).toHaveText(beforeInput);
  });

  test("respeta reduced motion al cambiar de sección", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "COLECCIÓN 2027", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toContainText(/14/);
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
    await page.getByRole("button", { name: "STARLAB", exact: true }).click();
    await expect(page.getByTestId("page-indicator")).toContainText(/2/);
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
  });

  test("captura y verifica los estados visuales de las transiciones", async ({ page }, testInfo) => {
    await page.goto("/");
    const mobile = testInfo.project.name.includes("mobile");
    const indicator = page.getByTestId("page-indicator");
    const cover = page.getByRole("img", { name: "Página 1 del catálogo StarVie 2027", exact: true }).first();
    await expect(cover).toBeVisible();
    await expect.poll(() => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("p1-opening-00.png") });

    if (mobile) await page.keyboard.press("ArrowRight");
    else await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await page.waitForTimeout(180);
    await expect(page.locator('[data-cover-bridge="lineup"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("p1-opening-25.png") });
    await page.waitForTimeout(200);
    await page.screenshot({ path: testInfo.outputPath("p1-opening-50.png") });
    await page.waitForTimeout(200);
    await page.screenshot({ path: testInfo.outputPath("p1-opening-75.png") });
    await expect(indicator).not.toContainText(mobile ? "2 / 39" : "2–3 / 39");
    await expect(indicator).toContainText(mobile ? "14 / 39" : "14 · VIDEO / 39");
    await page.screenshot({ path: testInfo.outputPath("p1-opening-100.png") });

    await page.screenshot({ path: testInfo.outputPath("p1-closing-00.png") });
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(180);
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-cover-motion", "closing");
    await page.screenshot({ path: testInfo.outputPath("p1-closing-25.png") });
    await page.waitForTimeout(200);
    await page.screenshot({ path: testInfo.outputPath("p1-closing-50.png") });
    await page.waitForTimeout(200);
    await page.screenshot({ path: testInfo.outputPath("p1-closing-75.png") });
    await expect(indicator).toContainText("1 / 39");
    await page.screenshot({ path: testInfo.outputPath("p1-closing-100.png") });

    await page.getByRole("button", { name: "COLECCIÓN 2027", exact: true }).click();
    await expect(indicator).toContainText(mobile ? "14 / 39" : "14 · VIDEO / 39");
    await page.getByRole("button", { name: "STARLAB", exact: true }).click();
    await page.waitForTimeout(280);
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-transition-direction", "backward");
    await page.screenshot({ path: testInfo.outputPath("section-backward.png") });
    await expect(indicator).toContainText(mobile ? "2 / 39" : "2–3 / 39");

    await page.getByRole("button", { name: "COLECCIÓN 2027", exact: true }).click();
    await page.waitForTimeout(280);
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-transition-direction", "forward");
    await page.screenshot({ path: testInfo.outputPath("section-forward.png") });
    await expect(indicator).toContainText(mobile ? "14 / 39" : "14 · VIDEO / 39");

    // Un segundo ciclo detecta desincronizaciones acumulativas entre el
    // índice físico de StPageFlip y el destino lógico del catálogo.
    await page.getByRole("button", { name: "STARLAB", exact: true }).click();
    await expect(indicator).toContainText(mobile ? "2 / 39" : "2–3 / 39");
    await page.getByRole("button", { name: "COLECCIÓN 2027", exact: true }).click();
    await expect(indicator).toContainText(mobile ? "14 / 39" : "14 · VIDEO / 39");
  });

  test("resuelve los bordes lógicos antes del flip y no deriva después", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name.includes("mobile");
    const app = page.locator("main.catalog-app");
    const indicator = page.getByTestId("page-indicator");
    const coverLabel = "1 / 39";
    const starLabStartLabel = mobile ? "2 / 39" : "2–3 / 39";
    const starLabEndLabel = mobile ? "13 / 39" : "12–13 / 39";
    const collectionLabel = mobile ? "14 / 39" : "14 · VIDEO / 39";

    const waitIdle = async () => {
      await expect(app).toHaveAttribute("data-book-transition", "idle");
    };
    const openCollection = async () => {
      await page.keyboard.press("ArrowRight");
      await expect(indicator).toContainText(collectionLabel);
      await waitIdle();
    };
    const enterStarLab = async () => {
      await page.getByRole("button", { name: "STARLAB", exact: true }).click();
      await expect(indicator).toContainText(starLabStartLabel);
      await waitIdle();
    };
    const goToStarLabEnd = async () => {
      if (mobile) {
        await indicator.click();
        await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("13");
        await page.getByRole("button", { name: "Ir", exact: true }).click();
      } else {
        await page.getByRole("button", { name: "Última página", exact: true }).click();
      }
      await expect(indicator).toContainText(starLabEndLabel);
    };
    const expectStable = async (label: string) => {
      await expect(indicator).toContainText(label);
      await waitIdle();
      await page.waitForTimeout(500);
      await expect(indicator).toContainText(label);
    };
    const expectHardCoverClose = async (screenshotName: string) => {
      await expect(app).toHaveAttribute("data-book-transition", "close-to-cover");
      await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-cover-motion", "closing");
      await page.screenshot({ path: testInfo.outputPath(screenshotName) });
      await expectStable(coverLabel);
    };

    await page.goto("/");
    const cover = page.getByRole("img", { name: "Página 1 del catálogo StarVie 2027", exact: true }).first();
    await expect(cover).toBeVisible();
    await expect.poll(() => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    // P12/P13 -> Colección: la intención se resuelve antes de girar y no hay
    // callback tardío que restaure el final de StarLab.
    await openCollection();
    await enterStarLab();
    await goToStarLabEnd();
    if (mobile) await page.keyboard.press("ArrowRight");
    else await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await expect(app).toHaveAttribute("data-book-transition", "edge-enter-collection");
    await expect(app).toHaveAttribute("data-transition-direction", "forward");
    await page.waitForTimeout(280);
    await page.screenshot({ path: testInfo.outputPath("starlab-end-to-collection.png") });
    await expectStable(collectionLabel);
    await expect(page.getByRole("button", { name: "COLECCIÓN 2027", exact: true })).toHaveAttribute("aria-pressed", "true");

    // P14+VIDEO -> tapa: nunca pasa por StarLab y permanece cerrada.
    if (mobile) await page.keyboard.press("ArrowLeft");
    else await page.getByRole("button", { name: "Página anterior", exact: true }).click();
    await expect(page.locator('[data-cover-bridge="lineup"]')).toBeVisible();
    await expectHardCoverClose("collection-start-to-cover.png");
    await expect(page.getByRole("img", { name: "Página 2 del catálogo StarVie 2027", exact: true }).first()).toBeHidden();

    // P2/P3 -> tapa usa el mismo cierre hard-cover, sin bridge comercial.
    await openCollection();
    await enterStarLab();
    if (mobile) await page.keyboard.press("ArrowLeft");
    else await page.getByRole("button", { name: "Página anterior", exact: true }).click();
    await expect(page.locator('[data-cover-bridge="lineup"]')).toHaveCount(0);
    await expectHardCoverClose("starlab-start-to-cover.png");

    // Repetición completa con teclado: detecta drift físico/lógico y callbacks
    // tardíos después de cada borde.
    await openCollection();
    await enterStarLab();
    await goToStarLabEnd();
    await page.keyboard.press("ArrowRight");
    await expectStable(collectionLabel);
    await page.keyboard.press("ArrowLeft");
    await expectStable(coverLabel);
    await openCollection();
    await enterStarLab();
    await page.keyboard.press("ArrowLeft");
    await expectStable(coverLabel);

    // Los botones de sección conservan sus transiciones independientes.
    await openCollection();
    await enterStarLab();
    await page.getByRole("button", { name: "COLECCIÓN 2027", exact: true }).click();
    await expectStable(collectionLabel);
  });

  test("el drag de esquina usa la misma intención en los tres bordes", async ({ page, context }, testInfo) => {
    const mobile = testInfo.project.name.includes("mobile");
    const app = page.locator("main.catalog-app");
    const indicator = page.getByTestId("page-indicator");
    const starLabStartLabel = mobile ? "2 / 39" : "2–3 / 39";
    const starLabEndLabel = mobile ? "13 / 39" : "12–13 / 39";
    const collectionLabel = mobile ? "14 / 39" : "14 · VIDEO / 39";

    const waitIdle = async () => expect(app).toHaveAttribute("data-book-transition", "idle");
    const openCollection = async () => {
      await page.keyboard.press("ArrowRight");
      await expect(indicator).toContainText(collectionLabel);
      await waitIdle();
    };
    const enterStarLab = async () => {
      await page.getByRole("button", { name: "STARLAB", exact: true }).click();
      await expect(indicator).toContainText(starLabStartLabel);
      await waitIdle();
    };
    const goToStarLabEnd = async () => {
      await indicator.click();
      await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("13");
      await page.getByRole("button", { name: "Ir", exact: true }).click();
      await expect(indicator).toContainText(starLabEndLabel);
    };
    const drag = async (selector: string, direction: "previous" | "next") => {
      const image = page.locator(selector).first();
      await expect(image).toBeVisible();
      const box = await image.boundingBox();
      expect(box).not.toBeNull();
      const startX = box!.x + box!.width * (direction === "next" ? 0.82 : 0.18);
      const endX = box!.x + box!.width * (direction === "next" ? 0.42 : 0.58);
      const y = box!.y + box!.height * 0.82;
      if (mobile) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: endX, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else {
        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(endX, y, { steps: 5 });
        await page.mouse.up();
      }
    };

    await page.goto("/");
    const cover = page.getByRole("img", { name: "Página 1 del catálogo StarVie 2027", exact: true }).first();
    await expect(cover).toBeVisible();
    await expect.poll(() => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    await openCollection();
    await enterStarLab();
    await drag('img[data-catalog-page="2"]', "previous");
    await expect(app).toHaveAttribute("data-book-transition", "close-to-cover");
    await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-cover-motion", "closing");
    await expect(indicator).toContainText("1 / 39");
    await waitIdle();

    await openCollection();
    await enterStarLab();
    await goToStarLabEnd();
    await drag('img[data-catalog-page="13"]', "next");
    await expect(app).toHaveAttribute("data-book-transition", "edge-enter-collection");
    await expect(indicator).toContainText(collectionLabel);
    await waitIdle();

    await drag('img[data-catalog-page="14"]', "previous");
    await expect(app).toHaveAttribute("data-book-transition", "close-to-cover");
    await expect(page.locator('[data-cover-bridge="lineup"]')).toBeVisible();
    await expect(indicator).toContainText("1 / 39");
    await waitIdle();
    await page.waitForTimeout(500);
    await expect(indicator).toContainText("1 / 39");
  });

  test("37–38 es el último spread abierto y P39 sólo existe como contratapa", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "El spread doble sólo aplica a landscape");
    const indicator = page.getByTestId("page-indicator");
    const app = page.locator("main.catalog-app");

    await page.goto("/");
    await indicator.click();
    await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("37");
    await page.getByRole("button", { name: "Ir", exact: true }).click();
    await expect(indicator).toContainText("37–38 / 39");
    await expect(page.locator('img[data-catalog-page="37"]')).toBeVisible();
    await expect(page.locator('img[data-catalog-page="38"]')).toBeVisible();
    // P39 nunca participa del recorrido abierto: ni hoja, ni spread 38–39.
    await expect(page.locator(".catalog-leaf.back-cover-leaf")).toHaveCount(0);
    await expect(page.locator('.catalog-leaf img[data-catalog-page="39"]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("A-37-38.png") });

    // Avanzar desde 37–38 cierra la contratapa dura sin spread intermedio.
    await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
    await expect(app).toHaveAttribute("data-book-transition", "close-back-cover");
    await expect(app).toHaveAttribute("data-back-cover-state", "closed");
    await expect(indicator).toContainText("CONTRATAPA / 39");
    // La contratapa cerrada mide exactamente lo mismo que una hoja real.
    const cardBox = await page.locator('[data-rear-bridge-page="cover"]').boundingBox();
    const leafBox = await page.locator('.catalog-leaf[data-book-index="38"]').boundingBox();
    expect(cardBox).not.toBeNull();
    expect(leafBox).not.toBeNull();
    expect(Math.abs(cardBox!.width - leafBox!.width)).toBeLessThan(2);
    expect(Math.abs(cardBox!.height - leafBox!.height)).toBeLessThan(2);
    await page.screenshot({ path: testInfo.outputPath("C-back-cover-closed.png") });

    // El book conserva sus hojas normales: P39 sigue sin ser hoja.
    await expect(page.locator(".catalog-leaf")).toHaveCount(39);
    await expect(page.locator('.catalog-leaf > .pdf-page > img[data-catalog-page]')).toHaveCount(38);
    await expect(page.locator('.catalog-leaf > .video-page[data-virtual-page="collection-2027-video"]')).toHaveCount(1);
    await expect(page.locator('.catalog-leaf img[data-catalog-page="39"]')).toHaveCount(0);
  });

  test("cierra y reabre la contratapa temporal sin drift y reproduce el cierre vivo", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name.includes("mobile");
    const app = page.locator("main.catalog-app");
    const engine = page.getByTestId("page-flip-engine");
    const indicator = page.getByTestId("page-indicator");
    const backCover = page.getByTestId("back-cover");
    const logo = page.getByTestId("back-cover-logo");
    const title = page.getByTestId("back-cover-title");
    const credit = page.getByTestId("back-cover-credit");
    const rearRightImage = page.locator('[data-rear-bridge-page="right"] .back-cover-mirror-content > img');
    const rearRightLeaf = page.locator('[data-rear-bridge-page="right"]');
    const rearLeftLeaf = page.locator('[data-rear-bridge-page="left"]');
    const lastOpenLabel = mobile ? "38 / 39" : "37–38 / 39";
    const opacityOf = (locator: Locator) => locator.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity));
    const setLiveTimeline = async (time: number) => {
      for (const layer of [logo, title, credit]) {
        await layer.evaluate((node, currentTime) => {
          for (const animation of node.getAnimations()) {
            animation.pause();
            animation.currentTime = currentTime;
          }
        }, time);
      }
    };

    const waitIdle = async () => expect(app).toHaveAttribute("data-book-transition", "idle");
    const goToLastPage = async () => {
      await indicator.click();
      await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("38");
      await page.getByRole("button", { name: "Ir", exact: true }).click();
      await expect(indicator).toContainText(lastOpenLabel);
      await waitIdle();
    };
    const expectClosed = async (screenshotName: string, captureSequence = false) => {
      await expect(app).toHaveAttribute("data-back-cover-state", "closed");
      await waitIdle();
      if (captureSequence) {
        await expect.poll(() => logo.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);
        await setLiveTimeline(0);
        expect(await opacityOf(logo)).toBeLessThan(0.2);
        expect(await opacityOf(title)).toBeLessThan(0.2);
        expect(await opacityOf(credit)).toBeLessThan(0.2);
        await page.screenshot({ path: testInfo.outputPath("back-cover-closed-base.png") });
        await setLiveTimeline(350);
        expect(await opacityOf(logo)).toBeGreaterThan(0);
        expect(await opacityOf(title)).toBeLessThan(0.15);
        await page.screenshot({ path: testInfo.outputPath("back-cover-logo-entering.png") });
        await setLiveTimeline(600);
        expect(await opacityOf(title)).toBeGreaterThan(0);
        expect(await opacityOf(credit)).toBeLessThan(0.15);
        await page.screenshot({ path: testInfo.outputPath("back-cover-title-entering.png") });
        await setLiveTimeline(850);
        expect(await opacityOf(credit)).toBeGreaterThan(0);
        await page.screenshot({ path: testInfo.outputPath("back-cover-credit-entering.png") });
        await setLiveTimeline(1300);
      } else {
        await page.waitForTimeout(850);
      }
      await expect(indicator).toContainText("CONTRATAPA / 39");
      await expect(backCover).toHaveAttribute("data-back-cover-live", "true");
      await expect(backCover).toHaveClass(/is-live/);
      await expect(title).toHaveText("2027");
      await expect(credit).toHaveText("By Santiago Lareu");
      await expect.poll(() => opacityOf(logo)).toBeGreaterThan(0.95);
      await expect.poll(() => opacityOf(title)).toBeGreaterThan(0.95);
      await expect.poll(() => opacityOf(credit)).toBeGreaterThan(0.95);
      const brandingStyle = await title.evaluate((titleNode, creditTestId) => {
        const creditNode = document.querySelector<HTMLElement>(`[data-testid="${creditTestId}"]`);
        if (!creditNode) throw new Error("No se encontro el credito de contratapa");
        const titleStyle = getComputedStyle(titleNode);
        const creditStyle = getComputedStyle(creditNode);
        return {
          titleColor: titleStyle.color,
          titleSize: Number.parseFloat(titleStyle.fontSize),
          creditSize: Number.parseFloat(creditStyle.fontSize),
          titleWeight: Number.parseFloat(titleStyle.fontWeight),
          creditWeight: Number.parseFloat(creditStyle.fontWeight),
        };
      }, "back-cover-credit");
      expect(brandingStyle.titleColor).toBe("rgb(230, 70, 55)");
      expect(brandingStyle.creditSize).toBeLessThan(brandingStyle.titleSize);
      expect(brandingStyle.creditWeight).toBeLessThan(brandingStyle.titleWeight);
      await page.screenshot({ path: testInfo.outputPath(screenshotName) });
      await page.waitForTimeout(500);
      await expect(app).toHaveAttribute("data-back-cover-state", "closed");
      await expect(indicator).toContainText("CONTRATAPA / 39");
    };
    const expectOpen = async (screenshotName: string) => {
      await expect(app).toHaveAttribute("data-back-cover-state", "open");
      await waitIdle();
      await expect(indicator).toContainText(lastOpenLabel);
      await expect(backCover).toHaveAttribute("data-back-cover-live", "false");
      await expect(backCover).not.toHaveClass(/is-live/);
      await expect(page.locator(".catalog-leaf.back-cover-leaf")).toHaveCount(0);
      await expect(page.locator('.catalog-leaf img[data-catalog-page="39"]')).toHaveCount(0);
      await expect(page.locator(".catalog-leaf")).toHaveCount(39);
      expect(await opacityOf(logo)).toBe(0);
      expect(await opacityOf(title)).toBe(0);
      expect(await opacityOf(credit)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath(screenshotName) });
      await page.waitForTimeout(500);
      await expect(indicator).toContainText(lastOpenLabel);
    };
    const startClose = async (withButton = false) => {
      if (withButton && !mobile) {
        await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
      } else {
        await page.keyboard.press("ArrowRight");
      }
      await expect(app).toHaveAttribute("data-book-transition", "close-back-cover");
      await expect(engine).toHaveAttribute("data-back-cover-motion", "closing");
      await expect(backCover).toHaveAttribute("data-back-cover-live", "false");
      await expect(backCover).not.toHaveClass(/is-live/);
      // Composición P1: P39 viaja por encima y el spread P37–P38 del engine
      // queda visible debajo (sin P39 como hoja ni duplicados).
      await expect(page.locator('.catalog-leaf[data-book-index="38"]')).toHaveCSS("opacity", "1");
      await expect(page.locator(".back-cover-surface > img")).toHaveCSS("opacity", "0");
      // Los helpers del bridge son visualmente invisibles: opacity 0 es la
      // garantía real (cubre subárbol e imágenes). visibility es un detalle
      // interno: tras el cierre computa visible con display none de StPageFlip.
      await expect(rearRightLeaf).toHaveCSS("opacity", "0");
      await expect(rearLeftLeaf).toHaveCSS("opacity", "0");
    };
    const startOpen = async (withButton = false) => {
      if (withButton && !mobile) {
        await page.getByRole("button", { name: "Página anterior", exact: true }).click();
      } else {
        await page.keyboard.press("ArrowLeft");
      }
      await expect(app).toHaveAttribute("data-book-transition", "open-back-cover");
      await expect(engine).toHaveAttribute("data-back-cover-motion", "opening");
      await expect(backCover).toHaveAttribute("data-back-cover-live", "false");
      await expect(backCover).not.toHaveClass(/is-live/);
      // La inversa también viaja con P37–P38 visibles debajo desde el inicio.
      await expect(page.locator('.catalog-leaf[data-book-index="38"]')).toHaveCSS("opacity", "1");
      await expect(page.locator(".back-cover-surface > img")).toHaveCSS("opacity", "0");
      await expect(rearLeftLeaf).toHaveCSS("opacity", "0");
      if (mobile) {
        await expect(rearRightLeaf).toHaveCSS("visibility", "visible");
        await expect(rearRightLeaf).toHaveCSS("opacity", "1");
        await expect(rearRightImage).toHaveCSS("visibility", "hidden");
      } else {
        await expect(rearRightLeaf).toHaveCSS("opacity", "0");
      }
    };

    await page.goto("/");
    await goToLastPage();
    await page.screenshot({ path: testInfo.outputPath("back-cover-last-page.png") });

    // Cada porcentaje se captura desde un cierre nuevo: el tiempo de una
    // screenshot no desplaza los fotogramas siguientes de la animación.
    const physicalFrames = [
      { delay: 180, closeName: "back-cover-closing-25.png", openName: "back-cover-opening-25.png" },
      { delay: 380, closeName: "back-cover-closing-50.png", openName: "back-cover-opening-50.png" },
      { delay: 580, closeName: "back-cover-closing-75.png", openName: "back-cover-opening-75.png" },
    ];

    for (const [index, frame] of physicalFrames.entries()) {
      await startClose(index === 0);
      await page.waitForTimeout(frame.delay);
      await page.screenshot({ path: testInfo.outputPath(frame.closeName) });
      await expect(app).toHaveAttribute("data-back-cover-state", "closed");
      await waitIdle();
      await startOpen(index === 0);
      await page.waitForTimeout(frame.delay);
      await page.screenshot({ path: testInfo.outputPath(frame.openName) });
      await expect(app).toHaveAttribute("data-back-cover-state", "open");
      await waitIdle();
      await expect(indicator).toContainText(lastOpenLabel);
    }

    // Ciclo vivo controlado desde su primer frame cerrado.
    await startClose();
    await expectClosed("back-cover-closed.png", true);
    await startOpen();
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath("back-cover-opening.png") });
    await expectOpen("back-cover-reopened.png");

    // Otro ciclo completo valida reset y ausencia de drift acumulado.
    await startClose();
    await expectClosed("back-cover-second-close.png");
    await startOpen();
    await expectOpen("back-cover-second-reopen.png");
  });

  test("el drag físico cierra y abre la contratapa usando el resolver central", async ({ page, context }, testInfo) => {
    const mobile = testInfo.project.name.includes("mobile");
    const app = page.locator("main.catalog-app");
    const indicator = page.getByTestId("page-indicator");
    const engine = page.getByTestId("page-flip-engine");

    const drag = async (selector: string, direction: "previous" | "next") => {
      const surface = page.locator(selector).first();
      await expect(surface).toBeVisible();
      const box = await surface.boundingBox();
      expect(box).not.toBeNull();
      const startX = box!.x + box!.width * (direction === "next" ? 0.82 : 0.18);
      const endX = box!.x + box!.width * (direction === "next" ? 0.42 : 0.58);
      const y = box!.y + box!.height * 0.8;
      if (mobile) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: endX, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else {
        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(endX, y, { steps: 5 });
        await page.mouse.up();
      }
    };

    await page.goto("/");
    await indicator.click();
    await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("38");
    await page.getByRole("button", { name: "Ir", exact: true }).click();
    await expect(indicator).toContainText(mobile ? "38 / 39" : "37–38 / 39");

    await drag('img[data-catalog-page="38"]', "next");
    await expect(app).toHaveAttribute("data-book-transition", "close-back-cover");
    await expect(engine).toHaveAttribute("data-back-cover-motion", "closing");
    await expect(app).toHaveAttribute("data-back-cover-state", "closed");
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    await page.waitForTimeout(500);
    await expect(indicator).toContainText("CONTRATAPA / 39");

    await drag('[data-testid="back-cover"]', "previous");
    await expect(app).toHaveAttribute("data-book-transition", "open-back-cover");
    await expect(engine).toHaveAttribute("data-back-cover-motion", "opening");
    await expect(app).toHaveAttribute("data-back-cover-state", "open");
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    await page.waitForTimeout(500);
    await expect(indicator).toContainText(mobile ? "38 / 39" : "37–38 / 39");
  });

  test("la contratapa viva respeta reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const app = page.locator("main.catalog-app");
    const indicator = page.getByTestId("page-indicator");
    const mobile = (await page.viewportSize())!.width <= 600;
    const lastOpenLabel = mobile ? "38 / 39" : "37–38 / 39";
    const backCover = page.getByTestId("back-cover");
    await indicator.click();
    await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("38");
    await page.getByRole("button", { name: "Ir", exact: true }).click();
    await expect(indicator).toContainText(lastOpenLabel);
    await page.keyboard.press("ArrowRight");
    await expect(app).toHaveAttribute("data-back-cover-state", "closed");
    await expect(app).toHaveAttribute("data-book-transition", "idle");
    await expect.poll(() => backCover.getByText("By Santiago Lareu", { exact: true }).evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
    await page.keyboard.press("ArrowLeft");
    await expect(app).toHaveAttribute("data-back-cover-state", "open");
    await expect(indicator).toContainText(lastOpenLabel);
  });

  test("mantiene estable el eje vertical de P39 durante cierre y reapertura", async ({ page }, testInfo) => {
    await page.goto("/");
    const indicator = page.getByTestId("page-indicator");
    await indicator.click();
    await page.getByRole("spinbutton", { name: "Ir a", exact: true }).fill("38");
    await page.getByRole("button", { name: "Ir", exact: true }).click();
    const lastOpenLabel = testInfo.project.name.includes("mobile") ? "38 / 39" : "37–38 / 39";
    await expect(indicator).toContainText(lastOpenLabel);

    const expected = await page.locator('img[data-catalog-page="38"]').first().evaluate((image) => {
      const book = image.closest<HTMLElement>(".page-flip-host");
      const leaf = image.closest<HTMLElement>(".catalog-leaf");
      if (!book || !leaf) throw new Error("No se encontró la geometría estable de P38");
      const bookRect = book.getBoundingClientRect();
      const leafRect = leaf.getBoundingClientRect();
      return {
        centerY: leafRect.top + leafRect.height / 2,
        relativeTop: leafRect.top - bookRect.top,
      };
    });

    const capture = () => page.getByTestId("page-flip-engine").evaluate((book) => {
      const physics = book.querySelector<HTMLElement>(".back-cover-physics");
      const visibleHard = Array.from(
        physics?.querySelectorAll<HTMLElement>(".stf__item.--hard") ?? [],
      ).find((leaf) => {
        const rect = leaf.getBoundingClientRect();
        return getComputedStyle(leaf).display !== "none" && rect.height > 0;
      });
      if (!physics || !visibleHard) return null;
      const leafRect = visibleHard.getBoundingClientRect();
      return {
        centerY: leafRect.top + leafRect.height / 2,
        computedTop: Number.parseFloat(getComputedStyle(visibleHard).top),
        bookTop: book.getBoundingClientRect().top,
        physicsTop: physics.getBoundingClientRect().top,
      };
    });
    const collectMotion = async (state: "closing" | "opening") => {
      const samples: Array<NonNullable<Awaited<ReturnType<typeof capture>>>> = [];
      await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-back-cover-motion", state);
      for (let index = 0; index < 14; index += 1) {
        await page.waitForTimeout(50);
        const sample = await capture();
        if (sample) samples.push(sample);
      }
      return samples;
    };
    const expectStable = (
      samples: Array<NonNullable<Awaited<ReturnType<typeof capture>>>>,
      phase: string,
    ) => {
      expect(samples.length, `${phase}: muestras válidas`).toBeGreaterThan(3);
      const centers = samples.map((sample) => sample.centerY);
      const bookTops = samples.map((sample) => sample.bookTop);
      const physicsTops = samples.map((sample) => sample.physicsTop);
      expect(Math.max(...centers) - Math.min(...centers), `${phase}: drift vertical`).toBeLessThan(1);
      expect(Math.max(...bookTops) - Math.min(...bookTops), `${phase}: top del book`).toBeLessThan(0.5);
      expect(Math.max(...physicsTops) - Math.min(...physicsTops), `${phase}: top del renderer`).toBeLessThan(0.5);
      for (const sample of samples) {
        expect(Math.abs(sample.centerY - expected.centerY), `${phase}: centro contra P38`).toBeLessThan(1);
        expect(Math.abs(sample.computedTop - expected.relativeTop), `${phase}: top CSS estabilizado`).toBeLessThan(0.5);
      }
    };

    await page.keyboard.press("ArrowRight");
    const closing = await collectMotion("closing");
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-back-cover-state", "closed");
    expectStable(closing, "cierre");

    await page.keyboard.press("ArrowLeft");
    const opening = await collectMotion("opening");
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-back-cover-state", "open");
    await expect(indicator).toContainText(lastOpenLabel);
    expectStable(opening, "reapertura");
  });
});
