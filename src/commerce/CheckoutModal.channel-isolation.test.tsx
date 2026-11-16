/**
 * S3/S4 · Integración del checkout con la huella de sesión y el
 * aislamiento por canal.
 *
 * S3 (huella de valor): la prueba viva de la sesión de distribuidor es un
 * VALOR ("v1:<descuento>:<vencimiento>"), no la identidad de un objeto. Una
 * revalidación inocua de la MISMA sesión (el backend devuelve el mismo
 * vencimiento almacenado) conserva la huella: el intento sigue siendo
 * reenviable, liberable y conciliable. Un login nuevo (otra huella), un
 * logout (huella nula) o una sesión vencida (huella nula) lo bloquean y lo
 * conservan.
 *
 * S4 (compartimentos por canal): cada canal tiene su propio registro de
 * intento. Un intento pendiente del distribuidor no bloquea la compra
 * pública del mismo navegador y la compra pública nunca borra ni libera el
 * registro del distribuidor.
 *
 * Todo es MOCK: no hay red real, no hay pedidos reales y no hay correos.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutModal } from "./CheckoutModal";
import * as orderAttempt from "./orderAttempt";
import { purchaseMarkers } from "../test/distributorCheckout";
import type { OrderPayload } from "./orders";
import type { CommerceProduct, PresentedLine } from "./types";

const PUBLIC_LOCAL = "starvie-order-attempt-v2";
const PUBLIC_SESSION = "starvie-order-attempt-v2-session";
const DIST_LOCAL = "starvie-order-attempt-v2-distributor";
const DIST_SESSION = "starvie-order-attempt-v2-distributor-session";

/* Huella de valor de la sesión vigente. */
const FINGERPRINT = "v1:20:2026-11-20T20:00:00.000Z";
/* Otra cuenta: el backend devolvió otro vencimiento ⇒ otra huella. */
const OTHER_FINGERPRINT = "v1:20:2026-11-21T20:00:00.000Z";

const contact = {
  name: "Cliente de prueba",
  legalName: "Empresa de prueba",
  email: "cliente@example.test",
};
const lines = [{ productId: "raptor+", qty: 2 }];

const product = {
  id: "raptor+",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 500,
  disponible: true,
  imagenes: [],
  gama: "",
  tipoJuego: "",
  forma: "",
  plano: "",
  peso: "",
  balance: "",
  ean: "",
  pagina: 17,
} as unknown as CommerceProduct;

const presented: PresentedLine[] = [
  { line: { productId: "raptor+", qty: 2 }, product, subtotal: 1000 },
];

function fillContact(): void {
  fireEvent.change(document.querySelector("#checkout-name")!, { target: { value: contact.name } });
  fireEvent.change(document.querySelector("#checkout-legalname")!, { target: { value: contact.legalName } });
  fireEvent.change(document.querySelector("#checkout-email")!, { target: { value: contact.email } });
}

