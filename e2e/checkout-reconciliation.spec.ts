import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

/**
 * Conciliación del canal DISTRIBUIDOR + no regresión del checkout público
 * (S9). Todo es MOCK: no hay red real, no hay pedidos reales, no hay correos.
 *
 * Qué se comprueba:
 *  · el checkout público sigue confirmando el pedido;
 *  · el checkout público incierto NO ofrece la consulta de conciliación;
 *  · el canal distribuidor SÍ ofrece «Consultar estado del pedido»;
 *  · la consulta es UNA lectura (GET) y NO genera ningún pedido;
 *  · RECEIVED informa y no habilita reenvíos;
 *  · RECEIVED sobre un intento 'failed' del distribuidor CIERRA el intento y
 *    no envía ningún pedido nuevo;
 *  · NOT_RECEIVED informa y no envía nada por sí solo;
 *  · UNRESOLVED / UNKNOWN / EXPIRED mantienen el bloqueo, la referencia y el
 *    contacto real de RealStep;
 *  · ninguna consulta de conciliación genera pedidos ni correos.
 *
 * Requisitos del entorno:
 *  · la integración de distribuidores existe en el navegador cuando
 *    `VITE_DISTRIBUTOR_API_BASE_URL` está definido al iniciar el servidor de
 *    desarrollo (en este repositorio lo define el `.env.local`); sin esa
 *    variable el catálogo arranca en modo público y estos escenarios no
 *    tienen sentido;
 *  · el escenario que ENVÍA un pedido público necesita Turnstile configurado
 *    (`VITE_TURNSTILE_SITE_KEY`, con el widget simulado aquí) o desactivado
 *    (`VITE_TURNSTILE_ENABLED=false`): si el entorno no lo tiene, ese test
 *    se omite con un motivo explícito (no se instala nada).
 *
 * Limitación conocida (documentada a propósito): la prueba viva de sesión
 * del intento (`src/commerce/orderAttemptContext.ts`) vive SOLO en memoria.
 * Un intento sembrado desde `localStorage` en una página nueva no la tiene,
 * así que el canal distribuidor queda bloqueado de forma conservadora. Por
 * eso las acciones que exigen continuidad de sesión («Iniciar una nueva
 * compra», «Continuar con el envío») aparecen DESHABILITADAS: la
 * protección real está en el manejador, no en el atributo `disabled`, y este
 * archivo lo comprueba quitando ese atributo y pulsando igual.
 *
 * El escenario de RECEIVED sobre un intento 'failed' NO siembra el intento:
 * lo crea la propia aplicación al enviar un pedido que el servidor deja en
 * 'failed' (502 con orderId). Así el intento tiene su prueba viva de sesión
 * y la transición se puede observar de verdad.
 */

const REFERENCE = "0df502b3-51aa-461d-a1b6-19363712c567";
const PUBLIC_REFERENCE = "11111111-2222-4333-8444-555555555555";
const ORDER_ID = "RS-8dc011f4-40a3-4ca6-9ce9-2e9d11a9277b";
const LINES = [{ productId: "raptor+", qty: 2 }];
const LIST_PRICE = 372000;
const NET_UNIT_PRICE = 297600;

/** Mensajes de la conciliación, uno por estado del servidor. */
const RESOLUTION_MESSAGES: Record<string, string> = {
  RECEIVED: "RealStep confirmó la recepción de este pedido.",
  NOT_RECEIVED:
    "RealStep registró una resolución administrativa de no recepción: este pedido no fue recibido.",
  UNRESOLVED: "RealStep todavía no pudo determinar el resultado de este pedido.",
  UNKNOWN: "No hay información suficiente para determinar el resultado de este pedido.",
  EXPIRED: "El registro original de este pedido expiró y no se puede determinar su resultado.",
};

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

  /* 3) Sesión del distribuidor (cookie HttpOnly: el frontend nunca la ve). */
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
          ? { discountPercent: 20, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }
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
    /* …pero conserva la referencia para poder consultar a RealStep… */
    await expect(
      uncertainNotice(dialog).getByText(PUBLIC_REFERENCE, { exact: true }),
    ).toBeVisible();
    /* …y el canal público no tiene mecanismo de conciliación. */
    await expect(dialog.getByRole("button", { name: "Consultar estado del pedido" })).toHaveCount(0);
    await expect(dialog.getByText(/no tiene un mecanismo verificable/)).toBeVisible();

    expect(calls.resolutionCalls).toEqual([]);
    expectNoOrders(calls);
  });
});

