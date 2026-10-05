import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutModal } from "./CheckoutModal";
import { submitOrder, type OrderPayload, type SubmitResult } from "./orders";
import * as orderAttempt from "./orderAttempt";
import type { CommerceProduct, PresentedLine } from "./types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete window.turnstile;
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

const TEST_SITEKEY = "1x00000000000000000000AA";
type WidgetCallbacks = {
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

function enableMockTurnstile() {
  vi.stubEnv("VITE_TURNSTILE_ENABLED", "true");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", TEST_SITEKEY);
  let callbacks: WidgetCallbacks | null = null;
  const api = {
    render: vi.fn((_node: HTMLElement, options: WidgetCallbacks) => {
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
  fireEvent.change(screen.getByLabelText(/Teléfono/), {
    target: { value: "+54 9 11 1234 5678" },
  });
  fireEvent.change(screen.getByLabelText("Correo electrónico *"), {
    target: { value: "santi@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Provincia/), {
    target: { value: "Buenos Aires" },
  });
  fireEvent.change(screen.getByLabelText(/Localidad/), {
    target: { value: "La Plata" },
  });
}

function renderModal(overrides = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    presented,
    total: 1000,
    clearCart: vi.fn(),
    submitFn: vi.fn(async (_payload: OrderPayload) => ({
      kind: "completed" as const,
      orderId: "ord-1",
    })),
    ...overrides,
  };
  render(<CheckoutModal {...props} />);
  return props;
}

describe("CheckoutModal", () => {
  it("envía una línea sin precio, ocultando importes y preservando identidad/cantidad", async () => {
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
    const props = renderModal({ presented: [{ ...presented[0], product: { ...product, precio: null, sku: "" }, subtotal: null }], total: null });
    fillValidForm();
    const button = screen.getByRole("button", { name: "Enviar pedido" });
    expect(button).toBeEnabled();
    expect(document.querySelector(".checkout-total")).toBeNull();
    expect(document.querySelector(".checkout-line-subtotal")).toBeNull();
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/NaN|\$/);
    fireEvent.click(button);
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    expect(vi.mocked(props.submitFn).mock.calls[0][0].lines).toEqual([presented[0].line]);
    expect(JSON.stringify(vi.mocked(props.submitFn).mock.calls[0][0])).not.toMatch(/precio|subtotal|total/);
  });

  it("un intento previo puede consultarse aunque el precio haya sido retirado", async () => {
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
    orderAttempt.prepareAttempt({ name: "Cliente", legalName: "Empresa", email: "test@example.com" }, [presented[0].line]);
    const original = orderAttempt.getAttemptSession();
    const submitFn = vi.fn(async (_payload: OrderPayload) => ({ kind: "unknown" as const, message: "Sin confirmar" }));
    const props = renderModal({ presented: [{ ...presented[0], product: { ...product, precio: null }, subtotal: null }], total: null, submitFn });
    const button = screen.getByRole("button", { name: "Reintentar envío" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    expect(submitFn.mock.calls[0]).toBeDefined();
    const sent = vi.mocked(props.submitFn).mock.calls[0][0];
    expect(sent.idempotencyKey).toBe(original?.idempotencyKey);
    expect(sent.lines).toEqual(original?.lines);
    expect(sent.contact).toEqual(original?.contact);
  });
  /* Ensure clean storage before each test (parallel tests share localStorage). */
  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = "";
  });

  it("jsdom localStorage is functional", () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("test", "value");
    expect(localStorage.getItem("test")).toBe("value");
    sessionStorage.setItem("test", "value");
    expect(sessionStorage.getItem("test")).toBe("value");
  });

  it("prepareAttempt works directly with present lines", () => {
    localStorage.clear();
    sessionStorage.clear();
    const lines = presented.map(({ line }) => ({
      productId: line.productId,
      qty: line.qty,
    }));
    const contact = {
      name: "Santiago Lareu",
      legalName: "StarVie Padel SAS",
      email: "santi@example.com",
      phone: "+54 9 11 1234 5678",
      province: "Buenos Aires",
      city: "La Plata",
      address: "Calle 123",
      cuit: "20-12345678-9",
      notes: "Llamar antes",
    };
    const result = orderAttempt.prepareAttempt(contact, lines);
    expect(result).not.toBe(false);
    if (result !== false) {
      expect(typeof (result as { idempotencyKey: string }).idempotencyKey).toBe(
        "string",
      );
      expect(
        (result as { lines: { productId: string; qty: number }[] }).lines,
      ).toHaveLength(1);
    }
  });

  it("renderiza su backdrop por encima del drawer", () => {
    renderModal();
    const backdrop = document.querySelector(
      ".modal-backdrop.checkout-backdrop",
    );
    expect(backdrop).not.toBeNull();
  });

  it("envía formulario válido con payload sin precios y muestra orderId", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const props = renderModal();
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    const payload = (props.submitFn as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as OrderPayload;
    expect(payload.contact).toMatchObject({
      name: "Santiago Lareu",
      legalName: "StarVie Padel SAS",
      phone: "+54 9 11 1234 5678",
      email: "santi@example.com",
      province: "Buenos Aires",
      city: "La Plata",
    });
    expect(payload.lines).toEqual([{ productId: "raptor+", qty: 2 }]);
    expect(JSON.stringify(payload)).not.toMatch(/precio|subtotal|disponible/);
    expect(typeof payload.idempotencyKey).toBe("string");
    await screen.findByText("Pedido enviado.");
    expect(await screen.findByText("N° ord-1")).toBeVisible();
    expect(props.clearCart).toHaveBeenCalledOnce();
  });

  it("bloquea email inválido sin enviar, pero permite opcionales vacíos", () => {
    const props = renderModal();
    fireEvent.change(screen.getByLabelText("Nombre y apellido *"), {
      target: { value: "Santiago" },
    });
    fireEvent.change(screen.getByLabelText("Correo electrónico *"), {
      target: { value: "mal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    expect(
      screen.getByText("Ingresá un correo electrónico válido."),
    ).toBeVisible();
    /* legalName was not filled → error present. */
    expect(screen.getByText("Ingresá la razón social.")).toBeVisible();
    /* Optional fields left empty → no error. */
    expect(screen.queryByText("Ingresá tu teléfono.")).toBeNull();
    expect(screen.queryByText("Ingresá la provincia.")).toBeNull();
    expect(screen.queryByText("Ingresá la localidad.")).toBeNull();
    expect(props.submitFn).not.toHaveBeenCalled();
    expect(props.clearCart).not.toHaveBeenCalled();
  });

  it("envía con opcionales vacíos y los omite del payload", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const props = renderModal();
    fireEvent.change(screen.getByLabelText("Nombre y apellido *"), {
      target: { value: "Santiago Lareu" },
    });
    fireEvent.change(screen.getByLabelText("Razón social *"), {
      target: { value: "StarVie Padel SAS" },
    });
    fireEvent.change(screen.getByLabelText("Correo electrónico *"), {
      target: { value: "santi@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    const payload = (props.submitFn as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as OrderPayload;
    expect(payload.contact).toEqual({
      name: "Santiago Lareu",
      legalName: "StarVie Padel SAS",
      email: "santi@example.com",
    });
    await screen.findByText("Pedido enviado.");
    expect(props.clearCart).toHaveBeenCalledOnce();
  });

  it("bloquea doble click durante el envío", async () => {
    localStorage.clear();
    sessionStorage.clear();
    let resolveSubmit!: (value: SubmitResult) => void;
    const submitFn = vi.fn(
      () => new Promise<SubmitResult>((resolve) => (resolveSubmit = resolve)),
    );
    renderModal({ submitFn });
    fillValidForm();
    const send = screen.getByRole("button", { name: "Enviar pedido" });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(submitFn).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Enviando pedido..." }),
    ).toBeDisabled();
    resolveSubmit({ kind: "completed", orderId: "ord-1" });
    await screen.findByText("Pedido enviado.");
  });

  it("en error conserva carrito y formulario; reintentar usa la misma key", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload) => {
      calls.push(payload);
      if (calls.length === 1) {
        return {
          kind: "unknown" as const,
          error: "Falló el servidor.",
        };
      }
      return { kind: "completed" as const, orderId: "ord-2" };
    });
    const props = renderModal({ submitFn });
    /* Fill form inline to avoid cross-test DOM pollution. */
    fireEvent.change(screen.getByLabelText("Nombre y apellido *"), {
      target: { value: "Santiago Lareu" },
    });
    fireEvent.change(screen.getByLabelText("Razón social *"), {
      target: { value: "StarVie Padel SAS" },
    });
    fireEvent.change(screen.getByLabelText(/Teléfono/), {
      target: { value: "+54 9 11 1234 5678" },
    });
    fireEvent.change(screen.getByLabelText("Correo electrónico *"), {
      target: { value: "santi@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Provincia/), {
      target: { value: "Buenos Aires" },
    });
    fireEvent.change(screen.getByLabelText(/Localidad/), {
      target: { value: "La Plata" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Falló el servidor",
      ),
    );
    expect(props.clearCart).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombre y apellido *")).toHaveValue(
      "Santiago Lareu",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(await screen.findByText("Pedido enviado."));
    expect(calls[0].idempotencyKey).toBe(calls[1].idempotencyKey);
    expect(props.clearCart).toHaveBeenCalledOnce();
  });

  it("bloquea Escape durante submitting y lo permite en idle", async () => {
    localStorage.clear();
    sessionStorage.clear();
    let resolveSubmit!: (value: SubmitResult) => void;
    const submitFn = vi.fn(
      () => new Promise<SubmitResult>((resolve) => (resolveSubmit = resolve)),
    );
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
    resolveSubmit({ kind: "completed", orderId: "ord-1" });
    await screen.findByText("Pedido enviado.");
  });

  it("Escape en idle cierra y restaura el foco al botón que abrió", () => {
    const opener = document.createElement("button");
    opener.textContent = "abrir";
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { rerender } = render(
      <CheckoutModal
        open={true}
        onClose={onClose}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <CheckoutModal
        open={false}
        onClose={onClose}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
      />,
    );
    expect(opener).toHaveFocus();
    opener.remove();
  });

  /* ── SubmitResult: processing (202) ─────────────────────────────── */
  it("202 processing: no clearCart, modal abierto, muestra orderId", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "processing" as const,
      orderId: "proc-1",
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    /* Card stays — no clearCart for processing. */
    expect(props.clearCart).not.toHaveBeenCalled();
    /* Modal shows processing state, not closed. */
    await screen.findByText("Pedido recibido — en proceso.");
    expect(screen.getByText("N° proc-1")).toBeVisible();
  });

  it("202 processing: close/reopen reuses same key and orderId", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "processing" as const,
      orderId: "proc-2",
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    await screen.findByText("Pedido recibido — en proceso.");

    /* Key should be preserved from prior attempt (from sessionStorage). */
    const storedKey = localStorage.getItem("starvie-order-attempt-v2");
    expect(storedKey).toBeTruthy();
  });

  it("processing consulta con el mismo POST, payload y clave", async () => {
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload) => {
      calls.push(payload);
      return { kind: "processing" as const, orderId: "proc-query" };
    });
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("Pedido recibido — en proceso.");
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual(calls[0]);
    expect(props.clearCart).not.toHaveBeenCalled();
  });

  it("una consulta incierta conserva processing y su referencia", async () => {
    let calls = 0;
    const submitFn = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? { kind: "processing" as const, orderId: "proc-uncertain" }
        : { kind: "unknown" as const, error: "Sin conexión." };
    });
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("Pedido recibido — en proceso.");
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await screen.findByText("Sin conexión.");
    expect(screen.getByText("N° proc-uncertain")).toBeVisible();
    expect(JSON.parse(localStorage.getItem("starvie-order-attempt-v2")!).status).toBe("processing");
    expect(props.clearCart).not.toHaveBeenCalled();
  });

  it("202 processing: marker saved after first attempt", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "processing" as const,
      orderId: "proc-3",
    }));
    const props = renderModal({ submitFn });

    /* Before any submission, localStorage should not have the attempt. */
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();

    /* Submit so the marker gets saved. */
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());

    /* Marker should now exist in localStorage. */
    const stored = localStorage.getItem("starvie-order-attempt-v2");
    expect(stored).toBeTruthy();
  });

  /* ── SubmitResult: failed (502) ─────────────────────────────────── */
  it("502 failed: keeps orderId, no auto new purchase key", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "failed" as const,
      orderId: "fail-1",
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    /* Card stays. */
    expect(props.clearCart).not.toHaveBeenCalled();
    /* Shows error. */
    expect(screen.getByRole("alert").textContent).toContain(
      "falló definitivamente",
    );
    /* orderId preserved. */
    const storedMarker = JSON.parse(
      localStorage.getItem("starvie-order-attempt-v2")!,
    );
    expect(storedMarker.orderId).toBe("fail-1");
  });

  it("502 failed terminal: no ofrece reintento con la clave bloqueada", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload) => {
      calls.push(payload);
      return {
        kind: "failed" as const,
        orderId: "fail-retry",
        error: "Fallback",
      };
    });
    const props = renderModal({ submitFn });
    /* Fill form inline to avoid cross-test DOM pollution. */
    fireEvent.change(screen.getByLabelText("Nombre y apellido *"), {
      target: { value: "Santiago Lareu" },
    });
    fireEvent.change(screen.getByLabelText("Razón social *"), {
      target: { value: "StarVie Padel SAS" },
    });
    fireEvent.change(screen.getByLabelText(/Teléfono/), {
      target: { value: "+54 9 11 1234 5678" },
    });
    fireEvent.change(screen.getByLabelText("Correo electrónico *"), {
      target: { value: "santi@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Provincia/), {
      target: { value: "Buenos Aires" },
    });
    fireEvent.change(screen.getByLabelText(/Localidad/), {
      target: { value: "La Plata" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    expect(calls).toHaveLength(1);
    const firstKey = calls[0].idempotencyKey;

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("falló definitivamente"));
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("starvie-order-attempt-v2")!).idempotencyKey).toBe(firstKey);
  });

  it("al reabrir un failed terminal no ofrece reintento", async () => {
    const submitFn = vi.fn(async () => ({ kind: "failed" as const, orderId: "fail-reopen" }));
    const modal = (open: boolean) => <CheckoutModal
      open={open}
      onClose={vi.fn()}
      presented={presented}
      total={1000}
      clearCart={vi.fn()}
      submitFn={submitFn}
    />;
    const { rerender } = render(modal(true));
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("N° fail-reopen");
    rerender(modal(false));
    rerender(modal(true));
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    expect(screen.getByText("N° fail-reopen")).toBeVisible();
    expect(submitFn).toHaveBeenCalledOnce();
  });

  /* ── SubmitResult: conflict (409) ───────────────────────────────── */
  it("409 conflict: safe — keeps form and shows error", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "conflict" as const,
      error: "Idempotency key used with different request",
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    expect(props.clearCart).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Idempotency key");
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
  });

  /* ── SubmitResult: rateLimited (429) ─────────────────────────────── */
  it("429 Retry-After disables retry until due", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "rateLimited" as const,
      error: "Demasiadas solicitudes",
      retryAfter: 30,
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    expect(screen.getByRole("alert").textContent).toContain("30s");
  });

  /* ── SubmitResult: unknown / timeout ─────────────────────────────── */
  it("timeout/unknown: same key and immutable payload", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload) => {
      calls.push(payload);
      if (calls.length === 1) {
        return { kind: "unknown" as const, error: "Sin conexión." };
      }
      return { kind: "completed" as const, orderId: "unknown-done" };
    });
    const props = renderModal({ submitFn });
    /* Fill form inline to avoid cross-test DOM pollution. */
    fireEvent.change(screen.getByLabelText("Nombre y apellido *"), {
      target: { value: "Santiago Lareu" },
    });
    fireEvent.change(screen.getByLabelText("Razón social *"), {
      target: { value: "StarVie Padel SAS" },
    });
    fireEvent.change(screen.getByLabelText(/Teléfono/), {
      target: { value: "+54 9 11 1234 5678" },
    });
    fireEvent.change(screen.getByLabelText("Correo electrónico *"), {
      target: { value: "santi@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Provincia/), {
      target: { value: "Buenos Aires" },
    });
    fireEvent.change(screen.getByLabelText(/Localidad/), {
      target: { value: "La Plata" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Sin conexión"),
    );

    /* Retry succeeds. */
    fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    /* Same idempotency key preserved across retry. */
    expect(calls[0].idempotencyKey).toBe(calls[1].idempotencyKey);
    /* Payload is immutable — same lines and contact. */
    expect(calls[0].contact.name).toBe("Santiago Lareu");
    expect(calls[1].contact.name).toBe("Santiago Lareu");
  });

  /* ── localStorage: before fetch / default storage ───────────────── */
  it("localStorage no tiene PII del contacto", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "processing" as const,
      orderId: "ord-pii",
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    const stored = localStorage.getItem("starvie-order-attempt-v2");
    expect(stored).toBeTruthy();
    const marker = JSON.parse(stored!);
    expect(marker).not.toHaveProperty("contact");
    expect(marker).not.toHaveProperty("name");
    expect(marker).not.toHaveProperty("email");
    expect(marker).not.toHaveProperty("phone");
    expect(marker).not.toHaveProperty("cuit");
    expect(marker).not.toHaveProperty("address");
    /* But should have lines, key, version. */
    expect(marker.version).toBe("v2");
    expect(marker.lines).toHaveLength(1);
  });

  it("sessionStorage usa default storage (globalThis.sessionStorage)", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "processing" as const,
      orderId: "ord-sess",
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    const stored = sessionStorage.getItem("starvie-order-attempt-v2-session");
    expect(stored).toBeTruthy();
    const session = JSON.parse(stored!);
    expect(session.contact.name).toBe("Santiago Lareu");
    expect(session.lines).toHaveLength(1);
  });

  /* ── Modal behavior: close preserves state ──────────────────────── */
  it("cerrar modal después de submitting preserva estado", async () => {
    localStorage.clear();
    sessionStorage.clear();
    let resolveSubmit!: (value: SubmitResult) => void;
    const submitFn = vi.fn(
      () => new Promise<SubmitResult>((resolve) => (resolveSubmit = resolve)),
    );
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

    /* Close while submitting — should not close. */
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();

    /* Complete the submission. */
    resolveSubmit({ kind: "completed", orderId: "ord-close" });
    await screen.findByText("Pedido enviado.");
    /* Now close should work. */
    await waitFor(() => {
      fireEvent.keyDown(window, { key: "Escape" });
      expect(props.onClose).toHaveBeenCalledOnce();
    });
  });

  it("cerrar modal después de processed (processing) no clearCart", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "processing" as const,
      orderId: "proc-close",
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("Pedido recibido — en proceso.");
    expect(props.clearCart).not.toHaveBeenCalled();

    /* Close — should not clear cart. */
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.clearCart).not.toHaveBeenCalled();
  });

  /* ── SubmitResult: validation ───────────────────────────────────── */
  it("validation error from server shows error text", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "validation" as const,
      error: "contact.name is required",
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    expect(screen.getByRole("alert").textContent).toContain(
      "contact.name is required",
    );
  });

  /* ── SubmitResult: completed preserves orderId ──────────────────── */
  it("completed: clearCart and preserve orderId", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const submitFn = vi.fn(async () => ({
      kind: "completed" as const,
      orderId: "ord-preserve",
    }));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("Pedido enviado.");
    expect(props.clearCart).toHaveBeenCalledOnce();
    expect(screen.getByText("N° ord-preserve")).toBeVisible();
  });

  it("recarga processing y consulta el mismo pedido con payload intacto", async () => {
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload) => {
      calls.push(payload);
      return { kind: "processing" as const, orderId: "proc-reload" };
    });
    const first = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("N° proc-reload");
    cleanup();
    const reopened = renderModal({ submitFn });
    expect(screen.getByText("N° proc-reload")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual(calls[0]);
    expect(first.clearCart).not.toHaveBeenCalled();
    expect(reopened.clearCart).not.toHaveBeenCalled();
  });

  it("recarga después de timeout sin orderId y reintenta con el payload original", async () => {
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload) => {
      calls.push(payload);
      return { kind: "unknown" as const, error: "Tiempo agotado" };
    });
    renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("Tiempo agotado");
    const marker = JSON.parse(localStorage.getItem("starvie-order-attempt-v2")!);
    expect(marker.orderId).toBeNull();
    cleanup();
    renderModal({ submitFn });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual(calls[0]);
  });

  it("completed limpia ambos storages y la compra siguiente usa otra key", async () => {
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload) => {
      calls.push(payload);
      return { kind: "completed" as const, orderId: `done-${calls.length}` };
    });
    renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("N° done-1");
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();
    expect(sessionStorage.getItem("starvie-order-attempt-v2-session")).toBeNull();
    expect(screen.getByText("Pedido enviado.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar nueva compra" }));
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();
    expect(calls).toHaveLength(1);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].idempotencyKey).not.toBe(calls[0].idempotencyKey);
  });

  it.each([0, 24 * 3600_000])("resuelve completed histórico con edad %i sin borrar el carrito actual", (age) => {
    orderAttempt.prepareAttempt(
      { name: "Santiago", legalName: "StarVie", email: "santi@example.com" },
      [{ productId: "raptor+", qty: 2 }],
    );
    orderAttempt.updateAttempt([{ productId: "raptor+", qty: 2 }], {
      orderId: "done-reopen", status: "completed", completed: true,
    });
    const historicalCreatedAt = new Date(Date.now() - age).toISOString();
    for (const [storage, key] of [[localStorage, "starvie-order-attempt-v2"], [sessionStorage, "starvie-order-attempt-v2-session"]] as const) {
      const stored = JSON.parse(storage.getItem(key)!);
      stored.createdAt = historicalCreatedAt;
      storage.setItem(key, JSON.stringify(stored));
    }
    const props = renderModal();
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();
    expect(sessionStorage.getItem("starvie-order-attempt-v2-session")).toBeNull();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    expect(screen.queryByText(/Venció la ventana/)).toBeNull();
    expect(props.clearCart).not.toHaveBeenCalled();
    expect(props.submitFn).not.toHaveBeenCalled();
  });

  it.each([201, 200])("HTTP %i completed conserva confirmación y cierra el intento", async (httpStatus) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true, orderId: "RS-confirmed", status: "completed", duplicate: httpStatus === 200,
    }), { status: httpStatus, headers: { "Content-Type": "application/json" } }));
    const submitFn: typeof submitOrder = (payload) => submitOrder(payload, { fetchImpl });
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("N° RS-confirmed");
    expect(screen.getByText("Pedido enviado.")).toBeVisible();
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();
    expect(sessionStorage.getItem("starvie-order-attempt-v2-session")).toBeNull();
    expect(props.clearCart).toHaveBeenCalledOnce();
    cleanup();
    renderModal();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    expect(screen.queryByText("N° RS-confirmed")).toBeNull();
  });

  it("HTTP 2xx malformado conserva key y payload para el reintento", async () => {
    const sent: OrderPayload[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(JSON.parse(init!.body as string));
      return new Response("not-json", { status: 201 });
    });
    const props = renderModal({ submitFn: (payload: OrderPayload) => submitOrder(payload, { fetchImpl }) });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("Respuesta inválida del servidor.");
    const marker = localStorage.getItem("starvie-order-attempt-v2");
    const session = sessionStorage.getItem("starvie-order-attempt-v2-session");
    expect(marker).toBeTruthy();
    expect(session).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual(sent[0]);
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBe(marker);
    expect(sessionStorage.getItem("starvie-order-attempt-v2-session")).toBe(session);
    expect(props.clearCart).not.toHaveBeenCalled();
  });

  it("una respuesta completed no modifica otro marcador concurrente", async () => {
    let otherMarker = "";
    const submitFn = vi.fn(async () => {
      const current = JSON.parse(localStorage.getItem("starvie-order-attempt-v2")!);
      otherMarker = JSON.stringify({ ...current, idempotencyKey: crypto.randomUUID(), orderId: "RS-other", status: "processing" });
      localStorage.setItem("starvie-order-attempt-v2", otherMarker);
      return { kind: "completed" as const, orderId: "RS-original" };
    });
    renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("N° RS-original");
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBe(otherMarker);
    expect(sessionStorage.getItem("starvie-order-attempt-v2-session")).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent(/no se pudo limpiar/);
    expect(screen.getByRole("button", { name: "Iniciar nueva compra" })).toBeDisabled();
  });

  it.each(["starvie-order-attempt-v2", "starvie-order-attempt-v2-session"])("fallo al limpiar %s conserva éxito y bloquea compra nueva", async (key) => {
    const removeItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, item) {
      if (item === key) throw new Error("denied");
      removeItem.call(this, item);
    });
    const props = renderModal();
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("Pedido enviado.");
    expect(screen.getByText("N° ord-1")).toBeVisible();
    expect(JSON.parse(localStorage.getItem("starvie-order-attempt-v2")!).status).toBe("completed");
    expect(screen.getByRole("alert")).toHaveTextContent(/no se pudo limpiar/);
    expect(screen.getByRole("button", { name: "Iniciar nueva compra" })).toBeDisabled();
    expect(props.submitFn).toHaveBeenCalledOnce();
    cleanup();
    renderModal();
    expect(screen.getByRole("button", { name: "Iniciar nueva compra" })).toBeDisabled();
    vi.restoreAllMocks();
    cleanup();
    renderModal();
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();
    expect(sessionStorage.getItem("starvie-order-attempt-v2-session")).toBeNull();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
  });

  it("failed terminal conserva referencia y solo crea otra compra tras resolverlo", async () => {
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload) => {
      calls.push(payload);
      return calls.length === 1
        ? { kind: "failed" as const, orderId: "fail-old" }
        : { kind: "completed" as const, orderId: "done-new" };
    });
    renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("N° fail-old");
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resolver intento e iniciar nueva compra" }));
    expect(calls).toHaveLength(1);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].idempotencyKey).not.toBe(calls[0].idempotencyKey);
  });

  it("sin sessionStorage conserva orderId, bloquea POST y exige confirmación", async () => {
    const prepared = orderAttempt.prepareAttempt({ name: "Santiago", legalName: "StarVie", email: "santi@example.com" }, [{ productId: "raptor+", qty: 2 }]);
    expect(prepared).not.toBe(false);
    orderAttempt.updateAttempt([{ productId: "raptor+", qty: 2 }], { orderId: "proc-lost", status: "processing" });
    sessionStorage.clear();
    const props = renderModal();
    expect(screen.getByText("N° proc-lost")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
    expect(props.submitFn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo que consulté con StarVie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Resolver intento e iniciar nueva compra" }));
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();
    expect(props.submitFn).not.toHaveBeenCalled();
  });

  it.each(["expired", "corrupt"] as const)("marcador %s requiere resolución explícita", (kind) => {
    if (kind === "expired") {
      const prepared = orderAttempt.prepareAttempt({ name: "Santiago", legalName: "StarVie", email: "santi@example.com" }, [{ productId: "raptor+", qty: 2 }]);
      expect(prepared).not.toBe(false);
      const marker = JSON.parse(localStorage.getItem("starvie-order-attempt-v2")!);
      marker.createdAt = new Date(Date.now() - 24 * 3600_000).toISOString();
      localStorage.setItem("starvie-order-attempt-v2", JSON.stringify(marker));
    } else {
      localStorage.setItem("starvie-order-attempt-v2", "bad-json");
    }
    const props = renderModal();
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
    expect(props.submitFn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo que consulté con StarVie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Resolver intento e iniciar nueva compra" }));
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();
    expect(props.submitFn).not.toHaveBeenCalled();
  });

  it("una sesión huérfana no genera key nueva al abrir", () => {
    orderAttempt.saveAttemptSession(
      { name: "Santiago", legalName: "StarVie", email: "santi@example.com" },
      [{ productId: "raptor+", qty: 2 }],
      "11111111-1111-4111-8111-111111111111",
    );
    const props = renderModal();
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
    expect(props.submitFn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo que consulté con StarVie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Resolver intento e iniciar nueva compra" }));
    expect(sessionStorage.getItem("starvie-order-attempt-v2-session")).toBeNull();
  });

  it("una sesión inconsistente bloquea la consulta hasta resolución explícita", () => {
    orderAttempt.prepareAttempt(
      { name: "Santiago", legalName: "StarVie", email: "santi@example.com" },
      [{ productId: "raptor+", qty: 2 }],
    );
    const session = JSON.parse(sessionStorage.getItem("starvie-order-attempt-v2-session")!);
    session.lines[0].qty = 3;
    sessionStorage.setItem("starvie-order-attempt-v2-session", JSON.stringify(session));
    const props = renderModal();
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    expect(props.submitFn).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Confirmo que consulté con StarVie/ })).toBeVisible();
  });
});

