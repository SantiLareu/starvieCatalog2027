import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import catalog from "../../generated/products.json";
import type { CommerceProduct } from "../commerce/types";
import { coverflowProducts, Page14Coverflow } from "./Page14Coverflow";

vi.mock("../commerce/CommerceContext", () => ({
  useCommerce: () => ({ products: catalog.products }),
}));

const expectedIds = [
  "eternal", "triton t-one", "raptor+", "black titan", "triton+ power", "triton+ balance",
  "astrum+", "metheora+", "phantom", "drax+", "shade", "kyra",
];

describe("selección comercial de P14", () => {
  it("conserva el producto seleccionado durante el flip sin montar Swiper", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const { container } = render(<Page14Coverflow visible={false} activeProductId="raptor+" onActiveProductChange={vi.fn()} onProductSelect={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Raptor+" })).toBeInTheDocument();
    expect(container.querySelectorAll(".page14-coverflow__snapshot img")).toHaveLength(7);
    expect(container.querySelector(".swiper")).toBeNull();
    expect(container.querySelector(".page14-coverflow__interactive")).toHaveAttribute("inert");
    expect(container.querySelector(".page14-coverflow__snapshot img:nth-child(1)")?.getAttribute("src")).toContain("catalog/coverflow/");
  });
  it("usa los 12 IDs vigentes y el orden de las páginas de paletas", () => {
    const products = coverflowProducts(catalog.products as CommerceProduct[]);
    expect(products.map((product) => product.id)).toEqual(expectedIds);
    expect(products.map((product) => product.pagina)).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);
  });

  it("descarta retirados y mantiene productos sin stock", () => {
    const existing = catalog.products as CommerceProduct[];
    const withoutOne = existing.filter((product) => product.id !== "eternal");
    const noStock = withoutOne.map((product) => product.id === "raptor+" ? { ...product, disponible: false } : product);
    const selected = coverflowProducts(noStock);
    expect(selected.map((product) => product.id)).not.toContain("eternal");
    expect(selected.find((product) => product.id === "raptor+")?.disponible).toBe(false);
  });
});
