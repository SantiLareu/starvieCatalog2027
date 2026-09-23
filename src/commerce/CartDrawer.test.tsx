import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartDrawer } from "./CartDrawer";
import { useCommerce } from "./CommerceContext";
import type { CommerceProduct } from "./types";

vi.mock("./CommerceContext", () => ({ useCommerce: vi.fn() }));

const mocked = vi.mocked(useCommerce);

afterEach(() => cleanup());

const raptor: CommerceProduct = {
  id: "raptor-plus",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 345,
  disponible: true,
  imagenes: ["products/palas/RAPTOR+/RAPTOR1.3.webp"],
  gama: "",
  tipoJuego: "",
  forma: "",
  plano: "",
  peso: "",
  balance: "",
  ean: "",
  pagina: 17,
};

function mockCommerce(overrides: Record<string, unknown> = {}) {
  mocked.mockReturnValue({
    cartOpen: true,
    setCartOpen: vi.fn(),
    setUiBusy: vi.fn(),
    presented: [],
    units: 0,
    total: 0,
    setQty: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
    cartNotices: [],
    dismissNotices: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useCommerce>);
}

describe("CartDrawer: banner de avisos", () => {
  it("agrupa varios cambios con título y detalle legible", () => {
    mockCommerce({
      cartNotices: [
        { type: "removed", productId: "eternal", name: "Eternal" },
        { type: "out-of-stock", productId: "raptor-plus", name: "Raptor+" },
      ],
    });
    render(<CartDrawer />);
    const banner = screen.getByRole("alert");
    expect(banner).toBeVisible();
    expect(banner).toHaveTextContent("Se actualizaron algunos productos de tu pedido.");
    expect(banner).toHaveTextContent("Eternal ya no está disponible y fue retirado del pedido.");
    expect(banner).toHaveTextContent("Raptor+ se quedó sin stock y fue retirado del pedido.");
  });

  it("un solo aviso se muestra sin título de grupo y se descarta", () => {
    const dismissNotices = vi.fn();
    mockCommerce({
      dismissNotices,
      cartNotices: [
        { type: "out-of-stock", productId: "raptor-plus", name: "Raptor+" },
      ],
    });
    render(<CartDrawer />);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.queryByText("Se actualizaron algunos productos de tu pedido.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(dismissNotices).toHaveBeenCalledOnce();
  });

  it("sin avisos no hay banner", () => {
    mockCommerce({ cartNotices: [] });
    render(<CartDrawer />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("la cantidad no tiene tope de inventario ni mensajes de máximo", () => {
    const setQty = vi.fn();
    mockCommerce({
      setQty,
      units: 10,
      total: 3450,
      presented: [{ line: { productId: "raptor-plus", qty: 10 }, product: raptor, subtotal: 3450 }],
    });
    render(<CartDrawer />);
    const drawer = screen.getByRole("dialog", { name: "Pedido" });
    expect(drawer).not.toHaveTextContent(/Cantidad máxima disponible/);
    expect(drawer).not.toHaveTextContent(/Stock máximo/);
    expect(drawer).not.toHaveTextContent(/unidades disponibles/);
    const more = screen.getByRole("button", { name: "Agregar una unidad" });
    expect(more).toBeEnabled();
    expect(more.title).toBe("");
    fireEvent.click(more);
    expect(setQty).toHaveBeenCalledWith("raptor-plus", 11);
  });
});
