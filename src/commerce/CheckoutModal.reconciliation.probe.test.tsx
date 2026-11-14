/**
 * SONDA INDEPENDIENTE #3 — integración en el modal de checkout
 * (src/commerce/CheckoutModal.tsx).
 *
 * Escenarios propios del verificador (no una copia de los tests del
 * candidato): sólo lectura, no-mutación, aislamiento de sesión, respuesta
 * vieja, integridad de referencia y no-regresión del canal público.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutModal } from "./CheckoutModal";
import { rememberAttemptContext } from "./orderAttemptContext";
import type { CommerceProduct, PresentedLine } from "./types";

const REF = "0df502b3-51aa-461d-a1b6-19363712c567";
const OTHER_REF = "11111111-2222-4333-8444-555555555555";
const LOCAL_KEY = "starvie-order-attempt-v2";
const SESSION_KEY = "starvie-order-attempt-v2-session";
const PUBLIC_DISCLAIMER =
  "Consultar con RealStep no habilita por sí solo una compra nueva: este catálogo todavía no tiene un mecanismo verificable para resolverlo manualmente.";

const PROOF_A = { status: "authenticated" as const, discountPercent: 20, expiresAt: "2026-01-01T00:00:00.000Z", tag: "A" };
const PROOF_B = { status: "authenticated" as const, discountPercent: 20, expiresAt: "2026-01-01T00:00:00.000Z", tag: "B" };

const product = {
  id: "raptor+", sku: "PSTRP41000", nombre: "Raptor+", categoria: "palas",
  subcategoria: "super-pro", precio: 500, disponible: true, imagenes: [], gama: "",
  tipoJuego: "", forma: "", plano: "", peso: "", balance: "", ean: "", pagina: 17,
} as unknown as CommerceProduct;
const presented: PresentedLine[] = [{ line: { productId: "raptor+", qty: 2 }, product, subtotal: 1000 }];

function hashStorage(): string {
  const raw = [localStorage.getItem(LOCAL_KEY) ?? "", sessionStorage.getItem(SESSION_KEY) ?? ""].join("|");
  /* Compara los bytes crudos: sin dependencias de Node. */
  return raw;
}

type Seed = { reference?: string; status?: string; channel?: "distributor" | "public"; createdAt?: string };

function seed(seedOptions: Seed = {}): void {
  const reference = seedOptions.reference ?? REF;
  const status = seedOptions.status ?? "accepted";
  const channel = seedOptions.channel ?? "distributor";
  const createdAt = seedOptions.createdAt ?? new Date().toISOString();
  const lines = [{ productId: "raptor+", qty: 2 }];
  const marker = { version: "v2", idempotencyKey: reference, orderId: null, lines, createdAt, status, channel };
  localStorage.setItem(LOCAL_KEY, JSON.stringify(marker));
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    ...marker,
    contact: { name: "Cliente", legalName: "Empresa", email: "cliente@example.test" },
  }));
  rememberAttemptContext(reference, { channel, distributorProof: PROOF_A });
}

function resolutionBody(status: string, reference = REF) {
  return { ok: true, reference, status, decidedAt: null };
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body } as unknown as Response;
}

function renderDistributor(overrides: Partial<React.ComponentProps<typeof CheckoutModal>> = {}) {
  const clearCart = overrides.clearCart ?? vi.fn();
  const submitFn = overrides.submitFn ?? vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" }));
  const props: React.ComponentProps<typeof CheckoutModal> = {
    open: true,
    onClose: vi.fn(),
    presented,
    total: 1000,
    clearCart,
    submitFn,
    distributorMode: true,
    distributorSessionProof: PROOF_A,
    distributorDiscountPercent: 20,
    distributorTotal: 800,
    distributorNetByProduct: { "raptor+": 800 },
    ...overrides,
  };
  const utils = render(<CheckoutModal {...props} />);
  return { ...utils, clearCart, submitFn, props };
}

beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://probe.invalid");
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("P3 · la consulta es de sólo lectura y no muta nada", () => {
  it("P3.1 un único GET con la referencia persistida; ningún pedido, ninguna clave nueva", async () => {
    seed();
    const fetchMock = vi.fn(async () => jsonResponse(200, resolutionBody("RECEIVED")));
    vi.stubGlobal("fetch", fetchMock);
    const uuid = vi.spyOn(globalThis.crypto, "randomUUID");
    const { submitFn } = renderDistributor();
    const before = hashStorage();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const calls = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const [rawUrl, init] = calls[0] as [string, RequestInit];
    const url = new URL(String(rawUrl));
    expect(url.pathname).toBe("/api/distributor/order-resolution");
    expect([...url.searchParams.keys()]).toEqual(["reference"]);
    expect(url.searchParams.get("reference")).toBe(REF);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    /* Ningún pedido, ningún correo: sólo la lectura. */
    expect(calls).toHaveLength(1);
    expect(String(rawUrl)).not.toContain("/orders");
    expect(submitFn).not.toHaveBeenCalled();
    /* La consulta NO muta el estado persistido ni genera una clave. */
    expect(hashStorage()).toBe(before);
    expect(uuid).not.toHaveBeenCalled();
  });

  it("P3.2 no hay consulta automática ni sondeo", async () => {
    seed();
    const fetchMock = vi.fn(async () => jsonResponse(200, resolutionBody("RECEIVED")));
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("P3 · aislamiento de sesión", () => {
  it("P3.3 una respuesta que llega tras cambiar de cuenta NO se aplica", async () => {
    seed();
    let release: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(<CheckoutModal {...({
      open: true, onClose: vi.fn(), presented, total: 1000, clearCart: vi.fn(),
      submitFn: vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" })),
      distributorMode: true, distributorSessionProof: PROOF_B,
      distributorDiscountPercent: 20, distributorTotal: 800,
      distributorNetByProduct: { "raptor+": 800 },
    } as React.ComponentProps<typeof CheckoutModal>)} />);

    await act(async () => { release!(jsonResponse(200, resolutionBody("RECEIVED"))); });

    await screen.findByText(/La sesión cambió durante la consulta/);
    expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
    expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it("P3.4 una resolución obtenida con la cuenta A NO libera nada con la cuenta B", async () => {
    seed();
    const fetchMock = vi.fn(async () => jsonResponse(200, resolutionBody("RECEIVED")));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findAllByText(/RealStep confirmó la recepción/);
    const before = hashStorage();

    /* Cambia la cuenta con la resolución ya en memoria. */
    rerender(<CheckoutModal {...({
      open: true, onClose: vi.fn(), presented, total: 1000, clearCart: vi.fn(),
      submitFn: vi.fn(async () => ({ kind: "unknown" as const, error: "sin red" })),
      distributorMode: true, distributorSessionProof: PROOF_B,
      distributorDiscountPercent: 20, distributorTotal: 800,
      distributorNetByProduct: { "raptor+": 800 },
    } as React.ComponentProps<typeof CheckoutModal>)} />);

    const button = screen.getByRole("button", { name: "Iniciar una nueva compra" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    /* Aunque se fuerce el clic (quitando el atributo disabled), el manejador
       no puede liberar el intento de otra cuenta. */
    button.removeAttribute("disabled");
    await act(async () => { fireEvent.click(button); });
    expect(hashStorage()).toBe(before);
    expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
  });

  it("P3.5 una respuesta VIEJA (de una consulta anterior) no pisa la vigente", async () => {
    seed();
    const resolvers: ((value: Response) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolvers.push(resolve); }));
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor();

    const button = screen.getByRole("button", { name: "Consultar estado del pedido" });
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    /* Llega primero la respuesta de la consulta MÁS RECIENTE. */
    await act(async () => { resolvers[1](jsonResponse(200, resolutionBody("RECEIVED"))); });
    /* Y después, tarde, la de la consulta anterior. */
    await act(async () => { resolvers[0](jsonResponse(200, resolutionBody("NOT_RECEIVED"))); });

    await screen.findAllByText(/RealStep confirmó la recepción/);
    expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
    expect(screen.getByRole("button", { name: "Iniciar una nueva compra" })).toBeEnabled();
  });
});

describe("P3 · protección frente a pedidos duplicados", () => {
  it("P3.6 RECEIVED no reenvía nada por sí solo y la compra nueva usa una clave NUEVA", async () => {
    seed();
    const fetchMock = vi.fn(async () => jsonResponse(200, resolutionBody("RECEIVED")));
    vi.stubGlobal("fetch", fetchMock);
    const { clearCart, submitFn } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findAllByText(/RealStep confirmó la recepción/);
    /* RECEIVED: no hay botón de reenvío y no se envía nada solo. */
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
    expect(submitFn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Iniciar una nueva compra" }));
    await waitFor(() => expect(clearCart).toHaveBeenCalledOnce());
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    /* La referencia anterior sigue visible: no se borra en silencio. */
    expect(screen.getAllByText(REF).length).toBeGreaterThan(0);

    /* La compra nueva (explícita) arranca con una clave DISTINTA: se
       reabre el checkout (como haría el usuario tras vaciar el carrito) y
       se envía. */
    cleanup();
    const second = renderDistributor({ submitFn });
    fireEvent.change(document.querySelector("#checkout-name")!, { target: { value: "Cliente" } });
    fireEvent.change(document.querySelector("#checkout-legalname")!, { target: { value: "Empresa" } });
    fireEvent.change(document.querySelector("#checkout-email")!, { target: { value: "cliente@example.test" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(1));
    const payload = (submitFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { idempotencyKey: string };
    expect(payload.idempotencyKey).not.toBe(REF);
    expect(payload.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    second.unmount();
  });

  it("P3.7 NOT_RECEIVED no envía solo y conserva la MISMA referencia", async () => {
    seed();
    const fetchMock = vi.fn(async () => jsonResponse(200, resolutionBody("NOT_RECEIVED")));
    vi.stubGlobal("fetch", fetchMock);
    const { submitFn } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findAllByText(/RealStep registró una resolución administrativa de no recepción/);
    expect(submitFn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continuar con el envío" }));
    const marker = JSON.parse(localStorage.getItem(LOCAL_KEY)!);
    expect(marker.idempotencyKey).toBe(REF);
    expect(submitFn).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
  });

  it("P3.8 un intento 'failed' SE libera con un RECEIVED auténtico", async () => {
    seed({ status: "failed" });
    const fetchMock = vi.fn(async () => jsonResponse(200, resolutionBody("RECEIVED")));
    vi.stubGlobal("fetch", fetchMock);
    const { clearCart, submitFn } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findAllByText(/RealStep confirmó la recepción/);

    /* Con RECEIVED el servidor confirmó la recepción: no queda nada pendiente
       que pueda duplicarse, así que el intento se cierra incluso con estado
       local 'failed'. */
    const button = screen.getByRole("button", { name: "Iniciar una nueva compra" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await act(async () => { fireEvent.click(button); });

    await waitFor(() => expect(clearCart).toHaveBeenCalledOnce());
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    /* La compra nueva vuelve a estar disponible… */
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    /* …pero NO se envía ningún pedido por sí solo. */
    expect(submitFn).not.toHaveBeenCalled();
    /* La referencia anterior sigue visible: no se borra en silencio. */
    expect(screen.getAllByText(REF).length).toBeGreaterThan(0);
  });

  for (const status of ["failed", "conflict"]) {
    it(`P3.8b un intento '${status}' NO se libera con NOT_RECEIVED (no amplía permisos)`, async () => {
      seed({ status });
      const fetchMock = vi.fn(async () => jsonResponse(200, resolutionBody("NOT_RECEIVED")));
      vi.stubGlobal("fetch", fetchMock);
      const { clearCart, submitFn } = renderDistributor();

      fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
      await screen.findAllByText(/RealStep registró una resolución administrativa de no recepción/);
      const before = hashStorage();

      const continueButton = screen.getByRole("button", { name: "Continuar con el envío" });
      expect(continueButton).toBeEnabled();
      await act(async () => { fireEvent.click(continueButton); });

      /* El rechazo es explícito y el almacenamiento queda byte a byte igual. */
      await screen.findByText(
        "RealStep registró que este pedido no fue recibido, pero este resultado no alcanza para cerrar el intento. Conservamos su referencia; consultá a RealStep.",
      );
      expect(hashStorage()).toBe(before);
      expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
      expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
      expect(clearCart).not.toHaveBeenCalled();
      expect(submitFn).not.toHaveBeenCalled();
    });
  }

  it("P3.9 un fallo técnico (503) o un eco ajeno mantienen el bloqueo", async () => {
    seed();
    const fetchMock = vi.fn(async () => jsonResponse(503, { ok: false }));
    vi.stubGlobal("fetch", fetchMock);
    const { submitFn } = renderDistributor();
    const before = hashStorage();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findByText(/La consulta de resolución no está disponible/);
    expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
    expect(hashStorage()).toBe(before);
    expect(submitFn).not.toHaveBeenCalled();

    /* Y una respuesta que=echa otra referencia tampoco. */
    const foreign = vi.fn(async () => jsonResponse(200, resolutionBody("RECEIVED", OTHER_REF)));
    vi.stubGlobal("fetch", foreign);
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await waitFor(() => expect(foreign).toHaveBeenCalledTimes(1));
    await screen.findByText(/No pudimos consultar la resolución del pedido/);
    expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
    expect(hashStorage()).toBe(before);
  });
});

describe("P3 · integridad de la referencia y no-regresión del canal público", () => {
  it("P3.10 la referencia consultada y mostrada es la persistida", async () => {
    seed({ reference: OTHER_REF });
    const fetchMock = vi.fn(async () => jsonResponse(200, resolutionBody("RECEIVED", OTHER_REF)));
    vi.stubGlobal("fetch", fetchMock);
    renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]));
    expect(url.searchParams.get("reference")).toBe(OTHER_REF);
    expect(screen.getAllByText(OTHER_REF).length).toBeGreaterThan(0);
    expect(screen.queryByText(REF)).toBeNull();
  });

  it("P3.12 NOT_RECEIVED con un intento vencido: cierra el registro pero conserva la referencia y el carrito", async () => {
    seed({ createdAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
    const fetchMock = vi.fn(async () => jsonResponse(200, resolutionBody("NOT_RECEIVED")));
    vi.stubGlobal("fetch", fetchMock);
    const { clearCart, submitFn } = renderDistributor();

    fireEvent.click(screen.getByRole("button", { name: "Consultar estado del pedido" }));
    await screen.findAllByText(/RealStep registró una resolución administrativa de no recepción/);
    fireEvent.click(screen.getByRole("button", { name: "Continuar con el envío" }));

    await waitFor(() => expect(localStorage.getItem(LOCAL_KEY)).toBeNull());
    /* La referencia previa NO se borra en silencio: sigue a la vista. */
    expect(screen.getAllByText(REF).length).toBeGreaterThan(0);
    /* El carrito no se toca y nada se envía solo. */
    expect(clearCart).not.toHaveBeenCalled();
    expect(submitFn).not.toHaveBeenCalled();
  });

  it("P3.11 el canal público no gana ninguna capacidad de conciliación", async () => {
    seed({ channel: "public" });
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

    /* Sin botón de consulta y sin ninguna llamada. */
    expect(screen.queryByRole("button", { name: "Consultar estado del pedido" })).toBeNull();
    expect(screen.queryByText(/Consultar estado del pedido/)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetchMock).not.toHaveBeenCalled();

    /* El aviso público conserva el texto original de origin/main: sólo el
       párrafo de error, sin referencia, sin copia y sin contacto. */
    expect(screen.queryByText(PUBLIC_DISCLAIMER)).toBeNull();
    expect(screen.queryByRole("button", { name: "Copiar referencia" })).toBeNull();
    expect(screen.queryByRole("link", { name: "WhatsApp comercial de RealStep" })).toBeNull();
    expect(screen.queryByText(REF)).toBeNull();
    /* Ni una acción ni una resolución nueva en el checkout público. */
    expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
    expect(screen.queryByText(/RealStep confirmó la recepción/)).toBeNull();
    /* Los pasos de envío del checkout público no cambian. */
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
    const inputs = [...document.querySelectorAll("input, textarea")].map((node) => node.id).sort();
    expect(inputs).toEqual([
      "checkout-address", "checkout-city", "checkout-cuit", "checkout-email",
      "checkout-legalname", "checkout-name", "checkout-notes", "checkout-phone",
      "checkout-province",
    ]);
  });
});
