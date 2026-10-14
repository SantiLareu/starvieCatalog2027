import { expect, test, type Page } from "@playwright/test";

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Abrir miniaturas", exact: true }).tap();
  await expect(page.locator(".thumbnail-drawer")).toHaveClass(/is-open/);
  await expect(page.locator(".thumbnail-drawer")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
}

async function fromThumbnail(page: Page, source: number | "video") {
  await openMenu(page);
  const thumbnail = page.getByRole("button", { name: source === "video" ? "Ir a página de video" : `Ir a página ${source}`, exact: true });
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.tap();
  await expect(page.locator(".catalog-app")).toHaveAttribute("data-book-transition", "idle");
  await expect(page.getByTestId("page-flip-engine")).toHaveAttribute("data-flip-state", "read");
}

async function contactFromMenu(page: Page) {
  await openMenu(page);
  await page.locator(".mobile-contact-button").tap();
  await expect(page.locator(".thumbnail-drawer")).not.toHaveClass(/is-open/);
  await expect(page.locator(".catalog-app")).toHaveAttribute("data-back-cover-state", "closed");
  await expect(page.locator(".catalog-app")).toHaveAttribute("data-book-transition", "idle");
  await expect(page.getByTestId("page-indicator")).toHaveText("CONTRATAPA / 39");
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`mobile: menú Contacto cierra y navega desde portada, StarLab, hero y último spread (${reducedMotion})`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "Flujo táctil mobile");
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    await expect(page.locator(".catalog-app")).toHaveClass(/cover-ready/);
    for (const source of [1, 2, 17, 38]) {
      if (source !== 1) await fromThumbnail(page, source);
      await contactFromMenu(page);
      await expect(page.locator(".back-cover-contacts")).toHaveCSS("opacity", "1");
      await page.getByRole("button", { name: "Página anterior", exact: true }).tap();
      await expect(page.locator(".catalog-app")).toHaveAttribute("data-back-cover-state", "open");
      await expect(page.locator(".catalog-app")).toHaveAttribute("data-book-transition", "idle");
      await expect(page.getByTestId("page-indicator")).toHaveText("38 / 39");
      await expect(page.locator(".back-cover-contacts")).toHaveAttribute("inert", "");
    }
  });
}

test("mobile: Contacto funciona desde carrusel, video e índice y en P39 solo cierra el menú", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Flujo táctil mobile");
  await page.goto("/");
  for (const source of [14, "video", 27] as const) {
    await fromThumbnail(page, source);
    if (source === "video") {
      await expect.poll(() => page.locator('.mobile-star-news video').evaluate(el => !(el as HTMLVideoElement).paused)).toBe(true);
    }
    await contactFromMenu(page);
    if (source === "video") {
      await expect(page.locator('.mobile-star-news video')).toHaveCount(0);
    }
  }
  const states = await page.evaluateHandle(() => {
    const states: string[] = [];
    const app = document.querySelector('.catalog-app')!;
    const observer = new MutationObserver(() => states.push(app.getAttribute('data-book-transition')!));
    observer.observe(app, { attributes: true, attributeFilter: ['data-book-transition'] });
    return { stop: () => { observer.disconnect(); return states; } };
  });
  await contactFromMenu(page);
  expect(await states.evaluate(probe => probe.stop())).toEqual([]);
});

test("mobile: miniaturas tienen scroll táctil independiente y Contacto permanece fijo", async ({ page, context, isMobile }, testInfo) => {
  test.skip(!isMobile, "Panel mobile");
  await page.goto("/");
  await openMenu(page);
  const contact = page.locator('.mobile-contact-button');
  const before = await contact.boundingBox();
  expect(before!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.catalog-toolbar .desktop-contact-button')).toBeHidden();
  await expect(page.locator('.thumbnail-drawer a')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Contacto', exact: true })).toHaveCount(1);
  const list = page.locator('.thumbnail-list');
  const box = (await list.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: box.y + box.height * .75 }] });
  for (const fraction of [.6, .4, .2]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: box.y + box.height * fraction }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(50);
  expect(await contact.boundingBox()).toEqual(before);
  const last = page.getByRole('button', { name: 'Ir a página 38', exact: true });
  await last.scrollIntoViewIfNeeded();
  expect(await contact.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('mobile-menu-contact.png') });
  await last.tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('38 / 39');
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition', 'idle');
  await openMenu(page);
  await expect(last).toHaveClass(/is-active/);
  await contact.tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('CONTRATAPA / 39');
});

