/**
 * Fase T2 — reproducción OBSERVADA del contexto del intento de pedido.
 *
 * Estos tests describen el comportamiento REQUERIDO (S2/S3/S5) y hoy fallan
 * (RED) porque la implementación actual no vincula el intento persistido con
 * su canal (público/distribuidor) ni con la continuidad de la sesión.
 *
 * Reglas covered (una por test):
 *   A · intento público incierto → login de distribuidor → no se reenvía por
 *       la vía distribuidora.
 *   B · intento distribuidor incierto → logout → no se degrada a pedido público.
 *   C · distribuidor A → logout/login B (mismo descuento y mismo vencimiento)
 *       → no se reintenta (el descuento NO identifica a la cuenta).
 *   D · recarga (montaje nuevo) con contexto autenticado fresco → bloqueo
 *       conservando el registro; control: el reintento público explícito tras
 *       recargar sigue permitido con la misma clave.
 *   E · resultado incierto (respuesta ambigua / promesa rechazada) → el
 *       intento se conserva sin rotar la clave y el reintento legítimo usa la
 *       misma clave; y un intento distribuidor incierto no se reenvía como
 *       pedido público.
 *   F · registro v2 heredado SIN canal ni cuenta → bloqueo sin adivinar ni borrar.
 *   G · reintento legítimo dentro del mismo contexto → misma clave, sin crear
 *       otro intento.
 *
 * Nada de red real: TODO el tráfico HTTP pasa por un doble de `fetch` local
 * que además falla si se llama a una ruta inesperada. El componente del que
 * se afirma la SELECCIÓN DE CANAL (CartDrawer) y el CheckoutModal son reales;
 * sólo se doblan el estado del carrito y el servidor.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartDrawer } from "./CartDrawer";
import { CheckoutModal } from "./CheckoutModal";
import { useCommerce } from "./CommerceContext";
import {
  DistributorProvider,
  useDistributor,
} from "./distributor/DistributorContext";
import type { OrderPayload } from "./orders";
import type { CommerceProduct, PresentedLine } from "./types";

/* Sólo el estado del carrito se dobla: no influye en la selección de canal. */
vi.mock("./CommerceContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./CommerceContext")>()),
  useCommerce: vi.fn(),
}));

/* ── constantes de storage (mismas claves que usa orderAttempt.ts) ──── */
/* Cada canal tiene su propio compartmento: el público conserva las claves
   históricas de origin/main y el distribuidor usa las suyas. */
const PUBLIC_LOCAL = "starvie-order-attempt-v2";
const PUBLIC_SESSION = "starvie-order-attempt-v2-session";
const DIST_LOCAL = "starvie-order-attempt-v2-distributor";
const DIST_SESSION = "starvie-order-attempt-v2-distributor-session";

type Channel = "public" | "distributor";

function keys(channel: Channel): { local: string; session: string } {
  return channel === "distributor"
    ? { local: DIST_LOCAL, session: DIST_SESSION }
    : { local: PUBLIC_LOCAL, session: PUBLIC_SESSION };
}

/* ── dobles de servidor ─────────────────────────────────────────────── */
const DISTRIBUTOR_BASE = "https://distributor.test";
const CUIT_A = "20-11111111-1";
const CUIT_B = "20-22222222-2";
const PASSWORD = "clave-de-prueba";
const DISCOUNT_PERCENT = 20;
/* El backend devuelve el IDENTIFICADOR OPACO DE SESIÓN: es estable durante
   la vida de la sesión, distinto en cada login y distinto en cada cuenta.
   El vencimiento se mantiene IGUAL entre logins a propósito: dos cuentas
   pueden compartir descuento y vencimiento (esa era la colisión de la
   huella anterior). */
const ORDER_ID = "ord-1";

type FetchCall = {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
};

let calls: FetchCall[] = [];
let unexpectedCalls: string[] = [];
let sessionAuthenticated = false;
/* Vencimiento de la sesión vigente (el que devuelve /session). */
let sessionExpiresAt: string | null = null;
/* Identificador opaco de la sesión vigente (el que devuelve /session). */
let sessionId: string | null = null;
let loginCount = 0;
/* El vencimiento es el MISMO para todas las sesiones que abre este doble:
   la distin-ción entre cuentas no puede depender de él. */
const SHARED_EXPIRES_AT = "2026-11-20T20:00:00.000Z";

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => data,
  } as unknown as Response;
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  let body: Record<string, unknown> | null = null;
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      body = null;
    }
  }
  calls.push({ url, method, body });

  if (url.endsWith("/api/distributor/session") && method === "GET") {
    return sessionAuthenticated
      ? jsonResponse({
          ok: true,
          authenticated: true,
          discountPercent: DISCOUNT_PERCENT,
          expiresAt: sessionExpiresAt,
          sessionId,
        })
      : jsonResponse({ ok: true, authenticated: false });
  }
  if (url.endsWith("/api/distributor/login") && method === "POST") {
    sessionAuthenticated = true;
    /* Cada login abre una sesión nueva: el backend devuelve un
       identificador NUEVO (y el MISMO descuento y el MISMO vencimiento que
       otra cuenta: no puede ser eso lo que distinga a las cuentas). */
    loginCount += 1;
    sessionExpiresAt = SHARED_EXPIRES_AT;
    sessionId = `session-id-${loginCount}`;
    return jsonResponse({
      ok: true,
      authenticated: true,
      discountPercent: DISCOUNT_PERCENT,
      expiresAt: sessionExpiresAt,
      sessionId,
    });
  }
  if (url.endsWith("/api/distributor/logout") && method === "POST") {
    sessionAuthenticated = false;
    sessionExpiresAt = null;
    sessionId = null;
    return jsonResponse({ ok: true });
  }
  if (url.includes("/api/distributor/quote") && method === "GET") {
    return jsonResponse({
      ok: true,
      currency: "ARS",
      discountPercent: DISCOUNT_PERCENT,
      lines: [
        {
          productId: "raptor+",
          qty: 1,
          listUnitPrice: 500,
          netUnitPrice: 400,
          netSubtotal: 400,
        },
      ],
    });
  }
  /* Respuesta AMBIGUA: el servidor recibió el pedido pero el resultado no
     se puede confirmar (mismo escenario que una respuesta perdida). */
  if (
    method === "POST" &&
    (url.endsWith("/api/distributor/orders") || url.endsWith("/api/orders"))
  ) {
    return jsonResponse({ orderId: ORDER_ID, status: "respuesta-ambigua" });
  }

  unexpectedCalls.push(`${method} ${url}`);
  throw new Error(`Unexpected fetch: ${method} ${url}`);
});

