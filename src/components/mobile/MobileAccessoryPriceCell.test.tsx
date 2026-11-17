import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DistributorProvider } from "../../commerce/distributor/DistributorContext";
import type { CommerceProduct } from "../../commerce/types";
import { MobileAccessoryPriceCell } from "./MobileAccessoryPriceCell";
import { MobileAccessoryPairPage, MobileAccessoryProductPage } from "./MobileAccessories";
import { MobilePremiumProductPage } from "./MobilePremiumProductPage";
import { mobileProductPresentation } from "../../data/mobileProductPresentation";
import { mobileAccessoryPresentations, mobileNecessairesPresentation } from "../../data/mobileAccessoryPresentation";
import catalog from "../../../generated/products.json";

/**
 * Celda de precio de las hojas mobile de accesorios (P28–37).
 *
 * Reglas que se comprueban aquí (comportamiento observable, no interno):
 *  · sin precio vivo no hay celda de precio;
 *  · el precio lista se muestra tal como lo publica el catálogo;
 *  · el precio NETO sólo existe si lo devolvió la cotización del servidor
 *    (nunca calculado en el frontend a partir del descuento);
 *  · una cotización pendiente, ajena o desactualizada no muestra importes;
 *  · la hoja inactiva no pide cotizaciones (el motor monta todas las hojas).
 */

