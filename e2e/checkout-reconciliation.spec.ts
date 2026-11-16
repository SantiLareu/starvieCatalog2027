import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

/** The public flow is unchanged. Distributor history no longer blocks new
 * purchases. All APIs are mocked; no real orders, mail or external traffic.
 */

const REFERENCE = "0df502b3-51aa-461d-a1b6-19363712c567";
const PUBLIC_REFERENCE = "11111111-2222-4333-8444-555555555555";
const ORDER_ID = "RS-8dc011f4-40a3-4ca6-9ce9-2e9d11a9277b";
const LINES = [{ productId: "raptor+", qty: 2 }];
const LIST_PRICE = 372000;
const NET_UNIT_PRICE = 297600;
/**
 * Identificador opaco de sesión que devuelve el backend. Es la PRUEBA DE
 * CONTINUIDAD que el checkout del canal distribuidor exige: sin él la
 * prueba es `null` y el checkout bloquea (no hay conciliación, no hay
 * reenvío). Valor fijo y FICTICIO: no es una credencial ni existe ninguna
 * cuenta real detrás.
 */
const SESSION_ID = "test-session-id-0001";

type Network = {
  /** URLs consultadas en /api/distributor/order-resolution. */
  resolutionCalls: string[];
  /** Cuerpos enviados al endpoint público de pedidos. */
  publicOrderPayloads: unknown[];
  /** URLs de pedidos de distribuidores (siempre 0). */
  distributorOrderCalls: string[];
  /** Peticiones a hosts externos: siempre 0 (nada sale a la red real). */
  externalCalls: string[];
  /** Consultas de sesión del distribuidor. */
  sessionCalls: number;
};

