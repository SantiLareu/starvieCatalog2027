import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutModal } from "./CheckoutModal";
import { rememberAttemptContext } from "./orderAttemptContext";
import type { CommerceProduct, PresentedLine } from "./types";

/**
 * Conciliación administrativa del canal distribuidor.
 *
 * Todo es MOCK: no hay red, no hay pedidos reales y no hay correos. La
 * consulta se hace contra el cliente HTTP real (`fetchDistributorOrderResolution`)
 * con un `fetch` global simulado.
 */

const REFERENCE = "0df502b3-51aa-461d-a1b6-19363712c567";
const OTHER_REFERENCE = "11111111-2222-4333-8444-555555555555";

/**
 * Huella de VALOR de la sesión ("v1:<descuento>:<vencimiento>"): el
 * checkout la compara por valor, así que una revalidación de la MISMA
 * sesión conserva la huella.
 */
const SESSION_FINGERPRINT = "v1:20:2026-11-20T20:00:00.000Z";

/** Segunda cuenta: otra huella de sesión (otro vencimiento). */
const OTHER_SESSION_FINGERPRINT = "v1:20:2026-11-21T20:00:00.000Z";

/* La conciliación es exclusiva del canal distribuidor: su compartmento. */
const LOCAL_KEY = "starvie-order-attempt-v2-distributor";
const SESSION_KEY = "starvie-order-attempt-v2-distributor-session";

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

type JsonResponseInit = { status?: number; body: unknown };

function jsonResponse({ status = 200, body }: JsonResponseInit): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

function seedAttempt(options: { status?: string; channel?: "distributor" | "public" } = {}) {
  const status = options.status ?? "accepted";
  const channel = options.channel ?? "distributor";
  const createdAt = new Date().toISOString();
  const lines = [{ productId: "raptor+", qty: 2 }];
  const marker = { version: "v2", idempotencyKey: REFERENCE, orderId: null, lines, createdAt, status, channel };
  localStorage.setItem(LOCAL_KEY, JSON.stringify(marker));
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    ...marker,
    contact: { name: "Cliente de prueba", legalName: "Empresa de prueba", email: "cliente@example.test" },
  }));
  rememberAttemptContext(REFERENCE, { channel, distributorProof: SESSION_FINGERPRINT });
}

function resolutionBody(status: string, reference = REFERENCE, decidedAt: string | null = null) {
  return { ok: true, reference, status, decidedAt };
}

/** Bytes crudos del marcador y de la sesión: para comparar sin mutar. */
function storageBytes(): string {
  return [
    localStorage.getItem(LOCAL_KEY) ?? "",
    sessionStorage.getItem(SESSION_KEY) ?? "",
  ].join("|");
}

/** Completa los campos obligatorios del formulario de compra. */
function fillContact(): void {
  fireEvent.change(document.querySelector("#checkout-name")!, { target: { value: "Cliente de prueba" } });
  fireEvent.change(document.querySelector("#checkout-legalname")!, { target: { value: "Empresa de prueba" } });
  fireEvent.change(document.querySelector("#checkout-email")!, { target: { value: "cliente@example.test" } });
}

/** Clave nueva y válida que se genera para la compra independiente. */
const NEW_KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function renderDistributor(overrides: Partial<React.ComponentProps<typeof CheckoutModal>> = {}) {
  const clearCart = overrides.clearCart ?? vi.fn();
  const submitFn = overrides.submitFn ?? vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" }));
  const utils = render(
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
      submitFn={submitFn}
      {...overrides}
    />,
  );
  return { ...utils, clearCart, submitFn };
}

beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("CheckoutModal · consulta de conciliación (RECEIVED)", () => {
  it("informa la recepción, no reenvía el pedido y ofrece una compra nueva explícita", async () => {
    seedAttempt();
    const fetchMock = vi.fn(async () => jsonResponse({ body: resolutionBody("RECEIVED", REFERENCE, "2026-11-12T10:00:00.000Z") }));
    vi.stubGlobal("fetch", fetchMock);
    const { clearCart, submitFn } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));

    await screen.findAllByText("RealStep confirmó la recepción de este pedido.");
    /* La consulta es un GET de sólo lectura: ningún pedido, ningún correo. */
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/distributor/order-resolution?reference=");
    expect(init.method).toBe("GET");
    expect(submitFn).not.toHaveBeenCalled();
    /* Con la recepción confirmada no se puede reenviar el pedido. */
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
    expect(clearCart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Iniciar una nueva compra" }));

    await waitFor(() => expect(clearCart).toHaveBeenCalledOnce());
    /* El intento anterior queda cerrado: la compra nueva usa una clave nueva. */
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    /* La referencia anterior no se borra en silencio: sigue a la vista. */
    expect(screen.getAllByText(REFERENCE).length).toBeGreaterThan(0);
    /* La compra nueva se puede enviar: la recepción ya no bloquea el envío
       de un intento que no es el consultado. */
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
  });
});

describe("CheckoutModal · consulta de conciliación (NOT_RECEIVED)", () => {
  it("no envía solo: habilita continuar con la misma referencia y sin reusar un token", async () => {
    seedAttempt();
    const fetchMock = vi.fn(async () => jsonResponse({ body: resolutionBody("NOT_RECEIVED", REFERENCE, "2026-11-12T10:00:00.000Z") }));
    vi.stubGlobal("fetch", fetchMock);
    const { submitFn } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));

    await screen.findAllByText(/RealStep registró una resolución administrativa de no recepción/);
    expect(submitFn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continuar con el envío" }));

    /* El reenvío conserva la MISMA referencia: no se genera otra clave. */
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
    const marker = JSON.parse(localStorage.getItem(LOCAL_KEY)!);
    expect(marker.idempotencyKey).toBe(REFERENCE);
  });

  it("con el intento vencido cierra el registro y permite un envío nuevo con clave nueva", async () => {
    seedAttempt({ status: "accepted" });
    /* Se hace vencer el intento (fuera de la ventana de retención). */
    const createdAt = new Date(Date.now() - 25 * 3600_000).toISOString();
    const lines = [{ productId: "raptor+", qty: 2 }];
    const marker = { version: "v2", idempotencyKey: REFERENCE, orderId: null, lines, createdAt, status: "accepted", channel: "distributor" };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(marker));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      ...marker,
      contact: { name: "Cliente de prueba", legalName: "Empresa de prueba", email: "cliente@example.test" },
    }));

    const fetchMock = vi.fn(async () => jsonResponse({ body: resolutionBody("NOT_RECEIVED") }));
    vi.stubGlobal("fetch", fetchMock);
    const { clearCart } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findAllByText(/RealStep registró una resolución administrativa de no recepción/);

    fireEvent.click(screen.getByRole("button", { name: "Continuar con el envío" }));

    await waitFor(() => expect(localStorage.getItem(LOCAL_KEY)).toBeNull());
    /* La referencia anterior sigue visible y el carrito no se borra. */
    expect(screen.getAllByText(REFERENCE).length).toBeGreaterThan(0);
    expect(clearCart).not.toHaveBeenCalled();
  });
});

