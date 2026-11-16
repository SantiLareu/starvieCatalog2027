import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CheckoutModal } from "./CheckoutModal";
import type { OrderPayload, SubmitResult } from "./orders";
import { fillContact, proofB, purchaseMarkers, renderDistributor, storageBytes } from "../test/distributorCheckout";

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network"); }));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it.each(["completed", "processing"] as const)("automatically confirms backend %s, keeps the recorded result and allows a new purchase", async kind => {
  const submitFn = vi.fn(async (_payload: OrderPayload) => ({ kind, orderId: "order-mock", nextRetryAt: Date.now() + 60000 }));
  const { props } = renderDistributor({ submitFn });
  fillContact();
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  await screen.findByText(kind === "completed" ? "¡Pedido enviado con éxito!" : "¡Pedido recibido!");
  expect(props.clearCart).toHaveBeenCalledOnce();
  expect(purchaseMarkers()[0].value).toMatchObject({ status: kind, orderId: "order-mock" });
  const firstBytes = storageBytes();
  fireEvent.click(screen.getByRole("button", { name: "Iniciar pedido nuevo" }));
  fillContact();
  expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(2));
  expect(submitFn.mock.calls[0][0].idempotencyKey).not.toBe(submitFn.mock.calls[1][0].idempotencyKey);
  for (const [key, value] of Object.entries(firstBytes.local)) expect(localStorage.getItem(key)).toBe(value);
  for (const [key, value] of Object.entries(firstBytes.session)) expect(sessionStorage.getItem(key)).toBe(value);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["unknown", "rejected-promise", "failed", "conflict", "validation"])("%s does not resend or require manual approval; the next explicit purchase gets a different key", async kind => {
  const submitFn = vi.fn(async (_payload: OrderPayload): Promise<SubmitResult> => {
    if (kind === "rejected-promise") throw new TypeError("Lost response");
    if (kind === "failed") return { kind, orderId: "failed-order" };
    return { kind, error: "Mock error" } as SubmitResult;
  });
  const { rerender, props } = renderDistributor({ submitFn });
  fillContact();
  const send = screen.getByRole("button", { name: "Enviar pedido" });
  fireEvent.click(send); fireEvent.click(send);
  await screen.findByRole("button", { name: "Iniciar pedido nuevo" });
  expect(submitFn).toHaveBeenCalledOnce();
  expect(props.clearCart).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Reintentar envío|Consultar estado|Resolver intento/ })).toBeNull();
  if (["unknown", "rejected-promise"].includes(kind)) expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos confirmar el resultado/);
  const bytes = storageBytes();
  rerender(<CheckoutModal {...props} open={false} />);
  rerender(<CheckoutModal {...props} />);
  expect(submitFn).toHaveBeenCalledOnce();
  fillContact();
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(2));
  expect(submitFn.mock.calls[1][0].idempotencyKey).not.toBe(submitFn.mock.calls[0][0].idempotencyKey);
  for (const [key, value] of Object.entries(bytes.local)) expect(localStorage.getItem(key)).toBe(value);
});

it("discards a late response after changing accounts and never exposes the old contact/reference", async () => {
  let complete!: (result: SubmitResult) => void;
  const submitFn = vi.fn((_payload: OrderPayload) => new Promise<SubmitResult>(resolve => { complete = resolve; }));
  const { rerender, props } = renderDistributor({ submitFn });
  fillContact();
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  const keyA = submitFn.mock.calls[0][0].idempotencyKey;
  rerender(<CheckoutModal {...props} distributorSessionFingerprint={proofB} />);
  await act(async () => { complete({ kind: "completed", orderId: "order-a" }); });
  expect(props.clearCart).not.toHaveBeenCalled();
  expect(screen.queryByText(keyA)).toBeNull();
  expect(screen.getByLabelText("Nombre y apellido *")).toHaveValue("");
  expect(screen.queryByText("¡Pedido enviado con éxito!")).toBeNull();
});
