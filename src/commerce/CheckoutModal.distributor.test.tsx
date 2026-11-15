import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutModal } from "./CheckoutModal";
import { submitDistributorOrder } from "./distributor/client";
import * as orderAttempt from "./orderAttempt";
import { rememberAttemptContext } from "./orderAttemptContext";
import type { OrderPayload } from "./orders";
import type { CommerceProduct, PresentedLine } from "./types";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete window.turnstile;
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

/**
 * Prueba de continuidad de la sesión de distribuidor: el IDENTIFICADOR
 * OPACO DE SESIÓN que devuelve el backend. El canal distribuidor lo exige:
 * sin él el checkout no prepara, no reenvía, no libera ni concilia nada.
 * Es estable durante la vida de la sesión (una revalidación de la MISMA
 * sesión devuelve el mismo identificador).
 */
const SESSION_FINGERPRINT = "Zk3vJ8xQ1nT5pR7wY2bA";
/** Otra sesión del backend (otra cuenta u otro login). */
const OTHER_SESSION_FINGERPRINT = "Q7wY2bA0Zk3vJ8xQ1nT5pR";

const product = {
  id: "raptor+",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 500,
  disponible: true,
  imagenes: ["products/palas/RAPTOR/RAPTOR1.3.webp"],
  gama: "",
  tipoJuego: "",
  forma: "",
  plano: "",
  peso: "",
  balance: "",
  ean: "",
  pagina: 17,
} as CommerceProduct;

const presented: PresentedLine[] = [
  { line: { productId: "raptor+", qty: 2 }, product, subtotal: 1000 },
];

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Nombre y apellido *"), {
    target: { value: "Santiago Lareu" },
  });
  fireEvent.change(screen.getByLabelText("Razón social *"), {
    target: { value: "StarVie Padel SAS" },
  });
  fireEvent.change(screen.getByLabelText("Correo electrónico *"), {
    target: { value: "santi@example.com" },
  });
}

describe("CheckoutModal · un 401 distribuidor nunca se reintenta como pedido público (D1)", () => {
  it("conserva carrito y clave, pide reingreso y reintenta por la misma vía", async () => {
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
    const onDistributorSessionExpired = vi.fn();
    const submitFn = vi.fn(async (_payload: OrderPayload) => ({
      kind: "sessionExpired" as const,
      error: "Tu sesión de distribuidor venció. Volvé a ingresar para enviar el pedido con tu descuento.",
    }));
    const clearCart = vi.fn();
    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={clearCart}
        distributorMode
        distributorSessionFingerprint={SESSION_FINGERPRINT}
        distributorDiscountPercent={20}
        distributorTotal={800}
        distributorNetByProduct={{ "raptor+": 800 }}
        onDistributorSessionExpired={onDistributorSessionExpired}
        submitFn={submitFn}
      />,
    );

    expect(screen.getByText(/Total distribuidor/, { selector: "span" })).toBeVisible();
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

    await waitFor(() => expect(submitFn).toHaveBeenCalledOnce());
    expect(onDistributorSessionExpired).toHaveBeenCalledOnce();
    await screen.findByText(/Tu sesión de distribuidor venció/);
    expect(clearCart).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();

    // El reintento usa la misma vía distribuidor y la misma clave: jamás pública.
    fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
    await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(2));
    const first = vi.mocked(submitFn).mock.calls[0][0];
    const second = vi.mocked(submitFn).mock.calls[1][0];
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.lines).toEqual(first.lines);
    expect(clearCart).not.toHaveBeenCalled();
  });
});

