import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DistributorProvider } from "../commerce/distributor/DistributorContext";
import type { CommerceProduct } from "../commerce/types";
import { PagePriceTag, PriceOverlayFrame, pagePriceTargets, pagePriceZone } from "./PagePriceTag";
import { PAGE_PRICE_PLACEMENTS, pagePricePlacement } from "../data/pagePriceZones";

/**
 * Precio editorial sobre las páginas desktop del catálogo (P15–26, P28–37).
 *
 * Comportamiento observable que se fija acá:
 *  · la página decide su propia zona de precio (P38 no lleva precios);
 *  · el visitante ve sólo el PRECIO LISTA del catálogo vivo;
 *  · el distribuidor ve el neto que devolvió el servidor (nunca calculado
 *    en el frontend);
 *  · una hoja que no está a la vista no pide cotizaciones ni presenta netos;
 *  · la capa de precio es inerte: no captura el clic del hotspot ni publica
 *    identificadores de producto (los delega el motor del libro).
 */

const PALA: CommerceProduct = {
  id: "eternal",
  sku: "PSTETE41000",
  nombre: "Eternal",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 372000,
  disponible: true,
  imagenes: [],
  gama: "Super Pro",
  tipoJuego: "Versátil",
  forma: "Híbrida",
  plano: "18K Carbon",
  peso: "350–370 gr",
  balance: "Medio",
  ean: "8436612941998",
  pagina: 15,
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const SESSION = {
  ok: true,
  authenticated: true,
  discountPercent: 20,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  sessionId: "Zk3vJ8xQ1nT5pR7wY2bA",
};

function quote(productId: string, listUnitPrice: number, netUnitPrice: number | null) {
  return json({
    ok: true,
    currency: "ARS",
    discountPercent: 20,
    lines: [{ productId, qty: 1, listUnitPrice, netUnitPrice, netSubtotal: netUnitPrice }],
    listTotal: listUnitPrice,
    netTotal: netUnitPrice,
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "http://127.0.0.1:9999");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("zonas de precio por página", () => {
  it("mapea cada familia de página a su zona editorial y deja fuera P38 y P27", () => {
    expect(pagePriceZone(15, 0)).toBe("paddle");
    expect(pagePriceZone(26, 0)).toBe("paddle");
    expect(pagePriceZone(29, 0)).toBe("accessory");
    expect(pagePriceZone(36, 0)).toBe("accessory");
    expect(pagePriceZone(37, 0)).toBe("pair-left");
    expect(pagePriceZone(37, 1)).toBe("pair-right");
    // P38 (retícula de accesorios) y P27 (índice) no llevan precios.
    expect(pagePriceZone(38, 0)).toBeNull();
    expect(pagePriceZone(27, 0)).toBeNull();
    expect(pagePriceZone(1, 0)).toBeNull();
  });

  it("toma los productos de la página del mapa editorial existente", () => {
    expect(pagePriceTargets("page-15", 15)).toEqual([{ productId: "eternal", index: 0 }]);
    expect(pagePriceTargets("page-37", 37)).toEqual([
      { productId: "neceser navy", index: 0 },
      { productId: "neceser moss", index: 1 },
    ]);
    // La retícula de accesorios queda explícitamente fuera.
    expect(pagePriceTargets("page-38", 38)).toEqual([]);
    expect(pagePriceTargets("page-27", 27)).toEqual([]);
  });
});

describe("precio editorial sobre la página", () => {
  it("el visitante ve sólo el PRECIO LISTA del catálogo vivo", () => {
    render(<PagePriceTag product={PALA} pageNumber={15} index={0} active live />);
    expect(screen.getByText("PRECIO LISTA")).toBeVisible();
    expect(screen.getByText("$ 372.000")).toBeVisible();
    expect(screen.queryByText(/Distribuidor/)).toBeNull();
  });

  it("no publica precio si el producto vivo no tiene precio", () => {
    const { container } = render(
      <PagePriceTag product={{ ...PALA, precio: null }} pageNumber={15} index={0} active live />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("PRECIO LISTA")).toBeNull();
  });

  it("no publica precio en una página sin zona de precio (P38)", () => {
    const { container } = render(
      <PagePriceTag product={PALA} pageNumber={38} index={0} active live />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("el distribuidor ve el neto que devolvió el servidor, sin calcularlo en el frontend", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      if (url.includes("/api/distributor/quote")) return quote(PALA.id, 372000, 297600);
      throw new Error(`fetch inesperado: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DistributorProvider>
        <PagePriceTag product={PALA} pageNumber={15} index={0} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("$ 297.600")).toBeVisible());
    expect(screen.getByText("$ 372.000")).toBeVisible();
  });

  it("una hoja que no está a la vista no pide cotización ni presenta un neto", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      if (url.includes("/api/distributor/quote")) return quote(PALA.id, 372000, 297600);
      throw new Error(`fetch inesperado: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DistributorProvider>
        <PagePriceTag product={PALA} pageNumber={15} index={0} active={false} live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("PRECIO LISTA")).toBeVisible());
    expect(screen.queryByText(/Distribuidor/)).toBeNull();
    expect(fetchMock.mock.calls.filter(call => String(call[0]).includes("/quote"))).toHaveLength(0);
  });

  it("la capa de precio es inerte: publica su zona y ningún identificador de producto", () => {
    const { container } = render(<PagePriceTag product={PALA} pageNumber={15} index={0} active live />);
    const overlay = container.querySelector<HTMLElement>(".page-price-tag")!;
    expect(overlay).toHaveAttribute("data-price-zone", "paddle");
    expect(overlay.querySelectorAll("[data-product-id]")).toHaveLength(0);
    expect(container.querySelectorAll("button, a")).toHaveLength(0);
  });
});

describe("Opción A sobre la página (S10)", () => {
  /** Signo menos tipográfico (U+2212) como en el prototipo aprobado. */
  const MINUS = "\u2212";

  /** Cotización del servidor con su propio porcentaje (fuente de la etiqueta). */
  function serverQuote(input: {
    productId: string;
    listUnitPrice: number;
    netUnitPrice: number | null;
    discountPercent: number;
  }) {
    return json({
      ok: true,
      currency: "ARS",
      discountPercent: input.discountPercent,
      lines: [
        {
          productId: input.productId,
          qty: 1,
          listUnitPrice: input.listUnitPrice,
          netUnitPrice: input.netUnitPrice,
          netSubtotal: input.netUnitPrice,
        },
      ],
      listTotal: input.listUnitPrice,
      netTotal: input.netUnitPrice,
    });
  }

  it("el visitante ve una sola fila en la página: la de precio lista", () => {
    const { container } = render(<PagePriceTag product={PALA} pageNumber={15} index={0} active live />);
    const cell = container.querySelector(".mobile-accessory-price")!;
    expect(cell.querySelectorAll(".mobile-accessory-price__row")).toHaveLength(1);
    expect(cell.querySelector(".mobile-accessory-price__discount")).toBeNull();
    expect(screen.queryByText("PRECIO DISTRIBUIDOR")).toBeNull();
  });

  it("el distribuidor ve la fila de distribuidor con el neto y la etiqueta del servidor", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      if (url.includes("/api/distributor/quote")) {
        return serverQuote({
          productId: PALA.id,
          listUnitPrice: 372000,
          netUnitPrice: 297600,
          discountPercent: 20,
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }));

    const { container } = render(
      <DistributorProvider>
        <PagePriceTag product={PALA} pageNumber={15} index={0} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("$ 297.600")).toBeVisible());
    const cell = container.querySelector(".mobile-accessory-price")!;
    expect(cell.querySelectorAll(".mobile-accessory-price__row")).toHaveLength(2);
    expect(screen.getByText("PRECIO DISTRIBUIDOR")).toBeVisible();
    expect(cell.querySelector(".mobile-accessory-price__discount")?.textContent).toBe(`${MINUS}20%`);
  });

  it("P37 publica un precio y una etiqueta propios por cada neceser", async () => {
    const NECESER_NAVY: CommerceProduct = { ...PALA, id: "neceser navy", nombre: "Neceser Navy", precio: 39000 };
    const NECESER_MOSS: CommerceProduct = { ...PALA, id: "neceser moss", nombre: "Neceser Moss", precio: 39000 };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      if (url.includes("/api/distributor/quote")) {
        const productId = new URL(url).searchParams.get("productId") ?? "";
        if (productId === "neceser navy") {
          return serverQuote({ productId, listUnitPrice: 39000, netUnitPrice: 31200, discountPercent: 20 });
        }
        return serverQuote({ productId, listUnitPrice: 39000, netUnitPrice: 27300, discountPercent: 30 });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }));

    const { container } = render(
      <DistributorProvider>
        <PagePriceTag product={NECESER_NAVY} pageNumber={37} index={0} active live />
        <PagePriceTag product={NECESER_MOSS} pageNumber={37} index={1} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("$ 31.200")).toBeVisible());
    const cells = container.querySelectorAll(".mobile-accessory-price");
    expect(cells).toHaveLength(2);
    const discounts = [...container.querySelectorAll(".mobile-accessory-price__discount")].map(node => node.textContent);
    expect(discounts).toContain(`${MINUS}20%`);
    expect(discounts).toContain(`${MINUS}30%`);
    const nets = [...container.querySelectorAll(".mobile-accessory-price__net-value")].map(node => node.textContent);
    expect(nets).toContain("$ 31.200");
    expect(nets).toContain("$ 27.300");
  });

  it("P38 no lleva precios: ni filas ni etiqueta de descuento", () => {
    const { container } = render(
      <PagePriceTag product={PALA} pageNumber={38} index={0} active live />,
    );
    expect(container.querySelectorAll(".mobile-accessory-price")).toHaveLength(0);
    expect(container.querySelectorAll(".mobile-accessory-price__discount")).toHaveLength(0);
  });
});