/**
 * Cabeceras CORS de la respuesta simulada: el cliente consulta con
 * `credentials: "include"` a otro origen, así que la respuesta mock debe
 * permitirlo o el navegador rechaza la lectura.
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

async function mockNetwork(
  page: Page,
  options: {
    session?: "authenticated" | "anonymous";
    resolution?: { status: number; body: unknown };
    publicOrder?: "complete" | "abort";
    /** El pedido del distribuidor falla con 502 (intento 'failed'). */
    distributorOrder?: "failed";
    /** La conciliación devuelve como eco la referencia consultada. */
    echoResolutionReference?: boolean;
  } = {},
): Promise<Network> {
  const calls: Network = {
    resolutionCalls: [],
    publicOrderPayloads: [],
    distributorOrderCalls: [],
    externalCalls: [],
    sessionCalls: 0,
  };

  /* 1) Bloqueo general: ningún host externo (correos, analítica…) sale. */
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
      return;
    }
    calls.externalCalls.push(url.href);
    await route.abort();
  });

  /* 2) Pedidos: nunca reales. El público se puede fulfilled para comprobar
        que el checkout público sigue confirmando. */
  await page.route("**/api/orders", async route => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    calls.publicOrderPayloads.push(route.request().postDataJSON());
    if (options.publicOrder === "complete") {
      await route.fulfill({
        status: 201,
        headers: corsHeaders(route),
        contentType: "application/json",
        body: JSON.stringify({ ok: true, orderId: ORDER_ID, status: "completed" }),
      });
      return;
    }
    await route.abort();
  });
  await page.route("**/api/distributor/orders", async route => {
    calls.distributorOrderCalls.push(route.request().url());
    if (options.distributorOrder === "failed") {
      /* El servidor conserva el pedido: el intento queda en 'failed'. */
      await route.fulfill({
        status: 502,
        headers: corsHeaders(route),
        contentType: "application/json",
        body: JSON.stringify({ ok: false, status: "failed", orderId: ORDER_ID }),
      });
      return;
    }
    await route.abort();
  });

  /* 3) Sesión del distribuidor (cookie HttpOnly: el frontend nunca la ve).
        El `sessionId` es lo que el backend devuelve como prueba de
        continuidad: sin él el checkout del canal distribuidor bloquea y no
        ofrece la conciliación. */
  await page.route("**/api/distributor/session", async route => {
    calls.sessionCalls += 1;
    const authenticated = (options.session ?? "authenticated") === "authenticated";
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        authenticated,
        ...(authenticated
          ? {
              discountPercent: 20,
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              sessionId: SESSION_ID,
            }
          : {}),
      }),
    });
  });

  /* 4) Cotización: el precio neto lo manda el servidor. */
  await page.route("**/api/distributor/quote*", async route => {
    const url = new URL(route.request().url());
    const productId = url.searchParams.get("productId") ?? "";
    const qty = Number(url.searchParams.get("qty") ?? "1");
    const netSubtotal = NET_UNIT_PRICE * qty;
    await route.fulfill({
      status: 200,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        currency: "ARS",
        discountPercent: 20,
        lines: [
          {
            productId,
            qty,
            listUnitPrice: LIST_PRICE,
            netUnitPrice: NET_UNIT_PRICE,
            netSubtotal,
          },
        ],
        listTotal: LIST_PRICE * qty,
        netTotal: netSubtotal,
      }),
    });
  });

  /* 5) Conciliación: SÓLO LECTURA. */
  await page.route("**/api/distributor/order-resolution**", async route => {
    calls.resolutionCalls.push(route.request().url());
    const requested = new URL(route.request().url()).searchParams.get("reference") ?? "";
    const answer = options.resolution ?? {
      status: 200,
      body: { ok: true, reference: REFERENCE, status: "UNRESOLVED", decidedAt: null },
    };
    const body =
      options.echoResolutionReference && answer.body && typeof answer.body === "object"
        ? { ...(answer.body as Record<string, unknown>), reference: requested }
        : answer.body;
    await route.fulfill({
      status: answer.status,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  /* 6) Turnstile: widget simulado (mismo patrón que checkout-success). */
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

async function seedCart(page: Page): Promise<void> {
  await page.addInitScript(lines => {
    localStorage.setItem("starvie-cart-v1", JSON.stringify(lines));
  }, LINES);
}

async function seedAttempt(
  page: Page,
  options: {
    reference: string;
    channel: "public" | "distributor";
    withSession: boolean;
    status?: string;
  },
): Promise<void> {
  const keys = attemptKeys(options.channel);
  await page.addInitScript(
    ({ reference, channel, withSession, status, keys }) => {
      const marker = {
        version: "v2",
        idempotencyKey: reference,
        orderId: null,
        lines: [{ productId: "raptor+", qty: 2 }],
        createdAt: new Date().toISOString(),
        status,
        channel,
      };
      localStorage.setItem(keys.marker, JSON.stringify(marker));
      if (withSession) {
        sessionStorage.setItem(
          keys.session,
          JSON.stringify({
            ...marker,
            contact: {
              name: "Cliente de prueba",
              legalName: "Empresa de prueba",
              email: "cliente@example.test",
            },
          }),
        );
      }
    },
    {
      reference: options.reference,
      channel: options.channel,
      withSession: options.withSession,
      status: options.status ?? "accepted",
      keys,
    },
  );
}

/** El intento de pedido vive en un compartimento por canal: el público
 *  conserva las claves históricas y el distribuidor tiene las suyas, para que
 *  un intento pendiente de un canal no bloquee ni pise al otro. */
const PUBLIC_ATTEMPT_MARKER_KEY = "starvie-order-attempt-v2";
const PUBLIC_ATTEMPT_SESSION_KEY = "starvie-order-attempt-v2-session";
const DISTRIBUTOR_ATTEMPT_MARKER_KEY = "starvie-order-attempt-v2-distributor";
const DISTRIBUTOR_ATTEMPT_SESSION_KEY = "starvie-order-attempt-v2-distributor-session";

function attemptKeys(channel: "public" | "distributor") {
  return channel === "distributor"
    ? { marker: DISTRIBUTOR_ATTEMPT_MARKER_KEY, session: DISTRIBUTOR_ATTEMPT_SESSION_KEY }
    : { marker: PUBLIC_ATTEMPT_MARKER_KEY, session: PUBLIC_ATTEMPT_SESSION_KEY };
}

async function openCheckout(page: Page) {
  await page.getByRole("button", { name: /Abrir pedido/ }).first().click();
  await page
    .getByRole("dialog", { name: "Pedido", exact: true })
    .getByRole("button", { name: "Finalizar pedido", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Finalizar pedido", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** El aviso de pedido sin confirmar: es donde vive la referencia. */
function uncertainNotice(dialog: Locator) {
  return dialog.locator('aside[aria-label="Pedido sin confirmar"]');
}

/**
 * El panel de conciliación: es donde vive el mensaje de estado de la
 * resolución. Cuando la resolución es RECEIVED o NOT_RECEIVED el aviso
 * «Pedido sin confirmar» muestra EL MISMO texto, así que una búsqueda suelta
 * dentro del diálogo coincide con DOS elementos. La aserción se acota al
 * panel para comprobar exactamente el mensaje de la conciliación.
 */
function reconciliationPanel(dialog: Locator) {
  return dialog.getByTestId("checkout-reconciliation");
}

/** El mensaje de estado de la conciliación, dentro de su panel. */
function resolutionStatus(dialog: Locator, status: keyof typeof RESOLUTION_MESSAGES) {
  return reconciliationPanel(dialog).getByText(RESOLUTION_MESSAGES[status], { exact: true });
}

function expectNoOrders(calls: Network): void {
  expect(calls.publicOrderPayloads).toEqual([]);
  expect(calls.distributorOrderCalls).toEqual([]);
  expect(calls.externalCalls).toEqual([]);
}

test.describe("checkout público (sin regresiones)", () => {
  test("el checkout público sigue confirmando el pedido", async ({ page }) => {
    const calls = await mockNetwork(page, { session: "anonymous", publicOrder: "complete" });
    await seedCart(page);
    await page.goto("/");
    const dialog = await openCheckout(page);
    await dialog.getByLabel("Nombre y apellido *").fill("Cliente de prueba");
    await dialog.getByLabel("Razón social *").fill("Empresa de prueba");
    await dialog.getByLabel("Correo electrónico *").fill("cliente@example.com");

    /* Si el entorno no tiene Turnstile configurado no se puede enviar un
       pedido: se informa y se omite (no se instala nada). */
    const unconfigured = dialog
      .getByRole("alert")
      .filter({ hasText: "La verificación de seguridad no está configurada" });
    if ((await unconfigured.count()) > 0) {
      test.skip(
        true,
        "El entorno no tiene Turnstile configurado (VITE_TURNSTILE_SITE_KEY o VITE_TURNSTILE_ENABLED=false): no se puede enviar un pedido público de prueba.",
      );
    }

    await dialog.getByRole("button", { name: "Enviar pedido", exact: true }).click();

    const confirmation = page.getByRole("dialog", { name: "¡Pedido enviado con éxito!", exact: true });
    await expect(confirmation).toBeVisible();
    /* La pantalla de confirmación NO muestra ninguna referencia ni el id. */
    await expect(confirmation).not.toContainText(
      /RS-|[a-f0-9]{8}-[a-f0-9-]{27,}|NÚMERO DE PEDIDO|idempotencyKey/i,
    );
    expect(await confirmation.evaluate(node => node.outerHTML)).not.toContain(ORDER_ID);
    expect(calls.publicOrderPayloads).toHaveLength(1);
    expect(calls.distributorOrderCalls).toEqual([]);
  });

  test("el pedido público incierto no ofrece la consulta de conciliación", async ({ page }) => {
    const calls = await mockNetwork(page, { session: "anonymous" });
    await seedCart(page);
    await seedAttempt(page, {
      reference: PUBLIC_REFERENCE,
      channel: "public",
      withSession: false,
    });
    await page.goto("/");
    const dialog = await openCheckout(page);

    /* Sin la sesión del pedido original el checkout bloquea… */
    await expect(dialog.getByRole("alert").first()).toContainText(
      "No está disponible el pedido original completo",
    );
    /* …y el canal PÚBLICO conserva la paridad con origin/main: ni la
       referencia, ni el aviso de «Pedido sin confirmar», ni el contacto de
       RealStep (todo eso es del canal distribuidor). */
    await expect(uncertainNotice(dialog)).toHaveCount(0);
    await expect(dialog.getByText(PUBLIC_REFERENCE, { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Copiar referencia" })).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "WhatsApp comercial de RealStep" })).toHaveCount(0);
    /* …y el canal público no tiene mecanismo de conciliación. */
    await expect(dialog.getByRole("button", { name: "Consultar estado del pedido" })).toHaveCount(0);
    await expect(dialog.locator(".checkout-reconciliation")).toHaveCount(0);

    expect(calls.resolutionCalls).toEqual([]);
    expectNoOrders(calls);
  });
});

test.describe("distribuidores sin conciliación administrativa", () => {
  for (const status of ["accepted", "processing", "UNKNOWN", "UNRESOLVED"]) {
    test(`${status}: el histórico se conserva y no bloquea una compra nueva`, async ({ page }) => {
      const calls = await mockNetwork(page);
      await seedCart(page);
      await seedAttempt(page, { reference: REFERENCE, channel: "distributor", withSession: true, status });
      await page.goto("/");
      const before = await page.evaluate(() => [localStorage.getItem("starvie-order-attempt-v2-distributor"), sessionStorage.getItem("starvie-order-attempt-v2-distributor-session")]);
      const dialog = await openCheckout(page);
      await expect(dialog.getByLabel("Nombre y apellido *")).toBeEditable();
      await expect(dialog.getByLabel("Nombre y apellido *")).toHaveValue("");
      await expect(dialog.getByText(REFERENCE, { exact: true })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: /Consultar estado|Resolver intento|Continuar con el envío/ })).toHaveCount(0);
      await expect(dialog.getByRole("checkbox")).toHaveCount(0);
      expect(await page.evaluate(() => [localStorage.getItem("starvie-order-attempt-v2-distributor"), sessionStorage.getItem("starvie-order-attempt-v2-distributor-session")])).toEqual(before);
      expect(calls.resolutionCalls).toEqual([]);
      expectNoOrders(calls);
    });
  }
});