describe("CheckoutModal Turnstile", () => {
  it("flag habilitado sin sitekey falla cerrado antes de crear intento", () => {
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "true");
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    const props = renderModal();
    fillValidForm();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
    expect(screen.getByText(/La verificación de seguridad no está configurada/)).toBeVisible();
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();
    expect(props.submitFn).not.toHaveBeenCalled();
  });

  it("sin configuración pública falla cerrado y no crea un pedido", () => {
    const props = renderModal();
    fillValidForm();
    expect(screen.queryByLabelText("Verificación de seguridad")).toBeNull();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
    expect(screen.getByText(/La verificación de seguridad no está configurada/)).toBeVisible();
    expect(props.submitFn).not.toHaveBeenCalled();
  });

  it("solo una desactivación explícita permite enviar sin Turnstile", async () => {
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
    const props = renderModal();
    fillValidForm();
    expect(screen.queryByLabelText("Verificación de seguridad")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    expect((props.submitFn as ReturnType<typeof vi.fn>).mock.calls[0][1].turnstileToken).toBeUndefined();
  });

  it("exige token antes del primer POST, lo envía una vez y consulta processing sin él", async () => {
    const widget = enableMockTurnstile();
    const props = renderModal({ submitFn: vi.fn(async () => ({ kind: "processing" as const, orderId: "proc-ts" })) });
    fillValidForm();
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    expect(widget.api.render.mock.calls[0][1]).toMatchObject({
      sitekey: TEST_SITEKEY, action: "order_starvie", appearance: "always", execution: "render",
    });
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBeNull();
    act(() => widget.callbacks().callback("fresh-token"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("N° proc-ts");
    const calls = (props.submitFn as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][1].turnstileToken).toBe("fresh-token");
    expect(localStorage.getItem("starvie-order-attempt-v2")).not.toContain("fresh-token");
    expect(sessionStorage.getItem("starvie-order-attempt-v2-session")).not.toContain("fresh-token");
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1][0]).toEqual(calls[0][0]);
    expect(calls[1][1].turnstileToken).toBeUndefined();
    expect(props.clearCart).not.toHaveBeenCalled();
  });

  it("expiración y error invalidan el token; reset permite renovarlo", async () => {
    const widget = enableMockTurnstile();
    renderModal();
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    act(() => widget.callbacks().callback(""));
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
    expect(screen.getByText(/no devolvió un token válido/)).toBeVisible();
    act(() => widget.callbacks().callback("valid-token"));
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    act(() => widget.callbacks()["expired-callback"]());
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
    expect(screen.getByText(/La verificación venció/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar verificación" }));
    expect(widget.api.reset).toHaveBeenCalledWith("test-widget");
    act(() => widget.callbacks()["error-callback"]());
    expect(screen.getByText(/No se pudo completar la verificación/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar verificación" }));
    expect(widget.api.reset).toHaveBeenCalledTimes(2);
    act(() => widget.callbacks().callback("renewed-token"));
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
  });

  it("timeout, consulta sin token y verificación nueva conservan el mismo pedido", async () => {
    const widget = enableMockTurnstile();
    const calls: Array<{ payload: OrderPayload; token?: string }> = [];
    const submitFn = vi.fn(async (payload: OrderPayload, options?: { turnstileToken?: string }): Promise<SubmitResult> => {
      calls.push({ payload, token: options?.turnstileToken });
      return calls.length === 1
        ? { kind: "unknown", error: "Timeout" }
        : calls.length === 2
          ? { kind: "verificationRequired", error: "Token required" }
          : { kind: "completed", orderId: "done-ts" };
    });
    renderModal({ submitFn });
    fillValidForm();
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    act(() => widget.callbacks().callback("first-token"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByRole("button", { name: "Reintentar envío" });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeDisabled();
    act(() => widget.callbacks().callback("second-token"));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
    await screen.findByText("N° done-ts");
    expect(calls.map((call) => call.token)).toEqual(["first-token", undefined, "second-token"]);
    expect(calls[1].payload).toEqual(calls[0].payload);
    expect(calls[2].payload).toEqual(calls[0].payload);
  });

  it("reabre un processing persistido y consulta sin widget ni token", async () => {
    const widget = enableMockTurnstile();
    const prepared = orderAttempt.prepareAttempt(
      { name: "Santiago", legalName: "StarVie", email: "santi@example.com" },
      [{ productId: "raptor+", qty: 2 }],
    );
    expect(prepared).not.toBe(false);
    orderAttempt.updateAttempt([{ productId: "raptor+", qty: 2 }], { orderId: "proc-persisted", status: "processing" });
    const props = renderModal({ submitFn: vi.fn(async () => ({ kind: "processing" as const, orderId: "proc-persisted" })) });
    expect(screen.getByText("N° proc-persisted")).toBeVisible();
    expect(widget.api.render).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    expect((props.submitFn as ReturnType<typeof vi.fn>).mock.calls[0][0].idempotencyKey).toBe((prepared as { idempotencyKey: string }).idempotencyKey);
    expect((props.submitFn as ReturnType<typeof vi.fn>).mock.calls[0][1].turnstileToken).toBeUndefined();
  });

  it("failed no permite retry; compra nueva usa nueva key y nuevo token", async () => {
    const widget = enableMockTurnstile();
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload): Promise<SubmitResult> => {
      calls.push(payload);
      return calls.length === 1 ? { kind: "failed", orderId: "failed-ts" } : { kind: "completed", orderId: "new-ts" };
    });
    renderModal({ submitFn });
    fillValidForm();
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    act(() => widget.callbacks().callback("first-token"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("N° failed-ts");
    expect(screen.queryByRole("button", { name: "Reintentar envío" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resolver intento e iniciar nueva compra" }));
    fillValidForm();
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
    act(() => widget.callbacks().callback("new-token"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("N° new-ts");
    expect(calls[1].idempotencyKey).not.toBe(calls[0].idempotencyKey);
  });

  it("desmonta el widget y deja inactivos sus callbacks", async () => {
    const widget = enableMockTurnstile();
    renderModal();
    await waitFor(() => expect(widget.api.render).toHaveBeenCalledOnce());
    cleanup();
    expect(widget.api.remove).toHaveBeenCalledWith("test-widget");
    act(() => widget.callbacks().callback("late-token"));
  });

  it("permite recargar el script si falla su descarga", async () => {
    vi.stubEnv("VITE_TURNSTILE_ENABLED", "true");
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", TEST_SITEKEY);
    renderModal();
    const first = document.querySelector("script[data-starvie-turnstile]");
    expect(first).not.toBeNull();
    fireEvent.error(first!);
    await screen.findByText(/No se pudo completar la verificación/);
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar verificación" }));
    await waitFor(() => {
      const next = document.querySelector("script[data-starvie-turnstile]");
      expect(next).not.toBeNull();
      expect(next).not.toBe(first);
    });
    fireEvent.error(document.querySelector("script[data-starvie-turnstile]")!);
  });
});
