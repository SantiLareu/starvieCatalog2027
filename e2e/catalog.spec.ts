import { expect, test } from "@playwright/test";

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
      const titleOpacity = await coverTitle.evaluate((title) => Number.parseFloat(getComputedStyle(title).opacity));
      if (shadowState.opening) openingTitleOpacities.push(titleOpacity);
    }
    await nextAction;
    expect(openingCoverCenters.length).toBeGreaterThan(2);
    expect(Math.max(...openingCoverCenters) - Math.min(...openingCoverCenters)).toBeLessThan(4);
    expect(openingInteriorTops.length).toBeGreaterThan(2);
    expect(Math.max(...openingInteriorTops) - Math.min(...openingInteriorTops)).toBeLessThan(4);
    expect(openingHardShadowOpacities.length).toBeGreaterThan(2);
    expect(Math.max(...openingHardShadowOpacities)).toBeLessThan(0.7);
    expect(openingHardInnerShadowOpacities.length).toBeGreaterThan(2);
    expect(Math.max(...openingHardInnerShadowOpacities)).toBeLessThan(0.7);
    expect(openingTitleOpacities.length).toBeGreaterThan(2);
    expect(Math.min(...openingTitleOpacities)).toBeGreaterThan(0.95);
    await expect(page.getByTestId("page-indicator")).not.toContainText("1 / 39");
    const bookOpen = await page.getByTestId("page-flip-engine").boundingBox();
    expect(bookOpen).not.toBeNull();
    expect(Math.abs(bookOpen!.x - bookRest!.x)).toBeLessThan(2);
    expect(Math.abs(bookOpen!.width - bookRest!.width)).toBeLessThan(2);
    const interiorOpenBox = await interiorRightForMeasure.boundingBox();
    expect(interiorOpenBox).not.toBeNull();
    expect(Math.abs(interiorOpenBox!.y - closedCoverBox!.y)).toBeLessThan(3);
    expect(Math.abs(interiorOpenBox!.y + interiorOpenBox!.height - (closedCoverBox!.y + closedCoverBox!.height))).toBeLessThan(3);

    const closingCoverCenters: number[] = [];
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
    }
    await previousAction;
    expect(closingCoverCenters.length).toBeGreaterThan(2);
    expect(Math.max(...closingCoverCenters) - Math.min(...closingCoverCenters)).toBeLessThan(4);
    await expect(page.getByTestId("page-indicator")).toContainText("1 / 39");

    await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
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
    await expect(page.getByText("PSTRP41000")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar ficha" }).click();
    await expect(page.getByRole("dialog", { name: "Raptor+" })).toBeHidden();
    await expect(page.getByTestId("page-indicator")).toHaveText(indicatorBeforeModal);

    expect(consoleErrors).toEqual([]);
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
});