function markerOf(key: string): Record<string, unknown> | null {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
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

/* ══════════════════════════════════════════════════════════════════════
 * S4 · Aislamiento por canal.
 * ══════════════════════════════════════════════════════════════════════ */
describe("S4 · el checkout público y el de distribuidores son independientes", () => {
  it("una compra pública se completa con un intento de distribuidor pendiente y NO lo toca", async () => {
    /* Un intento del distribuidor, con resultado incierto. */
    const prepared = orderAttempt.prepareAttempt(contact, lines, { channel: "distributor" });
    expect(prepared).not.toBe(false);
    const distKey = (prepared as { idempotencyKey: string }).idempotencyKey;
    orderAttempt.updateAttempt(lines, { channel: "distributor", orderId: "ord-dist", status: "accepted" });
    const markerBefore = localStorage.getItem(DIST_LOCAL);
    const sessionBefore = sessionStorage.getItem(DIST_SESSION);

    const submitFn = vi.fn(async (_payload: OrderPayload) => ({ kind: "completed" as const, orderId: "ord-public" }));
    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        submitFn={submitFn}
      />,
    );

    fillContact();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(submitFn).toHaveBeenCalledOnce());

    /* La compra pública usa su propia clave (nunca la del distribuidor). */
    expect(submitFn.mock.calls[0][0].idempotencyKey).not.toBe(distKey);
    await screen.findByRole("dialog", { name: "¡Pedido enviado con éxito!" });
    /* El compartmento público queda limpio… */
    expect(localStorage.getItem(PUBLIC_LOCAL)).toBeNull();
    expect(sessionStorage.getItem(PUBLIC_SESSION)).toBeNull();
    /* …y el registro del distribuidor sigue byte a byte igual. */
    expect(localStorage.getItem(DIST_LOCAL)).toBe(markerBefore);
    expect(sessionStorage.getItem(DIST_SESSION)).toBe(sessionBefore);
    expect(markerOf(DIST_LOCAL)?.idempotencyKey).toBe(distKey);
    expect(markerOf(DIST_LOCAL)?.status).toBe("accepted");
    expect(markerOf(DIST_LOCAL)?.orderId).toBe("ord-dist");
  });

  it("el checkout de distribuidores NUNCA reutiliza el intento público", async () => {
    const prepared = orderAttempt.prepareAttempt(contact, lines, { channel: "public" });
    expect(prepared).not.toBe(false);
    const publicKey = (prepared as { idempotencyKey: string }).idempotencyKey;
    const markerBefore = localStorage.getItem(PUBLIC_LOCAL);

    const submitFn = vi.fn(async (_payload: OrderPayload) => ({ kind: "unknown" as const, error: "sin red" }));
    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={FINGERPRINT}
        distributorDiscountPercent={20}
        submitFn={submitFn}
      />,
    );

    fillContact();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(submitFn).toHaveBeenCalledOnce());

    /* Clave propia del canal distribuidor. */
    expect(submitFn.mock.calls[0][0].idempotencyKey).not.toBe(publicKey);
    /* El registro público no se toca. */
    expect(localStorage.getItem(PUBLIC_LOCAL)).toBe(markerBefore);
    expect(markerOf(PUBLIC_LOCAL)?.idempotencyKey).toBe(publicKey);
  });

  it("cambiar de canal no pierde ningún intento: cada uno conserva su clave y su estado", async () => {
    const submitFn = vi.fn(async (_payload: OrderPayload) => ({ kind: "unknown" as const, error: "sin red" }));
    /* 1 · Canal distribuidor. */
    const first = render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={FINGERPRINT}
        distributorDiscountPercent={20}
        submitFn={submitFn}
      />,
    );
    fillContact();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(submitFn).toHaveBeenCalledOnce());
    const distKey = submitFn.mock.calls[0][0].idempotencyKey;
    const firstMarker = purchaseMarkers()[0];
    const originalMarker = localStorage.getItem(firstMarker.key);
    first.unmount();

    /* 2 · Canal público: su propio intento, el del distribuidor intacto. */
    const second = render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        submitFn={submitFn}
      />,
    );
    fillContact();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(2));
    const publicKey = submitFn.mock.calls[1][0].idempotencyKey;
    expect(publicKey).not.toBe(distKey);
    second.unmount();

    /* 3 · Vuelta al distribuidor: compra independiente, histórico intacto. */
    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={FINGERPRINT}
        distributorDiscountPercent={20}
        submitFn={submitFn}
      />,
    );
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    fillContact();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(3));
    expect(submitFn.mock.calls[2][0].idempotencyKey).not.toBe(distKey);
    expect(localStorage.getItem(firstMarker.key)).toBe(originalMarker);
    expect(markerOf(PUBLIC_LOCAL)?.idempotencyKey).toBe(publicKey);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * S3 · La huella de valor de la sesión.
 * ══════════════════════════════════════════════════════════════════════ */