describe("ubicación del precio por página (medida sobre el arte original)", () => {
  const PALA: CommerceProduct = {
    id: "eternal",
    sku: "PSTETE41000",
    nombre: "Eternal",
    categoria: "palas",
    subcategoria: "super-pro",
    precio: 372000,
    disponible: true,
    imagenes: [],
    gama: "Super Pro",
    tipoJuego: "Versátil",
    forma: "Híbrida",
    plano: "18K Carbon",
    peso: "350–370 gr",
    balance: "Medio",
    ean: "8436612941998",
    pagina: 15,
  };

  const BOLSO: CommerceProduct = { ...PALA, id: "hard eva eternal", nombre: "Paletero Hard Eva Eternal", pagina: 29 };

  it("cada página de precio tiene su propia zona libre medida", () => {
    // Una entrada explícita por página de catálogo con precio: P15–26 y P28–36.
    const pages = PAGE_PRICE_PLACEMENTS.map(placement => placement.pageNumber);
    expect(pages).toEqual([
      15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      28, 29, 30, 31, 32, 33, 34, 35, 36,
    ]);
    // P37 conserva su distribución propia (sin override por página) y P38 no lleva precios.
    expect(pages).not.toContain(37);
    expect(pages).not.toContain(38);
  });

  it("la zona de una página se publica en el estilo del chip", () => {
    const placement = pagePricePlacement(29)!;
    expect(placement).not.toBeNull();
    const { container } = render(
      <PagePriceTag product={BOLSO} pageNumber={29} index={0} active live />,
    );
    const tag = container.querySelector<HTMLElement>(".page-price-tag")!;
    expect(tag).toHaveAttribute("data-price-page", "29");
    expect(tag.style.getPropertyValue("--price-left")).toBe(`${placement.region.left}%`);
    expect(tag.style.getPropertyValue("--price-top")).toBe(`${placement.region.top}%`);
    expect(tag.style.getPropertyValue("--price-width")).toBe(`${placement.region.width}%`);
  });

  it("las páginas con arte distinto tienen zonas distintas", () => {
    // P29 tiene la firma a la izquierda de su zona libre; P28 no.
    const p28 = pagePricePlacement(28)!;
    const p29 = pagePricePlacement(29)!;
    const p30 = pagePricePlacement(30)!;
    expect(p28.region.left).not.toBe(p29.region.left);
    expect(p29.region.left).not.toBe(p30.region.left);
    // Cada zona está medida contra el arte que no se puede tapar.
    for (const placement of PAGE_PRICE_PLACEMENTS) {
      expect(placement.region.width).toBeGreaterThan(0);
      expect(placement.region.height).toBeGreaterThan(0);
      expect(placement.region.left + placement.region.width).toBeLessThanOrEqual(100.01);
      expect(placement.avoid.length).toBeGreaterThan(0);
    }
  });

  it("P37 conserva su distribución actual: sin ubicación por página", () => {
    const { container } = render(
      <PagePriceTag product={BOLSO} pageNumber={37} index={0} active live />,
    );
    const tag = container.querySelector<HTMLElement>(".page-price-tag")!;
    expect(tag).toHaveAttribute("data-price-zone", "pair-left");
    expect(tag).not.toHaveAttribute("data-price-page");
    expect(tag.style.getPropertyValue("--price-left")).toBe("");
  });

  it("la pala usa la zona de su propia página", () => {
    const { container } = render(
      <PagePriceTag product={PALA} pageNumber={15} index={0} active live />,
    );
    const tag = container.querySelector<HTMLElement>(".page-price-tag")!;
    expect(tag).toHaveAttribute("data-price-zone", "paddle");
    expect(tag).toHaveAttribute("data-price-page", "15");
    expect(tag.style.getPropertyValue("--price-left")).toBe(`${pagePricePlacement(15)!.region.left}%`);
  });
});

