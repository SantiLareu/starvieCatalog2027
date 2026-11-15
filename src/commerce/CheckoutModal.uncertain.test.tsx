import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CheckoutUncertainNotice, UNCERTAIN_ORDER_MESSAGE } from "./CheckoutUncertainNotice";

const WARNING_LINES = [
  "No pudimos confirmar si RealStep recibió tu pedido.",
  "No vuelvas a enviarlo todavía.",
];
const REFERENCE = "11111111-1111-4111-8111-111111111111";

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
});

describe("aviso de pedido incierto", () => {
  it("muestra el mensaje requerido con el salto de línea exacto", () => {
    const { container } = render(<CheckoutUncertainNotice reference={REFERENCE} />);
    const paragraph = container.querySelector("aside p")!;
    expect(paragraph.textContent).toBe(UNCERTAIN_ORDER_MESSAGE);
    expect(paragraph.textContent?.split("\n")).toEqual(WARNING_LINES);
  });

  it("usa el contacto comercial real de RealStep sin llamadas de red", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<CheckoutUncertainNotice reference={REFERENCE} />);
    const link = screen.getByRole("link", { name: "WhatsApp comercial de RealStep" });
    expect(link).toHaveAttribute("href", "https://wa.me/5492235440976");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("copia la referencia y conserva el intento cuando el portapapeles falla", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CheckoutUncertainNotice reference={REFERENCE} />);
    screen.getByRole("button", { name: "Copiar referencia" }).click();
    await screen.findByText(/copiala manualmente/i);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(REFERENCE);
    expect(screen.getByText(REFERENCE)).toBeVisible();
  });

  it("no inventa una referencia cuando el registro es irrecuperable", () => {
    render(<CheckoutUncertainNotice reference={null} />);
    expect(screen.getByText(/No pudimos recuperar una referencia válida/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copiar referencia" })).toBeNull();
  });

  it("informa que consultar a RealStep no habilita por sí solo una compra nueva", () => {
    render(<CheckoutUncertainNotice reference={REFERENCE} />);
    expect(screen.getByText(/no tiene un mecanismo verificable para resolverlo/i)).toBeVisible();
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Variación del aviso para estados que NO son liberables.
 *
 * El aviso de incertidumbre ("no pudimos confirmar si RealStep recibió tu
 * pedido") es FALSO para un pedido que el servidor registró (`failed`) y
 * para un 409 cuya respuesta no prueba nada (`conflict`). El mismo
 * componente admite un mensaje propio para esos estados, SIN cambiar la
 * referencia, la copia, el contacto ni la limitación de conciliación.
 * ══════════════════════════════════════════════════════════════════════ */
const FAILED_MESSAGE =
  "El pedido llegó al servidor y puede que ya te hayan notificado por correo.\nNo vuelvas a enviarlo todavía.";
const CONFLICT_MESSAGE =
  "El resultado de este pedido no se puede verificar desde el catálogo.\nNo vuelvas a enviarlo todavía.";

describe("aviso de un pedido que no se puede liberar localmente", () => {
  it.each([
    ["failed", FAILED_MESSAGE],
    ["conflict", CONFLICT_MESSAGE],
  ])("el estado %s muestra su propio mensaje, con referencia, copia y contacto", (_state, message) => {
    const { container } = render(<CheckoutUncertainNotice reference={REFERENCE} message={message} />);
    expect(container.querySelector("aside p")!.textContent).toBe(message);
    /* La referencia original y su copia siguen disponibles. */
    expect(screen.getByText(REFERENCE)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copiar referencia" })).toBeVisible();
    /* El contacto comercial real de RealStep sigue disponible. */
    expect(screen.getByRole("link", { name: "WhatsApp comercial de RealStep" })).toHaveAttribute(
      "href",
      "https://wa.me/5492235440976",
    );
    /* La limitación sigue declarada: no hay conciliación manual verificable. */
    expect(screen.getByText(/no tiene un mecanismo verificable para resolverlo/i)).toBeVisible();
    /* El aviso de incertidumbre por defecto no se mezcla con el mensaje propio. */
    expect(screen.queryByText(/No pudimos confirmar si RealStep recibió tu pedido/)).toBeNull();
  });

  it("el aviso de incertidumbre por defecto no cambia sin variación explícita", () => {
    const { container } = render(<CheckoutUncertainNotice reference={REFERENCE} />);
    expect(container.querySelector("aside p")!.textContent).toBe(UNCERTAIN_ORDER_MESSAGE);
  });
});