describe("CheckoutModal · el descuento sólo se muestra cuando está confirmado (C1)", () => {
  function renderCheckout(discountConfirmed?: boolean) {
    return render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={SESSION_FINGERPRINT}
        distributorDiscountPercent={20}
        distributorDiscountConfirmed={discountConfirmed}
        distributorTotal={800}
        distributorNetByProduct={{ "raptor+": 800 }}
        submitFn={vi.fn(async () => ({ kind: "completed" as const, orderId: "o1" }))}
      />,
    );
  }

  function distributorTotalLabel(): HTMLElement {
    return document.querySelector(".checkout-total--distributor span") as HTMLElement;
  }

  it("no muestra el porcentaje de descuento mientras no está confirmado", () => {
    renderCheckout(false);
    expect(distributorTotalLabel()).toHaveTextContent("Total distribuidor");
    expect(distributorTotalLabel()).not.toHaveTextContent("20% de descuento");
  });

  it("muestra el porcentaje de descuento cuando la cotización lo confirma", () => {
    renderCheckout(true);
    expect(distributorTotalLabel()).toHaveTextContent("20% de descuento");
  });
});

/* ══════════════════════════════════════════════════════════════════
 * Turnstile en el canal distribuidor (mocks; nunca red real).
 *
 * Contrato del backend candidato (catálogo "starvie", acción
 * "order_starvie"): el token viaja en el cuerpo del POST y se consume una
 * sola vez; 400 "Turnstile token is required" y 403 "Turnstile
 * verification failed" NO crean pedido; 503 "Turnstile verification
 * unavailable" tampoco crea pedido (la verificación no estuvo
 * disponible). El reintento de un pedido ya conocido NO lleva token.
 * ══════════════════════════════════════════════════════════════════ */

const TEST_SITEKEY = "1x00000000000000000000AA";