test.describe("conciliación del canal distribuidor", () => {
  async function openDistributorCheckout(page: Page) {
    await page.goto("/");
    /* La sesión simulada del distribuidor deja el catálogo en modo
       distribuidor: el distintivo del header lo confirma. */
    await expect(page.locator(".distributor-account__badge")).toHaveText("Distribuidor");
    return openCheckout(page);
  }

  test("el distribuidor consulta la conciliación: una sola lectura y ningún pedido", async ({ page }) => {
    const calls = await mockNetwork(page, {
      resolution: {
        status: 200,
        body: { ok: true, reference: REFERENCE, status: "UNRESOLVED", decidedAt: null },
      },
    });
    await seedCart(page);
    await seedAttempt(page, {
      reference: REFERENCE,
      channel: "distributor",
      withSession: true,
    });
    const dialog = await openDistributorCheckout(page);

    /* El intento sembrado no tiene prueba viva de sesión (sólo memoria): el
       checkout queda bloqueado de forma conservadora, pero la consulta sigue
       disponible. */
    await expect(dialog.getByRole("alert").first()).toContainText(
      "Este pedido pertenece a otro canal o a otra sesión",
    );
    await expect(
      uncertainNotice(dialog).getByText(REFERENCE, { exact: true }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Consultar estado del pedido" }).click();
    await expect(dialog.getByText(RESOLUTION_MESSAGES.UNRESOLVED)).toBeVisible();

    /* Exactamente UNA lectura de la conciliación, con la referencia
       consultada… */
    expect(calls.resolutionCalls).toHaveLength(1);
    expect(calls.resolutionCalls[0]).toContain("/api/distributor/order-resolution?reference=");
    expect(calls.resolutionCalls[0]).toContain(REFERENCE);
    /* …y NINGÚN pedido (ni público ni de distribuidores). */
    expectNoOrders(calls);
  });

  test("RECEIVED: informa la recepción y no habilita ningún reenvío", async ({ page }) => {
    const calls = await mockNetwork(page, {
      resolution: {
        status: 200,
        body: {
          ok: true,
          reference: REFERENCE,
          status: "RECEIVED",
          decidedAt: "2026-11-12T10:00:00.000Z",
        },
      },
    });
    await seedCart(page);
    await seedAttempt(page, {
      reference: REFERENCE,
      channel: "distributor",
      withSession: true,
    });
    const dialog = await openDistributorCheckout(page);

    await dialog.getByRole("button", { name: "Consultar estado del pedido" }).click();
    await expect(dialog.getByText(RESOLUTION_MESSAGES.RECEIVED)).toBeVisible();

    /* El pedido recibido no se reenvía: no hay botón de reintento ni de envío. */
    await expect(dialog.getByRole("button", { name: "Reintentar envío", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Enviar pedido", exact: true })).toHaveCount(0);
    /* La compra nueva existe como acción explícita, pero sin prueba viva de
       sesión (sólo memoria) queda deshabilitada: la transición no se
       autoriza sola. */
    await expect(dialog.getByRole("button", { name: "Iniciar una nueva compra", exact: true })).toBeDisabled();

    expectNoOrders(calls);
  });

  test("RECEIVED sobre un intento 'failed': cierra el intento y no envía ningún pedido nuevo", async ({ page }) => {
    const calls = await mockNetwork(page, {
      distributorOrder: "failed",
      echoResolutionReference: true,
      resolution: {
        status: 200,
        body: {
          ok: true,
          reference: REFERENCE,
          status: "RECEIVED",
          decidedAt: "2026-11-12T10:00:00.000Z",
        },
      },
    });
    await seedCart(page);
    const dialog = await openDistributorCheckout(page);

    /* El intento NO se siembra: lo crea la propia aplicación al enviar un
       pedido que el servidor deja en 'failed'. Así tiene su prueba viva de
       sesión (que sólo vive en memoria) y la transición se puede observar. */
    await dialog.getByLabel("Nombre y apellido *").fill("Cliente de prueba");
    await dialog.getByLabel("Razón social *").fill("Empresa de prueba");
    await dialog.getByLabel("Correo electrónico *").fill("cliente@example.com");

    const unconfigured = dialog
      .getByRole("alert")
      .filter({ hasText: "La verificación de seguridad no está configurada" });
    if ((await unconfigured.count()) > 0) {
      test.skip(
        true,
        "El entorno no tiene Turnstile configurado (VITE_TURNSTILE_SITE_KEY o VITE_TURNSTILE_ENABLED=false): no se puede crear el intento de prueba.",
      );
    }

    await dialog.getByRole("button", { name: "Enviar pedido", exact: true }).click();

    /* El servidor conservó el pedido: el intento queda en 'failed' y su
       referencia sigue visible. */
    await expect(dialog.getByText(/El pedido falló definitivamente/)).toBeVisible();
    const marker = JSON.parse(
      (await page.evaluate(
        (key) => localStorage.getItem(key),
        DISTRIBUTOR_ATTEMPT_MARKER_KEY,
      )) ?? "{}",
    ) as { status?: string; idempotencyKey?: string };
    expect(marker.status).toBe("failed");
    const reference = marker.idempotencyKey ?? "";
    expect(reference).not.toBe("");
    await expect(
      uncertainNotice(dialog).getByText(reference, { exact: true }),
    ).toBeVisible();

    /* La conciliación auténtica con RECEIVED habilita el cierre. */
    await dialog.getByRole("button", { name: "Consultar estado del pedido" }).click();
    await expect(dialog.getByText(RESOLUTION_MESSAGES.RECEIVED)).toBeVisible();
    const newPurchase = dialog.getByRole("button", { name: "Iniciar una nueva compra", exact: true });
    await expect(newPurchase).toBeEnabled();

    await newPurchase.click();

    /* La transición ocurre: el intento queda cerrado (marcador y sesión). */
    await expect
      .poll(() => page.evaluate(
        (key) => localStorage.getItem(key),
        DISTRIBUTOR_ATTEMPT_MARKER_KEY,
      ))
      .toBeNull();
    expect(
      await page.evaluate(
        (key) => sessionStorage.getItem(key),
        DISTRIBUTOR_ATTEMPT_SESSION_KEY,
      ),
    ).toBeNull();
    /* Y NO se envía ningún pedido nuevo: el único POST fue el del intento
       que falló, y la conciliación no reenvía nada. */
    expect(calls.distributorOrderCalls).toHaveLength(1);
    expect(calls.publicOrderPayloads).toEqual([]);
    expect(calls.externalCalls).toEqual([]);
    /* La referencia anterior no se borra en silencio: sigue a la vista. */
    await expect(
      dialog.getByText(reference, { exact: true }).first(),
    ).toBeVisible();
  });

  test("NOT_RECEIVED: informa la no recepción y continuar no envía nada por sí solo", async ({ page }) => {
    const calls = await mockNetwork(page, {
      resolution: {
        status: 200,
        body: {
          ok: true,
          reference: REFERENCE,
          status: "NOT_RECEIVED",
          decidedAt: "2026-11-12T10:00:00.000Z",
        },
      },
    });
    await seedCart(page);
    await seedAttempt(page, {
      reference: REFERENCE,
      channel: "distributor",
      withSession: true,
    });
    const dialog = await openDistributorCheckout(page);

    await dialog.getByRole("button", { name: "Consultar estado del pedido" }).click();
    await expect(dialog.getByText(RESOLUTION_MESSAGES.NOT_RECEIVED)).toBeVisible();

    const continueButton = dialog.getByRole("button", { name: "Continuar con el envío", exact: true });
    await expect(continueButton).toBeVisible();
    await expect(continueButton).toBeDisabled();

    /* Se quita el atributo `disabled` para pulsar igual: la protección real
       está en el manejador (prueba viva de sesión), no en el atributo. */
    await continueButton.evaluate((node: HTMLButtonElement) => {
      node.disabled = false;
    });
    await continueButton.click();

    /* Ni un pedido, ni un correo, y el registro del intento sigue intacto. */
    expectNoOrders(calls);
    expect(await page.evaluate(
      (key) => localStorage.getItem(key),
      DISTRIBUTOR_ATTEMPT_MARKER_KEY,
    )).not.toBeNull();
    expect(await page.evaluate(
      (key) => sessionStorage.getItem(key),
      DISTRIBUTOR_ATTEMPT_SESSION_KEY,
    )).not.toBeNull();
  });

  for (const status of ["UNRESOLVED", "UNKNOWN", "EXPIRED"] as const) {
    test(`${status}: mantiene el bloqueo, la referencia y el contacto real`, async ({ page }) => {
      const calls = await mockNetwork(page, {
        resolution: {
          status: 200,
          body: { ok: true, reference: REFERENCE, status, decidedAt: null },
        },
      });
      await seedCart(page);
      await seedAttempt(page, {
        reference: REFERENCE,
        channel: "distributor",
        withSession: true,
      });
      const dialog = await openDistributorCheckout(page);

      await dialog.getByRole("button", { name: "Consultar estado del pedido" }).click();
      await expect(dialog.getByText(RESOLUTION_MESSAGES[status])).toBeVisible();

      /* La referencia se conserva… */
      await expect(
        uncertainNotice(dialog).getByText(REFERENCE, { exact: true }),
      ).toBeVisible();
      /* …y el contacto real de RealStep sigue disponible. */
      const whatsapp = dialog.getByRole("link", { name: "WhatsApp comercial de RealStep" });
      await expect(whatsapp).toBeVisible();
      await expect(whatsapp).toHaveAttribute("href", "https://wa.me/5492235440976");
      /* El bloqueo sigue: ninguna acción lo levanta. */
      await expect(dialog.getByRole("alert").first()).toContainText(
        "Este pedido pertenece a otro canal o a otra sesión",
      );
      await expect(dialog.getByRole("button", { name: "Iniciar una nueva compra", exact: true })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "Continuar con el envío", exact: true })).toHaveCount(0);

      expectNoOrders(calls);
    });
  }

  test("una consulta de conciliación no genera pedidos ni correos", async ({ page }) => {
    const calls = await mockNetwork(page, {
      resolution: {
        status: 200,
        body: { ok: true, reference: REFERENCE, status: "UNKNOWN", decidedAt: null },
      },
    });
    await seedCart(page);
    await seedAttempt(page, {
      reference: REFERENCE,
      channel: "distributor",
      withSession: true,
    });
    const dialog = await openDistributorCheckout(page);

    const before = await page.evaluate((keys) => ({
      marker: localStorage.getItem(keys.marker),
      session: sessionStorage.getItem(keys.session),
    }), attemptKeys("distributor"));

    await dialog.getByRole("button", { name: "Consultar estado del pedido" }).click();
    await expect(dialog.getByText(RESOLUTION_MESSAGES.UNKNOWN)).toBeVisible();

    /* Sólo lectura: ni pedidos, ni correos, ni una referencia nueva. */
    expect(calls.resolutionCalls).toHaveLength(1);
    expectNoOrders(calls);
    /* Ni un correo: el frontend no habla con ningún servicio de correo. */
    expect(
      calls.externalCalls.filter(url => /mail|smtp|sendgrid|postmark|resend/i.test(url)),
    ).toEqual([]);
    const after = await page.evaluate((keys) => ({
      marker: localStorage.getItem(keys.marker),
      session: sessionStorage.getItem(keys.session),
    }), attemptKeys("distributor"));
    expect(after).toEqual(before);
  });
});
