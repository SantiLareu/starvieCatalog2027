import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

/**
 * Flujo end-to-end del canal DISTRIBUIDOR y aislamiento del canal PÚBLICO.
 *
 * TODO es MOCK: ninguna petición sale a la red real. El único host que se
 * alcanza es el servidor local de desarrollo (127.0.0.1:5173); cualquier otro
 * host se aborta y queda registrado, y las pruebas fallan si alguno se
 * intenta. Las credenciales son FICTICIAS (CUIT/contraseña de prueba): no
 * existe ninguna cuenta real.
 *
 * Qué se comprueba:
 *  · el login simulado habilita el canal y muestra el distintivo;
 *  · la revalidación de sesión (foco) conserva la sesión del distribuidor;
 *  · el carrito muestra el PRECIO DE LISTA y el total con el 20% de
 *    descuento, siempre con los importes que devuelve el servidor;
 *  · el checkout del distribuidor muestra el total distribuidor y envía el
 *    pedido a /api/distributor/orders, nunca al canal público;
 *  · "Salir" revoca la sesión y devuelve el carrito al canal público;
 *  · sin sesión de distribuidor el checkout público sigue siendo público.
 *
 * Requisito del entorno: la integración de distribuidores existe en el
 * navegador cuando `VITE_DISTRIBUTOR_API_BASE_URL` está definido al iniciar
 * el servidor de desarrollo (en CI lo define `.github/workflows/e2e-pr.yml`
 * con un extremo inerte). Sin esa variable el frontend no hace ninguna
 * petición de distribuidores y estos escenarios no tienen sentido: las
 * pruebas se omiten con un motivo explícito (no se instala nada).
 */

const PRODUCT_ID = "eternal";
const LIST_PRICE = 372000;
const DISCOUNT_PERCENT = 20;
/** El precio NETO lo devuelve el servidor: 372.000 − 20% = 297.600. */
const NET_UNIT_PRICE = 297600;
const QTY = 5;
/** Credenciales FICTICIAS: no hay ninguna cuenta real detrás. */
const FICTIONAL_CUIT = "20111111112";
const FICTIONAL_PASSWORD = "clave-de-prueba";
const SESSION_ID = "sesion-de-prueba-0001";
const ORDER_ID = "RS-prueba-0001";

type Network = {
  /** Hosts externos intentados: siempre 0 (nada sale a la red real). */
  externalCalls: string[];
  /** Cuerpos enviados al login de distribuidores. */
  loginBodies: unknown[];
  /** Consultas a la sesión de distribuidores. */
  sessionCalls: number;
  /** Cierres de sesión solicitados. */
  logoutCalls: number;
  /** Cuerpos enviados al endpoint de pedidos del distribuidor. */
  distributorOrderBodies: unknown[];
  /** Cuerpos enviados al endpoint público de pedidos. */
  publicOrderBodies: unknown[];
};

/**
 * Cabeceras CORS de la respuesta simulada: el cliente consulta con
 * `credentials: "include"` contra otro origen, así que la respuesta mock
 * debe permitirlo o el navegador rechaza la lectura y la sesión simulada
 * nunca se autentica.
 */
function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"];
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