type WidgetOptions = {
  sitekey: string;
  action: string;
  size: string;
  appearance: string;
  execution: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

/** Widget Turnstile simulado: una sola instancia, una acción, un sitio. */
function enableMockTurnstile() {
  vi.stubEnv("VITE_TURNSTILE_ENABLED", "true");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", TEST_SITEKEY);
  let callbacks: WidgetOptions | null = null;
  const api = {
    render: vi.fn((_node: HTMLElement, options: WidgetOptions) => {
      callbacks = options;
      return "test-widget";
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api as unknown as NonNullable<typeof window.turnstile>;
  return {
    api,
    callbacks: () => {
      if (!callbacks) throw new Error("Widget was not rendered");
      return callbacks;
    },
  };
}

type OrderCall = {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  /** Volcado del storage en el instante del POST: el token no se persiste. */
  storageAtSend: { local: string; session: string };
};

function storageDump(storage: Storage): string {
  const parts: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null) continue;
    parts.push(`${key}=${storage.getItem(key)}`);
  }
  return parts.join("\n");
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => data,
  } as unknown as Response;
}

/** Doble estricto de fetch: registra cada POST y nunca toca la red. */
function mockDistributorFetch(
  handler: (call: OrderCall, index: number) => Response,
): { calls: OrderCall[]; fetchImpl: typeof fetch } {
  const calls: OrderCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = null;
      }
    }
    const call: OrderCall = {
      url,
      method,
      body,
      storageAtSend: {
        local: storageDump(localStorage),
        session: storageDump(sessionStorage),
      },
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

/** El cliente real de distribuidores, con el fetch doblado (nunca red). */
function distributorSubmit(fetchImpl: typeof fetch) {
  return (payload: OrderPayload, options?: { turnstileToken?: string }) =>
    submitDistributorOrder(payload, { ...options, fetchImpl });
}

function renderDistributorCheckout(submitFn: ReturnType<typeof distributorSubmit>) {
  return render(
    <CheckoutModal
      open
      onClose={vi.fn()}
      presented={presented}
      total={1000}
      clearCart={vi.fn()}
      distributorMode
      distributorSessionFingerprint={SESSION_FINGERPRINT}
      distributorDiscountPercent={20}
      distributorTotal={800}
      distributorNetByProduct={{ "raptor+": 800 }}
      submitFn={submitFn}
    />,
  );
}

const TOKEN = "token-distribuidor-1";
const TOKEN_NUEVO = "token-distribuidor-2";

describe("CheckoutModal distribuidor · Turnstile", () => {
  it("usa el MISMO widget, exige token antes del primer POST y lo envía una sola vez", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    const widget = enableMockTurnstile();
    const { calls, fetchImpl } = mockDistributorFetch(() =>
      jsonResponse({ ok: true, orderId: "ord-1", status: "completed" }, 201),
    );
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();

    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    /* Un único captcha: el widget compartido, con la acción y el sitio
       que espera el backend. */
    expect(widget.api.render.mock.calls[0][1]).toMatchObject({
      sitekey: TEST_SITEKEY,
      action: "order_starvie",
    });
    expect(document.querySelectorAll(".checkout-turnstile")).toHaveLength(1);
    expect(screen.getByLabelText("Verificación de seguridad")).toBeInTheDocument();

    /* Sin token no se puede enviar: ni POST ni intento creado. */
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
    expect(localStorage.getItem("starvie-order-attempt-v2-distributor")).toBeNull();

    act(() => widget.callbacks().callback(TOKEN));
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe("https://distributor.test/api/distributor/orders");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body?.turnstileToken).toBe(TOKEN);
    expect(calls[0].body).not.toHaveProperty("catalogId");
    expect(calls[0].body?.lines).toEqual([{ productId: "raptor+", qty: 2 }]);
    expect(typeof calls[0].body?.idempotencyKey).toBe("string");

    /* El token no se persiste en ningún storage. */
    expect(calls[0].storageAtSend.local).not.toContain(TOKEN);
    expect(calls[0].storageAtSend.session).not.toContain(TOKEN);

    await screen.findByRole("dialog", { name: "¡Pedido enviado con éxito!" });
    expect(localStorage.getItem("starvie-order-attempt-v2-distributor")).toBeNull();
    expect(sessionStorage.getItem("starvie-order-attempt-v2-distributor-session")).toBeNull();
  });

  it("sin token no hay POST ni intento creado, y el envío sigue bloqueado", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    const widget = enableMockTurnstile();
    const { calls, fetchImpl } = mockDistributorFetch(() =>
      jsonResponse({ ok: true, orderId: "ord-x", status: "completed" }, 201),
    );
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();

    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    const send = screen.getByRole("button", { name: "Enviar pedido" });
    /* El botón de envío permanece deshabilitado hasta que llega un token:
       la verificación de seguridad es la única vía de envío. El texto de
       guardia "Completá la verificación de seguridad antes de enviar el
       pedido" vive en una rama defensiva de `send()` que la UI no puede
       alcanzar (el botón nunca se habilita sin token); lo que se fija acá
       es la garantía exigida: sin token NO hay POST y NO hay intento. */
    expect(send).toBeDisabled();
    fireEvent.click(send);

    expect(calls).toHaveLength(0);
    expect(localStorage.getItem("starvie-order-attempt-v2-distributor")).toBeNull();
    expect(sessionStorage.getItem("starvie-order-attempt-v2-distributor-session")).toBeNull();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
    expect(document.querySelectorAll(".checkout-turnstile")).toHaveLength(1);
  });

  it("403 'Turnstile verification failed' pide un token nuevo y reintenta con la misma clave y el mismo payload", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    const widget = enableMockTurnstile();
    const { calls, fetchImpl } = mockDistributorFetch((_call, index) =>
      index === 0
        ? jsonResponse({ ok: false, error: "Turnstile verification failed" }, 403)
        : jsonResponse({ ok: true, orderId: "ord-2", status: "completed" }, 201),
    );
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();

    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    act(() => widget.callbacks().callback(TOKEN));
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body?.turnstileToken).toBe(TOKEN);

    /* Se pide una verificación nueva: el mismo widget, nunca dos captchas. */
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledTimes(2));
    expect(document.querySelectorAll(".checkout-turnstile")).toHaveLength(1);
    expect(
      screen.getByText("Se necesita una verificación nueva para continuar."),
    ).toBeVisible();
    const retry = screen.getByRole("button", { name: "Reintentar envío" });
    expect(retry).toBeDisabled();

    act(() => widget.callbacks().callback(TOKEN_NUEVO));
    expect(retry).toBeEnabled();
    fireEvent.click(retry);

    await waitFor(() => expect(calls).toHaveLength(2));
    /* El token consumido NO se reutiliza. */
    expect(calls[1].body?.turnstileToken).toBe(TOKEN_NUEVO);
    expect(calls[1].body?.turnstileToken).not.toBe(TOKEN);
    /* Misma clave y mismo payload: es el mismo pedido. */
    expect(calls[1].body?.idempotencyKey).toBe(calls[0].body?.idempotencyKey);
    expect(calls[1].body?.lines).toEqual(calls[0].body?.lines);
    expect(calls[1].body?.contact).toEqual(calls[0].body?.contact);
    await screen.findByRole("dialog", { name: "¡Pedido enviado con éxito!" });
  });

  it("400 'Turnstile token is required' exige verificación nueva y reintenta con la misma clave", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    const widget = enableMockTurnstile();
    const { calls, fetchImpl } = mockDistributorFetch((_call, index) =>
      index === 0
        ? jsonResponse({ ok: false, error: "Turnstile token is required" }, 400)
        : jsonResponse({ ok: true, orderId: "ord-3", status: "completed" }, 201),
    );
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();

    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    act(() => widget.callbacks().callback(TOKEN));
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.getByText("Se necesita una verificación nueva para continuar."),
      ).toBeVisible(),
    );
    const retry = screen.getByRole("button", { name: "Reintentar envío" });
    expect(retry).toBeDisabled();

    act(() => widget.callbacks().callback(TOKEN_NUEVO));
    fireEvent.click(retry);

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body?.turnstileToken).toBe(TOKEN_NUEVO);
    expect(calls[1].body?.idempotencyKey).toBe(calls[0].body?.idempotencyKey);
    expect(calls[1].body?.lines).toEqual(calls[0].body?.lines);
    expect(calls[1].body?.contact).toEqual(calls[0].body?.contact);
  });

  it("503 'Turnstile verification unavailable' no deja un intento incierto: pide token nuevo y reintenta igual", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    const widget = enableMockTurnstile();
    const { calls, fetchImpl } = mockDistributorFetch((_call, index) =>
      index === 0
        ? jsonResponse({ ok: false, error: "Turnstile verification unavailable" }, 503)
        : jsonResponse({ ok: true, orderId: "ord-4", status: "completed" }, 201),
    );
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();

    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    act(() => widget.callbacks().callback(TOKEN));
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

    await waitFor(() => expect(calls).toHaveLength(1));

    /* El backend NO creó ningún pedido: no puede quedar un intento
       marcado como aceptado-pero-no-confirmado, ni un aviso de "pedido
       sin confirmar" que le diga al usuario que no lo vuelva a enviar. */
    const marker = JSON.parse(localStorage.getItem("starvie-order-attempt-v2-distributor")!);
    expect(marker.status).not.toBe("accepted");
    expect(screen.queryByLabelText("Pedido sin confirmar")).toBeNull();
    expect(screen.queryByText(/No pudimos confirmar si RealStep recibió tu pedido/)).toBeNull();

    /* Se pide una verificación nueva (no un cierre de pedido incierto). */
    await waitFor(() =>
      expect(
        screen.getByText("Se necesita una verificación nueva para continuar."),
      ).toBeVisible(),
    );
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledTimes(2));
    expect(document.querySelectorAll(".checkout-turnstile")).toHaveLength(1);

    const retry = screen.getByRole("button", { name: "Reintentar envío" });
    expect(retry).toBeDisabled();
    act(() => widget.callbacks().callback(TOKEN_NUEVO));
    fireEvent.click(retry);

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body?.turnstileToken).toBe(TOKEN_NUEVO);
    expect(calls[1].body?.idempotencyKey).toBe(calls[0].body?.idempotencyKey);
    expect(calls[1].body?.lines).toEqual(calls[0].body?.lines);
    expect(calls[1].body?.contact).toEqual(calls[0].body?.contact);

    /* El pedido termina confirmado: no queda un intento que bloquee. */
    await screen.findByRole("dialog", { name: "¡Pedido enviado con éxito!" });
    expect(localStorage.getItem("starvie-order-attempt-v2-distributor")).toBeNull();
    expect(sessionStorage.getItem("starvie-order-attempt-v2-distributor-session")).toBeNull();
  });

  it("consultar un pedido ya aceptado NO lleva token y conserva la misma clave", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    const widget = enableMockTurnstile();
    const { calls, fetchImpl } = mockDistributorFetch((_call, index) =>
      index === 0
        ? jsonResponse({ ok: true, orderId: "ord-5", status: "processing" }, 202)
        : jsonResponse({ ok: true, orderId: "ord-5", status: "completed" }, 200),
    );
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();

    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    act(() => widget.callbacks().callback(TOKEN));
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body?.turnstileToken).toBe(TOKEN);
    await screen.findByText("Pedido recibido — en proceso.");
    /* En consulta no hay captcha: una sola instancia, nunca dos. */
    expect(document.querySelectorAll(".checkout-turnstile")).toHaveLength(0);
    expect(widget.api.render).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body).not.toHaveProperty("turnstileToken");
    expect(calls[1].body?.idempotencyKey).toBe(calls[0].body?.idempotencyKey);
    expect(calls[1].body?.lines).toEqual(calls[0].body?.lines);
    await screen.findByRole("dialog", { name: "¡Pedido enviado con éxito!" });
  });

  it("con Turnstile habilitado y sin site key falla cerrado antes de cualquier POST", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "true");
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    const { calls, fetchImpl } = mockDistributorFetch(() =>
      jsonResponse({ ok: true, orderId: "ord-y", status: "completed" }, 201),
    );
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();

    expect(
      screen.getByText(/La verificación de seguridad no está configurada/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
    expect(document.querySelectorAll(".checkout-turnstile")).toHaveLength(0);
    expect(calls).toHaveLength(0);
    expect(localStorage.getItem("starvie-order-attempt-v2-distributor")).toBeNull();
  });

  it("un resultado realmente incierto del canal distribuidor conserva su aviso de pedido sin confirmar", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    const widget = enableMockTurnstile();
    /* 503 que NO es de Turnstile: el cliente no puede afirmar que no se
       creó un pedido → sigue siendo un resultado incierto. */
    const { calls, fetchImpl } = mockDistributorFetch(() =>
      jsonResponse({ ok: false, error: "Service Unavailable" }, 503),
    );
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();

    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    act(() => widget.callbacks().callback(TOKEN));
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    await screen.findByLabelText("Pedido sin confirmar");
    expect(screen.getByText(/No pudimos confirmar si RealStep recibió tu pedido/)).toBeVisible();
    expect(JSON.parse(localStorage.getItem("starvie-order-attempt-v2-distributor")!).status).toBe("accepted");
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
  });
});

