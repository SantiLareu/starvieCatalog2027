import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DistributorProvider, useDistributor } from "./DistributorContext";
import { DistributorPriceLine } from "../../components/distributor/DistributorPriceLine";

beforeEach(() => {
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "http://localhost:8787");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Identificador opaco de sesión que devuelve el backend. Es estable
 * durante la vida de la sesión y distinto en cada login.
 */
const SESSION_ID = "Zk3vJ8xQ1nT5pR7wY2bA";
/** Otra sesión del backend (otra cuenta u otro login). */
const OTHER_SESSION_ID = "Q7wY2bA0Zk3vJ8xQ1nT5pR";

function Probe() {
  const distributor = useDistributor();
  return (
    <div>
      <span data-testid="auth">
        {distributor.auth.status}
        {distributor.auth.status === "anonymous" && distributor.auth.expired ? "-expired" : ""}
      </span>
      <span data-testid="discount">{distributor.discountPercent ?? "none"}</span>
      <span data-testid="fingerprint">{distributor.sessionFingerprint ?? "none"}</span>
      <span data-testid="quote">{distributor.quoteFor("p1", 1).status}</span>
      <button type="button" onClick={() => void distributor.login("20111111112", "secreto")}>
        login
      </button>
      <button type="button" onClick={() => void distributor.logout()}>
        logout
      </button>
      <button type="button" onClick={() => distributor.ensureQuote("p1", 1)}>
        quote
      </button>
    </div>
  );
}

function authText(): string {
  return screen.getByTestId("auth").textContent ?? "";
}

function fingerprintText(): string {
  return screen.getByTestId("fingerprint").textContent ?? "";
}

/** Cotización del servidor para p1 x 1 (importes autoritativos del backend). */
function quoteResponse(discountPercent = 20): Response {
  return json({
    ok: true,
    currency: "ARS",
    discountPercent,
    lines: [
      { productId: "p1", qty: 1, listUnitPrice: 1000, netUnitPrice: 800, netSubtotal: 800 },
    ],
    listTotal: 1000,
    netTotal: 800,
  });
}

/**
 * Sonda que consume el epoch de cotizaciones: pide la cotización cuando hay
 * sesión y vuelve a pedirla en cada invalidación (el epoch se incrementa).
 * Reproduce el efecto de los consumidores reales (carrito, revista, ficha y
 * firma mobile), que dependen del epoch para re-cotizar una sola vez.
 */
function EpochProbe() {
  const distributor = useDistributor();
  const quoteEpoch = distributor.quoteEpoch;
  const discountConfirmed = distributor.discountConfirmed;
  useEffect(() => {
    if (!distributor.isAuthenticated) return;
    distributor.ensureQuote("p1", 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributor.isAuthenticated, quoteEpoch]);
  return (
    <div>
      <span data-testid="epoch-auth">
        {distributor.auth.status}
        {distributor.auth.status === "anonymous" && distributor.auth.expired ? "-expired" : ""}
      </span>
      <span data-testid="epoch">{quoteEpoch}</span>
      <span data-testid="confirmed">{String(discountConfirmed)}</span>
      <span data-testid="epoch-discount">{distributor.discountPercent ?? "none"}</span>
      <span data-testid="epoch-quote">{distributor.quoteFor("p1", 1).status}</span>
      <button type="button" onClick={() => distributor.ensureQuote("p1", 1)}>
        cotizar
      </button>
      <button type="button" onClick={() => void distributor.login("20111111112", "secreto")}>
        entrar
      </button>
      <button type="button" onClick={() => void distributor.logout()}>
        salir
      </button>
    </div>
  );
}

function epochQuoteStatus(): string {
  return screen.getByTestId("epoch-quote").textContent ?? "";
}

describe("DistributorContext · protección frente a respuestas de sesiones anteriores", () => {
  it("sin backend configurado no consulta nada y queda no disponible", async () => {
    vi.unstubAllEnvs();
    const fetchMock = vi.fn(async () => json({ ok: true, authenticated: false }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("unavailable"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    // Sin sesión ni precios: nada inventado, el acceso sigue visible.
    expect(screen.getByTestId("discount").textContent).toBe("none");
    expect(screen.getByTestId("quote").textContent).toBe("idle");
  });

  it("descarta la cotización tardía de la sesión anterior tras logout", async () => {
    const quoteRequest = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) return quoteRequest.promise;
        if (url.includes("/api/distributor/logout")) {
          return json({ ok: true, authenticated: false });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("authenticated"));

    fireEvent.click(screen.getByText("quote"));
    await waitFor(() => expect(screen.getByTestId("quote").textContent).toBe("loading"));

    fireEvent.click(screen.getByText("logout"));
    await waitFor(() => expect(authText()).toBe("anonymous"));

    // La respuesta llega tarde y con 401: no aplica importes ni vence nada.
    quoteRequest.resolve(new Response("{}", { status: 401 }));
    await waitFor(() => expect(screen.getByTestId("quote").textContent).toBe("idle"));
    expect(authText()).toBe("anonymous");
  });

  it("un cierre de sesión que el servidor no confirma no se da por cerrado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        // El servidor no revocó la sesión: la petición falla.
        if (url.includes("/api/distributor/logout")) throw new Error("sin red");
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("authenticated"));

    fireEvent.click(screen.getByText("logout"));
    await waitFor(() => expect(authText()).toBe("authenticated"));
    // La sesión sigue viva: no se limpian los precios ni se anuncia un cierre.
    expect(screen.getByTestId("quote").textContent).toBe("idle");
  });

  it("un login anterior que resuelve tarde no pisa al último iniciado", async () => {
    const firstLogin = deferred<Response>();
    let loginCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({ ok: true, authenticated: false });
        }
        if (url.includes("/api/distributor/login")) {
          loginCalls += 1;
          if (loginCalls === 1) return firstLogin.promise;
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 30,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("anonymous"));

    fireEvent.click(screen.getByText("login"));
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("discount").textContent).toBe("30"));

    firstLogin.resolve(
      json({
        ok: true,
        sessionId: loginCalls === 1 ? SESSION_ID : OTHER_SESSION_ID,
        authenticated: true,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    // Da tiempo a que la respuesta obsoleta se procese si no estuviera guardada.
    await waitFor(() => expect(loginCalls).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("discount").textContent).toBe("30");
    expect(authText()).toBe("authenticated");
  });

  it("una cotización en vuelo de la sesión anterior no altera los precios tras un nuevo login", async () => {
    const quoteRequest = deferred<Response>();
    let loginCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({ ok: true, authenticated: false });
        }
        if (url.includes("/api/distributor/login")) {
          loginCalls += 1;
          return json({
            ok: true,
            sessionId: loginCalls === 1 ? SESSION_ID : OTHER_SESSION_ID,
            authenticated: true,
            discountPercent: loginCalls === 1 ? 20 : 30,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) return quoteRequest.promise;
        if (url.includes("/api/distributor/logout")) {
          return json({ ok: true, authenticated: false });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("anonymous"));

    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("discount").textContent).toBe("20"));
    fireEvent.click(screen.getByText("quote"));
    await waitFor(() => expect(screen.getByTestId("quote").textContent).toBe("loading"));

    // Nueva identidad antes de que resuelva la cotización anterior.
    fireEvent.click(screen.getByText("logout"));
    await waitFor(() => expect(authText()).toBe("anonymous"));
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("discount").textContent).toBe("30"));

    quoteRequest.resolve(
      json({
        ok: true,
        currency: "ARS",
        discountPercent: 20,
        lines: [
          {
            productId: "p1",
            qty: 1,
            listUnitPrice: 1000,
            netUnitPrice: 800,
            netSubtotal: 800,
          },
        ],
        listTotal: 1000,
        netTotal: 800,
      }),
    );
    await waitFor(() => expect(loginCalls).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("quote").textContent).toBe("idle");
    expect(screen.getByTestId("discount").textContent).toBe("30");
    expect(authText()).toBe("authenticated");
  });
});