describe("S3 · la huella del servidor aísla la compra activa", () => {
  const props = { open: true, onClose: vi.fn(), presented, total: 1000, clearCart: vi.fn(), distributorMode: true };
  it("una revalidación con la misma huella conserva la compra activa sin reenviarla", async () => {
    const submitFn = vi.fn(async (_payload: OrderPayload) => ({ kind: "unknown" as const, error: "lost response" }));
    const view = render(<CheckoutModal {...props} distributorSessionFingerprint={FINGERPRINT} submitFn={submitFn} />);
    fillContact(); fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByRole("button", { name: "Iniciar pedido nuevo" });
    const key = submitFn.mock.calls[0][0].idempotencyKey;
    view.rerender(<CheckoutModal {...props} distributorSessionFingerprint={String(FINGERPRINT)} submitFn={submitFn} />);
    expect(screen.getByText(key)).toBeVisible();
    expect(submitFn).toHaveBeenCalledOnce();
  });
  it("otra huella limpia los datos visibles sin tocar el historial de la cuenta anterior", async () => {
    const submitFn = vi.fn(async (_payload: OrderPayload) => ({ kind: "unknown" as const, error: "lost response" }));
    const view = render(<CheckoutModal {...props} distributorSessionFingerprint={FINGERPRINT} submitFn={submitFn} />);
    fillContact(); fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await screen.findByRole("button", { name: "Iniciar pedido nuevo" });
    const oldMarker = purchaseMarkers()[0];
    const raw = localStorage.getItem(oldMarker.key);
    view.rerender(<CheckoutModal {...props} distributorSessionFingerprint={OTHER_FINGERPRINT} submitFn={submitFn} />);
    expect(screen.queryByText(oldMarker.value.idempotencyKey)).toBeNull();
    expect(screen.getByLabelText("Nombre y apellido *")).toHaveValue("");
    fillContact(); fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(2));
    expect(submitFn.mock.calls[1][0].idempotencyKey).not.toBe(oldMarker.value.idempotencyKey);
    expect(localStorage.getItem(oldMarker.key)).toBe(raw);
  });
  it("la huella nula no autoriza envíos ni asigna referencias", () => {
    const uuid = vi.spyOn(crypto, "randomUUID");
    const submitFn = vi.fn(async (_payload: OrderPayload) => ({ kind: "unknown" as const, error: "lost response" }));
    render(<CheckoutModal {...props} distributorSessionFingerprint={null} submitFn={submitFn} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Ingresá como distribuidor/);
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
    expect(submitFn).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
  });
  it.each(["RECEIVED", "NOT_RECEIVED"])("%s histórico no exige una decisión administrativa ni se consulta", () => {
    localStorage.setItem(DIST_LOCAL, JSON.stringify({ resolution: "historical" }));
    const raw = localStorage.getItem(DIST_LOCAL);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<CheckoutModal {...props} distributorSessionFingerprint={FINGERPRINT} />);
    expect(screen.queryByRole("button", { name: /Consultar estado|Continuar con el envío|Resolver intento/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(DIST_LOCAL)).toBe(raw);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * S3 (copy) · La nota del canal distribuidor no promete lo que el backend
 * no habilita.
 * ══════════════════════════════════════════════════════════════════════ */
describe("S3 · la nota del canal distribuidor no promete un reintento del mismo pedido", () => {
  it("no promete reintentar el mismo pedido y conserva la referencia y el contacto", () => {
    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={presented}
        total={1000}
        clearCart={vi.fn()}
        distributorMode
        distributorSessionFingerprint={FINGERPRINT}
        distributorDiscountPercent={20}
        submitFn={vi.fn(async (_payload: OrderPayload) => ({ kind: "unknown" as const, error: "sin red" }))}
      />,
    );

    const note = document.querySelector(".checkout-distributor-note") as HTMLElement;
    expect(note).toBeVisible();
    /* Tras un login nuevo la huella cambia: el mismo pedido NO se puede
       reintentar con la referencia anterior. */
    expect(note.textContent ?? "").not.toMatch(/reintent[áa] con el mismo pedido/i);
    expect(note.textContent ?? "").not.toMatch(/mismo pedido/i);
    /* La salida real: la referencia conservada y el contacto de RealStep. */
    expect(note.textContent ?? "").toMatch(/referencia/i);
    expect(note.textContent ?? "").toMatch(/RealStep/);
  });
});
