import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartDrawer } from "./CartDrawer";
import { useCommerce } from "./CommerceContext";
import { submitDistributorOrder } from "./distributor/client";
import { useOptionalDistributor } from "./distributor/DistributorContext";
import type { DistributorLoginResult, DistributorQuoteState } from "./distributor/types";
import type { CommerceProduct } from "./types";

vi.mock("./CommerceContext", () => ({ useCommerce: vi.fn() }));
// El módulo real se conserva (proveedor y contexto): sólo se intercepta la
// lectura opcional para poder fijar la sesión a mano en cada prueba.
vi.mock("./distributor/DistributorContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./distributor/DistributorContext")>();
  return { ...actual, useOptionalDistributor: vi.fn() };
});

const actualDistributor = await vi.importActual<
  typeof import("./distributor/DistributorContext")
>("./distributor/DistributorContext");

let capturedCheckoutProps: any = null;
/**
 * Prueba de continuidad de la sesión vigente del mock: el identificador
 * opaco de sesión que devuelve el backend.
 */
const SESSION_ID = "Zk3vJ8xQ1nT5pR7wY2bA";
let currentFingerprint: string | null = null;
vi.mock("./CheckoutModal", () => ({
  CHECKOUT_HERO_SRC: "checkout-hero",
  CheckoutModal: (props: any) => {
    capturedCheckoutProps = props;
    return null;
  },
}));

const mockedCommerce = vi.mocked(useCommerce);
const mockedDistributor = vi.mocked(useOptionalDistributor);

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  capturedCheckoutProps = null;
  mockedDistributor.mockReset();
  vi.unstubAllEnvs();
});

const raptor: CommerceProduct = {
  id: "raptor-plus",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 345,
  disponible: true,
  imagenes: ["products/palas/RAPTOR+/RAPTOR1.3.webp"],
  gama: "",
  tipoJuego: "",
  forma: "",
  plano: "",
  peso: "",
  balance: "",
  ean: "",
  pagina: 17,
};

