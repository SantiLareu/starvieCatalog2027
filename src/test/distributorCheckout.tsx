import { vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CheckoutModal } from "../commerce/CheckoutModal";
import type { CommerceProduct, PresentedLine } from "../commerce/types";

export const proofA = "server-session-a";
export const proofB = "server-session-b";
export const REFERENCE = "781cca67-4696-4338-b0f3-f3716ce5593f";
export const contact = { name: "Cliente de prueba", legalName: "Empresa de prueba", email: "cliente@example.test" };
export const lines = [{ productId: "raptor+", qty: 2 }];
export const product = { id: "raptor+", nombre: "Raptor+", precio: 500, disponible: true, imagenes: [] } as unknown as CommerceProduct;
export const presented: PresentedLine[] = [{ line: lines[0], product, subtotal: 1000 }];
export function fillContact() {
  fireEvent.change(screen.getByLabelText("Nombre y apellido *"), { target: { value: contact.name } });
  fireEvent.change(screen.getByLabelText("Razón social *"), { target: { value: contact.legalName } });
  fireEvent.change(screen.getByLabelText("Correo electrónico *"), { target: { value: contact.email } });
}
export function renderDistributor(overrides: Partial<React.ComponentProps<typeof CheckoutModal>> = {}) {
  const props = { open: true, onClose: vi.fn(), presented, total: 1000, clearCart: vi.fn(),
    distributorMode: true, distributorSessionFingerprint: proofA,
    submitFn: vi.fn(async () => ({ kind: "unknown" as const, error: "Mock lost response" })), ...overrides };
  return { ...render(<CheckoutModal {...props} />), props };
}
export function seedHistorical(status = "accepted", scoped = false) {
  const marker = { version: "v2", idempotencyKey: REFERENCE, orderId: null, lines, createdAt: new Date().toISOString(), status, channel: "distributor" };
  const key = scoped ? "starvie-order-attempt-v2-distributor" : "starvie-order-attempt-v2";
  localStorage.setItem(key, JSON.stringify(marker));
  sessionStorage.setItem(scoped ? `${key}-session` : "starvie-order-attempt-v2-session", JSON.stringify({ ...marker, contact }));
}
export function storageBytes() {
  return { local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)) };
}
export function purchaseMarkers() {
  return Object.entries(localStorage).filter(([key]) => key.includes(":purchase:"))
    .map(([key, raw]) => ({ key, value: JSON.parse(raw) as { idempotencyKey: string; status: string; orderId: string | null } }));
}
