import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOBILE_PREMIUM_PAGES, pilotPageFromSearch, usePilotViewport } from "./mobilePilot";

import { mainProductFeatures, mobileAssets, mobileProductPresentation, mobilePresentationForPage, type MobileProductPresentation } from "../../data/mobileProductPresentation";
import { ProductModal } from "../ProductModal";
import catalog from "../../../generated/products.json";
import type { CommerceProduct } from "../../commerce/types";

import { MobilePremiumProductPage } from "./MobilePremiumProductPage";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const product = catalog.products.find(candidate => candidate.id === "raptor+")! as CommerceProduct;

describe("P17 presentation and eligibility", () => {
  it("requires the explicit experiment and enables only P15/P17", () => {
    expect(pilotPageFromSearch("")).toBeNull();
    expect(pilotPageFromSearch("?mobile-pilot=17")).toBe(17);
    expect(pilotPageFromSearch("?mobile-pilot=15")).toBe(15);
    expect(MOBILE_PREMIUM_PAGES).toEqual([15, 17]);
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
    expect(mobilePresentationForPage(17)).toBe(mobileProductPresentation[product.id]);
    expect(mobilePresentationForPage(28)).toBeUndefined();
  });
  it("renders the configured premium photo; recovers the catalog presentation if it cannot load", () => {
    const { container } = render(<MobilePremiumProductPage presentation={mobileProductPresentation[product.id]} product={product} live load />);
    expect(screen.getByRole("img", { name: "Raptor+" })).toHaveAttribute("src", expect.stringContaining("hero/raptor-mobile.webp"));
    expect(container.querySelector(".mobile-premium-product-page--premium")).not.toBeNull();
    expect(screen.queryByText(/hero mobile pendiente/)).toBeNull();
    fireEvent.error(screen.getByRole("img", { name: "Raptor+" }));
    expect(container.querySelector(".mobile-premium-product-page--premium")).toBeNull();
    expect(container.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(screen.getByTestId("mobile-editorial-page").style.getPropertyValue("--mobile-premium-scene")).toBe("");
    expect(screen.getByRole("img", { name: "Raptor+" })).toHaveAttribute("srcset", expect.stringContaining("catalog/product-images/"));
    expect(screen.getByText(/hero mobile pendiente/)).toBeVisible();
  });
  it("uses four real features, without copying the mockup's EVA or Carbon 3K", () => {
    expect(mainProductFeatures(product)).toEqual([["Plano", "3D Carbon"], ["Forma", "Lágrima"], ["Peso", "350–370 g"], ["Balance", "Medio"]]);
  });
  it("does not mount a hero image when P17 is distant", () => {
    render(<MobilePremiumProductPage presentation={mobileProductPresentation[product.id]} product={product} load={false} live={false} />);
    expect(screen.queryByRole("img", { name: "Raptor+" })).toBeNull();
    expect(document.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir ficha de Raptor+" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ver ficha y opciones de pedido de Raptor+" })).toBeDisabled();
  });
  it("shows the requested technology rail, live technical data and an accessible Explore CTA", () => {
    const { container } = render(<MobilePremiumProductPage presentation={mobileProductPresentation[product.id]} product={product} load live />);
    const rail = within(screen.getByRole("complementary", { name: "Tecnologías de Raptor+" }));
    expect(rail.getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "3D Carbon Hybrid", "M-Eva Balance", "Air Booster", "Tri-Force Core", "Hexa Cell",
      "A-Shock", "Spin Boost Tech", "Longer Handgrip", "Z-shock",
    ]);
    expect(screen.getByRole("img", { name: "Punto dulce de Raptor+" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Datos técnicos de Raptor+" })).toHaveTextContent(/Versátil.*Lágrima.*3D Carbon.*350–370 GR.*Medio/);
    expect(container.querySelector(".mobile-premium-product-page__masthead")).toHaveTextContent("GAMA Super ProProfesional y semi pro");
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

describe("Eternal / P15 presentation profile", () => {
  const eternal = catalog.products.find(candidate => candidate.nombre === "Eternal")! as CommerceProduct;

  it("associates the real Eternal identity with explicit page 15 and its exact hero", () => {
    const profile = mobilePresentationForPage(15)!;
    expect(eternal.id).toBe("eternal");
    expect(profile).toBe(mobileProductPresentation.eternal);
    expect(profile).toMatchObject({ pageId: 15, productId: "eternal",
      mobileHero: { source: "/hero/eternal-mobile.png", role: "hero", scale: 1 } });
    expect(mobileAssets(eternal).assets[0]).toEqual(profile.mobileHero);
    expect(mobileAssets(eternal, "gallery").assets.map(asset => asset.source)).toEqual(eternal.imagenes);
  });

  it("renders the exact approved Eternal content using the unchanged premium template", () => {
    const profile = mobilePresentationForPage(15)!;
    expect(profile.rangeLabel).toBe("SUPER PRO");
    expect(profile.audienceLabel).toBe("PROFESIONAL Y SEMI PRO");
    expect(profile.claim).toBe("BREAK THE RULES");
    expect(profile.gameType).toBe("VERSÁTIL");
    expect(profile.specs).toEqual({ shape: "HÍBRIDA", surface: "18K CARBON", weight: "350–370 GR", balance: "MEDIO" });
    const technologies = ["18K Carbon Hybrid", "M-Eva Balance", "Aero Drive", "V-Force Bridge", "Hexa Cell",
      "Power Balance", "A-Shock", "Spin Boost Tech", "Longer Handgrip", "Z-Shock"];
    expect(profile.technologies.map(technology => technology.label)).toEqual(technologies);
    expect(profile.technologies.every(technology => technology.icon.source === "catalog/pages/page-15.webp")).toBe(true);
    expect(profile.sweetSpot).toEqual({ kind: "asset", source: "mobile/eternal-sweetspot.png", width: 162, height: 255 });
    const { container } = render(<MobilePremiumProductPage product={eternal} presentation={profile} load live />);
    const leaf = screen.getByTestId("mobile-editorial-page");
    expect(leaf).toHaveAttribute("aria-label", "Página 15, edición vertical StarVie");
    expect(screen.getByRole("heading", { name: "Eternal" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Eternal" })).toHaveAttribute("src", expect.stringContaining("/hero/eternal-mobile.png"));
    expect(leaf).toHaveTextContent(/SUPER PRO.*PROFESIONAL Y SEMI PRO.*BREAK THE RULES/);
    expect(leaf).not.toHaveTextContent(/TODO_/);
    expect(screen.getByRole("complementary", { name: "Datos técnicos de Eternal" })).toHaveTextContent(/VERSÁTIL.*HÍBRIDA.*18K CARBON.*350–370 GR.*MEDIO/);
    expect(within(screen.getByRole("complementary", { name: "Tecnologías de Eternal" })).getAllByRole("listitem").map(item => item.textContent)).toEqual(technologies);
    expect(screen.getByRole("img", { name: "Punto dulce de Eternal" })).toHaveAttribute("src", expect.stringContaining("mobile/eternal-sweetspot.png"));
    const buttons = container.querySelectorAll("[data-product-id]");
    expect(buttons).toHaveLength(3);
    buttons.forEach(button => expect(button).toHaveAttribute("data-product-id", eternal.id));
    expect(screen.getByRole("button", { name: "Explorar Eternal" })).toBeEnabled();
    expect(container.querySelector(".mobile-premium-product-page__folio")).toHaveTextContent("15");
  });

  it("enables direct entry to P15 without changing the Raptor+ profile", () => {
    expect(pilotPageFromSearch("?mobile-pilot=15")).toBe(15);
    expect(pilotPageFromSearch("?mobile-pilot=17")).toBe(17);
    expect(mobilePresentationForPage(17)).toBe(mobileProductPresentation[product.id]);
    expect(mobileAssets(product).assets[0]).toEqual({ source: "hero/raptor-mobile.webp", role: "hero", scale: 1 });
  });

  it("defers all Eternal presentation assets when its leaf is distant", () => {
    const { container } = render(<MobilePremiumProductPage product={eternal} presentation={mobileProductPresentation.eternal} load={false} live={false} />);
    expect(screen.queryByRole("img", { name: "Eternal" })).toBeNull();
    expect(container.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(screen.getByRole("img", { name: "Punto dulce de Eternal" })).not.toHaveAttribute("src");
    container.querySelectorAll<HTMLElement>(".mobile-premium-product-page__technology-icon").forEach(icon => expect(icon.style.backgroundImage).toBe(""));
    screen.getAllByRole("button").forEach(button => expect(button).toBeDisabled());
  });
});

describe("Reusable premium product template", () => {
  const anotherProduct: CommerceProduct = { ...product, id: "template-fixture", nombre: "Producto de prueba", pagina: 23,
    tipoJuego: "Control", forma: "Redonda", plano: "Superficie de prueba", peso: "360 g", balance: "Bajo" };
  const presentation: MobileProductPresentation = {
    ...mobileProductPresentation[product.id], pageId: 23, productId: anotherProduct.id,
    themeAccent: "#739cd8", heroBackgroundMode: undefined,
    rangeLabel: "Gama de prueba", audienceLabel: "Audiencia de prueba", claim: "Claim de prueba",
    mobileHero: { source: "fixtures/another-hero.webp", role: "hero", scale: .95 },
    backgroundTheme: { background: "#102030", asset: { source: "fixtures/background.webp", position: "top" } },
    technologies: [{ label: "Tecnología de prueba", icon: { source: "fixtures/icon.svg" } }],
    sweetSpot: { kind: "asset", source: "fixtures/sweet-spot.svg", width: 100, height: 156 },
  };

  it("renders a different product using only configuration, with no Raptor+ content or asset", () => {
    const { container } = render(<MobilePremiumProductPage product={anotherProduct} presentation={presentation} load live />);
    const page = screen.getByTestId("mobile-editorial-page");
    expect(page).toHaveAttribute("aria-label", "Página 23, edición vertical StarVie");
    expect(page).not.toHaveTextContent(/Raptor|BREAK THE RULES|3D Carbon Hybrid/);
    expect(screen.getByRole("heading", { name: anotherProduct.nombre })).toBeVisible();
    expect(page).toHaveTextContent(/Gama de prueba.*Audiencia de prueba.*Claim de prueba/);
    expect(screen.getByRole("listitem")).toHaveTextContent("Tecnología de prueba");
    const icon = container.querySelector<HTMLElement>(".mobile-premium-product-page__technology-icon")!;
    expect(icon.style.backgroundImage).toContain("fixtures/icon.svg");
    expect(icon.style.backgroundSize).toBe("contain");
    expect(page.style.getPropertyValue("--mobile-premium-background")).toContain('fixtures/background.webp');
    expect(page.style.getPropertyValue("--mobile-premium-background")).toContain('#102030');
    expect(page.style.getPropertyValue("--mobile-premium-accent")).toBe("#739cd8");
    expect(page.style.getPropertyValue("--mobile-premium-scene")).toContain("fixtures/another-hero.webp");
    expect(screen.getByRole("img", { name: anotherProduct.nombre })).toHaveAttribute("src", expect.stringContaining("fixtures/another-hero.webp"));
    expect(screen.getByRole("img", { name: `Punto dulce de ${anotherProduct.nombre}` })).toHaveAttribute("src", expect.stringContaining("fixtures/sweet-spot.svg"));
    expect(screen.getByRole("complementary", { name: `Datos técnicos de ${anotherProduct.nombre}` })).toHaveTextContent(/Control.*Redonda.*Superficie de prueba.*360 GR.*Bajo/);
    expect(container.querySelector(".mobile-premium-product-page__features")).toHaveTextContent(/Superficie de prueba.*Redonda.*360 g.*Bajo/);
    expect(container.querySelector(".mobile-premium-product-page__folio")).toHaveTextContent("23");
    const productButtons = container.querySelectorAll("[data-product-id]");
    expect(productButtons).toHaveLength(3);
    productButtons.forEach(button => expect(button).toHaveAttribute("data-product-id", anotherProduct.id));
  });

  it("reads updated live specs and omits absent values without changing the profile", () => {
    const { rerender } = render(<MobilePremiumProductPage product={anotherProduct} presentation={presentation} load live />);
    const updated = { ...anotherProduct, forma: "Forma actualizada", peso: "", balance: "" };
    rerender(<MobilePremiumProductPage product={updated} presentation={presentation} load live />);
    const technical = screen.getByRole("complementary", { name: `Datos técnicos de ${anotherProduct.nombre}` });
    expect(technical).toHaveTextContent("Forma actualizada");
    expect(technical).not.toHaveTextContent(/Redonda|360|Bajo|Peso|Balance/);
  });

  it("does not load deferred decorative/icon/hero assets and cannot open a mismatched product", () => {
    const { container } = render(<MobilePremiumProductPage product={product} presentation={presentation} load={false} live />);
    expect(screen.queryByRole("img", { name: product.nombre })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    screen.getAllByRole("button").forEach(button => { expect(button).toBeDisabled(); expect(button).not.toHaveAttribute("data-product-id"); });
    expect(container.querySelector<HTMLElement>(".mobile-premium-product-page__technology-icon")!.style.backgroundImage).toBe("");
    expect(screen.getByTestId("mobile-editorial-page").style.getPropertyValue("--mobile-premium-background")).toBe("#102030");
    expect(screen.getByTestId("mobile-editorial-page").style.getPropertyValue("--mobile-premium-scene")).toBe("");
    expect(container.querySelector(".mobile-premium-product-page__readability")).toBeNull();
    expect(screen.getByRole("img", { name: "Punto dulce de producto" })).not.toHaveAttribute("src");
  });

  it("the vector silhouette, zone and perforations also come from the profile", () => {
    const graphicProfile: MobileProductPresentation = { ...presentation, technologies: [], sweetSpot: {
      kind: "vector", viewBox: "0 0 20 30", transform: "scale(1)", outline: "M1 1H19V29H1Z", neck: "M8 20H12",
      zone: { cx: 10, cy: 8, rx: 5, ry: 3, color: "#123456" }, perforations: [[8, [8, 12]]],
    } };
    const { container } = render(<MobilePremiumProductPage product={anotherProduct} presentation={graphicProfile} load live />);
    const graphic = screen.getByRole("img", { name: `Punto dulce de ${anotherProduct.nombre}` });
    expect(graphic).toHaveAttribute("viewBox", "0 0 20 30");
    expect(graphic.querySelector("path")).toHaveAttribute("d", "M1 1H19V29H1Z");
    expect(graphic.querySelector("ellipse")).toHaveAttribute("cy", "8");
    expect(graphic.querySelector("ellipse")).toHaveAttribute("fill", "#123456");
    expect(graphic.querySelectorAll("circle")).toHaveLength(2);
    expect(container.querySelector(".mobile-premium-product-page__technologies")).toBeNull();
  });

  it("supports contained presentation and a per-profile readability overlay without changing assets or product actions", () => {
    const overlay = "linear-gradient(#0008, #0002)";
    const configured = { ...presentation, backgroundTheme: { ...presentation.backgroundTheme, readabilityOverlay: overlay } };
    const { container, rerender } = render(<MobilePremiumProductPage product={anotherProduct} presentation={configured} load live />);
    expect(screen.getByTestId("mobile-editorial-page").style.getPropertyValue("--mobile-premium-readability")).toBe(overlay);
    expect(container.querySelector(".mobile-premium-product-page__scene")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".mobile-premium-product-page__readability")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("img", { name: anotherProduct.nombre })).toHaveAttribute("src", expect.stringContaining("fixtures/another-hero.webp"));
    rerender(<MobilePremiumProductPage product={anotherProduct} presentation={{ ...configured, heroBackgroundMode: "contained" }} load live />);
    expect(container.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(container.querySelector(".mobile-premium-product-page__readability")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    screen.getAllByRole("button").forEach(button => expect(button).toHaveAttribute("data-product-id", anotherProduct.id));
  });

  it.each([["eternal", "#e8b957"], ["raptor+", "#e84b3e"]])("uses the explicit %s accent and loaded hero for its full-bleed scene", (id, accent) => {
    const liveProduct = catalog.products.find(candidate => candidate.id === id)! as CommerceProduct;
    const profile = mobileProductPresentation[id];
    const { container } = render(<MobilePremiumProductPage product={liveProduct} presentation={profile} load live />);
    expect(profile.themeAccent).toBe(accent);
    expect(profile.heroBackgroundMode).toBe("full-bleed");
    expect(screen.getByTestId("mobile-editorial-page").style.getPropertyValue("--mobile-premium-accent")).toBe(accent);
    expect(screen.getByTestId("mobile-editorial-page").style.getPropertyValue("--mobile-premium-scene")).toContain(profile.mobileHero!.source);
    expect(container.querySelectorAll(".mobile-premium-product-page__scene > span")).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: liveProduct.nombre })).toHaveLength(1);
    expect(container.querySelectorAll("[data-product-id]")).toHaveLength(3);
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