/* ── catálogo / carrito ─────────────────────────────────────────────── */
const product = {
  id: "raptor+",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 500,
  disponible: true,
  imagenes: ["products/palas/RAPTOR/RAPTOR1.3.webp"],
  gama: "",
  tipoJuego: "",
  forma: "",
  plano: "",
  peso: "",
  balance: "",
  ean: "",
  pagina: 17,
} as CommerceProduct;

const PRESENTED: PresentedLine[] = [
  { line: { productId: "raptor+", qty: 2 }, product, subtotal: 1000 },
];

const mockedCommerce = vi.mocked(useCommerce);
const clearCartSpy = vi.fn();

/**
 * Prueba de continuidad de la sesión para los montajes directos del modal
 * en canal distribuidor: el IDENTIFICADOR OPACO DE SESIÓN que devuelve el
 * backend. Sin esa prueba el checkout no prepara ni reenvía nada.
 */
const SESSION_FINGERPRINT = "Zk3vJ8xQ1nT5pR7wY2bA";

function mockCommerce() {
  mockedCommerce.mockReturnValue({
    cartOpen: true,
    setCartOpen: vi.fn(),
    setUiBusy: vi.fn(),
    presented: PRESENTED,
    units: 2,
    total: 1000,
    setQty: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: clearCartSpy,
    cartNotices: [],
    dismissNotices: vi.fn(),
  } as unknown as ReturnType<typeof useCommerce>);
}

/* ── helpers de observación ─────────────────────────────────────────── */
function orderPosts() {
  return calls.filter(
    (call) =>
      call.method === "POST" &&
      (call.url.endsWith("/api/orders") ||
        call.url.endsWith("/api/distributor/orders")),
  );
}
function publicOrderPosts() {
  return calls.filter(
    (call) => call.method === "POST" && call.url.endsWith("/api/orders"),
  );
}
function distributorOrderPosts() {
  return calls.filter(
    (call) =>
      call.method === "POST" && call.url.endsWith("/api/distributor/orders"),
  );
}
function orderKeys(list: FetchCall[]) {
  return list.map((call) => String(call.body?.idempotencyKey ?? "<sin clave>"));
}
function storedMarker(channel: Channel = "public"): Record<string, unknown> | null {
  const raw = localStorage.getItem(keys(channel).local);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}
function markerFacts(channel: Channel = "public") {
  const marker = storedMarker(channel);
  if (!marker) return null;
  return {
    idempotencyKey: String(marker.idempotencyKey),
    createdAt: String(marker.createdAt),
    lines: JSON.stringify(marker.lines),
    orderId: marker.orderId ?? null,
  };
}
function storedSession(channel: Channel = "public"): Record<string, unknown> | null {
  const raw = sessionStorage.getItem(keys(channel).session);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

/* ── helpers de interacción ─────────────────────────────────────────── */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function clickSubmit() {
  const button = screen.queryByRole("button", {
    name: /^(Enviar pedido|Reintentar envío)$/,
  });
  if (button) fireEvent.click(button);
  await settle();
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("Nombre y apellido *"), {
    target: { value: "Ana Test" },
  });
  fireEvent.change(screen.getByLabelText("Razón social *"), {
    target: { value: "StarVie Test SA" },
  });
  fireEvent.change(screen.getByLabelText("Correo electrónico *"), {
    target: { value: "ana@example.com" },
  });
}

async function openCheckout() {
  fireEvent.click(screen.getByRole("button", { name: "Finalizar pedido" }));
  await screen.findByRole("dialog", { name: "Finalizar pedido" });
}

async function closeCheckout() {
  fireEvent.click(screen.getByRole("button", { name: "Cerrar checkout" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Finalizar pedido" }),
    ).toBeNull(),
  );
}

function DistributorHarness() {
  const distributor = useDistributor();
  return (
    <div>
      <button
        type="button"
        onClick={() => void distributor.login(CUIT_A, PASSWORD)}
      >
        entrar-distribuidor-a
      </button>
      <button
        type="button"
        onClick={() => void distributor.login(CUIT_B, PASSWORD)}
      >
        entrar-distribuidor-b
      </button>
      <button type="button" onClick={() => void distributor.logout()}>
        salir-distribuidor
      </button>
      <span data-testid="auth-status">{distributor.auth.status}</span>
    </div>
  );
}

function renderApp() {
  return render(
    <DistributorProvider>
      <DistributorHarness />
      <CartDrawer />
    </DistributorProvider>,
  );
}

async function loginDistributor(which: "a" | "b") {
  fireEvent.click(
    screen.getByRole("button", {
      name: which === "a" ? "entrar-distribuidor-a" : "entrar-distribuidor-b",
    }),
  );
  await waitFor(() =>
    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"),
  );
  // A was already authenticated: also let the mocked B login finish.
  await settle();
}

async function logoutDistributor() {
  fireEvent.click(screen.getByRole("button", { name: "salir-distribuidor" }));
  await waitFor(() =>
    expect(screen.getByTestId("auth-status")).toHaveTextContent("anonymous"),
  );
}

/* ── ciclo de vida ──────────────────────────────────────────────────── */
beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", DISTRIBUTOR_BASE);
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
  calls = [];
  unexpectedCalls = [];
  sessionAuthenticated = false;
  sessionExpiresAt = null;
  sessionId = null;
  loginCount = 0;
  clearCartSpy.mockClear();
  mockCommerce();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
  expect(unexpectedCalls).toEqual([]);
});

/* ── regresiones independientes (S2–S5/S7) ───────────────────────────── */

function storageBytes() {
  return [
    localStorage.getItem(PUBLIC_LOCAL),
    localStorage.getItem(DIST_LOCAL),
    sessionStorage.getItem(PUBLIC_SESSION),
    sessionStorage.getItem(DIST_SESSION),
    localStorage.getItem("starvie-cart-v1"),
  ];
}
function expectPreserved(bytes: (string | null)[]) {
  expect(storageBytes()).toEqual(bytes);
  expect(clearCartSpy).not.toHaveBeenCalled();
}