function mockCommerce(overrides: Record<string, unknown> = {}) {
  mockedCommerce.mockReturnValue({
    cartOpen: true,
    setCartOpen: vi.fn(),
    setUiBusy: vi.fn(),
    presented: [{ line: { productId: raptor.id, qty: 1 }, product: raptor, subtotal: 345 }],
    units: 1,
    total: 345,
    setQty: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
    cartNotices: [],
    dismissNotices: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useCommerce>);
}

function mockDistributor(
  authenticated: boolean,
  quote: DistributorQuoteState = { status: "idle" },
) {
  const quoteFor = vi.fn(
    (_productId: string, _qty: number): DistributorQuoteState => quote,
  );
  const login = vi.fn(
    async (): Promise<DistributorLoginResult> => ({
      kind: "ok",
      discountPercent: 20,
      expiresAt: "2026-11-11T20:00:00.000Z",
      sessionId: SESSION_ID,
    }),
  );
  const logout = vi.fn(async (): Promise<{ kind: "ok" | "unconfirmed" }> => ({ kind: "ok" }));
  const refreshSession = vi.fn(async (): Promise<void> => {});
  const expireSession = vi.fn();
  const ensureQuote = vi.fn();
  const auth = authenticated
    ? {
        status: "authenticated" as const,
        discountPercent: 20,
        expiresAt: "2026-11-20T20:00:00.000Z",
        sessionId: SESSION_ID,
      }
    : { status: "anonymous" as const };
  /* La prueba de continuidad ES el identificador de sesión del backend: el
     mismo mientras la sesión siga viva, null cuando no hay sesión. */
  currentFingerprint = authenticated ? SESSION_ID : null;
  mockedDistributor.mockReturnValue(
    authenticated
      ? {
          auth,
          isAuthenticated: true,
          discountPercent: 20,
          sessionId: authenticated ? SESSION_ID : null,
          sessionFingerprint: currentFingerprint,
          quoteEpoch: 0,
          discountConfirmed: true,
          login,
          logout,
          refreshSession,
          expireSession,
          quoteFor,
          ensureQuote,
        }
      : {
          auth,
          isAuthenticated: false,
          discountPercent: null,
          sessionId: null,
          sessionFingerprint: null,
          quoteEpoch: 0,
          discountConfirmed: false,
          login,
          logout,
          refreshSession,
          expireSession,
          quoteFor,
          ensureQuote,
        },
  );
  return { quoteFor, login, logout, refreshSession, expireSession, ensureQuote, auth };
}

describe("CartDrawer · la vía distribuidor queda fijada al abrir el checkout (D1)", () => {
  it("si la sesión se pierde con el checkout abierto, no degrada a pedido público", () => {
    mockCommerce();
    mockDistributor(true);
    const { rerender } = render(<CartDrawer />);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar pedido" }));

    expect(capturedCheckoutProps.open).toBe(true);
    expect(capturedCheckoutProps.distributorMode).toBe(true);
    expect(capturedCheckoutProps.submitFn).toBe(submitDistributorOrder);
    // Prueba viva: sólo con sesión autenticada (y es un VALOR, no un objeto).
    expect(capturedCheckoutProps.distributorSessionFingerprint).toBe(currentFingerprint);
    expect(typeof capturedCheckoutProps.distributorSessionFingerprint).toBe("string");

    // La sesión vence (timer) o se cierra en otra pestaña con el checkout abierto.
    mockDistributor(false);
    rerender(<CartDrawer />);

    expect(capturedCheckoutProps.open).toBe(true);
    expect(capturedCheckoutProps.distributorMode).toBe(true);
    expect(capturedCheckoutProps.submitFn).toBe(submitDistributorOrder);
    // Sin sesión autenticada no hay prueba: el reintento se bloquearía.
    expect(capturedCheckoutProps.distributorSessionFingerprint).toBeNull();
  });

  it("el visitante público conserva el checkout público intacto", () => {
    mockCommerce();
    mockedDistributor.mockReturnValue(null);
    render(<CartDrawer />);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar pedido" }));

    expect(capturedCheckoutProps.open).toBe(true);
    expect(capturedCheckoutProps.distributorMode).toBe(false);
    expect(capturedCheckoutProps.submitFn).toBeUndefined();
  });
});

describe("CartDrawer · subtotal distribuidor (S2)", () => {
  const quoted = {
    status: "ready",
    discountPercent: 20,
    line: {
      productId: raptor.id,
      qty: 5,
      listUnitPrice: 372000,
      netUnitPrice: 297600,
      netSubtotal: 1488000,
    },
  } satisfies DistributorQuoteState;

  function mockFiveUnits() {
    mockCommerce({
      presented: [
        {
          line: { productId: raptor.id, qty: 5 },
          product: { ...raptor, precio: 372000 },
          subtotal: 1860000,
        },
      ],
      units: 5,
      total: 1860000,
    });
  }

  it("el subtotal de la línea es el precio unitario cotizado por la cantidad, no el precio lista", () => {
    mockFiveUnits();
    mockDistributor(true, quoted);
    render(<CartDrawer />);
    const drawer = screen.getByRole("dialog", { name: "Pedido" });
    const line = document.querySelector(".cart-line") as HTMLElement;
    // 5 × 297.600 = 1.488.000 (el precio lista daría 1.860.000).
    expect(line).toHaveTextContent("$ 1.488.000,00");
    expect(line).not.toHaveTextContent("1.860.000");
    expect(drawer).toHaveTextContent("$ 1.488.000,00");
  });

  it("muestra el precio unitario cotizado junto al precio lista", () => {
    mockFiveUnits();
    mockDistributor(true, quoted);
    render(<CartDrawer />);
    const drawer = screen.getByRole("dialog", { name: "Pedido" });
    expect(drawer).toHaveTextContent("Distribuidor $ 297.600,00 c/u");
    expect(drawer).toHaveTextContent("SKU PSTRP41000");
  });

  it("mientras la cotización está pendiente no muestra el subtotal lista como si fuera distribuidor", () => {
    mockFiveUnits();
    mockDistributor(true, { status: "loading" });
    render(<CartDrawer />);
    const drawer = screen.getByRole("dialog", { name: "Pedido" });
    const line = document.querySelector(".cart-line") as HTMLElement;
    expect(line).not.toHaveTextContent("1.860.000");
    expect(line).not.toHaveTextContent("$ 1.488.000,00");
    expect(drawer).toHaveTextContent("Consultando");
  });

  it("con error de cotización no inventa ningún importe distribuidor", () => {
    mockFiveUnits();
    mockDistributor(true, { status: "error" });
    render(<CartDrawer />);
    const drawer = screen.getByRole("dialog", { name: "Pedido" });
    const line = document.querySelector(".cart-line") as HTMLElement;
    expect(line).not.toHaveTextContent("$ 1.488.000,00");
    expect(drawer).toHaveTextContent("No disponible");
  });

  it("una cotización de otra cantidad no se aplica a la línea", () => {
    mockFiveUnits();
    mockDistributor(true, {
      status: "ready",
      discountPercent: 20,
      line: {
        productId: raptor.id,
        qty: 1,
        listUnitPrice: 372000,
        netUnitPrice: 297600,
        netSubtotal: 297600,
      },
    });
    render(<CartDrawer />);
    const drawer = screen.getByRole("dialog", { name: "Pedido" });
    const line = document.querySelector(".cart-line") as HTMLElement;
    expect(line).not.toHaveTextContent("$ 1.488.000,00");
    expect(line).not.toHaveTextContent("$ 297.600,00");
    expect(drawer).toHaveTextContent("Consultando");
  });

  it("el total distribuidor suma los importes cotizados y queda separado del total lista", () => {
    mockFiveUnits();
    mockDistributor(true, quoted);
    render(<CartDrawer />);
    const drawer = screen.getByRole("dialog", { name: "Pedido" });
    expect(drawer).toHaveTextContent("Total lista");
    expect(drawer).toHaveTextContent("Total distribuidor");
    // El total lista conserva su importe; el distribuidor, el cotizado.
    expect(drawer).toHaveTextContent("$ 1.860.000,00");
    expect(screen.getAllByText("$ 1.488.000,00").length).toBeGreaterThanOrEqual(2);
  });

  it("el visitante público conserva el subtotal lista tal como se publicaba", () => {
    mockFiveUnits();
    mockedDistributor.mockReturnValue(null);
    render(<CartDrawer />);
    const drawer = screen.getByRole("dialog", { name: "Pedido" });
    expect(drawer).toHaveTextContent("1.860.000,00 $");
    expect(drawer).not.toHaveTextContent("Distribuidor");
  });

  it("un producto sin precio no inventa una espera de cotización", () => {    mockCommerce({
      presented: [
        {
          line: { productId: raptor.id, qty: 2 },
          product: { ...raptor, precio: null },
          subtotal: null,
        },
      ],
      units: 2,
      total: null,
    });
    mockDistributor(true, { status: "idle" });
    render(<CartDrawer />);
    const line = document.querySelector(".cart-line") as HTMLElement;
    expect(line).not.toHaveTextContent("Distribuidor");
    expect(line).not.toHaveTextContent("Consultando");
    expect(line.querySelector(".cart-line-subtotal")).toBeNull();
  });

  it("una cotización de otro producto no se aplica a la línea", () => {
    mockFiveUnits();
    mockDistributor(true, {
      status: "ready",
      discountPercent: 20,
      line: {
        productId: "otro producto",
        qty: 5,
        listUnitPrice: 372000,
        netUnitPrice: 297600,
        netSubtotal: 1488000,
      },
    });
    render(<CartDrawer />);
    const line = document.querySelector(".cart-line") as HTMLElement;
    expect(line).not.toHaveTextContent("$ 1.488.000,00");
    expect(line).not.toHaveTextContent("$ 297.600,00");
  });

  it("el resumen distribuidor se reorganiza para no desbordar en 320 px", () => {
    mockFiveUnits();
    mockDistributor(true, quoted);
    render(<CartDrawer />);
    const row = document.querySelector(".cart-total--distributor") as HTMLElement;
    const label = row.querySelector("span") as HTMLElement;
    const amount = row.querySelector("strong") as HTMLElement;
    // El rótulo y el distintivo se apilan; el importe no se parte.
    expect(label.querySelector(".cart-distributor-badge")).not.toBeNull();
    expect(window.getComputedStyle(label).display).toBe("grid");
    expect(window.getComputedStyle(row).flexWrap).toBe("wrap");
    expect(window.getComputedStyle(amount).whiteSpace).toBe("nowrap");
  });

  it("los controles de la línea pueden envolver el importe sin solaparse", () => {
    mockFiveUnits();
    mockDistributor(true, quoted);
    render(<CartDrawer />);
    const controls = document.querySelector(".cart-line-controls") as HTMLElement;
    expect(controls.className).toContain("cart-line-controls--distributor");
    expect(window.getComputedStyle(controls).flexWrap).toBe("wrap");
  });
});

describe("CartDrawer · el descuento sólo se muestra cuando está confirmado (C1)", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("el distintivo de descuento no aparece mientras la cotización no lo confirma y vuelve al confirmarse", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "http://localhost:8787");
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({
            ok: true,
            authenticated: true,
            discountPercent: 20,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) {
          const request = deferred<Response>();
          quotes.push(request);
          return request.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    // La sesión real del proveedor: el carrito lee el contexto de verdad.
    mockedDistributor.mockImplementation(() => actualDistributor.useOptionalDistributor());
    mockCommerce({
      presented: [
        { line: { productId: raptor.id, qty: 1 }, product: raptor, subtotal: 345 },
      ],
      units: 1,
      total: 345,
    });

    const { DistributorProvider } = actualDistributor;
    render(
      <DistributorProvider>
        <CartDrawer />
      </DistributorProvider>,
    );

    // Sesión autenticada, cotización en vuelo: el descuento NO se muestra.
    await waitFor(() => expect(quotes.length).toBe(1));
    expect(document.querySelector(".cart-distributor-badge")).toBeNull();
    const line = document.querySelector(".cart-line") as HTMLElement;
    expect(line).toHaveTextContent("Consultando");
    expect(line).not.toHaveTextContent("Distribuidor $");

    // La cotización vigente confirma el descuento: el distintivo aparece.
    quotes[0].resolve(
      json({
        ok: true,
        currency: "ARS",
        discountPercent: 20,
        lines: [
          { productId: raptor.id, qty: 1, listUnitPrice: 345, netUnitPrice: 276, netSubtotal: 276 },
        ],
        listTotal: 345,
        netTotal: 276,
      }),
    );
    await waitFor(() =>
      expect(document.querySelector(".cart-distributor-badge")).not.toBeNull(),
    );
    expect(document.querySelector(".cart-distributor-badge")).toHaveTextContent("20% de descuento");
    await waitFor(() => expect(line).toHaveTextContent("Distribuidor $ 276,00 c/u"));

    // Revalidación: la cotización anterior se invalida y el descuento deja de
    // estar confirmado: no queda ni precio ni distintivo viejo visibles.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(quotes.length).toBe(2));
    expect(document.querySelector(".cart-distributor-badge")).toBeNull();
    expect(line).not.toHaveTextContent("Distribuidor $");
    expect(line).toHaveTextContent("Consultando");

    // La cotización nueva vuelve a confirmar el descuento.
    quotes[1].resolve(
      json({
        ok: true,
        currency: "ARS",
        discountPercent: 20,
        lines: [
          { productId: raptor.id, qty: 1, listUnitPrice: 345, netUnitPrice: 276, netSubtotal: 276 },
        ],
        listTotal: 345,
        netTotal: 276,
      }),
    );
    await waitFor(() =>
      expect(document.querySelector(".cart-distributor-badge")).not.toBeNull(),
    );
  });

  it("durante la revalidación no queda visible el precio ni el descuento de la sesión anterior", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "http://localhost:8787");
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    const sessions: Array<ReturnType<typeof deferred<Response>>> = [];
    let sessionCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          sessionCalls += 1;
          if (sessionCalls === 1) {
            return json({
              ok: true,
              authenticated: true,
              discountPercent: 20,
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            });
          }
          // La revalidación queda en vuelo: mientras no se sepa a qué cuenta
          // pertenece la sesión, no puede quedar visible ningún precio previo.
          const request = deferred<Response>();
          sessions.push(request);
          return request.promise;
        }
        if (url.includes("/api/distributor/quote")) {
          const request = deferred<Response>();
          quotes.push(request);
          return request.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    mockedDistributor.mockImplementation(() => actualDistributor.useOptionalDistributor());
    mockCommerce({
      presented: [
        { line: { productId: raptor.id, qty: 1 }, product: raptor, subtotal: 345 },
      ],
      units: 1,
      total: 345,
    });

    const { DistributorProvider } = actualDistributor;
    render(
      <DistributorProvider>
        <CartDrawer />
      </DistributorProvider>,
    );

    await waitFor(() => expect(quotes.length).toBe(1));
    quotes[0].resolve(
      json({
        ok: true,
        currency: "ARS",
        discountPercent: 20,
        lines: [
          { productId: raptor.id, qty: 1, listUnitPrice: 345, netUnitPrice: 276, netSubtotal: 276 },
        ],
        listTotal: 345,
        netTotal: 276,
      }),
    );
    await waitFor(() =>
      expect(document.querySelector(".cart-distributor-badge")).not.toBeNull(),
    );
    const line = document.querySelector(".cart-line") as HTMLElement;
    await waitFor(() => expect(line).toHaveTextContent("Distribuidor $ 276,00 c/u"));

    // Empieza la revalidación: sin esperar su respuesta, el precio neto y el
    // descuento de la sesión anterior ya no pueden verse.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(sessions.length).toBe(1));
    await waitFor(() => expect(document.querySelector(".cart-distributor-badge")).toBeNull());
    expect(line).not.toHaveTextContent("Distribuidor $");
    expect(line).toHaveTextContent("Consultando");

    // Llega la respuesta: se pide una cotización nueva y el precio confirmado
    // vuelve a aparecer.
    sessions[0].resolve(
      json({
        ok: true,
        authenticated: true,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    await waitFor(() => expect(quotes.length).toBe(2));
    quotes[1].resolve(
      json({
        ok: true,
        currency: "ARS",
        discountPercent: 20,
        lines: [
          { productId: raptor.id, qty: 1, listUnitPrice: 345, netUnitPrice: 276, netSubtotal: 276 },
        ],
        listTotal: 345,
        netTotal: 276,
      }),
    );
    await waitFor(() =>
      expect(document.querySelector(".cart-distributor-badge")).not.toBeNull(),
    );
    await waitFor(() => expect(line).toHaveTextContent("Distribuidor $ 276,00 c/u"));
  });

  it("el visitante público no ve distintivo de descuento ni dispara cotizaciones", () => {
    const { ensureQuote } = mockDistributor(false);
    mockCommerce({
      presented: [
        { line: { productId: raptor.id, qty: 1 }, product: raptor, subtotal: 345 },
      ],
      units: 1,
      total: 345,
    });
    render(<CartDrawer />);
    expect(document.querySelector(".cart-distributor-badge")).toBeNull();
    expect(document.querySelector(".cart-line")).toHaveTextContent("345,00 $");
    expect(ensureQuote).not.toHaveBeenCalled();
  });
});

describe("DistributorAvailabilityBridge · reconciliación de disponibilidad al iniciar sesión (C2)", () => {
  it("reconcilia una sola vez cuando la autenticación de distribuidor pasa a verdadera", async () => {
    // El módulo se importa en runtime: la prueba falla sola si el puente
    // todavía no existe, sin romper el resto del archivo.
    const bridgePath = "./DistributorAvailabilityBridge";
    const { DistributorAvailabilityBridge } = await import(/* @vite-ignore */ bridgePath);
    const reconcileAvailability = vi.fn();
    mockCommerce({ reconcileAvailability });
    mockedDistributor.mockReturnValue({ isAuthenticated: false } as never);

    const { rerender } = render(<DistributorAvailabilityBridge />);
    expect(reconcileAvailability).not.toHaveBeenCalled();

    mockedDistributor.mockReturnValue({ isAuthenticated: true } as never);
    rerender(<DistributorAvailabilityBridge />);
    expect(reconcileAvailability).toHaveBeenCalledTimes(1);

    // Sin un nuevo cambio de autenticación no se reconcilia otra vez.
    rerender(<DistributorAvailabilityBridge />);
    expect(reconcileAvailability).toHaveBeenCalledTimes(1);
  });
});