describe("DistributorContext · la revalidación que no puede probarse como la misma cuenta", () => {
  it("invalida la cotización lista y pide una nueva para el mismo producto y cantidad", async () => {
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          const request = deferred<Response>();
          quotes.push(request);
          return request.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <EpochProbe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("authenticated"));
    await waitFor(() => expect(quoteCalls).toBe(1));
    await waitFor(() => expect(epochQuoteStatus()).toBe("loading"));

    quotes[0].resolve(quoteResponse());
    await waitFor(() => expect(epochQuoteStatus()).toBe("ready"));

    // Revalidación (foco de la pestaña): la sesión sigue autenticada, pero el
    // contrato vigente NO permite probar que sea la misma cuenta.
    window.dispatchEvent(new Event("focus"));

    // Se pide una cotización nueva para el mismo producto y cantidad.
    await waitFor(() => expect(quoteCalls).toBe(2));
    // Y la cotización anterior deja de estar lista: no queda precio viejo.
    expect(epochQuoteStatus()).not.toBe("ready");
  });

  it("una cotización en vuelo de la sesión anterior no puebla precios tras la revalidación", async () => {
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          // Mismo descuento: el contrato no permite distinguir dos cuentas
          // con el mismo porcentaje.
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          const request = deferred<Response>();
          quotes.push(request);
          return request.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <EpochProbe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("authenticated"));
    await waitFor(() => expect(quoteCalls).toBe(1));

    // Cambio de cuenta en otra pestaña: revalidación con el mismo descuento.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(quoteCalls).toBe(2));

    // La respuesta vieja llega tarde: no puede poblar los precios.
    quotes[0].resolve(quoteResponse());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(epochQuoteStatus()).not.toBe("ready");

    // La respuesta vigente sí aplica.
    quotes[1].resolve(quoteResponse());
    await waitFor(() => expect(epochQuoteStatus()).toBe("ready"));
  });

  it("el cierre de una petición vieja no cancela la petición nueva del mismo producto", async () => {
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    let quoteCalls = 0;
    let sessionCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          sessionCalls += 1;
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: sessionCalls === 1 ? 20 : 30,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          const request = deferred<Response>();
          quotes.push(request);
          return request.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <EpochProbe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("authenticated"));
    await waitFor(() => expect(quoteCalls).toBe(1));

    // Otra cuenta: la sesión cambia y la cotización se vuelve a pedir.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(quoteCalls).toBe(2));

    // La petición vieja termina: su cierre no puede liberar la clave de la
    // petición vigente del mismo producto y cantidad.
    quotes[0].resolve(quoteResponse(20));
    await new Promise((resolve) => setTimeout(resolve, 50));

    fireEvent.click(screen.getByText("cotizar"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // La petición vigente sigue en vuelo: no hay una tercera petición.
    expect(quoteCalls).toBe(2);
  });

  it("el descuento sólo queda confirmado cuando una cotización vigente lo confirma", async () => {
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          const request = deferred<Response>();
          quotes.push(request);
          return request.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <EpochProbe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("authenticated"));
    await waitFor(() => expect(quoteCalls).toBe(1));

    // Antes de cotizar, el descuento de la sesión NO está confirmado.
    expect(screen.getByTestId("confirmed").textContent).toBe("false");

    quotes[0].resolve(quoteResponse());
    await waitFor(() => expect(screen.getByTestId("confirmed").textContent).toBe("true"));

    // Una revalidación vuelve a dejarlo sin confirmar hasta la cotización nueva.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(screen.getByTestId("confirmed").textContent).toBe("false"));
    await waitFor(() => expect(quoteCalls).toBe(2));
  });

  it("el login de la misma cuenta vuelve a cotizar y el precio con descuento aparece de nuevo", async () => {
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    let quoteCalls = 0;
    let loginCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({ ok: true, authenticated: false });
        }
        if (url.includes("/api/distributor/login")) {
          loginCalls += 1;
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          const request = deferred<Response>();
          quotes.push(request);
          return request.promise;
        }
        if (url.includes("/api/distributor/logout")) {
          return json({ ok: true, authenticated: false });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <EpochProbe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("anonymous"));

    fireEvent.click(screen.getByText("entrar"));
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("authenticated"));
    // El login invalida la cotización anterior y pide una nueva (una sola).
    await waitFor(() => expect(quoteCalls).toBe(1));
    quotes[0].resolve(quoteResponse());
    await waitFor(() => expect(epochQuoteStatus()).toBe("ready"));
    expect(screen.getByTestId("confirmed").textContent).toBe("true");

    // Salir y volver a entrar (misma cuenta): el precio con descuento vuelve.
    fireEvent.click(screen.getByText("salir"));
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("anonymous"));
    fireEvent.click(screen.getByText("entrar"));
    await waitFor(() => expect(loginCalls).toBe(2));
    await waitFor(() => expect(quoteCalls).toBe(2));
    quotes[1].resolve(quoteResponse());
    await waitFor(() => expect(epochQuoteStatus()).toBe("ready"));
    expect(screen.getByTestId("epoch-discount").textContent).toBe("20");
  });

  it("la sesión vencida limpia las cotizaciones y marca la sesión como expirada", async () => {
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    let quoteCalls = 0;
    let sessionCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          sessionCalls += 1;
          if (sessionCalls === 1) {
            return json({
              ok: true,
              sessionId: SESSION_ID,
              authenticated: true,
              discountPercent: 20,
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            });
          }
          return json({ ok: true, authenticated: false });
        }
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          const request = deferred<Response>();
          quotes.push(request);
          return request.promise;
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <EpochProbe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("authenticated"));
    await waitFor(() => expect(quoteCalls).toBe(1));
    quotes[0].resolve(quoteResponse());
    await waitFor(() => expect(epochQuoteStatus()).toBe("ready"));

    // La sesión venció en el servidor: la revalidación la deja expirada.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() =>
      expect(screen.getByTestId("epoch-auth").textContent).toBe("anonymous-expired"),
    );
    expect(epochQuoteStatus()).not.toBe("ready");
    expect(screen.getByTestId("confirmed").textContent).toBe("false");
  });

  it("una sesión vencida borra la huella (no hay continuidad)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          // El servidor ya no reconoce la sesión.
          return json({ ok: true, authenticated: false });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("anonymous"));
    expect(fingerprintText()).toBe("none");
  });
});