async function mockNetwork(page: Page): Promise<Network> {
  const calls: Network = {
    externalCalls: [],
    loginBodies: [],
    sessionCalls: 0,
    logoutCalls: 0,
    distributorOrderBodies: [],
    publicOrderBodies: [],
  };
  /* Estado de la sesión simulada: anónimo hasta el login, autenticado
     después y anónimo otra vez al salir. */
  let authenticated = false;
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

  /* 1) Bloqueo general: ningún host externo (correos, analítica, CDN…) sale. */
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
      return;
    }
    calls.externalCalls.push(url.href);
    await route.abort();
  });

  /* 2) Login: credenciales ficticias, nunca una cuenta real. */
  await page.route("**/api/distributor/login", async route => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    const body = route.request().postDataJSON() as { cuit?: string; password?: string };
    calls.loginBodies.push(body);
    if (body?.cuit !== FICTIONAL_CUIT || body?.password !== FICTIONAL_PASSWORD) {
      await route.fulfill({
        status: 401,
        headers: corsHeaders(route),
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Invalid credentials" }),
      });
      return;
    }
    authenticated = true;
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        authenticated: true,
        discountPercent: DISCOUNT_PERCENT,
        expiresAt,
        sessionId: SESSION_ID,
      }),
    });
  });

  /* 3) Sesión: la cookie es del servidor; el frontend nunca la ve. */
  await page.route("**/api/distributor/session", async route => {
    calls.sessionCalls += 1;
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        authenticated,
        ...(authenticated ? { discountPercent: DISCOUNT_PERCENT, expiresAt, sessionId: SESSION_ID } : {}),
      }),
    });
  });

  /* 4) Cierre de sesión: lo confirma el servidor. */
  await page.route("**/api/distributor/logout", async route => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    calls.logoutCalls += 1;
    authenticated = false;
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  /* 5) Cotización: el precio NETO lo manda el servidor, nunca el frontend. */
  await page.route("**/api/distributor/quote*", async route => {
    const url = new URL(route.request().url());
    const productId = url.searchParams.get("productId") ?? "";
    const qty = Number(url.searchParams.get("qty") ?? "1");
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        currency: "ARS",
        discountPercent: DISCOUNT_PERCENT,
        lines: [
          {
            productId,
            qty,
            listUnitPrice: LIST_PRICE,
            netUnitPrice: NET_UNIT_PRICE,
            netSubtotal: NET_UNIT_PRICE * qty,
          },
        ],
        listTotal: LIST_PRICE * qty,
        netTotal: NET_UNIT_PRICE * qty,
      }),
    });
  });

  /* 6) Pedidos: el de distribuidores y el público, cada uno en su canal. */
  await page.route("**/api/distributor/orders", async route => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    calls.distributorOrderBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: ORDER_ID, status: "completed" }),
    });
  });
  await page.route("**/api/orders", async route => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    calls.publicOrderBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: ORDER_ID, status: "completed" }),
    });
  });

  /* 7) Turnstile: si el entorno define una site key, el widget se simula
        (mismo patrón que checkout-success) y no se pide nada externo. */
  await page.addInitScript(() => {
    (window as unknown as { turnstile?: unknown }).turnstile = {
      render: (_node: HTMLElement, options: { callback: (token: string) => void }) => {
        queueMicrotask(() => options.callback("token-de-prueba"));
        return "mock-widget";
      },
      reset: () => {},
      remove: () => {},
    };
  });

  return calls;
}

/** El carrito sólo guarda identidad y cantidad: el precio lo da el catálogo. */
async function seedCart(page: Page, productId: string, qty: number): Promise<void> {
  await page.addInitScript(
    ([id, quantity]) => {
      localStorage.setItem("starvie-cart-v1", JSON.stringify([{ productId: id, qty: quantity }]));
    },
    [productId, qty] as const,
  );
}

/**
 * La integración de distribuidores sólo existe en el navegador si
 * `VITE_DISTRIBUTOR_API_BASE_URL` está definido: sin ella el frontend no
 * consulta la sesión (cero peticiones) y estos escenarios no tienen sentido.
 */
async function distributorIntegrationEnabled(calls: Network): Promise<boolean> {
  try {
    await expect.poll(() => calls.sessionCalls, { timeout: 5_000 }).toBeGreaterThan(0);
    return true;
  } catch {
    return false;
  }
}

/** Login simulado con credenciales ficticias: distintivo «Distribuidor». */
async function loginAsDistributor(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Distribuidores", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Acceso distribuidores" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("CUIT / CUIL").fill(FICTIONAL_CUIT);
  await modal.getByLabel("Contraseña").fill(FICTIONAL_PASSWORD);
  await modal.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.locator(".distributor-account__badge")).toHaveText("Distribuidor");
}

