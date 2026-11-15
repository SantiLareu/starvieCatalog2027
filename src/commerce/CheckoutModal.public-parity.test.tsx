/**
 * Paridad del canal PÚBLICO con origin/main.
 *
 * El canal público del checkout NO puede cambiar: ni su render de errores,
 * ni la casilla de confirmación y su vía de liberación, ni el aviso de
 * pedido incierto, ni las capacidades del canal de distribuidores (conciliación,
 * referencia, copia y contacto de RealStep).
 *
 * Estos estados se compararon, con el mismo DOM renderizado, contra
 * `git show origin/main:src/commerce/CheckoutModal.tsx` (rama base): la
 * diferencia fue NULA. Acá quedan fijados los hechos que hacen visible esa
 * paridad.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutModal } from "./CheckoutModal";
import type { CommerceProduct, PresentedLine } from "./types";

const LOCAL_KEY = "starvie-order-attempt-v2";
const SESSION_KEY = "starvie-order-attempt-v2-session";

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

const contact = { name: "Ana Test", legalName: "StarVie Test SA", email: "ana@example.com" };
const lines = [{ productId: "raptor+", qty: 2 }];

/** Siembra un intento público (mismo formato que el de origin/main). */
function seedAttempt(status?: string, createdAt = new Date().toISOString()): void {
  const marker: Record<string, unknown> = {
    version: "v2",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    orderId: null,
    lines,
    createdAt,
  };
  if (status) marker.status = status;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(marker));
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...marker, contact }));
}

function renderPublic() {
  return render(
    <CheckoutModal
      open
      onClose={vi.fn()}
      presented={presented}
      total={1000}
      clearCart={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("checkout público · paridad con origin/main", () => {
  it("idle: formulario vacío, sin avisos ni referencia", () => {
    renderPublic();
    expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
    expect((document.querySelector("#checkout-name") as HTMLInputElement).value).toBe("");
  });

  it("expired: el aviso de origin/main y ningún envío", () => {
    seedAttempt(undefined, new Date(Date.now() - 25 * 3600_000).toISOString());
    renderPublic();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Venció la ventana de seguridad de este pedido. No lo reintentes con la clave anterior; consultá a StarVie antes de iniciar otro.",
    );
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
  });

  it("failed: terminal con el texto de origin/main", () => {
    seedAttempt("failed");
    renderPublic();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Este pedido terminó sin completarse. Contactá soporte antes de iniciar otro.",
    );
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
  });

  it("unknown: reenvío con la misma referencia y sin aviso de referencia", () => {
    seedAttempt("accepted");
    renderPublic();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El resultado anterior no está confirmado. Podés consultar con la misma referencia.",
    );
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
    /* El aviso público de origin/main: sin referencia, sin copia y sin
       contacto de RealStep. */
    expect(screen.queryByRole("button", { name: "Copiar referencia" })).toBeNull();
    expect(screen.queryByRole("link", { name: "WhatsApp comercial de RealStep" })).toBeNull();
    expect(screen.queryByText("11111111-1111-4111-8111-111111111111")).toBeNull();
  });

  it("conflict: terminal con el texto de origin/main", () => {
    seedAttempt("conflict");
    renderPublic();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Este pedido terminó sin completarse. Contactá soporte antes de iniciar otro.",
    );
    expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
  });

  it("checkbox: la casilla de origin/main y su vía de liberación", async () => {
    /* Marcador dañado: el checkout queda bloqueado y ofrece la
       confirmación explícita (origin/main). */
    localStorage.setItem(LOCAL_KEY, "broken-json");
    renderPublic();

    const checkbox = screen.getByRole("checkbox", { name: /Confirmo que consulté/ });
    expect(checkbox).toBeVisible();
    expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();

    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeVisible(),
    );
  });

  it("el canal público no gana ninguna capacidad del canal de distribuidores", () => {
    seedAttempt("accepted");
    renderPublic();
    expect(screen.queryByRole("button", { name: "Consultar estado del pedido" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Iniciar una nueva compra" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar con el envío" })).toBeNull();
    expect(document.querySelector(".checkout-reconciliation")).toBeNull();
    expect(document.querySelector(".checkout-distributor-note")).toBeNull();
  });
});
