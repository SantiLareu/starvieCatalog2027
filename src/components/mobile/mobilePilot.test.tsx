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
  it("keeps deep links for P15/P16/P17/P18/P19/P20/P21/P22/P23/P24/P25/P26", () => {
    expect(pilotPageFromSearch("")).toBeNull();
    expect(pilotPageFromSearch("?mobile-pilot=17")).toBe(17);
    expect(pilotPageFromSearch("?mobile-pilot=15")).toBe(15);
    expect(pilotPageFromSearch("?mobile-pilot=16")).toBe(16);
    expect(pilotPageFromSearch("?mobile-pilot=18")).toBe(18);
    expect(pilotPageFromSearch("?mobile-pilot=19")).toBe(19);
    expect(pilotPageFromSearch("?mobile-pilot=20")).toBe(20);
    expect(pilotPageFromSearch("?mobile-pilot=21")).toBe(21);
    expect(pilotPageFromSearch("?mobile-pilot=22")).toBe(22);
    expect(pilotPageFromSearch("?mobile-pilot=23")).toBe(23);
    expect(pilotPageFromSearch("?mobile-pilot=24")).toBe(24);
    expect(pilotPageFromSearch("?mobile-pilot=25")).toBe(25);
    expect(pilotPageFromSearch("?mobile-pilot=26")).toBe(26);
    expect(MOBILE_PREMIUM_PAGES).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);
    expect(pilotPageFromSearch("?mobile-pilot=27")).toBeNull();
    expect(pilotPageFromSearch("?mobile-pilot=28")).toBeNull();
    expect(pilotPageFromSearch("?mobile-pilot")).toBe(17);
  });
  it("associates Black Titan with its real P18 identity and keeps its original commerce gallery", () => {
    const titan = catalog.products.find(candidate => candidate.id === "black titan")! as CommerceProduct;
    const presentation = mobilePresentationForPage(18)!;
    expect(titan).toMatchObject({ id: "black titan", sku: "PSTBT41000", pagina: 18 });
    expect(presentation).toBe(mobileProductPresentation[titan.id]);
    expect(presentation).toMatchObject({
      pageId: 18, productId: "black titan", title: "BLACK TITAN",
      printedDetails: { ref: "PSTBT41000", ean: "8436612942018", include: "ECOFRIENDLY GYMSACK" },
      mobileHero: { source: "/hero/titan-mobile.png", role: "hero", scale: 1 },
      themeAccent: "#36b9e8", heroBackgroundMode: "full-bleed",
      backgroundTheme: { asset: { source: "/hero/titan-ambient.webp", soften: false } },
      sweetSpot: { kind: "asset", source: "mobile/dulcetitan.png", width: 303, height: 435 },
      specs: { shape: "HÍBRIDO", surface: "24K CARBON", weight: "350-370 GR", balance: "ALTO" },
    });
    expect(presentation.technologies.map(technology => technology.label)).toEqual([
      "24K Carbon Master", "H-Eva Power", "Spin Boost Tech", "Anti-Vibe",
      "Dynamic Star", "Five Sides Tech", "Reactive Holes", "Z-shock",
    ]);
    expect(mobileAssets(titan, "gallery").assets.map(asset => asset.source)).toEqual(titan.imagenes);
    const { container } = render(<MobilePremiumProductPage presentation={presentation} product={titan} live load />);
    expect(container.querySelectorAll('button[data-product-id="black titan"]')).toHaveLength(3);
    expect(screen.getByText("REF: PSTBT41000")).toBeVisible();
    expect(screen.getByText("EAN: 8436612942018")).toBeVisible();
  });
  it("configures Tritón + Power on P19 with its exact masthead and original gallery", () => {
    const power = catalog.products.find(candidate => candidate.id === "triton+ power")! as CommerceProduct;
    const presentation = mobilePresentationForPage(19)!;
    expect(power).toMatchObject({ id: "triton+ power", sku: "PSTTP41000", pagina: 19 });
    expect(presentation).toBe(mobileProductPresentation[power.id]);
    expect(presentation).toMatchObject({
      pageId: 19, productId: "triton+ power", title: "TRITÓN + POWER",
      rangeLabel: "PRO-LINE", rangePrefix: "", audienceLabel: "HIGH LEVEL", claim: "BREAK THE RULES",
      printedDetails: { ref: "PSTTP41000", ean: "8436612942056", include: "ECOFRIENDLY GYMSACK" },
      mobileHero: { source: "/hero/power-mobile.png", role: "hero", scale: 1 },
      themeAccent: "#28bdf0", heroBackgroundMode: "full-bleed",
      backgroundTheme: { asset: { source: "/hero/power-ambient.webp", soften: false } },
      sweetSpot: { kind: "asset", source: "mobile/dulcepower.png", width: 168, height: 285 },
      gameType: "ATAQUE",
      specs: { shape: "DIAMANTE", surface: "18K CARBON", weight: "350-370 GR", balance: "ALTO" },
    });
    expect(presentation.technologies.map(technology => technology.label)).toEqual([
      "18K Carbon Hybrid", "H-Eva Power", "Spin Boost Tech", "TriTech Core",
      "Five Sides Tech", "Anatomic Bridge Design", "Longer Handgrip", "Z-shock",
    ]);
    expect(presentation.technologies.some(technology => technology.isNew)).toBe(false);
    expect(mobileAssets(power, "gallery").assets.map(asset => asset.source)).toEqual(power.imagenes);
    const { container } = render(<MobilePremiumProductPage presentation={presentation} product={power} live load />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    screen.getAllByRole("button").forEach(button => expect(button).toHaveAttribute("data-product-id", power.id));
    expect(container.querySelector(".mobile-premium-product-page__masthead strong")).toHaveTextContent(/^PRO-LINE$/);
    expect(screen.getByText("HIGH LEVEL")).toBeVisible();
    expect(screen.getByText("REF: PSTTP41000")).toBeVisible();
    expect(screen.getByText("EAN: 8436612942056")).toBeVisible();
  });
  it("configures Tritón + Balance on P20 without replacing its real catalog gallery", () => {
    const balance = catalog.products.find(candidate => candidate.id === "triton+ balance")! as CommerceProduct;
    const presentation = mobilePresentationForPage(20)!;
    expect(balance).toMatchObject({ id: "triton+ balance", sku: "PSTTB41000", pagina: 20 });
    expect(presentation).toBe(mobileProductPresentation[balance.id]);
    expect(presentation).toMatchObject({
      pageId: 20, productId: "triton+ balance", title: "TRITÓN + BALANCE",
      rangeLabel: "PRO-LINE", rangePrefix: "", audienceLabel: "HIGH LEVEL", claim: "BREAK THE RULES",
      printedDetails: { ref: "PSTTB41000", ean: "8436612942049", include: "ECOFRIENDLY GYMSACK" },
      mobileHero: { source: "/hero/balance-mobile.png", role: "hero", scale: 1 },
      themeAccent: "#f2d326", heroBackgroundMode: "full-bleed",
      backgroundTheme: { asset: { source: "/hero/balance-ambient.webp", soften: false } },
      sweetSpot: { kind: "asset", source: "mobile/dulcebalance.png", width: 180, height: 268 },
      gameType: "VERSÁTIL",
      specs: { shape: "DIAMANTE", surface: "18K CARBON", weight: "350-370 GR", balance: "MEDIO" },
    });
    expect(presentation.technologies.map(technology => technology.label)).toEqual([
      "18K Carbon Hybrid", "M-Eva Balance", "Spin Boost Tech", "TriTech Core",
      "Five Sides Tech", "Anatomic Bridge Design", "Longer Handgrip", "Z-shock",
    ]);
    expect(presentation.technologies.some(technology => technology.isNew)).toBe(false);
    expect(mobileAssets(balance, "gallery").assets.map(asset => asset.source)).toEqual(balance.imagenes);
    const { container } = render(<MobilePremiumProductPage presentation={presentation} product={balance} live load />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    screen.getAllByRole("button").forEach(button => expect(button).toHaveAttribute("data-product-id", balance.id));
    expect(container.querySelector(".mobile-premium-product-page__masthead strong")).toHaveTextContent(/^PRO-LINE$/);
    expect(screen.getByText("HIGH LEVEL")).toBeVisible();
    expect(screen.getByText("REF: PSTTB41000")).toBeVisible();
    expect(screen.getByText("EAN: 8436612942049")).toBeVisible();
  });
  it("keeps the original GAMA masthead for P15/P16/P17/P18", () => {
    for (const pageId of [15, 16, 17, 18]) {
      const presentation = mobilePresentationForPage(pageId)!;
      const original = catalog.products.find(candidate => candidate.id === presentation.productId)! as CommerceProduct;
      const { container, unmount } = render(<MobilePremiumProductPage presentation={presentation} product={original} load={false} live={false} />);
      expect(container.querySelector(".mobile-premium-product-page__masthead strong")).toHaveTextContent(/^GAMA /);
      unmount();
    }
  });
  it("renders Astrum+ with the shared court template, exact editorial data and real gallery", () => {
    const astrum = catalog.products.find(candidate => candidate.id === "astrum+")! as CommerceProduct;
    const presentation = mobilePresentationForPage(21)!;
    expect(astrum).toMatchObject({ id: "astrum+", sku: "PSTAMP41000", pagina: 21 });
    expect(mobileAssets(astrum, "gallery").assets.map(asset => asset.source)).toEqual(astrum.imagenes);
    const { container } = render(<MobilePremiumProductPage product={astrum} presentation={presentation} courtScene load live />);
    expect(screen.getByRole("heading", { name: /^ASTRUM\+$/ })).toBeVisible();
    expect(container.querySelector(".mobile-premium-product-page__masthead")).toHaveTextContent("GAMA PREMIUMINTERMEDIO");
    expect(screen.getByText("BREAK THE RULES")).toBeVisible();
    expect(screen.getByText("REF: PSTAMP41000")).toBeVisible();
    expect(screen.getByText("EAN: 8436612942032")).toBeVisible();
    expect(screen.getByText(/ECOFRIENDLY GYMSACK/)).toBeVisible();
    const rail = screen.getByRole("complementary", { name: "Tecnologías de Astrum+" });
    expect([...rail.querySelectorAll("li")].map(node => node.textContent)).toEqual([
      "12K Carbon Hyper", "M-Eva Balance", "Spin Boost Tech", "Air Booster", "Shock Shield", "Five Sides Tech", "Z-shock",
    ]);
    expect(screen.getByRole("complementary", { name: "Datos técnicos de Astrum+" })).toHaveTextContent("LÁGRIMA");
    expect(mainProductFeatures(astrum)).toEqual([
      ["Plano", "12K CARBON HYPER"], ["Forma", "LÁGRIMA"], ["Peso", "350–370 GR"], ["Balance", "MEDIO"],
    ]);
    expect(screen.getByRole("img", { name: "Punto dulce de Astrum+" })).toHaveAttribute("src", expect.stringContaining("mobile/astrum-sweetspot.png"));
    expect(screen.getByRole("img", { name: /^Astrum\+$/ })).toHaveAttribute("data-mobile-hero-source", "products/palas/ASTRUM/ASTRUM1.1.webp");
    expect(container.querySelector(".mobile-court-scene--product")).not.toBeNull();
    expect(container.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(container.querySelectorAll('button[data-product-id="astrum+"]')).toHaveLength(3);
  });
  it("renders Metheora+ on P22 with its real assets, exact data and only its two NEW technologies", () => {
    const metheora = catalog.products.find(candidate => candidate.id === "metheora+")! as CommerceProduct;
    const presentation = mobilePresentationForPage(22)!;
    expect(metheora).toMatchObject({ id: "metheora+", sku: "PSTMP41000", pagina: 22 });
    expect(presentation).toBe(mobileProductPresentation[metheora.id]);
    expect(mobileAssets(metheora, "gallery").assets.map(asset => asset.source)).toEqual(metheora.imagenes);
    const { container } = render(<MobilePremiumProductPage product={metheora} presentation={presentation} courtScene load live />);
    expect(screen.getByRole("heading", { name: /^METHEORA\+$/ })).toBeVisible();
    expect(container.querySelector(".mobile-premium-product-page__masthead")).toHaveTextContent("GAMA PREMIUMINTERMEDIO");
    expect(screen.getByText("BREAK THE RULES")).toBeVisible();
    expect(screen.getByText("REF: PSTMP41000")).toBeVisible();
    expect(screen.getByText("EAN: 8436612942063")).toBeVisible();
    expect(screen.getByText(/ECOFRIENDLY GYMSACK/)).toBeVisible();
    const rail = screen.getByRole("complementary", { name: "Tecnologías de Metheora+" });
    expect([...rail.querySelectorAll("li")].map(node => node.textContent)).toEqual([
      "12K Carbon Hyper", "M-Eva Balance", "Spin Boost Tech", "Precision Bridge NEW",
      "Core Axis NEW", "Reactive Holes", "Longer Handgrip", "Z-shock",
    ]);
    expect(presentation.technologies.filter(technology => technology.isNew).map(technology => technology.label)).toEqual(["Precision Bridge", "Core Axis"]);
    expect(mainProductFeatures(metheora)).toEqual([
      ["Plano", "12K CARBON HYPER"], ["Forma", "HÍBRIDA"], ["Peso", "350–370 GR"], ["Balance", "MEDIO"],
    ]);
    expect(screen.getByRole("img", { name: "Punto dulce de Metheora+" })).toHaveAttribute("src", expect.stringContaining("mobile/metheora-sweetspot.png"));
    expect(screen.getByRole("img", { name: /^Metheora\+$/ })).toHaveAttribute("data-mobile-hero-source", "products/palas/METHEORA/METHE1.4.webp");
    expect(container.querySelector(".mobile-court-scene--product")).not.toBeNull();
    expect(container.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(container.querySelectorAll('button[data-product-id="metheora+"]')).toHaveLength(3);
  });
  it("renders Phantom on P23 with exact printed data, real assets and its two NEW technologies", () => {
    const phantom = catalog.products.find(candidate => candidate.id === "phantom")! as CommerceProduct;
    const presentation = mobilePresentationForPage(23)!;
    expect(phantom).toMatchObject({ id: "phantom", sku: "PSTP41000", pagina: 23 });
    expect(presentation).toBe(mobileProductPresentation[phantom.id]);
    expect(mobileAssets(phantom, "gallery").assets.map(asset => asset.source)).toEqual(phantom.imagenes);
    const { container } = render(<MobilePremiumProductPage product={phantom} presentation={presentation} courtScene load live />);
    expect(screen.getByRole("heading", { name: /^PHANTOM$/ })).toBeVisible();
    expect(container.querySelector(".mobile-premium-product-page__masthead")).toHaveTextContent("GAMA PREMIUMINTERMEDIO");
    expect(screen.getByText("BREAK THE RULES")).toBeVisible();
    expect(screen.getByText("REF: PSTP41000")).toBeVisible();
    expect(screen.getByText("EAN: 8436612942070")).toBeVisible();
    expect(screen.getByText(/ECOFRIENDLY GYMSACK/)).toBeVisible();
    const rail = screen.getByRole("complementary", { name: "Tecnologías de Phantom" });
    expect([...rail.querySelectorAll("li")].map(node => node.textContent)).toEqual([
      "12K Carbon Hyper", "S-Eva Flex", "Spin Boost Tech", "Precision Bridge NEW",
      "Core Axis NEW", "Reactive Holes", "Longer Handgrip", "Z-shock",
    ]);
    expect(presentation.technologies.filter(technology => technology.isNew).map(technology => technology.label)).toEqual(["Precision Bridge", "Core Axis"]);
    expect(mainProductFeatures(phantom)).toEqual([
      ["Plano", "12K CARBON HYPER"], ["Forma", "REDONDA"], ["Peso", "347–365 GR"], ["Balance", "BAJO"],
    ]);
    expect(screen.getByRole("complementary", { name: "Datos técnicos de Phantom" })).toHaveTextContent("CONTROL");
    expect(screen.getByRole("img", { name: "Punto dulce de Phantom" })).toHaveAttribute("src", expect.stringContaining("mobile/phantom-sweetspot.png"));
    expect(screen.getByRole("img", { name: /^Phantom$/ })).toHaveAttribute("data-mobile-hero-source", "products/palas/PHANTOM/PHANTON1.1.webp");
    expect(container.querySelector(".mobile-court-scene--product")).not.toBeNull();
    expect(container.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(container.querySelectorAll('button[data-product-id="phantom"]')).toHaveLength(3);
  });
  it("renders Drax+ on P24 with exact printed data, real assets and all nine technologies in order", () => {
    const drax = catalog.products.find(candidate => candidate.id === "drax+")! as CommerceProduct;
    const presentation = mobilePresentationForPage(24)!;
    expect(drax).toMatchObject({ id: "drax+", sku: "PSTDP31000", pagina: 24 });
    expect(presentation).toBe(mobileProductPresentation[drax.id]);
    expect(mobileAssets(drax, "gallery").assets.map(asset => asset.source)).toEqual(drax.imagenes);
    const { container } = render(<MobilePremiumProductPage product={drax} presentation={presentation} courtScene load live />);
    expect(screen.getByRole("heading", { name: /^DRAX\+$/ })).toBeVisible();
    expect(container.querySelector(".mobile-premium-product-page__masthead")).toHaveTextContent("GAMA PREMIUMINTERMEDIO");
    expect(screen.getByText("BREAK THE RULES")).toBeVisible();
    expect(screen.getByText("REF: PSTDP31000")).toBeVisible();
    expect(screen.getByText("EAN: 8436612941073")).toBeVisible();
    expect(screen.getByText(/ECOFRIENDLY GYMSACK/)).toBeVisible();
    const rail = screen.getByRole("complementary", { name: "Tecnologías de Drax+" });
    expect([...rail.querySelectorAll("li")].map(node => node.textContent)).toEqual([
      "12K Carbon Hyper", "M-Eva Balance", "Spin Boost Tech", "Hepta Bridge", "Shock Shield",
      "Reactive Holes", "Longer Handgrip", "Air Flow Design", "Z-shock",
    ]);
    expect(presentation.technologies.some(technology => technology.isNew)).toBe(false);
    expect(mainProductFeatures(drax)).toEqual([
      ["Plano", "12K CARBON HYPER"], ["Forma", "LÁGRIMA"], ["Peso", "350–370 GR"], ["Balance", "MEDIO"],
    ]);
    expect(screen.getByRole("complementary", { name: "Datos técnicos de Drax+" })).toHaveTextContent("CONTROL");
    expect(screen.getByRole("img", { name: "Punto dulce de Drax+" })).toHaveAttribute("src", expect.stringContaining("mobile/drax-sweetspot.png"));
    expect(screen.getByRole("img", { name: /^Drax\+$/ })).toHaveAttribute("data-mobile-hero-source", "products/palas/DRAX/DRAX1.5.webp");
    expect(container.querySelector(".mobile-court-scene--product")).not.toBeNull();
    expect(container.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(container.querySelectorAll('button[data-product-id="drax+"]')).toHaveLength(3);
  });
  it("renders Shade on P25 with Advance labels, exact printed data and only Aluminized X-Glass marked NEW", () => {
    const shade = catalog.products.find(candidate => candidate.id === "shade")! as CommerceProduct;
    const presentation = mobilePresentationForPage(25)!;
    expect(shade).toMatchObject({ id: "shade", sku: "PSTS41000", pagina: 25 });
    expect(presentation).toBe(mobileProductPresentation[shade.id]);
    expect(mobileAssets(shade, "gallery").assets.map(asset => asset.source)).toEqual(shade.imagenes);
    const { container } = render(<MobilePremiumProductPage product={shade} presentation={presentation} courtScene load live />);
    expect(screen.getByRole("heading", { name: /^SHADE$/ })).toBeVisible();
    expect(container.querySelector(".mobile-premium-product-page__masthead")).toHaveTextContent("GAMA ADVANCEPRINCIPIANTES");
    expect(screen.getByText("BREAK THE RULES")).toBeVisible();
    expect(screen.getByText("REF: PSTS41000")).toBeVisible();
    expect(screen.getByText("EAN: 8436612942094")).toBeVisible();
    expect(screen.getByText(/ECOFRIENDLY GYMSACK/)).toBeVisible();
    const rail = screen.getByRole("complementary", { name: "Tecnologías de Shade" });
    expect([...rail.querySelectorAll("li")].map(node => node.textContent)).toEqual([
      "Aluminized X-Glass NEW", "S-Eva Flex", "Geo Bridge", "Reactive Holes", "Longer Handgrip",
    ]);
    expect(presentation.technologies.filter(technology => technology.isNew).map(technology => technology.label)).toEqual(["Aluminized X-Glass"]);
    expect(mainProductFeatures(shade)).toEqual([
      ["Plano", "ALUMINIZED X-GLASS"], ["Forma", "REDONDA"], ["Peso", "350–370 GR"], ["Balance", "BAJO"],
    ]);
    expect(screen.getByRole("complementary", { name: "Datos técnicos de Shade" })).toHaveTextContent("CONTROL");
    expect(screen.getByRole("img", { name: "Punto dulce de Shade" })).toHaveAttribute("src", expect.stringContaining("mobile/shade-sweetspot.png"));
    expect(screen.getByRole("img", { name: /^Shade$/ })).toHaveAttribute("data-mobile-hero-source", "products/palas/SHADE/SHADE1.1.webp");
    expect(container.querySelector(".mobile-court-scene--product")).not.toBeNull();
    expect(container.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(container.querySelectorAll('button[data-product-id="shade"]')).toHaveLength(3);
  });
  it("renders Kyra on P26 using the shared format, real assets and requested printed identifiers", () => {
    const kyra = catalog.products.find(candidate => candidate.id === "kyra")! as CommerceProduct;
    const presentation = mobilePresentationForPage(26)!;
    expect(kyra).toMatchObject({ id: "kyra", sku: "PSTK41000", pagina: 26 });
    expect(presentation).toBe(mobileProductPresentation[kyra.id]);
    expect(mobileAssets(kyra, "gallery").assets.map(asset => asset.source)).toEqual(kyra.imagenes);
    const { container } = render(<MobilePremiumProductPage product={kyra} presentation={presentation} courtScene load live />);
    expect(screen.getByRole("heading", { name: /^KYRA$/ })).toBeVisible();
    expect(container.querySelector(".mobile-premium-product-page__masthead")).toHaveTextContent("GAMA ADVANCEPRINCIPIANTES");
    expect(screen.getByText("BREAK THE RULES")).toBeVisible();
    expect(screen.getByText("REF: PSTS41000")).toBeVisible();
    expect(screen.getByText("EAN: 8436612942094")).toBeVisible();
    expect(screen.getByText(/ECOFRIENDLY GYMSACK/)).toBeVisible();
    const rail = screen.getByRole("complementary", { name: "Tecnologías de Kyra" });
    expect([...rail.querySelectorAll("li")].map(node => node.textContent)).toEqual([
      "X-Glass Tech", "S-Eva Flex", "Geo Bridge", "Reactive Holes", "Longer Handgrip",
    ]);
    expect(presentation.technologies.some(technology => technology.isNew)).toBe(false);
    expect(mainProductFeatures(kyra)).toEqual([
      ["Plano", "X-GLASS TECH"], ["Forma", "REDONDA"], ["Peso", "340–360 GR"], ["Balance", "BAJO"],
    ]);
    expect(screen.getByRole("complementary", { name: "Datos técnicos de Kyra" })).toHaveTextContent("CONTROL");
    expect(screen.getByRole("img", { name: "Punto dulce de Kyra" })).toHaveAttribute("src", expect.stringContaining("mobile/kyra-sweetspot.png"));
    expect(screen.getByRole("img", { name: /^Kyra$/ })).toHaveAttribute("data-mobile-hero-source", "products/palas/KYRA/KYRA1.2.webp");
    expect(container.querySelector(".mobile-court-scene--product")).not.toBeNull();
    expect(container.querySelector(".mobile-premium-product-page__scene")).toBeNull();
    expect(container.querySelectorAll('button[data-product-id="kyra"]')).toHaveLength(3);
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
    expect(page.style.getPropertyValue("--mobile-premium-scene")).toContain('fixtures/background.webp');
    expect(page.style.getPropertyValue("--mobile-premium-background")).toContain('#102030');
    expect(page.style.getPropertyValue("--mobile-premium-accent")).toBe("#739cd8");
    expect(page.style.getPropertyValue("--mobile-premium-scene")).toContain("fixtures/background.webp");
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

  it.each([["eternal", "#e8b957"], ["triton t-one", "#8b3046"], ["raptor+", "#e84b3e"]])("uses the explicit %s accent and configured full-bleed scene without replacing the foreground", (id, accent) => {
    const liveProduct = catalog.products.find(candidate => candidate.id === id)! as CommerceProduct;
    const profile = mobileProductPresentation[id];
    const { container } = render(<MobilePremiumProductPage product={liveProduct} presentation={profile} load live />);
    expect(profile.themeAccent).toBe(accent);
    expect(profile.heroBackgroundMode).toBe("full-bleed");
    expect(screen.getByTestId("mobile-editorial-page").style.getPropertyValue("--mobile-premium-accent")).toBe(accent);
    expect(screen.getByTestId("mobile-editorial-page").style.getPropertyValue("--mobile-premium-scene")).toContain(profile.backgroundTheme.asset?.source ?? profile.mobileHero!.source);
    expect(container.querySelectorAll(".mobile-premium-product-page__scene > span")).toHaveLength(profile.backgroundTheme.asset ? 0 : 2);
    expect(screen.getAllByRole("img", { name: liveProduct.nombre })).toHaveLength(1);
    expect(screen.getByRole("img", { name: liveProduct.nombre })).toHaveAttribute("src", expect.stringContaining(profile.mobileHero!.source));
    expect(container.querySelectorAll("[data-product-id]")).toHaveLength(3);
  });

  it.each(["eternal", "triton t-one", "raptor+"])("uses the configured identifiers or live catalog in the %s footer", id => {
    const liveProduct = catalog.products.find(candidate => candidate.id === id)! as CommerceProduct;
    const profile = mobileProductPresentation[id];
    const { container } = render(<MobilePremiumProductPage product={liveProduct} presentation={profile} load live />);
    const footer = container.querySelector("footer")!;
    expect(footer).toHaveTextContent("STARVIE · 2027");
    expect(footer).toHaveTextContent(`REF: ${profile.printedDetails?.ref ?? liveProduct.sku}`);
    const ean = profile.printedDetails?.ean ?? liveProduct.ean;
    if (ean) expect(footer).toHaveTextContent(`EAN: ${ean}`);
    else expect(footer).not.toHaveTextContent("EAN:");
    expect(footer).not.toHaveTextContent(/undefined|TODO_/);
    if (!profile.printedDetails?.include) expect(footer).not.toHaveTextContent("INCLUYE");
  });

  it.each([
    { sku: "", ean: "" }, { sku: "PSTRP41000", ean: "" },
    { sku: "", ean: "8436612942001" }, { sku: "PSTRP41000", ean: "8436612942001" },
  ])("independently omits missing SKU/EAN and refreshes the live footer (%j)", identifiers => {
    const profile = { ...mobileProductPresentation[product.id], printedDetails: undefined };
    const { container, rerender } = render(<MobilePremiumProductPage product={{ ...product, ...identifiers }} presentation={profile} load live />);
    const footer = () => container.querySelector("footer")!;
    if (identifiers.sku) expect(footer()).toHaveTextContent(`REF: ${identifiers.sku}`);
    else expect(footer()).not.toHaveTextContent("REF:");
    if (identifiers.ean) expect(footer()).toHaveTextContent(`EAN: ${identifiers.ean}`);
    else expect(footer()).not.toHaveTextContent("EAN:");
    rerender(<MobilePremiumProductPage product={{ ...product, sku: "  ", ean: "  " }} presentation={profile} load live />);
    expect(footer()).not.toHaveTextContent(/REF:|EAN:/);
  });

  it("prioritizes the approved printed identifiers independently, with blank overrides falling back to commerce", () => {
    const liveProduct = { ...product, sku: "LIVE-SKU", ean: "LIVE-EAN" };
    const profile = mobileProductPresentation[product.id];
    const { container, rerender } = render(<MobilePremiumProductPage product={liveProduct} presentation={profile} load live />);
    const footer = () => container.querySelector("footer")!;
    expect(footer()).toHaveTextContent("REF: PSTRP41000");
    expect(footer()).toHaveTextContent("EAN: 8436612942025");
    expect(footer()).not.toHaveTextContent(/LIVE-SKU|LIVE-EAN|INCLUYE/);
    rerender(<MobilePremiumProductPage product={liveProduct} presentation={{ ...profile, printedDetails: { ref: "PSTRP41000", ean: "  " } }} load live />);
    expect(footer()).toHaveTextContent("REF: PSTRP41000");
    expect(footer()).toHaveTextContent("EAN: LIVE-EAN");
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