describe("CheckoutModal distribuidor · un intento incierto no se libera localmente", () => {
  it("un intento distribuidor incierto queda bloqueado, sin casilla ni botón, y conserva su referencia", () => {
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
    const prepared = orderAttempt.prepareAttempt(
      { name: "Santiago Lareu", legalName: "StarVie Padel SAS", email: "santi@example.com" },
      [{ productId: "raptor+", qty: 2 }],
      { channel: "distributor" },
    );
    expect(prepared).not.toBe(false);
    const key = (prepared as { idempotencyKey: string }).idempotencyKey;
    /* El servidor recibió el pedido y la respuesta se perdió. */
    orderAttempt.updateAttempt([{ productId: "raptor+", qty: 2 }], {
      orderId: "ord-dist",
      status: "accepted",
    });
    const markerBefore = localStorage.getItem("starvie-order-attempt-v2-distributor");
    const uuid = vi.spyOn(crypto, "randomUUID");
    const submitFn = vi.fn(async () => ({ kind: "completed" as const, orderId: "ord-nuevo" }));

    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        submitFn={submitFn}
      />,
    );

    /* Sin prueba viva el canal distribuidor no reenvía ni libera nada. */
    expect(screen.getByRole("alert")).toHaveTextContent(/pertenece a otro canal o a otra sesión/);
    expect(screen.queryByRole("checkbox", { name: /Confirmo que consulté/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
    expect(screen.getByText(key)).toBeVisible();
    expect(localStorage.getItem("starvie-order-attempt-v2-distributor")).toBe(markerBefore);
    expect(uuid).not.toHaveBeenCalled();
    expect(submitFn).not.toHaveBeenCalled();
    uuid.mockRestore();
  });
});

/* ══════════════════════════════════════════════════════════════════
 * Verificación de estados definitivos (canal distribuidor).
 *
 * La misma regla que en el canal público: la liberación local exige
 * evidencia de que NO queda un pedido pendiente en el servidor.
 *   validation → liberable (el servidor rechaza antes de crear el pedido).
 *   failed / conflict → NO liberables en NINGÚN canal.
 * ══════════════════════════════════════════════════════════════════ */
describe("CheckoutModal distribuidor · estados definitivos y liberación local", () => {
  const LOCAL_KEY = "starvie-order-attempt-v2-distributor";
  const SESSION_KEY = "starvie-order-attempt-v2-distributor-session";
  const RELEASE_BUTTON = "Resolver intento e iniciar nueva compra";

  beforeEach(() => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
  });

  it("502 failed: el terminal se conserva con su referencia y NO se libera", async () => {
    const { calls, fetchImpl } = mockDistributorFetch(() =>
      jsonResponse({ ok: false, status: "failed", orderId: "ord-f" }, 502));
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await screen.findByText(/El pedido falló definitivamente/);

    const key = JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey;
    const markerBefore = localStorage.getItem(LOCAL_KEY);
    const sessionBefore = sessionStorage.getItem(SESSION_KEY);
    const uuid = vi.spyOn(crypto, "randomUUID");

    expect.soft(screen.queryByRole("button", { name: RELEASE_BUTTON })).toBeNull();
    expect.soft(screen.queryByRole("checkbox", { name: /Confirmo que consulté/ })).toBeNull();
    expect.soft(screen.queryByText(key)).toBeInTheDocument();
    expect.soft(screen.queryByRole("button", { name: "Copiar referencia" })).toBeInTheDocument();
    expect.soft(screen.queryByRole("link", { name: "WhatsApp comercial de RealStep" })).toBeInTheDocument();
    /* El canal distribuidor dispone de conciliación verificable: el aviso
       lo declara y aclara que sólo la resolución del servidor habilita. */
    expect.soft(screen.queryByText(/Sólo una resolución de RealStep habilita continuar/i)).toBeInTheDocument();
    expect.soft(screen.queryByText(/El pedido llegó al servidor/)).toBeInTheDocument();

    const release = screen.queryByRole("button", { name: RELEASE_BUTTON });
    if (release) fireEvent.click(release);
    const send = screen.queryByRole("button", { name: /^(Enviar pedido|Reintentar envío)$/ });
    if (send) {
      fillValidForm();
      fireEvent.click(send);
    }

    expect.soft(localStorage.getItem(LOCAL_KEY)).toBe(markerBefore);
    expect.soft(sessionStorage.getItem(SESSION_KEY)).toBe(sessionBefore);
    expect.soft(uuid).not.toHaveBeenCalled();
    expect.soft(calls).toHaveLength(1);
    uuid.mockRestore();
  });

  it("409 conflict: el terminal se conserva con su referencia y NO se libera", async () => {
    const { calls, fetchImpl } = mockDistributorFetch(() =>
      jsonResponse({ ok: false, error: "Idempotency key already used with a different request" }, 409));
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await screen.findByText(/Idempotency key already used with a different request/);

    const key = JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey;
    const markerBefore = localStorage.getItem(LOCAL_KEY);
    const sessionBefore = sessionStorage.getItem(SESSION_KEY);
    const uuid = vi.spyOn(crypto, "randomUUID");

    expect.soft(screen.queryByRole("button", { name: RELEASE_BUTTON })).toBeNull();
    expect.soft(screen.queryByRole("checkbox", { name: /Confirmo que consulté/ })).toBeNull();
    expect.soft(screen.queryByText(key)).toBeInTheDocument();
    expect.soft(screen.queryByRole("button", { name: "Copiar referencia" })).toBeInTheDocument();
    expect.soft(screen.queryByRole("link", { name: "WhatsApp comercial de RealStep" })).toBeInTheDocument();
    expect.soft(screen.queryByText(/no se puede verificar desde el catálogo/)).toBeInTheDocument();

    const release = screen.queryByRole("button", { name: RELEASE_BUTTON });
    if (release) fireEvent.click(release);
    const send = screen.queryByRole("button", { name: /^(Enviar pedido|Reintentar envío)$/ });
    if (send) {
      fillValidForm();
      fireEvent.click(send);
    }

    expect.soft(localStorage.getItem(LOCAL_KEY)).toBe(markerBefore);
    expect.soft(sessionStorage.getItem(SESSION_KEY)).toBe(sessionBefore);
    expect.soft(uuid).not.toHaveBeenCalled();
    expect.soft(calls).toHaveLength(1);
    uuid.mockRestore();
  });

  it("400 validation: el rechazo definitivo NO atrapa al cliente y la liberación sigue disponible", async () => {
    const { calls, fetchImpl } = mockDistributorFetch(() =>
      jsonResponse({ ok: false, error: "Producto no disponible" }, 400));
    renderDistributorCheckout(distributorSubmit(fetchImpl));
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await screen.findByText("Producto no disponible");

    const firstKey = JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey;
    const release = screen.getByRole("button", { name: RELEASE_BUTTON });
    expect(release).toBeVisible();
    fireEvent.click(release);
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();

    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    const secondKey = JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });
});


/* ═════════════════════════════════════════════════
 * La prueba de continuidad es el identificador de sesión del backend.
 *
 * Sin identificador no hay continuidad: el intento no se reenvía, no se
 * libera ni se concilia, y el registro se conserva byte a byte.
 * ═════════════════════════════════════════════════ */
describe("CheckoutModal distribuidor · la prueba de continuidad es el identificador del backend", () => {
  const LOCAL_KEY = "starvie-order-attempt-v2-distributor";
  const SESSION_KEY = "starvie-order-attempt-v2-distributor-session";
  const contact = {
    name: "Santiago Lareu",
    legalName: "StarVie Padel SAS",
    email: "santi@example.com",
  };
  const lines = [{ productId: "raptor+", qty: 2 }];

  /** Siembra un intento distribuidor INCIERTO atado a una prueba. */
  function seedAttempt(proof: string | null): string {
    const prepared = orderAttempt.prepareAttempt(contact, lines, { channel: "distributor" });
    expect(prepared).not.toBe(false);
    const key = (prepared as { idempotencyKey: string }).idempotencyKey;
    orderAttempt.updateAttempt(lines, {
      channel: "distributor",
      orderId: "ord-dist",
      status: "accepted",
    });
    rememberAttemptContext(key, { channel: "distributor", distributorProof: proof });
    return key;
  }

  function renderCheckout(fingerprint: string | null) {
    return render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={fingerprint}
        distributorDiscountPercent={20}
        submitFn={vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" }))}
      />,
    );
  }

  beforeEach(() => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
  });

  it("la MISMA sesión (mismo identificador) deja el intento reenviable", async () => {
    const key = seedAttempt(SESSION_FINGERPRINT);
    const markerBefore = localStorage.getItem(LOCAL_KEY);
    renderCheckout(SESSION_FINGERPRINT);

    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
    expect(screen.queryByText(/pertenece a otro canal o a otra sesión/)).toBeNull();
    expect(localStorage.getItem(LOCAL_KEY)).toBe(markerBefore);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey).toBe(key);
  });

  it("otra sesión (otro identificador) NO reenvía el intento y conserva el registro", async () => {
    const key = seedAttempt(SESSION_FINGERPRINT);
    const markerBefore = localStorage.getItem(LOCAL_KEY);
    const submitFn = vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" }));
    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={OTHER_SESSION_FINGERPRINT}
        distributorDiscountPercent={20}
        submitFn={submitFn}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/pertenece a otro canal o a otra sesión/);
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    await waitFor(() => expect(submitFn).not.toHaveBeenCalled());
    /* El registro se conserva byte a byte: ni clave nueva, ni pedido. */
    expect(localStorage.getItem(LOCAL_KEY)).toBe(markerBefore);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey).toBe(key);
  });

  it("sin prueba (logout o backend sin identificador) NO reenvía ni libera y conserva el registro", async () => {
    const key = seedAttempt(SESSION_FINGERPRINT);
    const markerBefore = localStorage.getItem(LOCAL_KEY);
    const submitFn = vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" }));
    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={null}
        distributorDiscountPercent={20}
        submitFn={submitFn}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/pertenece a otro canal o a otra sesión/);
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    /* Sin prueba de continuidad tampoco hay liberación local. */
    expect(screen.queryByRole("checkbox", { name: /Confirmo que consult/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
    await waitFor(() => expect(submitFn).not.toHaveBeenCalled());
    expect(localStorage.getItem(LOCAL_KEY)).toBe(markerBefore);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey).toBe(key);
  });

  it("un rechazo DEFINITIVO sin pedido creado tampoco se libera sin prueba", () => {
    /* Estado liberable por resultado (validation) pero SIN prueba de
       continuidad: el registro no se borra. */
    const prepared = orderAttempt.prepareAttempt(contact, lines, { channel: "distributor" });
    expect(prepared).not.toBe(false);
    const key = (prepared as { idempotencyKey: string }).idempotencyKey;
    orderAttempt.updateAttempt(lines, {
      channel: "distributor",
      orderId: null,
      status: "validation",
    });
    const markerBefore = localStorage.getItem(LOCAL_KEY);
    renderCheckout(null);

    expect(screen.queryByRole("checkbox", { name: /Confirmo que consult/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
    expect(localStorage.getItem(LOCAL_KEY)).toBe(markerBefore);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey).toBe(key);
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it("con la MISMA sesión el pedido sigue conciliable: RECEIVED habilita la compra nueva", async () => {
    const key = seedAttempt(SESSION_FINGERPRINT);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ok: true,
        reference: key,
        status: "RECEIVED",
        decidedAt: "2026-11-20T10:00:00.000Z",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderCheckout(SESSION_FINGERPRINT);
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findAllByText("RealStep confirmó la recepción de este pedido.");

    const newPurchase = screen.getByRole("button", { name: "Iniciar una nueva compra" }) as HTMLButtonElement;
    expect(newPurchase.disabled).toBe(false);
  });

  it("con otra sesión la conciliación NO habilita el cierre", async () => {
    const key = seedAttempt(SESSION_FINGERPRINT);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ok: true,
        reference: key,
        status: "RECEIVED",
        decidedAt: "2026-11-20T10:00:00.000Z",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={OTHER_SESSION_FINGERPRINT}
        distributorDiscountPercent={20}
        submitFn={vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" }))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findAllByText("RealStep confirmó la recepción de este pedido.");
    const newPurchase = screen.getByRole("button", { name: "Iniciar una nueva compra" }) as HTMLButtonElement;
    expect(newPurchase.disabled).toBe(true);
    /* El registro se conserva: otra cuenta no cierra el pedido de nadie. */
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey).toBe(key);
  });
});