test("mobile: enlaces compartidos abren pestañas sin giros y el resto de la tapa conserva gestos", async ({ page, context, isMobile }) => {
  test.skip(!isMobile, "Interacción táctil");
  await context.route(/https:\/\/(www\.instagram\.com|wa\.me|www\.realstep\.com\.ar)\//,
    route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Contacto</title>' }));
  await page.goto('/');
  await contactFromMenu(page);
  await expect(page.locator('.back-cover-contacts')).toHaveCSS('opacity', '1');
  const states = await page.evaluateHandle(() => {
    const states: string[] = [];
    const app = document.querySelector('.catalog-app')!;
    const observer = new MutationObserver(() => states.push(app.getAttribute('data-back-cover-state')!));
    observer.observe(app, { attributes: true, attributeFilter: ['data-back-cover-state'] });
    return { stop: () => { observer.disconnect(); return states; } };
  });
  for (const [name, url] of [
    ['Instagram de RealStep', 'https://www.instagram.com/realstep.oficial/'],
    ['WhatsApp comercial de RealStep', 'https://wa.me/5492235440976'],
    ['Sitio institucional de RealStep', 'https://www.realstep.com.ar/'],
  ]) {
    const link = page.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', url);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    const box = (await link.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const popupReady = page.waitForEvent('popup');
    await link.tap();
    const popup = await popupReady;
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toBe(url);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await popup.close();
    await expect(page.locator('.catalog-app')).toHaveAttribute('data-back-cover-state', 'closed');
  }
  expect(await states.evaluate(probe => probe.stop())).toEqual([]);
  const surface = (await page.locator('.back-cover-overlay').boundingBox())!;
  await page.touchscreen.tap(surface.x + surface.width * .1, surface.y + surface.height * .3);
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-back-cover-state', 'open');
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition', 'idle');
});

for (const viewport of [
  { width: 320, height: 480 }, { width: 375, height: 667 }, { width: 393, height: 851 },
  { width: 430, height: 932 }, { width: 667, height: 375 }, { width: 915, height: 412 },
]) {
  test(`mobile: composición y safe area ${viewport.width}×${viewport.height}`, async ({ page, context, isMobile }, testInfo) => {
    test.skip(!isMobile, "Composición mobile");
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } });
    await page.setViewportSize(viewport);
    await page.goto('/');
    await contactFromMenu(page);
    await expect(page.locator('.back-cover-contacts')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('back-cover-credit')).toHaveCSS('opacity', '1');
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
      return { credit: box('.back-cover-live small'), contacts: box('.back-cover-contacts'), surface: box('.back-cover-overlay'),
        controls: box('.page-controls'), hint: document.querySelector('.mobile-gesture-hint')?.getBoundingClientRect().toJSON(),
        header: [box('.experience-nav'), box('.page-picker-wrap'), box('.cart-button')],
        links: [...document.querySelectorAll('.back-cover-contacts a')].map(el => el.getBoundingClientRect().toJSON()) };
    });
    expect(geometry.credit.bottom).toBeLessThan(geometry.contacts.top);
    const [sections, indicator, cart] = geometry.header;
    expect(sections.right).toBeLessThanOrEqual(indicator.left);
    expect(indicator.right).toBeLessThanOrEqual(cart.left);
    for (const link of geometry.links) {
      expect(link.left).toBeGreaterThan(geometry.surface.left);
      expect(link.right).toBeLessThan(geometry.surface.right);
      expect(link.bottom).toBeLessThan(geometry.surface.bottom);
      expect(link.bottom).toBeLessThan(geometry.controls.top);
      if (geometry.hint?.height) expect(link.bottom).toBeLessThan(geometry.hint.top);
    }
    await page.screenshot({ path: testInfo.outputPath('mobile-back-cover-contact.png') });
    await openMenu(page);
    const button = (await page.locator('.mobile-contact-button').boundingBox())!;
    expect(button.y + button.height).toBeLessThanOrEqual(viewport.height - 34);
    await page.screenshot({ path: testInfo.outputPath('mobile-menu-contact.png') });
    await cdp.detach();
  });
}

test('mobile: cambio de altura y orientación conserva Contacto y navegación', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Viewport mobile');
  await page.goto('/');
  await contactFromMenu(page);
  for (const viewport of [{ width: 393, height: 651 }, { width: 393, height: 520 }, { width: 915, height: 412 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition', 'idle');
    await expect(page.getByRole('link', { name: 'WhatsApp comercial de RealStep' })).toBeVisible();
    const row = (await page.locator('.back-cover-contacts').boundingBox())!;
    const credit = (await page.getByTestId('back-cover-credit').boundingBox())!;
    expect(credit.y + credit.height).toBeLessThan(row.y);
    await openMenu(page);
    await page.locator('.mobile-contact-button').tap();
    await expect(page.getByTestId('page-indicator')).toHaveText('CONTRATAPA / 39');
  }
  await page.getByRole('button', { name: 'Página anterior', exact: true }).tap();
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-back-cover-state', 'open');
});

test('desktop: menú conserva su distribución y solo el header muestra Contacto', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Regresión desktop');
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir miniaturas', exact: true }).click();
  await expect(page.locator('.mobile-contact-footer')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Contacto', exact: true })).toHaveCount(1);
  await expect(page.locator('.thumbnail-drawer')).toHaveCSS('display', 'block');
  const heights = await page.locator('.thumbnail-drawer').evaluate(el => [el.clientHeight - 24, el.querySelector('.thumbnail-list')!.clientHeight]);
  expect(heights[0]).toBe(heights[1]);
});