describe("la contención de tamaño sólo alcanza a las páginas con ubicación medida", () => {
  it("P37 conserva la capa sin marcador de contención", () => {
    const { container } = render(
      <PriceOverlayFrame pageNumber={37}><span className="page-price-tag" /></PriceOverlayFrame>,
    );
    const overlay = container.querySelector(".page-price-overlay")!;
    expect(overlay).not.toBeNull();
    expect(overlay).not.toHaveAttribute("data-price-measured");
    expect(overlay.getAttribute("class")).toBe("page-price-overlay");
  });

  it("P38 no lleva marcador (no tiene precios)", () => {
    const { container } = render(
      <PriceOverlayFrame pageNumber={38}><span /></PriceOverlayFrame>,
    );
    expect(container.querySelector(".page-price-overlay")).not.toHaveAttribute("data-price-measured");
  });

  it("las páginas con ubicación medida sí llevan el marcador", () => {
    for (const pageNumber of [15, 26, 28, 36]) {
      const { container } = render(
        <PriceOverlayFrame pageNumber={pageNumber}><span /></PriceOverlayFrame>,
      );
      expect(container.querySelector(".page-price-overlay")).toHaveAttribute("data-price-measured", "true");
    }
  });

  it("el chip con tamaño relativo a la hoja sólo existe en páginas medidas", () => {
    // El chip de P37 no lleva `data-price-page`: no recibe ni el override de
    // tamaño relativo a la hoja ni la contención que lo haría posible.
    const { container } = render(
      <PagePriceTag product={PALA} pageNumber={37} index={0} active live />,
    );
    expect(container.querySelector(".page-price-tag")).not.toHaveAttribute("data-price-page");
  });
});
