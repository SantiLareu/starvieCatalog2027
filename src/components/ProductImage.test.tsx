import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductImage, assetUrl } from "./ProductImage";

afterEach(cleanup);
const source = "products/palas/ETERNAL/ETERNAL1.4.webp";
const original = () => assetUrl(source);

describe("derivados de ProductModal", () => {
  it("ofrece solamente 768/1280 en la vista normal y usa 160 en miniaturas", () => {
    render(<><ProductImage source={source} original={original()} alt="principal" /><ProductImage source={source} original={original()} thumbnail alt="miniatura" /></>);
    const main = screen.getByAltText("principal");
    expect(main.getAttribute("src")).toMatch(/catalog\/product-images\/.*-768\.webp$/);
    expect(main.getAttribute("srcset")).toMatch(/-768\.webp 768w, .*?-1280\.webp 1280w$/);
    expect(main.getAttribute("srcset")).not.toContain("products/palas/");
    expect(screen.getByAltText("miniatura").getAttribute("src")).toMatch(/-160\.webp$/);
    expect(screen.getByAltText("miniatura")).not.toHaveAttribute("srcset");
  });

  it("usa el original al activar zoom y vuelve a los derivados al restablecerlo", () => {
    const { rerender } = render(<ProductImage source={source} original={original()} alt="principal" />);
    rerender(<ProductImage source={source} original={original()} alt="principal" zoomed />);
    expect(screen.getByAltText("principal")).toHaveAttribute("src", original());
    expect(screen.getByAltText("principal")).not.toHaveAttribute("srcset");
    rerender(<ProductImage source={source} original={original()} alt="principal" />);
    expect(screen.getByAltText("principal").getAttribute("src")).toMatch(/-768\.webp$/);
  });

  it("un derivado roto intenta el original antes de retirar una imagen de la galería", () => {
    const onError = vi.fn();
    render(<ProductImage source={source} original={original()} alt="principal" onError={onError} />);
    fireEvent.error(screen.getByAltText("principal"));
    expect(screen.getByAltText("principal")).toHaveAttribute("src", original());
    expect(screen.getByAltText("principal")).not.toHaveAttribute("srcset");
    expect(onError).not.toHaveBeenCalled();
    fireEvent.error(screen.getByAltText("principal"));
    expect(onError).toHaveBeenCalledOnce();
  });

  it("una miniatura ausente también tiene fallback al original", () => {
    render(<ProductImage source={source} original={original()} alt="miniatura" thumbnail />);
    fireEvent.error(screen.getByAltText("miniatura"));
    expect(screen.getByAltText("miniatura")).toHaveAttribute("src", original());
  });

  it("mantiene una imagen normal si falla el original solicitado para zoom", () => {
    const onError = vi.fn();
    render(<ProductImage source={source} original={original()} alt="principal" zoomed onError={onError} />);
    fireEvent.error(screen.getByAltText("principal"));
    expect(screen.getByAltText("principal").getAttribute("src")).toMatch(/-768\.webp$/);
    expect(onError).not.toHaveBeenCalled();
  });

  it("las rutas nuevas sin derivados mantienen el original codificado", () => {
    const unknown = "products/palas/NUEVA+/vista frontal.webp";
    render(<ProductImage source={unknown} original={assetUrl(unknown)} alt="principal" />);
    expect(screen.getByAltText("principal")).toHaveAttribute("src", assetUrl(unknown));
    expect(screen.getByAltText("principal").getAttribute("src")).toContain("NUEVA%2B/vista%20frontal.webp");
    expect(screen.getByAltText("principal")).not.toHaveAttribute("srcset");
  });
});