describe("Contexto del intento de pedido (A–H)", () => {
  it("A · un intento público incierto no se reenvía por la vía distribuidora", async () => {
    renderApp();

    /* 1. Visitante público: envío cuyo resultado no se puede confirmar. */
    await openCheckout();
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(publicOrderPosts()).toHaveLength(1));
    const publicKey = String(publicOrderPosts()[0].body?.idempotencyKey);
    const factsAfterPublic = markerFacts();
    await closeCheckout();

    /* 2. Entra un distribuidor y se reabre el checkout (canal distribuidor). */
    await loginDistributor("a");
    await openCheckout();
    fillForm();
    await clickSubmit();

    /* Cada canal tiene su propio compartmento: la clave pública NUNCA se
       reenvía por la vía de distribuidores. La compra del distribuidor es
       independiente (su propia clave, su propio registro). */
    await waitFor(() => expect(distributorOrderPosts()).toHaveLength(1));
    expect(orderKeys(distributorOrderPosts())).not.toContain(publicKey);
    expect(orderKeys(publicOrderPosts())).toEqual([publicKey]);
    /* El intento original se conserva: no se borra ni se rota la clave. */
    expect(markerFacts("public")).toEqual(factsAfterPublic);
    expect(storedSession("public")?.idempotencyKey).toBe(publicKey);
    expect(clearCartSpy).not.toHaveBeenCalled();
  });

  it("B · un intento distribuidor incierto no se degrada a pedido público", async () => {
    renderApp();
    await loginDistributor("a");

    await openCheckout();
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(distributorOrderPosts()).toHaveLength(1));
    const distributorKey = String(
      distributorOrderPosts()[0].body?.idempotencyKey,
    );
    const factsAfterDistributor = markerFacts("distributor");
    await closeCheckout();

    /* Cae la sesión del distribuidor y se reabre el checkout como público. */
    await logoutDistributor();
    await openCheckout();
    fillForm();
    await clickSubmit();

    /* El intento del distribuidor NUNCA se degrada a pedido público: la
       compra pública usa su propia clave y su propio compartmento. */
    await waitFor(() => expect(publicOrderPosts()).toHaveLength(1));
    expect(orderKeys(publicOrderPosts())).not.toContain(distributorKey);
    expect(orderKeys(distributorOrderPosts())).toEqual([distributorKey]);
    expect(markerFacts("distributor")).toEqual(factsAfterDistributor);
    expect(storedSession("distributor")?.idempotencyKey).toBe(distributorKey);
    expect(clearCartSpy).not.toHaveBeenCalled();
  });

  it("C · cambiar de distribuidor (otra sesión ⇒ otra prueba) no reintenta", async () => {
    renderApp();
    await loginDistributor("a");

    await openCheckout();
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(distributorOrderPosts()).toHaveLength(1));
    const keyA = String(distributorOrderPosts()[0].body?.idempotencyKey);
    const facts = markerFacts("distributor");
    await closeCheckout();

    /* Sale A y entra B: otra cuenta ⇒ el backend abre otra sesión con OTRO
       identificador de sesión. El descuento y el vencimiento son los
       MISMOS: no puede ser eso lo que distinga a las cuentas (esa era la
       colisión de la huella anterior). */
    await logoutDistributor();
    await loginDistributor("b");
    const logins = calls.filter(
      (call) =>
        call.method === "POST" && call.url.endsWith("/api/distributor/login"),
    );
    expect(logins.map((call) => call.body?.cuit)).toEqual([CUIT_A, CUIT_B]);

    await openCheckout();
    await clickSubmit();

    /* El único envío legítimo es el primero: el cambio de cuenta no puede
       sumar un segundo POST con la MISMA clave. */
    expect(distributorOrderPosts()).toHaveLength(1);
    expect(orderKeys(distributorOrderPosts())).toEqual([keyA]);
    expect(markerFacts("distributor")).toEqual(facts);
    expect(storedSession("distributor")?.idempotencyKey).toBe(keyA);
  });

  it("C · dos cuentas con el MISMO descuento y el MISMO vencimiento NO comparten la prueba", async () => {
    /* La colisión que tenía la huella anterior (descuento + vencimiento):
       el backend abre dos sesiones con el mismo porcentaje y el mismo
       vencimiento, y sólo el identificador de sesión las distingue. */
    renderApp();
    await loginDistributor("a");

    await openCheckout();
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(distributorOrderPosts()).toHaveLength(1));
    const keyA = String(distributorOrderPosts()[0].body?.idempotencyKey);
    const facts = markerFacts("distributor");
    await closeCheckout();

    await logoutDistributor();
    await loginDistributor("b");

    /* Las dos sesiones comparten descuento y vencimiento: lo único que
       cambia es el identificador opaco del backend. */
    const sesiones = calls
      .filter(
        (call) =>
          call.method === "POST" && call.url.endsWith("/api/distributor/login"),
      )
      .length;
    expect(sesiones).toBe(2);

    await openCheckout();
    await clickSubmit();

    /* El intento de A NO es reutilizable bajo la sesión de B. */
    expect(distributorOrderPosts()).toHaveLength(1);
    expect(orderKeys(distributorOrderPosts())).toEqual([keyA]);
    expect(markerFacts("distributor")).toEqual(facts);
    expect(storedSession("distributor")?.idempotencyKey).toBe(keyA);
  });

  it("C · una sesión SIN identificador del backend no demuestra continuidad", async () => {
    /* El backend no envía el identificador de sesión: no hay prueba de
       continuidad y NO se sustituye por el descuento ni por el vencimiento. */
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/distributor/login")) {
        calls.push({ url, method: init?.method ?? "GET", body: JSON.parse(String(init?.body)) });
        sessionAuthenticated = true;
        sessionExpiresAt = SHARED_EXPIRES_AT;
        sessionId = null;
        return jsonResponse({
          ok: true,
          authenticated: true,
          discountPercent: DISCOUNT_PERCENT,
          expiresAt: sessionExpiresAt,
        });
      }
      if (url.endsWith("/api/distributor/session")) {
        calls.push({ url, method: "GET", body: null });
        return sessionAuthenticated
          ? jsonResponse({
              ok: true,
              authenticated: true,
              discountPercent: DISCOUNT_PERCENT,
              expiresAt: sessionExpiresAt,
            })
          : jsonResponse({ ok: true, authenticated: false });
      }
      return original(input, init);
    });
    try {
      renderApp();
      await loginDistributor("a");

      await openCheckout();
      fillForm();
      const uuid = vi.spyOn(crypto, "randomUUID");
      try {
        await clickSubmit();
        /* Sin prueba de continuidad no se prepara ni se envía nada: ni
           clave nueva, ni POST, ni registros escritos. */
        expect(distributorOrderPosts()).toHaveLength(0);
        expect(uuid).not.toHaveBeenCalled();
        expect(localStorage.getItem(DIST_LOCAL)).toBeNull();
        expect(sessionStorage.getItem(DIST_SESSION)).toBeNull();
      } finally {
        uuid.mockRestore();
      }
    } finally {
      fetchMock.mockImplementation(original);
    }
  });

  it("D · tras recargar, el intento distribuidor queda bloqueado y se conserva", async () => {
    renderApp();
    await loginDistributor("a");

    await openCheckout();
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(distributorOrderPosts()).toHaveLength(1));
    const key = String(distributorOrderPosts()[0].body?.idempotencyKey);
    const facts = markerFacts("distributor");
    await closeCheckout();

    /* Recarga: se desmonta la app y se monta de nuevo. El contexto
       autenticado en memoria es nuevo (mismo descuento y vencimiento) y el
       contexto VIVO del intento se pierde (sólo vive en memoria: una recarga
       real lo vacía). */
    const { forgetAttemptContext } = await import("./orderAttemptContext");
    forgetAttemptContext(key);
    cleanup();
    renderApp();
    await waitFor(() =>
      expect(screen.getByTestId("auth-status")).toHaveTextContent(
        "authenticated",
      ),
    );

    await openCheckout();
    await clickSubmit();

    /* RED: hoy el intento se reenvía con el mismo contexto recargado.
       El único envío legítimo es el primero: tras recargar no se reenvía. */
    expect(distributorOrderPosts()).toHaveLength(1);
    expect(orderKeys(distributorOrderPosts())).toEqual([key]);
    expect(markerFacts("distributor")).toEqual(facts);
    expect(storedSession("distributor")?.idempotencyKey).toBe(key);
  });

  it("D · control: tras recargar, el reintento público sigue con la misma clave", async () => {
    renderApp();

    await openCheckout();
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(publicOrderPosts()).toHaveLength(1));
    const key = String(publicOrderPosts()[0].body?.idempotencyKey);

    cleanup();
    renderApp();

    await openCheckout();
    await clickSubmit();

    /* Control (debe seguir en verde): el canal público conserva el reintento
       con la MISMA clave y sin crear otro intento. */
    await waitFor(() => expect(publicOrderPosts()).toHaveLength(2));
    expect(orderKeys(publicOrderPosts())).toEqual([key, key]);
    expect(storedMarker()?.idempotencyKey).toBe(key);
  });

  it("E · un resultado incierto conserva el intento y reintenta con la misma clave", async () => {
    renderApp();

    await openCheckout();
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(publicOrderPosts()).toHaveLength(1));
    const key = String(publicOrderPosts()[0].body?.idempotencyKey);

    /* El intento queda registrado como incierto: no se borra ni se rota. */
    expect(storedMarker()?.idempotencyKey).toBe(key);
    expect(storedSession()?.idempotencyKey).toBe(key);
    expect(clearCartSpy).not.toHaveBeenCalled();

    /* Reintento legítimo en el mismo contexto: misma clave, sin duplicar. */
    await closeCheckout();
    await openCheckout();
    await clickSubmit();
    await waitFor(() => expect(publicOrderPosts()).toHaveLength(2));
    expect(orderKeys(publicOrderPosts())).toEqual([key, key]);
    expect(storedMarker()?.idempotencyKey).toBe(key);
  });

  it("E · una promesa de envío rechazada conserva el intento y la misma clave", async () => {
    const submitFn = vi.fn(
      async (_payload: OrderPayload, _options: { turnstileToken?: string }) => {
        throw new Error("conexión perdida");
      },
    );
    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={PRESENTED}
        total={1000}
        clearCart={clearCartSpy}
        distributorMode
        distributorSessionFingerprint={SESSION_FINGERPRINT}
        distributorDiscountPercent={DISCOUNT_PERCENT}
        submitFn={submitFn}
      />,
    );

    fillForm();
    await clickSubmit();
    await waitFor(() => expect(submitFn).toHaveBeenCalledOnce());
    await screen.findByText("No pudimos confirmar si RealStep recibió tu pedido. No vuelvas a enviarlo todavía.");

    /* El intento se conserva: no se descarta en silencio ni se rota la clave. */
    const key = submitFn.mock.calls[0][0].idempotencyKey;
    expect(storedMarker("distributor")?.idempotencyKey).toBe(key);
    expect(storedSession("distributor")?.idempotencyKey).toBe(key);
    expect(clearCartSpy).not.toHaveBeenCalled();

    /* Reintento en el mismo contexto: misma clave. */
    await clickSubmit();
    await waitFor(() => expect(submitFn).toHaveBeenCalledTimes(2));
    expect(submitFn.mock.calls[1][0].idempotencyKey).toBe(key);
    expect(storedMarker("distributor")?.idempotencyKey).toBe(key);
  });

  it("E · un intento distribuidor incierto no se reenvía como pedido público", async () => {
    const distributorSubmit = vi.fn(
      async (_payload: OrderPayload, _options: { turnstileToken?: string }) => ({
        kind: "unknown" as const,
        error: "No se pudo confirmar el estado del pedido.",
      }),
    );
    const publicSubmit = vi.fn(
      async (_payload: OrderPayload, _options: { turnstileToken?: string }) => ({
        kind: "unknown" as const,
        error: "No se pudo confirmar el estado del pedido.",
      }),
    );
    const baseProps = {
      presented: PRESENTED,
      total: 1000,
      clearCart: clearCartSpy,
      onClose: vi.fn(),
    };
    const { rerender } = render(
      <CheckoutModal
        {...baseProps}
        open
        distributorMode
        distributorSessionFingerprint={SESSION_FINGERPRINT}
        distributorDiscountPercent={DISCOUNT_PERCENT}
        submitFn={distributorSubmit}
      />,
    );

    fillForm();
    await clickSubmit();
    await waitFor(() => expect(distributorSubmit).toHaveBeenCalledOnce());
    const key = distributorSubmit.mock.calls[0][0].idempotencyKey;
    expect(storedMarker("distributor")?.idempotencyKey).toBe(key);

    /* Se cierra el checkout y se reabre en canal público (sesión caída). */
    rerender(
      <CheckoutModal
        {...baseProps}
        open={false}
        distributorMode
        submitFn={distributorSubmit}
      />,
    );
    rerender(
      <CheckoutModal
        {...baseProps}
        open={false}
        distributorMode={false}
        submitFn={publicSubmit}
      />,
    );
    rerender(
      <CheckoutModal
        {...baseProps}
        open
        distributorMode={false}
        submitFn={publicSubmit}
      />,
    );
    fillForm();
    await clickSubmit();

    /* El canal público tiene su propio compartmento: la clave del
       distribuidor NUNCA se envía al endpoint público. La compra pública es
       independiente y el registro del distribuidor sobrevive intacto. */
    await waitFor(() => expect(publicSubmit).toHaveBeenCalledOnce());
    expect(publicSubmit.mock.calls[0][0].idempotencyKey).not.toBe(key);
    expect(storedMarker("distributor")?.idempotencyKey).toBe(key);
    expect(storedSession("distributor")?.idempotencyKey).toBe(key);
  });

  it("F · un registro v2 heredado sin canal ni cuenta se reenvía con la misma clave", async () => {
    const legacyKey = "11111111-1111-4111-8111-111111111111";
    const legacyCreatedAt = new Date().toISOString();
    const legacyLines = [{ productId: "raptor+", qty: 2 }];
    const legacyContact = {
      name: "Cliente Heredado",
      legalName: "Heredado SA",
      email: "heredado@example.com",
    };
    localStorage.setItem(
      PUBLIC_LOCAL,
      JSON.stringify({
        version: "v2",
        idempotencyKey: legacyKey,
        orderId: null,
        lines: legacyLines,
        createdAt: legacyCreatedAt,
      }),
    );
    sessionStorage.setItem(
      PUBLIC_SESSION,
      JSON.stringify({
        version: "v2",
        idempotencyKey: legacyKey,
        orderId: null,
        contact: legacyContact,
        lines: legacyLines,
        createdAt: legacyCreatedAt,
      }),
    );

    const publicSubmit = vi.fn(
      async (_payload: OrderPayload, _options: { turnstileToken?: string }) => ({
        kind: "unknown" as const,
        error: "No se pudo confirmar el estado del pedido.",
      }),
    );
    render(
      <CheckoutModal
        open
        onClose={vi.fn()}
        presented={PRESENTED}
        total={1000}
        clearCart={clearCartSpy}
        submitFn={publicSubmit}
      />,
    );

    await clickSubmit();

    /* El canal público conserva las reglas de origin/main: un registro
       heredado (sin atribución de canal) se reenvía con la MISMA clave. */
    expect(publicSubmit).toHaveBeenCalledOnce();
    expect(publicSubmit.mock.calls[0][0].idempotencyKey).toBe(legacyKey);
    /* Sin adivinar y sin borrar: el registro sigue exactamente igual. */
    expect(storedMarker()).not.toBeNull();
    expect(storedMarker()?.idempotencyKey).toBe(legacyKey);
    expect(storedMarker()?.createdAt).toBe(legacyCreatedAt);
    expect(storedMarker()?.lines).toEqual(legacyLines);
    expect(storedSession()?.idempotencyKey).toBe(legacyKey);
    expect(storedSession()?.contact).toEqual(legacyContact);
    expect(clearCartSpy).not.toHaveBeenCalled();
  });

  it("G · reintento legítimo en el mismo contexto: misma clave y sin otro intento", async () => {    renderApp();
    await loginDistributor("a");

    await openCheckout();
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(distributorOrderPosts()).toHaveLength(1));
    const key = String(distributorOrderPosts()[0].body?.idempotencyKey);

    /* Se cierra y se reabre el checkout en la MISMA sesión autenticada. */
    await closeCheckout();
    await openCheckout();
    await clickSubmit();

    await waitFor(() => expect(distributorOrderPosts()).toHaveLength(2));
    expect(orderKeys(distributorOrderPosts())).toEqual([key, key]);
    expect(storedMarker("distributor")?.idempotencyKey).toBe(key);
    expect(storedSession("distributor")?.idempotencyKey).toBe(key);
    expect(clearCartSpy).not.toHaveBeenCalled();
  });

  it("H · con el checkout abierto, perder la sesión bloquea el reintento sin degradar a público", async () => {
    renderApp();
    await loginDistributor("a");

    await openCheckout();
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(distributorOrderPosts()).toHaveLength(1));
    const key = String(distributorOrderPosts()[0].body?.idempotencyKey);
    const facts = markerFacts("distributor");

    /* La sesión distribuidora cae con el checkout abierto: el canal sigue
       fijado (distribuidor) pero la huella viva se perdió. */
    await logoutDistributor();
    await clickSubmit();

    expect(distributorOrderPosts()).toHaveLength(1);
    expect(publicOrderPosts()).toHaveLength(0);
    expect(markerFacts("distributor")).toEqual(facts);
    expect(storedSession("distributor")?.idempotencyKey).toBe(key);
    expect(clearCartSpy).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Regresiones independientes S2–S5/S7 (especificación del verificador).
 * ══════════════════════════════════════════════════════════════════════ */
describe("Regresiones independientes del guard de contexto", () => {
  it("S3 first-send: logout while open BEFORE any attempt must not POST or allocate", async () => {
    renderApp();
    await loginDistributor("a");
    await openCheckout();
    fillForm();
    await logoutDistributor();
    const bytes = storageBytes();
    const uuid = vi.spyOn(crypto, "randomUUID");
    try {
      await clickSubmit();
      expect.soft(orderPosts()).toHaveLength(0);
      expect.soft(uuid).not.toHaveBeenCalled();
      expectPreserved(bytes);
    } finally { uuid.mockRestore(); }
  });

  it("S3 direct dealer checkout without a live proof must not POST or allocate", async () => {
    const submit = vi.fn(async (_payload: OrderPayload) => ({ kind: "unknown" as const, error: "Unknown" }));
    render(<CheckoutModal open onClose={vi.fn()} presented={PRESENTED} total={1000} clearCart={clearCartSpy} distributorMode submitFn={submit} />);
    fillForm();
    const bytes = storageBytes();
    const uuid = vi.spyOn(crypto, "randomUUID");
    try {
      await clickSubmit();
      expect.soft(submit).not.toHaveBeenCalled();
      expect.soft(uuid).not.toHaveBeenCalled();
      expectPreserved(bytes);
    } finally { uuid.mockRestore(); }
  });

  it("S3/S4 refresh with identical discount/expiry KEEPS the continuity, preserves bytes", async () => {
    renderApp(); await loginDistributor("a"); await openCheckout(); fillForm(); await clickSubmit();
    expect(distributorOrderPosts()).toHaveLength(1);
    const firstKey = orderKeys(distributorOrderPosts())[0];
    const bytes = storageBytes();
    const sessions = calls.filter(c => c.url.endsWith("/api/distributor/session")).length;
    /* Revalidación inocua (cambio de pestaña): el backend devuelve el
       MISMO vencimiento almacenado ⇒ la huella de sesión NO cambia. */
    fireEvent(window, new Event("focus")); await settle();
    expect(calls.filter(c => c.url.endsWith("/api/distributor/session"))).toHaveLength(sessions + 1);
    await clickSubmit();
    /* El intento sigue siendo reenviable: mismo registro y misma clave. */
    expect(distributorOrderPosts()).toHaveLength(2);
    expect(orderKeys(distributorOrderPosts())).toEqual([firstKey, firstKey]);
    expect(publicOrderPosts()).toHaveLength(0);
    expectPreserved(bytes);
  });

  it("S3 same-open A to B replacement blocks without storage/cart mutation", async () => {
    renderApp(); await loginDistributor("a"); await openCheckout(); fillForm(); await clickSubmit();
    const bytes = storageBytes();
    await loginDistributor("b"); await clickSubmit();
    expect(distributorOrderPosts()).toHaveLength(1);
    expect(publicOrderPosts()).toHaveLength(0);
    expectPreserved(bytes);
  });

  it("S4 quote-only update keeps original authenticated proof and original payload", async () => {
    function QuoteUpdate() {
      const d = useDistributor();
      return <button onClick={() => d.ensureQuote("raptor+", 3)}>new-quote</button>;
    }
    render(<DistributorProvider><DistributorHarness /><QuoteUpdate /><CartDrawer /></DistributorProvider>);
    await loginDistributor("a"); await openCheckout(); fillForm(); await clickSubmit();
    const bytes = storageBytes();
    const first = distributorOrderPosts()[0];
    const quoteCount = calls.filter(c => c.url.includes("/api/distributor/quote")).length;
    fireEvent.click(screen.getByRole("button", {name: "new-quote"})); await settle();
    expect(calls.filter(c => c.url.includes("/api/distributor/quote"))).toHaveLength(quoteCount + 1);
    await clickSubmit();
    expect(distributorOrderPosts()).toHaveLength(2);
    expect(distributorOrderPosts()[1]).toEqual(first);
    expectPreserved(bytes);
  });

  it("S5 actual mocked 401 then account B cannot retry A key", async () => {
    const original = fetchMock.getMockImplementation()!;
    let expired = false;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/api/distributor/orders")) {
        calls.push({url: String(input), method: init?.method ?? "GET", body: JSON.parse(String(init?.body))});
        expired = true;
        return jsonResponse({error: "Expired"}, 401);
      }
      return original(input, init);
    });
    try {
      renderApp(); await loginDistributor("a"); await openCheckout(); fillForm(); await clickSubmit();
      expect(expired).toBe(true);
      expect(screen.getByTestId("auth-status")).toHaveTextContent("anonymous");
      const bytes = storageBytes();
      await loginDistributor("b"); await clickSubmit();
      expect(distributorOrderPosts()).toHaveLength(1);
      expect(publicOrderPosts()).toHaveLength(0);
      expectPreserved(bytes);
    } finally { fetchMock.mockImplementation(original); }
  });

  it.each(["public-crossing", "distributor-crossing"])("S3/S5 %s never reuses the attempt of the other channel", async (scenario) => {
    localStorage.setItem("starvie-cart-v1", JSON.stringify({version: 1, lines: [{productId:"raptor+",qty:2}]}));
    renderApp();
    if (scenario === "distributor-crossing") await loginDistributor("a");
    await openCheckout(); fillForm(); await clickSubmit(); await closeCheckout();
    const firstKey = orderKeys(orderPosts())[0];
    const firstChannel = scenario === "distributor-crossing" ? "distributor" : "public";
    const facts = markerFacts(firstChannel);
    if (scenario === "public-crossing") await loginDistributor("a");
    else await logoutDistributor();
    const posts = orderPosts().length;
    await openCheckout(); fillForm(); await clickSubmit();
    /* El otro canal arranca su PROPIO intento (compartimento propio): nunca
       reutiliza la clave del canal anterior. */
    expect(orderPosts().length).toBe(posts + 1);
    expect(orderKeys(orderPosts())[posts]).not.toBe(firstKey);
    /* El registro del primer canal queda byte a byte igual. */
    expect(markerFacts(firstChannel)).toEqual(facts);
    /* Y el carrito no se toca. */
    expect(localStorage.getItem("starvie-cart-v1")).toBeTruthy();
    expect(clearCartSpy).not.toHaveBeenCalled();
  });

  it("S3/S5 legacy reuses the same key and keeps byte-identical records and cart", async () => {
    localStorage.setItem("starvie-cart-v1", JSON.stringify({version: 1, lines: [{productId:"raptor+",qty:2}]}));
    renderApp();
    await openCheckout(); fillForm(); await clickSubmit(); await closeCheckout();
    /* El registro pierde la atribución de canal: queda heredado. */
    for (const [storage, key] of [[localStorage, PUBLIC_LOCAL], [sessionStorage, PUBLIC_SESSION]] as const) {
      const data = JSON.parse(storage.getItem(key)!); delete data.channel; storage.setItem(key, JSON.stringify(data));
    }
    const bytes = storageBytes(); const posts = orderPosts().length;
    const firstKey = orderKeys(orderPosts())[0];
    const uuid = vi.spyOn(crypto, "randomUUID");
    try {
      await openCheckout(); await clickSubmit();
      /* El canal público conserva las reglas de origin/main: el registro
         heredado se reenvía con la MISMA clave (no se crea otro intento). */
      expect(orderPosts()).toHaveLength(posts + 1);
      expect(orderKeys(orderPosts())).toEqual([firstKey, firstKey]);
      expect(storedMarker()?.idempotencyKey).toBe(firstKey);
      expect(uuid).not.toHaveBeenCalled();
      expectPreserved(bytes);
    } finally { uuid.mockRestore(); }
  });
});


