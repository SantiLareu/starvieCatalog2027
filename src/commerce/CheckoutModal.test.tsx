import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutModal } from "./CheckoutModal";
import type { OrderPayload } from "./orders";
import type { CommerceProduct, PresentedLine } from "./types";

afterEach(() => cleanup());

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

const presented: PresentedLine[] = [{ line: { productId: "raptor+", qty: 2 }, product, subtotal: 1000 }];

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Nombre y apellido *"), { target: { value: "Santiago Lareu" } });
  fireEvent.change(screen.getByLabelText("Razón social *"), { target: { value: "StarVie Padel SAS" } });
  fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "+54 9 11 1234 5678" } });
  fireEvent.change(screen.getByLabelText("Correo electrónico *"), { target: { value: "santi@example.com" } });
  fireEvent.change(screen.getByLabelText("Provincia"), { target: { value: "Buenos Aires" } });
  fireEvent.change(screen.getByLabelText("Localidad"), { target: { value: "La Plata" } });
}

function renderModal(overrides = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    presented,
    total: 1000,
    clearCart: vi.fn(),
    submitFn: vi.fn(async () => ({ ok: true, orderId: "ord-1" }) as const),
    ...overrides,
  };
  render(<CheckoutModal {...props} />);
  return props;
}

describe("CheckoutModal", () => {
  it("renderiza su backdrop por encima del drawer", () => {
    renderModal();
    const backdrop = document.querySelector(".modal-backdrop.checkout-backdrop");
    expect(backdrop).not.toBeNull();
  });

  it("envía formulario válido con payload sin precios y muestra orderId", async () => {
    const props = renderModal();
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    const payload = (props.submitFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as OrderPayload;
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
    fireEvent.change(screen.getByLabelText("Nombre y apellido *"), { target: { value: "Santiago" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico *"), { target: { value: "mal" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    expect(screen.getByText("Ingresá un correo electrónico válido.")).toBeVisible();
    expect(screen.getByText("Ingresá la razón social.")).toBeVisible();
    expect(screen.queryByText("Ingresá tu teléfono.")).toBeNull();
    expect(screen.queryByText("Ingresá la provincia.")).toBeNull();
    expect(screen.queryByText("Ingresá la localidad.")).toBeNull();
    expect(props.submitFn).not.toHaveBeenCalled();
    expect(props.clearCart).not.toHaveBeenCalled();
  });

  it("envía con opcionales vacíos y los omite del payload", async () => {
    const props = renderModal();
    fireEvent.change(screen.getByLabelText("Nombre y apellido *"), { target: { value: "Santiago Lareu" } });
    fireEvent.change(screen.getByLabelText("Razón social *"), { target: { value: "StarVie Padel SAS" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico *"), { target: { value: "santi@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    const payload = (props.submitFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as OrderPayload;
    expect(payload.contact).toEqual({
      name: "Santiago Lareu",
      legalName: "StarVie Padel SAS",
      email: "santi@example.com",
    });
    await screen.findByText("Pedido enviado.");
    expect(props.clearCart).toHaveBeenCalledOnce();
  });

  it("bloquea doble click durante el envío", async () => {
    let resolveSubmit!: (value: { ok: true; orderId: string }) => void;
    const submitFn = vi.fn(() => new Promise<{ ok: true; orderId: string }>((resolve) => (resolveSubmit = resolve)));
    renderModal({ submitFn });
    fillValidForm();
    const send = screen.getByRole("button", { name: "Enviar pedido" });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(submitFn).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Enviando pedido..." })).toBeDisabled();
    resolveSubmit({ ok: true, orderId: "ord-1" });
    await screen.findByText("Pedido enviado.");
  });

  it("en error conserva carrito y formulario; reintentar usa la misma key", async () => {
    const calls: OrderPayload[] = [];
    const submitFn = vi.fn(async (payload: OrderPayload) => {
      calls.push(payload);
      if (calls.length === 1) return { ok: false, error: "Falló el servidor." } as const;
      return { ok: true, orderId: "ord-2" } as const;
    });
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByText("Falló el servidor.");
    expect(props.clearCart).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombre y apellido *")).toHaveValue("Santiago Lareu");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar envío" }));
    await screen.findByText("Pedido enviado.");
    expect(calls).toHaveLength(2);
    expect(calls[0].idempotencyKey).toBe(calls[1].idempotencyKey);
    expect(props.clearCart).toHaveBeenCalledOnce();
  });

  it("bloquea Escape durante submitting y lo permite en idle", async () => {
    let resolveSubmit!: (value: { ok: true; orderId: string }) => void;
    const submitFn = vi.fn(() => new Promise<{ ok: true; orderId: string }>((resolve) => (resolveSubmit = resolve)));
    const props = renderModal({ submitFn });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
    resolveSubmit({ ok: true, orderId: "ord-1" });
    await screen.findByText("Pedido enviado.");
  });

  it("Escape en idle cierra y restaura el foco al botón que abrió", () => {
    const opener = document.createElement("button");
    opener.textContent = "abrir";
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { rerender } = render(
      <CheckoutModal open={true} onClose={onClose} presented={presented} total={1000} clearCart={vi.fn()} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <CheckoutModal open={false} onClose={onClose} presented={presented} total={1000} clearCart={vi.fn()} />,
    );
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