describe("CheckoutModal · la decisión RECEIVED cierra también los estados terminales", () => {
  for (const status of ["failed", "conflict"]) {
    it(`'${status}' + RECEIVED auténtico => cierra el intento y habilita una compra nueva con clave nueva`, async () => {
      seedAttempt({ status });
      const fetchMock = vi.fn(async () => jsonResponse({ body: resolutionBody("RECEIVED", REFERENCE, "2026-11-12T10:00:00.000Z") }));
      vi.stubGlobal("fetch", fetchMock);
      const uuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
        NEW_KEY as ReturnType<typeof globalThis.crypto.randomUUID>,
      );
      const { clearCart, submitFn } = renderDistributor();

      fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
      await screen.findAllByText("RealStep confirmó la recepción de este pedido.");

      /* El servidor confirmó la recepción: el cierre es posible aunque el
         intento haya quedado en un estado terminal. */
      const newPurchase = screen.getByRole("button", { name: "Iniciar una nueva compra" }) as HTMLButtonElement;
      expect(newPurchase.disabled).toBe(false);

      fireEvent.click(newPurchase);

      await waitFor(() => expect(clearCart).toHaveBeenCalledOnce());
      /* El intento anterior queda cerrado: marcador y sesión fuera. */
      expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
      /* La referencia anterior no se borra en silencio: sigue a la vista. */
      expect(screen.getAllByText(REFERENCE).length).toBeGreaterThan(0);
      /* Y la compra nueva está disponible… */
      expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();

      /* …con una clave DISTINTA: no se reenvía el pedido anterior. */
      fillContact();
      await waitFor(() => expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
      await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(1));
      const payload = (submitFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
        idempotencyKey: string;
      };
      expect(payload.idempotencyKey).toBe(NEW_KEY);
      expect(payload.idempotencyKey).not.toBe(REFERENCE);
      expect(uuid).toHaveBeenCalled();
    });

    it(`'${status}' + NOT_RECEIVED => sigue bloqueado (la decisión no amplía permisos)`, async () => {
      seedAttempt({ status });
      const fetchMock = vi.fn(async () => jsonResponse({ body: resolutionBody("NOT_RECEIVED", REFERENCE, "2026-11-12T10:00:00.000Z") }));
      vi.stubGlobal("fetch", fetchMock);
      const { clearCart, submitFn } = renderDistributor();

      fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
      await screen.findAllByText(/RealStep registró una resolución administrativa de no recepción/);
      const before = storageBytes();

      fireEvent.click(screen.getByRole("button", { name: "Continuar con el envío" }));

      /* El rechazo es explícito y el registro del intento no se toca. */
      await screen.findByText(
        "RealStep registró que este pedido no fue recibido, pero este resultado no alcanza para cerrar el intento. Conservamos su referencia; consultá a RealStep.",
      );
      expect(storageBytes()).toBe(before);
      expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
      expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
      expect(clearCart).not.toHaveBeenCalled();
      expect(submitFn).not.toHaveBeenCalled();
    });

    it(`'${status}' sin conciliación => sigue bloqueado (no hay ninguna acción de cierre)`, () => {
      seedAttempt({ status });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { submitFn } = renderDistributor();
      const before = storageBytes();

      expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(storageBytes()).toBe(before);
      expect(submitFn).not.toHaveBeenCalled();
    });
  }
});

describe("CheckoutModal · estados que mantienen el bloqueo", () => {
  for (const status of ["UNRESOLVED", "UNKNOWN", "EXPIRED"]) {
    it(`${status} conserva el bloqueo, la referencia y el carrito`, async () => {
      seedAttempt();
      const fetchMock = vi.fn(async () => jsonResponse({ body: resolutionBody(status) }));
      vi.stubGlobal("fetch", fetchMock);
      const { clearCart, submitFn } = renderDistributor();

      fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      expect(screen.getAllByText(REFERENCE).length).toBeGreaterThan(0);
      /* El contacto real de RealStep sigue disponible. */
      expect(screen.getByRole("link", { name: "WhatsApp comercial de RealStep" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
      expect(submitFn).not.toHaveBeenCalled();
      expect(clearCart).not.toHaveBeenCalled();
      expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
    });
  }

  it("un registro EXPIRED en el backend se informa como tal y no habilita nada", async () => {
    seedAttempt();
    const fetchMock = vi.fn(async () => jsonResponse({ body: resolutionBody("EXPIRED") }));
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findByText(/El registro original de este pedido expiró/);
    expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
  });
});

describe("CheckoutModal · fallos técnicos nunca desbloquean", () => {
  it("sin sesión de distribuidor no hay botón de consulta", () => {
    seedAttempt();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor({ distributorSessionFingerprint: null });

    expect(screen.queryByRole("button", { name: "Consultar estado del pedido" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("error de red: mantiene el bloqueo y ofrece una nueva consulta", async () => {
    seedAttempt();
    const fetchMock = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetchMock);
    const { submitFn } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));

    await screen.findByText(/No pudimos consultar la resolución del pedido/);
    expect(screen.getByRole("button", { name: "Consultar estado del pedido" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
    expect(submitFn).not.toHaveBeenCalled();
  });

  it("401: la sesión venció y el pedido sigue bloqueado", async () => {
    seedAttempt();
    const fetchMock = vi.fn(async () => jsonResponse({ status: 401, body: { ok: false, error: "Unauthorized" } }));
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));

    await screen.findByText(/Tu sesión de distribuidor venció/);
    expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
  });

  it("404: la conciliación no está disponible y no se interpreta como resolución", async () => {
    seedAttempt();
    const fetchMock = vi.fn(async () => jsonResponse({ status: 404, body: { ok: false, error: "Not found" } }));
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));

    await screen.findByText(/La consulta de resolución no está disponible/);
    expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
  });

  it("5xx: el fallo del servidor no habilita ninguna transición", async () => {
    seedAttempt();
    const fetchMock = vi.fn(async () => jsonResponse({ status: 500, body: { ok: false } }));
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));

    await screen.findByText(/No pudimos consultar la resolución del pedido/);
    expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
  });

  it("una respuesta de otra referencia no se aplica", async () => {
    seedAttempt();
    const fetchMock = vi.fn(async () => jsonResponse({ body: resolutionBody("RECEIVED", OTHER_REFERENCE) }));
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));

    /* El eco de otra referencia no es confiable: el cliente lo rechaza y el
       checkout lo trata como fallo técnico, nunca como resolución. */
    await screen.findByText(/No pudimos consultar la resolución del pedido/);
    expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
    expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
  });
});