describe("DistributorContext · la revalidación oculta los precios desde que empieza (C-A)", () => {
  it("mientras la revalidación está en curso no queda cotización lista ni descuento confirmado", async () => {
    const sessions: Array<ReturnType<typeof deferred<Response>>> = [];
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    let sessionCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          sessionCalls += 1;
          if (sessionCalls === 1) {
            return json({
              ok: true,
              sessionId: SESSION_ID,
              authenticated: true,
              discountPercent: 20,
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            });
          }
          // La revalidación queda en vuelo: la atribución de la cuenta es
          // desconocida mientras tanto.
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

    render(
      <DistributorProvider>
        <EpochProbe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("authenticated"));
    await waitFor(() => expect(quotes.length).toBe(1));
    quotes[0].resolve(quoteResponse());
    await waitFor(() => expect(epochQuoteStatus()).toBe("ready"));
    expect(screen.getByTestId("confirmed").textContent).toBe("true");

    // Empieza la revalidación: sin esperar la respuesta, la cotización
    // anterior ya no puede estar lista y el descuento queda sin confirmar.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(sessions.length).toBe(1));
    await waitFor(() => expect(epochQuoteStatus()).not.toBe("ready"));
    expect(screen.getByTestId("confirmed").textContent).toBe("false");
    expect(epochQuoteStatus()).not.toBe("ready");

    // Cuando llega la respuesta, se pide una cotización nueva y el precio
    // confirmado vuelve a estar disponible.
    sessions[0].resolve(
      json({
        ok: true,
        sessionId: SESSION_ID,
        authenticated: true,
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    await waitFor(() => expect(quotes.length).toBe(2));
    quotes[1].resolve(quoteResponse());
    await waitFor(() => expect(epochQuoteStatus()).toBe("ready"));
    expect(screen.getByTestId("confirmed").textContent).toBe("true");
  });

  it("la sesión se actualiza tras una revalidación por foco (la respuesta no se descarta)", async () => {
    let sessionCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          sessionCalls += 1;
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: sessionCalls === 1 ? 20 : 30,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) return quoteResponse();
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <EpochProbe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("epoch-auth").textContent).toBe("authenticated"));
    expect(screen.getByTestId("epoch-discount").textContent).toBe("20");

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(sessionCalls).toBe(2));
    // La respuesta de la revalidación se aplica: la sesión queda vigente.
    await waitFor(() =>
      expect(screen.getByTestId("epoch-discount").textContent).toBe("30"),
    );
    expect(screen.getByTestId("epoch-auth").textContent).toBe("authenticated");
  });

  it("una revalidación pide exactamente una cotización nueva por producto y cantidad", async () => {
    let quoteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }
        if (url.includes("/api/distributor/quote")) {
          quoteCalls += 1;
          return quoteResponse();
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <EpochProbe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(quoteCalls).toBe(1));
    await waitFor(() => expect(epochQuoteStatus()).toBe("ready"));

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(quoteCalls).toBe(2));
    // Ni una segunda invalidación ni reintentos encadenados.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(quoteCalls).toBe(2);
  });

  it("DistributorPriceLine no muestra el porcentaje mientras el descuento no está confirmado", async () => {
    const quotes: Array<ReturnType<typeof deferred<Response>>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({
            ok: true,
            sessionId: SESSION_ID,
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

    render(
      <DistributorProvider>
        <DistributorPriceLine productId="p1" />
      </DistributorProvider>,
    );
    await waitFor(() => expect(quotes.length).toBe(1));

    // La cotización está pendiente: el descuento todavía no está confirmado.
    expect(document.querySelector(".distributor-price-line__badge")).toBeNull();
    expect(document.querySelector(".distributor-price-line__sr")?.textContent ?? "").not.toContain(
      "20% de descuento",
    );

    // La cotización vigente confirma el descuento: el porcentaje aparece.
    quotes[0].resolve(quoteResponse());
    await waitFor(() =>
      expect(document.querySelector(".distributor-price-line__badge")).not.toBeNull(),
    );
    expect(document.querySelector(".distributor-price-line__badge")).toHaveTextContent(
      "20% de descuento",
    );
  });
});
/* ═══════════════════════════════════════════════════════
 * S3 · Prueba de continuidad: el identificador de sesión del backend.
 *
 * La prueba de continuidad ES el `sessionId` que devuelve el backend: un
 * valor opaco, estable durante la vida de la sesión, distinto en cada login
 * y en cada cuenta, y no secreto. Es lo que usa el checkout para saber si un
 * intento sigue siendo reenviable. Debe ser estable frente a una
 * revalidación inocua de la MISMA sesión y cambiar frente a un login nuevo,
 * un logout o una expiración. Si el servidor NO lo envía, no hay prueba:
 * nunca se sustituye por el descuento ni por el vencimiento.
 * ═════════════════════════════════════════════════ */