async function openCart(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
  const drawer = page.getByRole("dialog", { name: "Pedido", exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

async function openCheckout(page: Page): Promise<Locator> {
  const drawer = page.getByRole("dialog", { name: "Pedido", exact: true });
  await drawer.getByRole("button", { name: "Finalizar pedido", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Finalizar pedido", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillContact(dialog: Locator): Promise<void> {
  await dialog.getByLabel("Nombre y apellido *").fill("Distribuidor de prueba");
  await dialog.getByLabel("Razón social *").fill("Distribuidora de prueba S.A.");
  await dialog.getByLabel("Correo electrónico *").fill("distribuidor@example.test");
}

/**
 * Envía el pedido. Si el entorno no tiene Turnstile configurado el propio
 * checkout lo informa: el caso se omite con un motivo explícito (no se
 * instala nada).
 */
async function submitOrder(dialog: Locator): Promise<void> {
  const unconfigured = dialog
    .getByRole("alert")
    .filter({ hasText: "La verificación de seguridad no está configurada" });
  if ((await unconfigured.count()) > 0) {
    test.skip(
      true,
      "El entorno no tiene Turnstile configurado (VITE_TURNSTILE_SITE_KEY o VITE_TURNSTILE_ENABLED=false): no se puede enviar un pedido de prueba.",
    );
  }
  await dialog.getByRole("button", { name: "Enviar pedido", exact: true }).click();
}

test.describe("Flujo del canal distribuidor", () => {
  test("el login simulado habilita el canal y la revalidación conserva la sesión", async ({ page }) => {
    const calls = await mockNetwork(page);
    await page.goto("/");
    test.skip(
      !(await distributorIntegrationEnabled(calls)),
      "El entorno no define VITE_DISTRIBUTOR_API_BASE_URL: la integración de distribuidores no existe en el navegador.",
    );

    await loginAsDistributor(page);

    /* El login usó las credenciales ficticias y nada más. */
    expect(calls.loginBodies).toHaveLength(1);
    expect(calls.loginBodies[0]).toEqual({ cuit: FICTIONAL_CUIT, password: FICTIONAL_PASSWORD });

    /* La revalidación (foco) vuelve a consultar la sesión y la conserva. */
    const before = calls.sessionCalls;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => calls.sessionCalls).toBeGreaterThan(before);
    await expect(page.locator(".distributor-account__badge")).toHaveText("Distribuidor");

    expect(calls.externalCalls).toEqual([]);
    expect(calls.distributorOrderBodies).toEqual([]);
    expect(calls.publicOrderBodies).toEqual([]);
  });

  test("el carrito muestra el precio de lista y el total con el 20% de descuento", async ({ page }) => {
    const calls = await mockNetwork(page);
    await seedCart(page, PRODUCT_ID, QTY);
    await page.goto("/");
    test.skip(
      !(await distributorIntegrationEnabled(calls)),
      "El entorno no define VITE_DISTRIBUTOR_API_BASE_URL: la integración de distribuidores no existe en el navegador.",
    );
    await loginAsDistributor(page);

    const drawer = await openCart(page);
    const line = drawer.locator(".cart-line").first();

    /* El precio de lista convive con el cotizado por el servidor. */
    await expect(line).toContainText("Precio lista $ 372.000,00 c/u");
    await expect(line).toContainText("Distribuidor $ 297.600,00 c/u");
    /* 5 × 297.600 = 1.488.000 (el precio de lista daría 1.860.000). */
    await expect(line).toContainText("$ 1.488.000,00");
    await expect(line).not.toContainText("1.860.000,00");

    /* Los dos totales: el de lista y el de distribuidor, con el descuento. */
    await expect(drawer.locator(".cart-total:not(.cart-total--distributor)")).toContainText("Total lista");
    await expect(drawer.locator(".cart-total:not(.cart-total--distributor)")).toContainText("$ 1.860.000,00");
    await expect(drawer.locator(".cart-total--distributor")).toContainText("Total distribuidor");
    await expect(drawer.locator(".cart-total--distributor")).toContainText("$ 1.488.000,00");
    await expect(drawer.locator(".cart-distributor-badge")).toHaveText("20% de descuento");

    /* Sólo lecturas: ningún pedido en ningún canal. */
    expect(calls.distributorOrderBodies).toEqual([]);
    expect(calls.publicOrderBodies).toEqual([]);
    expect(calls.externalCalls).toEqual([]);
  });

  test("el checkout del distribuidor confirma el pedido por su propio canal", async ({ page }) => {
    const calls = await mockNetwork(page);
    await seedCart(page, PRODUCT_ID, QTY);
    await page.goto("/");
    test.skip(
      !(await distributorIntegrationEnabled(calls)),
      "El entorno no define VITE_DISTRIBUTOR_API_BASE_URL: la integración de distribuidores no existe en el navegador.",
    );
    await loginAsDistributor(page);
    await openCart(page);

    const dialog = await openCheckout(page);
    await expect(dialog.locator(".checkout-total:not(.checkout-total--distributor)")).toContainText("Total lista");
    await expect(dialog.locator(".checkout-total:not(.checkout-total--distributor)")).toContainText("1.860.000,00 $");
    await expect(dialog.locator(".checkout-total--distributor")).toContainText("Total distribuidor · 20% de descuento");
    await expect(dialog.locator(".checkout-total--distributor")).toContainText("1.488.000,00 $");
    await expect(dialog.locator(".checkout-line-distributor")).toContainText("Distribuidor 1.488.000,00 $");

    await fillContact(dialog);
    await submitOrder(dialog);

    const confirmation = page.getByRole("dialog", { name: "¡Pedido enviado con éxito!", exact: true });
    await expect(confirmation).toBeVisible();

    /* El pedido fue por el canal del distribuidor, con identidad y cantidad
       solamente: el frontend nunca manda precios. */
    expect(calls.distributorOrderBodies).toHaveLength(1);
    expect(calls.distributorOrderBodies[0]).toMatchObject({
      lines: [{ productId: PRODUCT_ID, qty: QTY }],
    });
    expect(JSON.stringify(calls.distributorOrderBodies[0])).not.toContain("372000");
    expect(JSON.stringify(calls.distributorOrderBodies[0])).not.toContain("297600");
    /* Aislamiento: el canal público no se toca. */
    expect(calls.publicOrderBodies).toEqual([]);
    expect(calls.externalCalls).toEqual([]);
  });

  test("salir de sesión devuelve el carrito al canal público", async ({ page }) => {
    const calls = await mockNetwork(page);
    await seedCart(page, PRODUCT_ID, QTY);
    await page.goto("/");
    test.skip(
      !(await distributorIntegrationEnabled(calls)),
      "El entorno no define VITE_DISTRIBUTOR_API_BASE_URL: la integración de distribuidores no existe en el navegador.",
    );
    await loginAsDistributor(page);

    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await expect(page.locator(".distributor-account__badge")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Distribuidores", exact: true })).toBeVisible();
    expect(calls.logoutCalls).toBe(1);

    /* El carrito vuelve al canal público: sin precios ni total de
       distribuidor, y con el total de lista del catálogo. */
    const drawer = await openCart(page);
    await expect(drawer.locator(".cart-total--distributor")).toHaveCount(0);
    await expect(drawer.locator(".cart-line-distributor")).toHaveCount(0);
    await expect(drawer.locator(".cart-total:not(.cart-total--distributor)")).toContainText("1.860.000,00 $");

    expect(calls.distributorOrderBodies).toEqual([]);
    expect(calls.publicOrderBodies).toEqual([]);
    expect(calls.externalCalls).toEqual([]);
  });
});

test.describe("Canal público sin sesión de distribuidor", () => {
  test("el catálogo, el carrito y el checkout siguen siendo públicos", async ({ page }) => {
    const calls = await mockNetwork(page);
    await seedCart(page, PRODUCT_ID, 2);
    await page.goto("/");

    /* Sin sesión de distribuidor no hay distintivo ni precios de distribuidor. */
    await expect(page.locator(".distributor-account__badge")).toHaveCount(0);

    const drawer = await openCart(page);
    await expect(drawer.locator(".cart-total--distributor")).toHaveCount(0);
    await expect(drawer.locator(".cart-line-distributor")).toHaveCount(0);
    await expect(drawer.locator(".cart-total:not(.cart-total--distributor)")).toContainText("744.000,00 $");

    const dialog = await openCheckout(page);
    await expect(dialog.locator(".checkout-total--distributor")).toHaveCount(0);
    await expect(dialog.locator(".checkout-total:not(.checkout-total--distributor)")).toContainText("Total");
    await expect(dialog.locator(".checkout-total:not(.checkout-total--distributor)")).toContainText("744.000,00 $");

    await fillContact(dialog);
    await submitOrder(dialog);

    const confirmation = page.getByRole("dialog", { name: "¡Pedido enviado con éxito!", exact: true });
    await expect(confirmation).toBeVisible();

    /* El pedido fue por el canal público y el de distribuidores ni se tocó. */
    expect(calls.publicOrderBodies).toHaveLength(1);
    expect(calls.publicOrderBodies[0]).toMatchObject({
      lines: [{ productId: PRODUCT_ID, qty: 2 }],
    });
    expect(calls.distributorOrderBodies).toEqual([]);
    expect(calls.externalCalls).toEqual([]);
  });
});
