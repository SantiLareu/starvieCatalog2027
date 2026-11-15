import { describe, expect, it } from "vitest";
import {
  discountBadgeLabel,
  distributorLinePricing,
  distributorPendingLabel,
  distributorPriceDisplay,
  formatAmountWithSymbol,
} from "./pricingDisplay";

const line = {
  productId: "eternal",
  qty: 1,
  listUnitPrice: 372000,
  netUnitPrice: 297600,
  netSubtotal: 297600,
};

describe("precio distribuidor (autoridad del servidor)", () => {
  it("visitante público: no muestra precio distribuidor", () => {
    expect(
      distributorPriceDisplay({
        authenticated: false,
        discountPercent: null,
        quoteStatus: "idle",
        line: null,
      }).kind,
    ).toBe("hidden");
  });

  it("con sesión pero sin cotización del servidor no inventa el importe", () => {
    const display = distributorPriceDisplay({
      authenticated: true,
      discountPercent: 20,
      quoteStatus: "idle",
      line: null,
    });
    expect(display.kind).toBe("loading");
  });

  it("muestra el neto exacto devuelto por /quote (372.000 -> 297.600)", () => {
    const display = distributorPriceDisplay({
      authenticated: true,
      discountPercent: 20,
      quoteStatus: "ready",
      line,
    });
    expect(display).toEqual({
      kind: "ready",
      discountPercent: 20,
      netUnitPrice: 297600,
    });
  });

  it("backend no disponible: informa sin mostrar un neto calculado", () => {
    const display = distributorPriceDisplay({
      authenticated: true,
      discountPercent: 20,
      quoteStatus: "unavailable",
      line: null,
    });
    expect(display.kind).toBe("unavailable");
  });

  it("etiqueta el descuento autorizado por la sesión", () => {
    expect(discountBadgeLabel(20)).toBe("20% de descuento");
  });
});

describe("precio distribuidor por línea del carrito (S2)", () => {
  it("usa el precio unitario cotizado por el servidor por la cantidad exacta de la línea", () => {
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 5,
      quote: {
        status: "ready",
        discountPercent: 20,
        line: {
          productId: "eternal",
          qty: 5,
          listUnitPrice: 372000,
          netUnitPrice: 297600,
          netSubtotal: 1488000,
        },
      },
    });
    expect(pricing).toEqual({ kind: "ready", netUnitPrice: 297600, netSubtotal: 1488000 });
  });

  it("nunca devuelve el precio de lista como precio distribuidor", () => {
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 5,
      quote: {
        status: "ready",
        discountPercent: 20,
        line: {
          productId: "eternal",
          qty: 5,
          listUnitPrice: 372000,
          netUnitPrice: 297600,
          netSubtotal: 1488000,
        },
      },
    });
    expect(pricing.kind === "ready" && pricing.netSubtotal).not.toBe(1860000);
  });

  it("acepta un precio unitario de medio centavo si coincide con el subtotal del servidor", () => {
    /* 297600.005 llega al binario como 29760000.499999996: sin un redondeo
       estable el subtotal local queda en 297600.00 y una cotización válida
       se rechaza como no disponible. */
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 1,
      quote: {
        status: "ready",
        discountPercent: 20,
        line: {
          productId: "eternal",
          qty: 1,
          listUnitPrice: 372000,
          netUnitPrice: 297600.005,
          netSubtotal: 297600.01,
        },
      },
    });
    expect(pricing).toEqual({ kind: "ready", netUnitPrice: 297600.005, netSubtotal: 297600.01 });
  });

  it("sigue fallando cerrado si el subtotal del servidor difiere en un centavo", () => {
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 1,
      quote: {
        status: "ready",
        discountPercent: 20,
        line: {
          productId: "eternal",
          qty: 1,
          listUnitPrice: 372000,
          netUnitPrice: 297600.005,
          netSubtotal: 297600.02,
        },
      },
    });
    expect(pricing.kind).toBe("unavailable");
  });

  it("falla cerrado si la cotización corresponde a otra cantidad (precio viejo)", () => {
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 5,
      quote: {
        status: "ready",
        discountPercent: 20,
        line: {
          productId: "eternal",
          qty: 1,
          listUnitPrice: 372000,
          netUnitPrice: 297600,
          netSubtotal: 297600,
        },
      },
    });
    expect(pricing.kind).toBe("loading");
  });

  it("falla cerrado si el subtotal del servidor no cuadra con el unitario por la cantidad", () => {
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 5,
      quote: {
        status: "ready",
        discountPercent: 20,
        line: {
          productId: "eternal",
          qty: 5,
          listUnitPrice: 372000,
          netUnitPrice: 297600,
          netSubtotal: 1860000,
        },
      },
    });
    expect(pricing.kind).toBe("unavailable");
  });

  it("servidor sin importe: pendiente, sin inventar un neto", () => {
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 5,
      quote: {
        status: "ready",
        discountPercent: 20,
        line: {
          productId: "eternal",
          qty: 5,
          listUnitPrice: 372000,
          netUnitPrice: null,
          netSubtotal: null,
        },
      },
    });
    expect(pricing.kind).toBe("pending");
  });

  it("cotización en vuelo o ausente: cargando", () => {
    expect(
      distributorLinePricing({ authenticated: true, productId: "eternal", qty: 1, quote: { status: "loading" } }).kind,
    ).toBe("loading");
    expect(
      distributorLinePricing({ authenticated: true, productId: "eternal", qty: 1, quote: { status: "idle" } }).kind,
    ).toBe("loading");
    expect(distributorLinePricing({ authenticated: true, productId: "eternal", qty: 1, quote: null }).kind).toBe("loading");
  });

  it("error o sesión vencida: no disponible (falla cerrado)", () => {
    expect(
      distributorLinePricing({ authenticated: true, productId: "eternal", qty: 1, quote: { status: "error" } }).kind,
    ).toBe("unavailable");
    expect(
      distributorLinePricing({ authenticated: true, productId: "eternal", qty: 1, quote: { status: "unavailable" } }).kind,
    ).toBe("unavailable");
    expect(
      distributorLinePricing({ authenticated: true, productId: "eternal", qty: 1, quote: { status: "session-expired" } })
        .kind,
    ).toBe("unavailable");
  });

  it("visitante público: no hay precio distribuidor", () => {
    expect(
      distributorLinePricing({ authenticated: false, productId: "eternal", qty: 1, quote: { status: "idle" } }).kind,
    ).toBe("hidden");
  });

  it("los rótulos de estado son distintos y en español", () => {
    expect(distributorPendingLabel("loading")).toBe("Consultando…");
    expect(distributorPendingLabel("pending")).toBe("A confirmar");
    expect(distributorPendingLabel("unavailable")).toBe("No disponible");
  });
});