describe("DistributorContext · prueba de continuidad (identificador de sesión)", () => {
  const EXPIRES_AT = "2026-11-20T20:00:00.000Z";

  it("sin sesión autenticada no hay prueba", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ ok: true, authenticated: false })),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("anonymous"));
    expect(fingerprintText()).toBe("none");
  });

  it("con sesión, la prueba ES el identificador que devolvió el backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: EXPIRES_AT,
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("authenticated"));
    expect(fingerprintText()).toBe(SESSION_ID);
  });

  it("una revalidación de la MISMA sesión conserva la prueba", async () => {
    let sessionCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          sessionCalls += 1;
          return json({
            ok: true,
            sessionId: SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: EXPIRES_AT,
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("authenticated"));
    const before = fingerprintText();

    /* Revalidación por foco: el backend devuelve el mismo identificador
       de sesión ⇒ la prueba NO cambia. */
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(sessionCalls).toBe(2));
    await waitFor(() => expect(fingerprintText()).toBe(before));
    expect(fingerprintText()).toBe(SESSION_ID);
  });

  it("un login nuevo cambia la prueba y un logout la borra", async () => {
    let loginCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({ ok: true, authenticated: false });
        }
        if (url.includes("/api/distributor/login")) {
          loginCalls += 1;
          return json({
            ok: true,
            sessionId: loginCalls === 1 ? SESSION_ID : OTHER_SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: loginCalls === 1
              ? EXPIRES_AT
              : "2026-11-21T20:00:00.000Z",
          });
        }
        if (url.includes("/api/distributor/logout")) {
          return json({ ok: true, authenticated: false });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("anonymous"));
    expect(fingerprintText()).toBe("none");

    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(authText()).toBe("authenticated"));
    const primera = fingerprintText();
    expect(primera).toBe(SESSION_ID);

    /* Logout: sin sesión no hay prueba. */
    fireEvent.click(screen.getByText("logout"));
    await waitFor(() => expect(authText()).toBe("anonymous"));
    expect(fingerprintText()).toBe("none");

    /* Login nuevo: el backend devuelve OTRO identificador ⇒ otra prueba. */
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(authText()).toBe("authenticated"));
    expect(fingerprintText()).not.toBe(primera);
    expect(fingerprintText()).toBe(OTHER_SESSION_ID);
  });

  it("una sesión SIN identificador del backend no deja prueba de continuidad", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          /* El servidor no envía el identificador: la continuidad NO está
             demostrada y no se sustituye por el descuento ni por el
             vencimiento. */
          return json({
            ok: true,
            authenticated: true,
            discountPercent: 20,
            expiresAt: EXPIRES_AT,
          });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("authenticated"));
    expect(fingerprintText()).toBe("none");
    expect(fingerprintText()).not.toContain("v1:");
    expect(fingerprintText()).not.toContain(EXPIRES_AT);
  });

  it("dos sesiones con el MISMO descuento y el MISMO vencimiento tienen pruebas DISTINTAS", async () => {
    /* La colisión que tenía la huella anterior: dos cuentas con el
       mismo porcentaje y el mismo vencimiento. Con el identificador del
       backend cada sesión tiene su propia prueba. */
    let loginCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/distributor/session")) {
          return json({ ok: true, authenticated: false });
        }
        if (url.includes("/api/distributor/login")) {
          loginCalls += 1;
          return json({
            ok: true,
            sessionId: loginCalls === 1 ? SESSION_ID : OTHER_SESSION_ID,
            authenticated: true,
            discountPercent: 20,
            expiresAt: EXPIRES_AT,
          });
        }
        if (url.includes("/api/distributor/logout")) {
          return json({ ok: true, authenticated: false });
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );

    render(
      <DistributorProvider>
        <Probe />
      </DistributorProvider>,
    );
    await waitFor(() => expect(authText()).toBe("anonymous"));

    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(authText()).toBe("authenticated"));
    const primera = fingerprintText();

    fireEvent.click(screen.getByText("logout"));
    await waitFor(() => expect(authText()).toBe("anonymous"));

    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(authText()).toBe("authenticated"));
    expect(fingerprintText()).not.toBe(primera);
    expect(fingerprintText()).toBe(OTHER_SESSION_ID);
  });
});
