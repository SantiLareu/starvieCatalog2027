import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DistributorAccountButton } from "./DistributorAccountButton";

const { mockUseDistributor } = vi.hoisted(() => ({ mockUseDistributor: vi.fn() }));

vi.mock("../../commerce/distributor/DistributorContext", () => ({
  useDistributor: mockUseDistributor,
}));

afterEach(() => {
  cleanup();
  mockUseDistributor.mockReset();
});

function session(discountPercent: number) {
  mockUseDistributor.mockReturnValue({
    auth: { status: "authenticated", discountPercent, expiresAt: "2026-11-11T20:00:00.000Z" },
    isAuthenticated: true,
    discountPercent,
    login: vi.fn(),
    logout: vi.fn(async () => ({ kind: "ok" as const })),
    refreshSession: vi.fn(async () => {}),
    expireSession: vi.fn(),
    quoteFor: vi.fn(),
    ensureQuote: vi.fn(),
  });
}

describe("DistributorAccountButton · header de distribuidores (S1)", () => {
  it("con sesión el distintivo dice sólo «Distribuidor», sin porcentaje", () => {
    session(20);
    render(<DistributorAccountButton />);
    const badge = document.querySelector(".distributor-account__badge") as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("Distribuidor");
    expect(badge.textContent).not.toContain("%");
  });

  it("no muestra porcentajes en el header con cualquier descuento de sesión", () => {
    session(15);
    const { container } = render(<DistributorAccountButton />);
    expect(container.textContent).not.toContain("%");
    expect(container.textContent).not.toContain("15");
  });

  it("«Salir» es un control propio, separado del distintivo y del carrito", () => {
    session(20);
    render(<DistributorAccountButton />);
    const logout = screen.getByRole("button", { name: "Salir" });
    expect(logout).toBeVisible();
    const badge = document.querySelector(".distributor-account__badge") as HTMLElement;
    expect(badge.contains(logout)).toBe(false);
    expect(logout.className).toContain("distributor-account__logout");
  });

  it("si el servidor no confirma el cierre, avisa en vez de anunciarse como cerrado", async () => {
    mockUseDistributor.mockReturnValue({
      auth: { status: "authenticated", discountPercent: 20, expiresAt: "2026-11-11T20:00:00.000Z" },
      isAuthenticated: true,
      discountPercent: 20,
      login: vi.fn(),
      logout: vi.fn(async () => ({ kind: "unconfirmed" as const })),
      refreshSession: vi.fn(async () => {}),
      expireSession: vi.fn(),
      quoteFor: vi.fn(),
      ensureQuote: vi.fn(),
    });
    render(<DistributorAccountButton />);
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/sigue activa/);
  });

  it("sin sesión ofrece el acceso a distribuidores", () => {
    mockUseDistributor.mockReturnValue({
      auth: { status: "anonymous" },
      isAuthenticated: false,
      discountPercent: null,
      login: vi.fn(),
      logout: vi.fn(async () => {}),
      refreshSession: vi.fn(async () => {}),
      expireSession: vi.fn(),
      quoteFor: vi.fn(),
      ensureQuote: vi.fn(),
    });
    render(<DistributorAccountButton />);
    expect(screen.getByRole("button", { name: "Distribuidores" })).toBeVisible();
    expect(screen.queryByText("Salir")).toBeNull();
  });
});
