import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { products } from "../data/CatalogData";
import { ProductModal } from "./ProductModal";

describe("ProductModal", () => {
  it("muestra datos reales y cierra sin navegación", () => {
    const onClose = vi.fn();
    render(<ProductModal product={products["raptor-plus"]} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Raptor+" })).toBeVisible();
    expect(screen.getByText("PSTRP41000")).toBeVisible();
    expect(screen.getByText("320 €")).toBeVisible();
    expect(screen.getByRole("button", { name: "Agregar al pedido" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar ficha" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("se puede cerrar con Escape", () => {
    const onClose = vi.fn();
    render(<ProductModal product={products["raptor-plus"]} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
