import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function jump(page: Page, number: number) {
  await page.getByTestId("page-indicator").click();
  await page.locator("#page-number").fill(String(number));
  await page.locator(".page-picker button").click();
  await expect(page.locator("main.catalog-app")).toHaveAttribute("data-book-transition", "idle");
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`Contacto reutiliza el cierre desde portada, StarLab, colección y último spread (${reducedMotion})`, async ({ page, isMobile }) => {
    test.skip(isMobile, "Acceso exclusivo de desktop");
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    const app = page.locator("main.catalog-app");
    const contact = page.getByRole("button", { name: "Contacto", exact: true });
    await expect(app).toHaveClass(/cover-ready/);
    for (const source of [1, 2, 17, 38]) {
      if (source !== 1) await jump(page, source);
      await expect(contact).toBeEnabled();
      await contact.focus();
      await page.keyboard.press("Enter");
      await expect(contact).toBeDisabled();
      await expect(app).toHaveAttribute("data-back-cover-state", "closed");
      await expect(app).toHaveAttribute("data-book-transition", "idle");
      await expect(page.getByTestId("page-indicator")).toHaveText("CONTRATAPA / 39");
      await expect(page.locator(".catalog-leaf img[data-catalog-page='39']")).toHaveCount(0);
      await expect(page.locator(".back-cover-contacts")).toHaveCSS("opacity", "1");
      await page.getByRole("button", { name: "Página anterior", exact: true }).click();
      await expect(app).toHaveAttribute("data-back-cover-state", "open");
      await expect(app).toHaveAttribute("data-book-transition", "idle");
      await expect(page.getByTestId("page-indicator")).toHaveText("37–38 / 39");
      await expect(page.locator(".back-cover-contacts")).toHaveAttribute("inert", "");
    }
  });
}

test("enlaces oficiales abren otra pestaña y no giran la contratapa", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "Redes exclusivas de desktop");
  const destinations = [
    ["Instagram de RealStep", "https://www.instagram.com/realstep.oficial/"],
    ["WhatsApp comercial de RealStep", "https://wa.me/5492235440976"],
    ["Sitio institucional de RealStep", "https://www.realstep.com.ar/"],
  ];
  // Exercise real anchor activation without visiting external services.
  await context.route(/https:\/\/(www\.instagram\.com|wa\.me|www\.realstep\.com\.ar)\//,
    route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Contacto</title>" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Contacto", exact: true }).click();
  const app = page.locator("main.catalog-app");
  await expect(app).toHaveAttribute("data-back-cover-state", "closed");
  await expect(page.locator(".back-cover-contacts")).toHaveCSS("opacity", "1");
  const turns = await page.evaluateHandle(() => {
    const states: string[] = [];
    const app = document.querySelector("main.catalog-app")!;
    const observer = new MutationObserver(() => states.push(app.getAttribute("data-book-transition")!));
    observer.observe(app, { attributes: true, attributeFilter: ["data-book-transition"] });
    return { stop: () => { observer.disconnect(); return states; } };
  });
  for (const [name, url] of destinations) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await link.hover();
    await expect(link).toHaveCSS("color", "rgb(230, 70, 55)");
    const popupReady = page.waitForEvent("popup");
    if (name.startsWith("WhatsApp")) { await link.focus(); await page.keyboard.press("Enter"); }
    else await link.click();
    const popup = await popupReady;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toBe(url);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await popup.close();
    await expect(app).toHaveAttribute("data-back-cover-state", "closed");
    await expect(app).toHaveAttribute("data-book-transition", "idle");
  }
  expect(await turns.evaluate(probe => probe.stop())).toEqual([]);
});

for (const viewport of [
  { width: 1024, height: 768 }, { width: 1280, height: 720 },
  { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1440, height: 600 },
]) {
  test(`composición desktop sin desbordes ${viewport.width}×${viewport.height}`, async ({ page, isMobile }, testInfo) => {
    test.skip(isMobile, "Composición exclusiva de desktop");
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Contacto", exact: true }).click();
    await expect(page.locator("main.catalog-app")).toHaveAttribute("data-back-cover-state", "closed");
    await expect(page.getByTestId("back-cover-credit")).toHaveCSS("opacity", "1");
    await expect(page.locator(".back-cover-contacts")).toHaveCSS("opacity", "1");
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
      return { surface: box(".back-cover-overlay"), credit: box(".back-cover-live small"),
        contacts: box(".back-cover-contacts"), links: [...document.querySelectorAll(".back-cover-contacts a")].map(el => el.getBoundingClientRect().toJSON()),
        header: [...document.querySelectorAll(".toolbar-left, .page-picker-wrap, .toolbar-right")].map(el => el.getBoundingClientRect().toJSON()) };
    });
    expect(geometry.credit.bottom).toBeLessThan(geometry.contacts.top);
    for (const link of geometry.links) {
      expect(link.left).toBeGreaterThan(geometry.surface.left);
      expect(link.right).toBeLessThan(geometry.surface.right);
      expect(link.top).toBeGreaterThan(geometry.contacts.top);
      expect(link.bottom).toBeLessThan(geometry.surface.bottom);
    }
    const [left, center, right] = geometry.header;
    expect(left.right).toBeLessThanOrEqual(center.left);
    expect(center.right).toBeLessThanOrEqual(right.left);
    expect(right.right).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath("contact-back-cover.png") });
  });
}

test("mobile mantiene el contacto fuera del header incluso en landscape", async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "Control de aislamiento mobile");
  await page.goto("/");
  await jump(page, 39);
  await expect(page.locator("main.catalog-app")).toHaveAttribute("data-back-cover-state", "closed");
  await expect(page.locator(".desktop-contact-button")).toBeHidden();
  await expect(page.locator(".back-cover-contacts")).toBeVisible();
  await expect(page.getByTestId("back-cover-logo")).toHaveCSS("translate", "none");
  await expect(page.getByTestId("back-cover-credit")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("mobile-back-cover.png") });
  await page.setViewportSize({ width: 915, height: 412 });
  await expect(page.locator(".desktop-contact-button")).toBeHidden();
  await expect(page.locator(".back-cover-contacts")).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.locator(".desktop-contact-button")).toBeHidden();
  await expect(page.locator(".back-cover-contacts")).toBeVisible();
});
