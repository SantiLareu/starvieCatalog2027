import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pilotPageFromSearch, usePilotViewport } from "./mobilePilot";

import { mainProductFeatures, mobileAssets, mobileProductPresentation } from "../../data/mobileProductPresentation";
import { ProductModal } from "../ProductModal";
import catalog from "../../../generated/products.json";
import type { CommerceProduct } from "../../commerce/types";

import { MobileP17Page } from "./MobileP17Page";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const product = catalog.products.find(candidate => candidate.id === "raptor+")! as CommerceProduct;

describe("P17 presentation and eligibility", () => {
  it("requires the explicit experiment and enables only P17", () => {
    expect(pilotPageFromSearch("")).toBeNull();
    expect(pilotPageFromSearch("?mobile-pilot=17")).toBe(17);
    expect(pilotPageFromSearch("?mobile-pilot=27")).toBeNull();
    expect(pilotPageFromSearch("?mobile-pilot=28")).toBeNull();
    expect(pilotPageFromSearch("?mobile-pilot")).toBe(17);
  });
  it("uses real commerce gallery paths as provisional assets", () => {
    const result = mobileAssets({ ...product, id: "unconfigured-test-product" });
    expect(result.provisional).toBe(true);
    expect(result.assets.map(asset => asset.source)).toEqual(product.imagenes);
    expect(mainProductFeatures({ ...product, forma: "", balance: "", peso: "" })).toEqual([["Plano", product.plano]]);
  });
  it("declares the verified Raptor+ hero only for the page, leaving its four real gallery assets intact", () => {
    expect(product).toMatchObject({ id: "raptor+", sku: "PSTRP41000", pagina: 17 });
    expect(mobileAssets(product).assets[0]).toEqual({ source: "hero/raptor-mobile.webp", role: "hero", scale: 1 });
    expect(mobileAssets(product, "gallery").assets.map(asset => asset.source)).toEqual(product.imagenes);
    expect(mobileAssets(product, "gallery").assets.some(asset => asset.role === "hero")).toBe(false);
  });
  it("renders the configured premium photo; recovers the catalog presentation if it cannot load", () => {
    const { container } = render(<MobileP17Page product={product} live load />);
    expect(screen.getByRole("img", { name: "Raptor+" })).toHaveAttribute("src", expect.stringContaining("hero/raptor-mobile.webp"));
    expect(container.querySelector(".mobile-p17-page--premium")).not.toBeNull();
    expect(screen.queryByText(/hero mobile pendiente/)).toBeNull();
    fireEvent.error(screen.getByRole("img", { name: "Raptor+" }));
    expect(container.querySelector(".mobile-p17-page--premium")).toBeNull();
    expect(screen.getByRole("img", { name: "Raptor+" })).toHaveAttribute("srcset", expect.stringContaining("catalog/product-images/"));
    expect(screen.getByText(/hero mobile pendiente/)).toBeVisible();
  });
  it("uses four real features, without copying the mockup's EVA or Carbon 3K", () => {
    expect(mainProductFeatures(product)).toEqual([["Plano", "3D Carbon"], ["Forma", "Lágrima"], ["Peso", "350–370 g"], ["Balance", "Medio"]]);
  });
  it("does not mount a hero image when P17 is distant", () => {
    render(<MobileP17Page product={product} load={false} live={false} />);
    expect(screen.queryByRole("img", { name: "Raptor+" })).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir ficha de Raptor+" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ver ficha y opciones de pedido de Raptor+" })).toBeDisabled();
  });
  it("shows the requested technology rail, live technical data and an accessible Explore CTA", () => {
    const { container } = render(<MobileP17Page product={product} load live />);
    const rail = within(screen.getByRole("complementary", { name: "Tecnologías de Raptor+" }));
    expect(rail.getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "3D Carbon Hybrid", "M-Eva Balance", "Air Booster", "Tri-Force Core", "Hexa Cell",
      "A-Shock", "Spin Boost Tech", "Longer Handgrip", "Z-shock",
    ]);
    expect(screen.getByRole("img", { name: "Punto dulce de Raptor+" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Datos técnicos de Raptor+" })).toHaveTextContent(/Versátil.*Lágrima.*3D Carbon.*350–370 GR.*Medio/);
    expect(container.querySelector(".mobile-p17-page__masthead")).toHaveTextContent("GAMA Super ProProfesional y semi pro");
    expect(screen.getByRole("button", { name: "Explorar Raptor+" })).toBeEnabled();
    const productButton = screen.getByRole("button", { name: "Ver ficha y opciones de pedido de Raptor+" });
    expect(productButton).toBeEnabled();
    expect(productButton).toHaveAttribute("data-product-id", product.id);
    expect(productButton).toHaveAttribute("aria-haspopup", "dialog");
  });
  it("replaces mobileHero through presentation metadata without duplicating the product", () => {
    const presentation = mobileProductPresentation[product.id];
    const original = presentation.mobileHero;
    try {
      presentation.mobileHero = { source: "mobile/test-hero.webp", role: "hero", scale: 1 };
      const result = mobileAssets(product);
      expect(result.provisional).toBe(false);
      expect(result.assets[0]).toEqual(presentation.mobileHero);
      expect(result.assets.slice(1).map(asset => asset.source)).toEqual(product.imagenes);
    } finally { presentation.mobileHero = original; }
  });
  it.each([true, false])("uses the media query rather than engine orientation (%s)", matches => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    function Probe() { return <p>{usePilotViewport() ? "mobile" : "classic"}</p>; }
    render(<Probe />);
    expect(screen.getByText(matches ? "mobile" : "classic")).toBeVisible();
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 599px) and (orientation: portrait)");
  });
});