describe("CheckoutModal · aislamiento de sesión", () => {
  it("descarta la respuesta si la cuenta cambió durante la consulta", async () => {
    seedAttempt();
    let release: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    /* Cambia la cuenta mientras la consulta está en vuelo. */
    rerender(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={OTHER_SESSION_FINGERPRINT}
        distributorDiscountPercent={20}
        distributorTotal={800}
        distributorNetByProduct={{ "raptor+": 800 }}
        submitFn={vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" }))}
      />,
    );

    await act(async () => {
      release!(jsonResponse({ body: resolutionBody("RECEIVED") }));
    });

    await screen.findByText(/La sesión cambió durante la consulta/);
    /* No se libera el intento ni se ofrece una compra nueva. */
    expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
    expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
  });

  it("una respuesta vieja no pisa la respuesta vigente", async () => {
    seedAttempt();
    const resolvers: ((value: Response) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolvers.push(resolve); }));
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor();

    const button = screen.getByRole("button", { name: "Consultar estado del pedido" });
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    /* La primera respuesta llega tarde con un estado que ya no vigente. */
    await act(async () => {
      resolvers[0](jsonResponse({ body: resolutionBody("RECEIVED") }));
    });
    await act(async () => {
      resolvers[1](jsonResponse({ body: resolutionBody("NOT_RECEIVED") }));
    });

    await screen.findAllByText(/RealStep registró una resolución administrativa de no recepción/);
    expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continuar con el envío" })).toBeVisible();
  });
});

describe("CheckoutModal · el checkout público no cambia", () => {
  it("el canal público no ofrece la consulta de conciliación", async () => {
    const createdAt = new Date().toISOString();
    const lines = [{ productId: "raptor+", qty: 2 }];
    const marker = { version: "v2", idempotencyKey: REFERENCE, orderId: null, lines, createdAt, status: "accepted", channel: "public" };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(marker));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      ...marker,
      contact: { name: "Cliente de prueba", legalName: "Empresa de prueba", email: "cliente@example.test" },
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        submitFn={vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" }))}
      />,
    );

    expect(screen.queryByRole("button", { name: "Consultar estado del pedido" })).toBeNull();
    /* El canal público conserva el aviso de origin/main: sólo el párrafo de
       error, sin referencia, sin copia y sin contacto de RealStep. */
    expect(screen.queryByText(/no tiene un mecanismo verificable para resolverlo/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Copiar referencia" })).toBeNull();
    expect(screen.queryByRole("link", { name: "WhatsApp comercial de RealStep" })).toBeNull();
    expect(screen.queryByText(REFERENCE)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