describe("Uncertain distributor closure", () => {
  const warning = "No pudimos confirmar si RealStep recibió tu pedido. No vuelvas a enviarlo todavía.";
  const contactUrl = "https://wa.me/5492235440976";
  async function uncertainDealer() {
    renderApp(); await loginDistributor("a"); await openCheckout(); fillForm(); await clickSubmit();
    expect(distributorOrderPosts()).toHaveLength(1);
    return String(storedMarker("distributor")!.idempotencyKey);
  }
  function clipboardDouble(reject = false) {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = reject ? vi.fn().mockRejectedValue(new Error("denied")) : vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    return { writeText, restore: () => { if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor); else Reflect.deleteProperty(navigator, "clipboard"); } };
  }
  it("S1 lost reply states uncertainty instead of inviting a new send", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (String(input).endsWith("/api/distributor/orders")) throw new TypeError("Mock completed reply lost");
      return response;
    });
    try {
      await uncertainDealer();
      expect(screen.getByRole("alert")).toHaveTextContent(warning);
      expect(screen.getByRole("alert").textContent?.split("\n")).toEqual([
        "No pudimos confirmar si RealStep recibió tu pedido.",
        "No vuelvas a enviarlo todavía.",
      ]);
      expect(screen.queryByText("Sin conexión con el servidor. Reintentá.")).toBeNull();
      expect(storedMarker("distributor")).toMatchObject({ status: "accepted", channel: "distributor" });
      expect(clearCartSpy).not.toHaveBeenCalled();
    } finally { fetchMock.mockImplementation(original); }
  });
  it("S2 copies only the original persisted reference without mutating the attempt", async () => {
    const clipboard = clipboardDouble();
    try {
      const key = await uncertainDealer(); const bytes = storageBytes();
      expect(screen.getByText(key)).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Copiar referencia" }));
      await screen.findByText("Referencia copiada.");
      expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(key);
      expectPreserved(bytes); expect(distributorOrderPosts()).toHaveLength(1);
    } finally { clipboard.restore(); }
  });
  it.each(["absent", "rejected"])("S2 clipboard %s keeps a manually selectable reference and the attempt", async (kind) => {
    const clipboard = clipboardDouble(kind === "rejected");
    if (kind === "absent") Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    try {
      const key = await uncertainDealer(); const bytes = storageBytes();
      fireEvent.click(screen.getByRole("button", { name: "Copiar referencia" }));
      await screen.findByText(/copiala manualmente/i);
      expect(screen.getByText(key)).toBeVisible(); expectPreserved(bytes);
      expect(distributorOrderPosts()).toHaveLength(1);
    } finally { clipboard.restore(); }
  });
  it("S3 uses the actual existing commercial WhatsApp and discloses no verified unlock", async () => {
    await uncertainDealer();
    const link = screen.getByRole("link", { name: "WhatsApp comercial de RealStep" });
    expect(link).toHaveAttribute("href", contactUrl);
    expect(link).toHaveAttribute("target", "_blank"); expect(link).toHaveAttribute("rel", "noopener noreferrer");
    /* El canal distribuidor ahora tiene un mecanismo verificable (la
       conciliación del backend): el aviso lo dice y deja claro que la
       consulta por sí sola no habilita nada. El frontend NUNCA llama a una
       ruta administrativa. */
    expect(screen.getByText(/Sólo una resolución de RealStep habilita continuar/i)).toBeVisible();
    expect(calls.some(c => /admin|investig|lookup/.test(c.url))).toBe(false);
  });
  it.each(["reload", "same-account login"])("S4 %s preserves the reference with no checkbox-only release or new order", async (transition) => {
    const key = await uncertainDealer(); await closeCheckout();
    if (transition === "reload") {
      /* Una recarga real vacía el contexto en memoria (sólo memoria). */
      const { forgetAttemptContext } = await import("./orderAttemptContext"); forgetAttemptContext(key);
      cleanup(); renderApp(); await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));
    } else {
      /* Un login nuevo abre otra sesión: el backend devuelve otro
         vencimiento ⇒ otra huella ⇒ el intento deja de ser reenviable. */
      await logoutDistributor(); await loginDistributor("a");
    }
    const bytes = storageBytes(); const uuid = vi.spyOn(crypto, "randomUUID");
    try {
      await openCheckout();
      expect(screen.getByText(key)).toBeVisible();
      expect(screen.queryByRole("checkbox", { name: /Confirmo que consulté/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
      await clickSubmit(); expectPreserved(bytes); expect(uuid).not.toHaveBeenCalled();
      expect(distributorOrderPosts()).toHaveLength(1); expect(publicOrderPosts()).toHaveLength(0);
    } finally { uuid.mockRestore(); }
  });
  it("S3 refresh (misma sesión ⇒ misma huella) keeps the attempt retryable with the same key", async () => {
    const key = await uncertainDealer(); await closeCheckout();
    /* Revalidación inocua: el backend devuelve el mismo vencimiento
       almacenado ⇒ la huella no cambia y el intento sigue siendo
       reenviable con su MISMA referencia. */
    fireEvent(window, new Event("focus")); await settle();
    const bytes = storageBytes();
    await openCheckout();
    expect(screen.getByText(key)).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /Confirmo que consulte/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
    await clickSubmit();
    expect(distributorOrderPosts()).toHaveLength(2);
    expect(orderKeys(distributorOrderPosts())).toEqual([key, key]);
    expect(publicOrderPosts()).toHaveLength(0);
    expectPreserved(bytes);
  });
  it("S4 logout: el canal público arranca una compra nueva y NO toca el registro del distribuidor", async () => {
    const key = await uncertainDealer(); await closeCheckout();
    const markerBefore = localStorage.getItem(DIST_LOCAL);
    const sessionBefore = sessionStorage.getItem(DIST_SESSION);
    await logoutDistributor();
    await openCheckout();
    /* El canal público tiene su propio compartmento: no ve el intento del
       distribuidor (ni su referencia, ni su casilla de liberación). */
    expect(screen.queryByText(key)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Confirmo que consulté/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
    /* La compra pública es posible e independiente… */
    fillForm();
    await clickSubmit();
    await waitFor(() => expect(publicOrderPosts()).toHaveLength(1));
    expect(orderKeys(publicOrderPosts())).not.toContain(key);
    /* …y el registro del distribuidor queda byte a byte igual. */
    expect(localStorage.getItem(DIST_LOCAL)).toBe(markerBefore);
    expect(sessionStorage.getItem(DIST_SESSION)).toBe(sessionBefore);
    expect(clearCartSpy).not.toHaveBeenCalled();
  });
  it("S4 legacy without a channel is reused by the public channel and retried with the same key", async () => {
    await uncertainDealer(); await closeCheckout();
    /* El registro heredado es el histórico del canal PÚBLICO (persistido sin
       el campo `channel` en su compartmento de siempre). */
    const legacyKey = "11111111-1111-4111-8111-111111111111";
    const legacyCreatedAt = new Date().toISOString();
    const legacyLines = [{ productId: "raptor+", qty: 2 }];
    const legacyContact = { name: "Cliente", legalName: "Empresa", email: "cliente@example.test" };
    localStorage.setItem(PUBLIC_LOCAL, JSON.stringify({
      version: "v2", idempotencyKey: legacyKey, orderId: null,
      lines: legacyLines, createdAt: legacyCreatedAt,
    }));
    sessionStorage.setItem(PUBLIC_SESSION, JSON.stringify({
      version: "v2", idempotencyKey: legacyKey, orderId: null,
      contact: legacyContact, lines: legacyLines, createdAt: legacyCreatedAt,
    }));
    await logoutDistributor(); const bytes = storageBytes(); await openCheckout();
    /* El canal público conserva las reglas de origin/main: el registro
       heredado se reutiliza, no se bloquea. */
    expect(screen.queryByRole("checkbox", { name: /Confirmo que consulté/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
    /* El canal público no muestra la referencia (origin/main). */
    expect(screen.queryByText(legacyKey)).toBeNull();
    /* El reintento usa la MISMA clave: no se crea otro intento. */
    await clickSubmit();
    expect(publicOrderPosts()).toHaveLength(1);
    expect(orderKeys(publicOrderPosts())).toEqual([legacyKey]);
    expect(distributorOrderPosts()).toHaveLength(1);
    /* El registro se conserva byte a byte y el carrito no se toca. */
    expect(storedMarker()?.idempotencyKey).toBe(legacyKey);
    expect(localStorage.getItem("starvie-cart-v1")).toBe(bytes[4]);
    expect(clearCartSpy).not.toHaveBeenCalled();
  });
  it("S5 ordinary dealer completion keeps one-step confirmation and hides the uncertainty notice", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/api/distributor/orders")) {
        calls.push({ url: String(input), method: "POST", body: JSON.parse(String(init?.body)) });
        return jsonResponse({ orderId: ORDER_ID, status: "completed" });
      }
      return original(input, init);
    });
    try {
      renderApp(); await loginDistributor("a"); await openCheckout(); fillForm(); await clickSubmit();
      await waitFor(() => expect(clearCartSpy).toHaveBeenCalledTimes(1));
      expect(distributorOrderPosts()).toHaveLength(1);
      expect(localStorage.getItem(DIST_LOCAL)).toBeNull(); expect(sessionStorage.getItem(DIST_SESSION)).toBeNull();
      expect(screen.queryByRole("button", { name: "Copiar referencia" })).toBeNull();
      expect(screen.queryByText(warning)).toBeNull();
    } finally { fetchMock.mockImplementation(original); }
  });
  it("S1/S5 a definite dealer rejection remains terminal, keeps its reference and is NOT released locally", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/api/distributor/orders")) {
        calls.push({ url: String(input), method: "POST", body: JSON.parse(String(init?.body)) });
        return jsonResponse({ orderId: ORDER_ID, status: "failed" }, 502);
      }
      return original(input, init);
    });
    try {
      renderApp(); await loginDistributor("a"); await openCheckout(); fillForm(); await clickSubmit();
      expect(screen.getByRole("alert")).toHaveTextContent("El pedido falló definitivamente.");
      /* El aviso de "pedido sin confirmar" sería FALSO: el servidor registró
         el pedido. */
      expect(screen.queryByText(warning)).toBeNull();
      expect(screen.getByText(/El pedido llegó al servidor/)).toBeVisible();
      /* La referencia original, su copia y el contacto real siguen visibles. */
      const key = String(storedMarker("distributor")!.idempotencyKey);
      expect(screen.getByText(key)).toBeVisible();
      expect(screen.getByRole("button", { name: "Copiar referencia" })).toBeVisible();
      expect(screen.getByRole("link", { name: "WhatsApp comercial de RealStep" })).toHaveAttribute("href", contactUrl);
      /* Pero NO hay liberación local: el pedido existe en el servidor y
         puede que el cliente ya haya sido notificado. */
      expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
      expect(screen.queryByRole("checkbox", { name: /Confirmo que consulté/ })).toBeNull();
      expect(localStorage.getItem(DIST_LOCAL)).toBeTruthy();
    } finally { fetchMock.mockImplementation(original); }
  });
  it("S5/S6 public unknown-result output and normal retry keep working, with the reference preserved", async () => {
    renderApp(); await openCheckout(); fillForm(); await clickSubmit();
    expect(screen.getByRole("alert")).toHaveTextContent("Respuesta ambigua del servidor.");
    expect(screen.getByRole("button", { name: "Reintentar envío" })).toBeEnabled();
    const key = String(storedMarker()!.idempotencyKey);
    /* La referencia original se conserva en el marcador, pero el canal
       público no la muestra (origin/main): sin referencia, sin copia y sin
       contacto de RealStep. */
    expect(screen.queryByText(key)).toBeNull();
    expect(screen.queryByRole("button", { name: "Copiar referencia" })).toBeNull();
    expect(screen.queryByRole("link", { name: "WhatsApp comercial de RealStep" })).toBeNull();
    expect(screen.queryByText(warning)).toBeNull();
    /* Pero un resultado incierto NO se libera localmente: sin casilla ni
       botón, y el reintento sigue siendo con la misma referencia. */
    expect(screen.queryByRole("checkbox", { name: /Confirmo que consulté/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolver intento e iniciar nueva compra" })).toBeNull();
    expect(storedMarker()?.idempotencyKey).toBe(key);
    await clickSubmit();
    expect(orderKeys(publicOrderPosts())).toEqual([key, key]);
  });
});