const PRODUCT: CommerceProduct = {
  id: "pro master",
  sku: "BSTPM51000",
  nombre: "Paletero Pro Master",
  categoria: "paletero",
  subcategoria: "paletero",
  precio: 146000,
  disponible: true,
  imagenes: [],
  gama: "",
  tipoJuego: "",
  forma: "",
  plano: "",
  peso: "",
  balance: "",
  ean: "8436612942155",
  pagina: 31,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

const SESSION = {
  ok: true,
  authenticated: true,
  discountPercent: 20,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  sessionId: "Zk3vJ8xQ1nT5pR7wY2bA",
};

/** Otra sesión: el servidor autoriza otro descuento (30%). */
const SESSION_30 = { ...SESSION, discountPercent: 30 };

/** Cotización del servidor para el producto y la cantidad de la celda. */
function quote(listUnitPrice: number | null, netUnitPrice: number | null, productId = PRODUCT.id) {
  return json({
    ok: true,
    currency: "ARS",
    discountPercent: 20,
    lines: [
      {
        productId,
        qty: 1,
        listUnitPrice,
        netUnitPrice,
        netSubtotal: netUnitPrice,
      },
    ],
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

describe("celda de precio de los accesorios mobile", () => {
  it("muestra el precio lista del catálogo y nada de distribuidor sin sesión", () => {
    render(<MobileAccessoryPriceCell product={PRODUCT} active live />);
    expect(screen.getByText("PRECIO LISTA")).toBeVisible();
    expect(screen.getByText("$ 146.000")).toBeVisible();
    expect(screen.queryByText(/Distribuidor/)).toBeNull();
  });

  it("no muestra celda de precio cuando el producto vivo no tiene precio", () => {
    const { container } = render(
      <MobileAccessoryPriceCell product={{ ...PRODUCT, precio: null }} active live />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("PRECIO LISTA")).toBeNull();
  });

  it("muestra el precio neto que devolvió el servidor, sin calcularlo en el frontend", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      if (url.includes("/api/distributor/quote")) return quote(146000, 117234.56);
      throw new Error(`fetch inesperado: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    // El neto es EXACTAMENTE el del servidor: 146.000 − 20% sería 116.800.
    await waitFor(() => expect(screen.getByText("$ 117.234,56")).toBeVisible());
    expect(screen.getByText("$ 146.000")).toBeVisible();
    expect(screen.queryByText("$ 116.800")).toBeNull();
  });

  it("no muestra ningún importe de distribuidor mientras la cotización está pendiente", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) return pending.promise;
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("Consultando…")).toBeVisible());
    expect(screen.getByText("$ 146.000")).toBeVisible();
    expect(screen.queryByText(/\$ 117/)).toBeNull();
  });

  it("no muestra el neto de una cotización que pertenece a otro producto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) return quote(146000, 117234.56, "star");
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("No disponible")).toBeVisible());
    expect(screen.queryByText(/\$ 117/)).toBeNull();
  });

  it("falla cerrado cuando la cotización corresponde a un precio lista que ya cambió", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        // El servidor cotizó contra un catálogo anterior: 100.000, no 146.000.
        if (url.includes("/api/distributor/quote")) return quote(100000, 80000);
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("A confirmar")).toBeVisible());
    expect(screen.queryByText("$ 80.000")).toBeNull();
    expect(screen.getByText("$ 146.000")).toBeVisible();
  });

  it("no pide cotización mientras la hoja no está activa", async () => {
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          return quote(146000, 117234.56);
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active={false} live={false} />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("$ 146.000")).toBeVisible());
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(quoteCalls).toBe(0);
    expect(screen.queryByText("Consultando…")).toBeNull();
  });

  it("pide una sola cotización del producto y la cantidad de la celda", async () => {
    const quotes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quotes.push(url);
          return quote(146000, 117234.56);
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("$ 117.234,56")).toBeVisible());
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toContain("productId=pro+master");
    expect(quotes[0]).toContain("qty=1");
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(quotes).toHaveLength(1);
  });

  it("no reintenta la cotización cuando el servidor la rechaza", async () => {
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          // El backend no puede cotizar: 503 = ruta no disponible.
          return json({ error: "unavailable" }, 503);
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    const { container } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("No disponible")).toBeVisible());
    await new Promise(resolve => setTimeout(resolve, 250));
    // Un fallo NO se reintenta solo: la petición se queda en una.
    expect(quoteCalls).toBe(1);
    // Y ningún importe se presenta como precio final.
    const net = container.querySelector(".mobile-accessory-price__net-value");
    expect(net?.textContent).toBe("No disponible");
    expect(net?.textContent).not.toContain("$");
    expect(screen.getByText("$ 146.000")).toBeVisible();
  });

  it("no reintenta la cotización cuando la respuesta es un error del servidor", async () => {
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          return json({ ok: false }, 500);
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    const { container } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("No disponible")).toBeVisible());
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(quoteCalls).toBe(1);
    expect(container.querySelector(".mobile-accessory-price__net-value")?.textContent).not.toContain("$");
  });

  it("descarta una cotización de otra cantidad y no la vuelve a pedir", async () => {
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          // El servidor cotiza otra cantidad: no es la de esta celda.
          return json({
            ok: true,
            currency: "ARS",
            discountPercent: 20,
            lines: [{
              productId: PRODUCT.id,
              qty: 2,
              listUnitPrice: 146000,
              netUnitPrice: 117234.56,
              netSubtotal: 234469.12,
            }],
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    const { container } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("No disponible")).toBeVisible());
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(quoteCalls).toBe(1);
    expect(container.querySelector(".mobile-accessory-price__net-value")?.textContent).not.toContain("$");
    expect(screen.queryByText("$ 117.234,56")).toBeNull();
  });

  it("descarta una cotización de otro producto y no la vuelve a pedir", async () => {
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          return json({
            ok: true,
            currency: "ARS",
            discountPercent: 20,
            lines: [{
              productId: "star",
              qty: 1,
              listUnitPrice: 124800,
              netUnitPrice: 99840,
              netSubtotal: 99840,
            }],
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    const { container } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("No disponible")).toBeVisible());
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(quoteCalls).toBe(1);
    expect(container.querySelector(".mobile-accessory-price__net-value")?.textContent).not.toContain("$");
    expect(screen.queryByText("$ 99.840")).toBeNull();
  });

  it("no vuelve a pedir la cotización cuando el catálogo cambia de precio", async () => {
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          // La cotización es de un catálogo anterior: no es un precio final.
          return quote(100000, 80000);
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("A confirmar")).toBeVisible());
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(quoteCalls).toBe(1);
    expect(screen.queryByText("$ 80.000")).toBeNull();
  });

  it("no pide cotizaciones para una hoja inactiva aunque el contexto se actualice", async () => {
    let sessionCalls = 0;
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          sessionCalls += 1;
          return json(SESSION);
        }
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          return quote(146000, 117234.56);
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active={false} live={false} />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByText("$ 146.000")).toBeVisible());

    // La revalidación de sesión cambia el contexto (nuevo epoch): una hoja
    // inactiva sigue sin pedir su cotización.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(sessionCalls).toBe(2));
    expect(quoteCalls).toBe(0);
    expect(screen.queryByText("Consultando…")).toBeNull();
  });

  it("una cotización pendiente no se vuelve a pedir con renders repetidos", async () => {
    let quoteCalls = 0;
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          return pending.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    const { rerender } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );
    await waitFor(() => expect(quoteCalls).toBe(1));
    expect(screen.getByText("Consultando…")).toBeVisible();

    for (let index = 0; index < 5; index += 1) {
      rerender(
        <DistributorProvider>
          <MobileAccessoryPriceCell product={PRODUCT} active live />
        </DistributorProvider>,
      );
    }
    // Los efectos ya corrieron: una petición nueva se vería de inmediato.
    expect(quoteCalls).toBe(1);
    expect(screen.getByText("Consultando…")).toBeVisible();
  });

  it("volver a activar la hoja no hace una petición nueva con la cotización en caché", async () => {
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          return quote(146000, 117234.56);
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    const { rerender } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByText("$ 117.234,56")).toBeVisible());
    expect(quoteCalls).toBe(1);

    rerender(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active={false} live={false} />
      </DistributorProvider>,
    );
    rerender(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );
    // La cotización válida sigue en caché: no hay petición nueva a la red.
    expect(quoteCalls).toBe(1);
    expect(screen.getByText("$ 117.234,56")).toBeVisible();
  });

  it("una nueva generación de cotizaciones pide una sola vez más y oculta el neto en vuelo", async () => {
    let quoteCalls = 0;
    const second = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          if (quoteCalls === 1) return quote(146000, 117234.56);
          return second.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByText("$ 117.234,56")).toBeVisible());

    // Nueva generación de cotizaciones: se pide una vez más y el precio
    // anterior deja de estar visible mientras la nueva está en vuelo.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(quoteCalls).toBe(2));
    expect(screen.queryByText("$ 117.234,56")).toBeNull();
    expect(screen.getByText("Consultando…")).toBeVisible();
  });

  it("el descuento de la sesión no recalcula ni sustituye el neto del servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION_30);
        if (url.includes("/api/distributor/quote")) return quote(146000, 117234.56);
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    // El neto es el del servidor: 146.000 − 30% sería 102.200.
    await waitFor(() => expect(screen.getByText("$ 117.234,56")).toBeVisible());
    expect(screen.queryByText("$ 102.200")).toBeNull();
    expect(screen.queryByText("$ 102.200,00")).toBeNull();
  });

  it("deja de mostrar el neto cuando la sesión se revalida", async () => {
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) return json(SESSION);
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          // La primera cotización responde; la que pide la revalidación queda
          // en vuelo, así que el estado intermedio es observable.
          if (quoteCalls === 1) return quote(146000, 117234.56);
          const request = deferred<Response>();
          quotes.push(request);
          return request.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("$ 117.234,56")).toBeVisible());

    // Revalidación: la atribución de la cuenta es desconocida, así que el
    // precio confirmado deja de estar visible.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(screen.queryByText("$ 117.234,56")).toBeNull());
    expect(screen.getByText("Consultando…")).toBeVisible();
    expect(screen.getByText("$ 146.000")).toBeVisible();
  });
});

describe("Opción A: la piel editorial de los precios (S10)", () => {
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

  it("el visitante ve sólo la fila de precio lista: sin fila de distribuidor, sin filete y sin etiqueta", () => {
    const { container } = render(<MobileAccessoryPriceCell product={PRODUCT} active live />);
    const cell = container.querySelector(".mobile-accessory-price")!;
    // UNA fila (la de lista). La segunda fila es la de distribuidor.
    expect(cell.querySelectorAll(".mobile-accessory-price__row")).toHaveLength(1);
    expect(cell.querySelector(".mobile-accessory-price__row--list")).not.toBeNull();
    expect(cell.querySelector(".mobile-accessory-price__row--net")).toBeNull();
    // Sin etiqueta de descuento y sin rótulo de distribuidor.
    expect(cell.querySelector(".mobile-accessory-price__discount")).toBeNull();
    expect(screen.queryByText("PRECIO DISTRIBUIDOR")).toBeNull();
  });

  it("el distribuidor ve la fila PRECIO DISTRIBUIDOR con el neto del servidor y la etiqueta de descuento", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      if (url.includes("/api/distributor/quote")) {
        return serverQuote({
          productId: PRODUCT.id,
          listUnitPrice: 146000,
          netUnitPrice: 117234.56,
          discountPercent: 20,
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }));

    const { container } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("$ 117.234,56")).toBeVisible());
    const cell = container.querySelector(".mobile-accessory-price")!;
    // DOS filas: lista y distribuidor.
    expect(cell.querySelectorAll(".mobile-accessory-price__row")).toHaveLength(2);
    expect(cell.querySelector(".mobile-accessory-price__row--net")).not.toBeNull();
    expect(screen.getByText("PRECIO DISTRIBUIDOR")).toBeVisible();
    // La etiqueta usa el signo menos tipográfico (U+2212) del prototipo.
    const discount = cell.querySelector(".mobile-accessory-price__discount");
    expect(discount).not.toBeNull();
    expect(discount!.textContent).toBe(`${MINUS}20%`);
  });

  it("el porcentaje sale de la cotización del servidor, no de la sesión ni de un valor fijo", async () => {
    // La sesión autoriza 20%, pero la cotización vigente de este producto
    // devuelve 30%: la etiqueta muestra lo que dice la cotización.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      if (url.includes("/api/distributor/quote")) {
        return serverQuote({
          productId: PRODUCT.id,
          listUnitPrice: 146000,
          netUnitPrice: 102200,
          discountPercent: 30,
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }));

    const { container } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("$ 102.200")).toBeVisible());
    expect(container.querySelector(".mobile-accessory-price__discount")?.textContent).toBe(`${MINUS}30%`);
  });

  it("una cotización pendiente no muestra etiqueta de descuento ni importe neto", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      if (url.includes("/api/distributor/quote")) return pending.promise;
      throw new Error(`fetch inesperado: ${url}`);
    }));

    const { container } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("Consultando…")).toBeVisible());
    expect(container.querySelector(".mobile-accessory-price__discount")).toBeNull();
    expect(container.querySelector(".mobile-accessory-price__net-value")?.textContent).not.toContain("$");
  });

  it("una cotización desactualizada o de otro producto no muestra etiqueta de descuento", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      // Cotización de un catálogo anterior: el importe no es presentable.
      if (url.includes("/api/distributor/quote")) {
        return serverQuote({
          productId: PRODUCT.id,
          listUnitPrice: 100000,
          netUnitPrice: 80000,
          discountPercent: 20,
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }));

    const { container } = render(
      <DistributorProvider>
        <MobileAccessoryPriceCell product={PRODUCT} active live />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("A confirmar")).toBeVisible());
    expect(container.querySelector(".mobile-accessory-price__discount")).toBeNull();
    expect(screen.queryByText("$ 80.000")).toBeNull();
  });

  it("el importe lista es una caja atómica y el rótulo es un elemento aparte", () => {
    const { container } = render(
      <MobileAccessoryPriceCell product={{ ...PRODUCT, precio: 1234567.89 }} active live />,
    );
    const amount = container.querySelector(".mobile-accessory-price__amount")!;
    // El símbolo y los dígitos viajan juntos: nunca se separan.
    expect(amount.textContent).toBe("$ 1.234.567,89");
    expect(amount.childNodes).toHaveLength(1);
    expect(amount.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
    // El rótulo es otro elemento (puede partirse sin tocar el número).
    const label = container.querySelector(".mobile-accessory-price__label")!;
    expect(label.textContent).toBe("PRECIO LISTA");
    expect(label).not.toBe(amount.parentElement);
  });

  it("P37 publica un precio y un descuento propios por producto, sin mezclarlos", async () => {
    const liveProducts = catalog.products as CommerceProduct[];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) return json(SESSION);
      if (url.includes("/api/distributor/quote")) {
        const productId = new URL(url).searchParams.get("productId") ?? "";
        if (productId === "neceser navy") {
          return serverQuote({
            productId,
            listUnitPrice: 39000,
            netUnitPrice: 31200,
            discountPercent: 20,
          });
        }
        return serverQuote({
          productId,
          listUnitPrice: 39000,
          netUnitPrice: 27300,
          discountPercent: 30,
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }));

    const { container } = render(
      <DistributorProvider>
        <MobileAccessoryPairPage
          presentation={mobileNecessairesPresentation}
          products={liveProducts}
          active
          live
          load
        />
      </DistributorProvider>,
    );

    await waitFor(() => expect(screen.getByText("$ 31.200")).toBeVisible());
    const cells = container.querySelectorAll(".mobile-accessory-price");
    expect(cells).toHaveLength(2);
    const discounts = [...container.querySelectorAll(".mobile-accessory-price__discount")].map(node => node.textContent);
    // Cada neceser con SU importe y SU etiqueta: ninguno hereda el del otro.
    expect(discounts).toContain(`${MINUS}20%`);
    expect(discounts).toContain(`${MINUS}30%`);
    const nets = [...container.querySelectorAll(".mobile-accessory-price__net-value")].map(node => node.textContent);
    expect(nets).toContain("$ 31.200");
    expect(nets).toContain("$ 27.300");
  });
});

describe("celda de precio reutilizada en las hojas mobile de paletas", () => {
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

  it("publica el precio lista del catálogo en una zona propia de la hoja de paletas", () => {
    const { container } = render(
      <MobilePremiumProductPage
        product={PALA}
        presentation={mobileProductPresentation.eternal}
        load
        live
        active
      />,
    );
    const zone = container.querySelector("[data-mobile-price-zone]")!;
    expect(zone).not.toBeNull();
    const price = zone.querySelector(".mobile-accessory-price")!;
    expect(price).not.toBeNull();
    expect(price).toHaveAttribute("data-price-product", "eternal");
    expect(price.querySelector(".mobile-accessory-price__label")).toHaveTextContent("PRECIO LISTA");
    expect(price.querySelector(".mobile-accessory-price__amount")).toHaveTextContent("$ 372.000");
  });

  it("no publica precio en una hoja de paleta sin precio vivo", () => {
    const { container } = render(
      <MobilePremiumProductPage
        product={{ ...PALA, precio: null }}
        presentation={mobileProductPresentation.eternal}
        load
        live
        active
      />,
    );
    expect(container.querySelector("[data-mobile-price-zone]")).toBeNull();
  });

  it("el precio ya NO vive en el carril derecho: tiene su propia banda ancha, después de la ficha técnica", () => {
    const { container } = render(
      <MobilePremiumProductPage
        product={PALA}
        presentation={mobileProductPresentation.eternal}
        load
        live
        active
      />,
    );
    // El carril derecho queda con la sola ficha técnica: el precio ya no
    // comparte ese 24 % de ancho (86 px a 360 px), donde el rótulo de
    // distribuidor no entraba en una línea.
    const rail = container.querySelector(".mobile-premium-product-page__rail")!;
    expect(rail).not.toBeNull();
    const technical = rail.querySelector(".mobile-premium-product-page__technical")!;
    expect(technical).not.toBeNull();
    expect(rail.querySelector("[data-mobile-price-zone]")).toBeNull();
    // El precio vive en la banda ancha de la composición inferior, después
    // de la ficha técnica en el documento.
    const lower = container.querySelector(".mobile-premium-product-page__lower")!;
    expect(lower).not.toBeNull();
    const price = lower.querySelector("[data-mobile-price-zone]")!;
    expect(price).not.toBeNull();
    expect(price.parentElement).toBe(lower);
    expect((technical.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });
});

describe("orden vertical precio → CTA en las hojas mobile de accesorios", () => {
  const liveProducts = catalog.products as CommerceProduct[];

  /** ¿El primer nodo aparece ANTES que el segundo en el documento? */
  function precedes(first: Element, second: Element): boolean {
    return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }

  it("la hoja de producto único publica el precio antes del CTA y en una misma zona de flujo", () => {
    const presentation = mobileAccessoryPresentations.find(item => item.pageId === 29)!;
    const product = liveProducts.find(item => item.id === presentation.productId)!;
    const { container } = render(
      <MobileAccessoryProductPage presentation={presentation} product={product} active live load />,
    );

    // El precio y el CTA viven en la MISMA zona inferior: no son dos cajas
    // absolutas que puedan pisarse.
    const bottom = container.querySelector(".mobile-accessory-product__bottom")!;
    expect(bottom).not.toBeNull();
    const price = bottom.querySelector(".mobile-accessory-price")!;
    const cta = bottom.querySelector(".mobile-accessory-product__explore")!;
    expect(price).not.toBeNull();
    expect(cta).not.toBeNull();
    expect(precedes(price, cta)).toBe(true);
    // La ficha de datos (materiales + precio) precede al CTA.
    const facts = bottom.querySelector(".mobile-accessory-product__facts")!;
    expect(precedes(facts, cta)).toBe(true);
  });

  it("cada neceser de P37 publica su precio antes de su propio EXPLORAR", () => {
    const { container } = render(
      <MobileAccessoryPairPage presentation={mobileNecessairesPresentation} products={liveProducts} active live load />,
    );
    const blocks = container.querySelectorAll(".mobile-accessory-pair__block");
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      // Precio y CTA comparten la zona inferior del bloque (flujo, no dos
      // cajas absolutas una al lado de la otra).
      const bottom = block.querySelector(".mobile-accessory-pair__bottom")!;
      expect(bottom).not.toBeNull();
      const price = bottom.querySelector(".mobile-accessory-price")!;
      const cta = bottom.querySelector(".mobile-accessory-product__explore")!;
      expect(price).not.toBeNull();
      expect(cta).not.toBeNull();
      // Orden vertical real: primero el precio, después el CTA.
      expect(precedes(price, cta)).toBe(true);
    }
  });
});