describe("P17 uses the original ProductModal", () => {
  it("opens its real four-image gallery without a premium sheet or hero", () => {
    render(<ProductModal product={product} cartQty={0} onAdd={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Raptor+" });
    expect(dialog).toHaveClass("product-modal");
    expect(document.querySelector(".mobile-v2-sheet")).toBeNull();
    expect(dialog.querySelector('img[src*="/hero/"]')).toBeNull();
    expect(within(dialog).getAllByRole("button", { name: /Ver imagen/ })).toHaveLength(4);
    expect(within(dialog).getByRole("img").getAttribute("alt")).toMatch(/imagen 1 de 4/);
  });
  it.each([null, 0, NaN])("pending price %s keeps the original quantity/order contract", precio => {
    const onAdd = vi.fn(), onClose = vi.fn();
    render(<ProductModal product={{ ...product, precio }} cartQty={0} onAdd={onAdd} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Raptor+" });
    expect(dialog).not.toHaveTextContent(/NaN|\$|Consultar precio/);
    fireEvent.click(screen.getByRole("button", { name: "Agregar una unidad" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(2);
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("keeps original tap zoom, half-step controls up to 4x and gallery reset", () => {
    render(<ProductModal product={{ ...product, precio: 100 }} cartQty={0} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelector(".product-prices")).toHaveTextContent(/Precio.*100/);
    const viewport = screen.getByRole("group", { name: "Visor ampliable de la imagen del producto" });
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    fireEvent.click(viewport);
    expect(viewport).toHaveAttribute("data-zoom", "2.00");
    for (let step = 0; step < 4; step++) fireEvent.click(screen.getByRole("button", { name: "Acercar imagen" }));
    expect(viewport).toHaveAttribute("data-zoom", "4.00");
    expect(screen.getByRole("button", { name: "Acercar imagen" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ver imagen 2" }));
    expect(viewport).toHaveAttribute("data-zoom", "1.00");
    expect(screen.getByRole("img").getAttribute("alt")).toMatch(/imagen 2 de 4/);
  });
  it("retains stock restrictions in the original modal", () => {
    render(<ProductModal product={{ ...product, disponible: false }} cartQty={0} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sin stock" })).toBeDisabled();
    expect(screen.queryByRole("group", { name: "Cantidad" })).toBeNull();
  });
});