describe("precisión de moneda del precio distribuidor (S2)", () => {
  const decimalQuote = (netSubtotal: number | null, productId = "eternal") => ({
    status: "ready" as const,
    discountPercent: 20,
    line: {
      productId,
      qty: 2,
      listUnitPrice: 20.01,
      netUnitPrice: 10.005,
      netSubtotal,
    },
  });

  it("redondea a centavos el subtotal calculado y lo contrasta con el del servidor", () => {
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 2,
      quote: decimalQuote(20.01),
    });
    expect(pricing).toEqual({ kind: "ready", netUnitPrice: 10.005, netSubtotal: 20.01 });
  });

  it("falla cerrado ante una diferencia de un centavo", () => {
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 2,
      quote: decimalQuote(20.02),
    });
    expect(pricing.kind).toBe("unavailable");
  });

  it("falla cerrado si la cotización es de otro producto", () => {
    const pricing = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 2,
      quote: decimalQuote(20.01, "otro producto"),
    });
    expect(pricing.kind).toBe("unavailable");
  });

  it("falla cerrado ante importes negativos o no finitos", () => {
    const negative = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 2,
      quote: {
        status: "ready",
        discountPercent: 20,
        line: {
          productId: "eternal",
          qty: 2,
          listUnitPrice: 20.01,
          netUnitPrice: -10,
          netSubtotal: -20,
        },
      },
    });
    expect(negative.kind).toBe("unavailable");
    const infinite = distributorLinePricing({
      authenticated: true,
      productId: "eternal",
      qty: 2,
      quote: {
        status: "ready",
        discountPercent: 20,
        line: {
          productId: "eternal",
          qty: 2,
          listUnitPrice: 20.01,
          netUnitPrice: Number.POSITIVE_INFINITY,
          netSubtotal: Number.POSITIVE_INFINITY,
        },
      },
    });
    expect(infinite.kind).toBe("unavailable");
  });
});

describe("importes del carrito (S5)", () => {
  it("antepone el símbolo al importe y conserva los centavos", () => {
    expect(formatAmountWithSymbol(1488000)).toBe("$ 1.488.000,00");
    expect(formatAmountWithSymbol(4761600)).toBe("$ 4.761.600,00");
  });

  it("un importe inválido no produce texto", () => {
    expect(formatAmountWithSymbol(Number.NaN)).toBe("");
  });
});
