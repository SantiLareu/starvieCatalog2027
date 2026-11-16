import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DistributorProvider } from "../../commerce/distributor/DistributorContext";
import type { CommerceProduct } from "../../commerce/types";
import { MobileAccessoryPriceCell } from "./MobileAccessoryPriceCell";

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
