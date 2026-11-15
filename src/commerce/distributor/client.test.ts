import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchDistributorQuote,
  fetchDistributorSession,
  loginDistributor,
  logoutDistributor,
  submitDistributorOrder,
} from "./client";

beforeEach(() => {
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distribuidor.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Identificador opaco de sesión que devuelve el backend (derivación de un
 * solo sentido sobre el hash del token de sesión, en base64url).
 */
const SESSION_ID = "Zk3vJ8xQ1nT5pR7wY2bA";

describe("cliente HTTP de distribuidores (contratos verificados)", () => {
  it("sin base configurada no realiza ninguna solicitud", async () => {
    vi.unstubAllEnvs();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { ok: true }),
    ) as unknown as typeof fetch;

    expect(await loginDistributor("20111111112", "x", fetchImpl)).toEqual({
      kind: "error",
      error: { kind: "unavailable" },
    });
    expect(await fetchDistributorSession(fetchImpl)).toEqual({
      ok: false,
      unavailable: true,
    });
    expect(await fetchDistributorQuote("p1", 1, fetchImpl)).toEqual({
      kind: "unavailable",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("login exitoso devuelve descuento, expiración y el identificador de sesión, con cookie y header CSRF", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        ok: true,
        authenticated: true,
        discountPercent: 20,
        expiresAt: "2026-11-11T20:00:00.000Z",
        sessionId: SESSION_ID,
      }),
    ) as unknown as typeof fetch;

    const result = await loginDistributor("20111111112", "secreto", fetchImpl);
    expect(result).toEqual({
      kind: "ok",
      discountPercent: 20,
      expiresAt: "2026-11-11T20:00:00.000Z",
      sessionId: SESSION_ID,
    });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/api/distributor/login");
    expect(init.credentials).toBe("include");
    expect(init.headers["X-Requested-With"]).toBe("distributor");
    expect(JSON.parse(init.body)).toEqual({ cuit: "20111111112", password: "secreto" });
  });

  it("el login y la sesión devuelven el identificador opaco tal como lo mandó el backend", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        ok: true,
        authenticated: true,
        discountPercent: 20,
        expiresAt: "2026-11-11T20:00:00.000Z",
        sessionId: SESSION_ID,
      }),
    ) as unknown as typeof fetch;

    const login = await loginDistributor("20111111112", "secreto", fetchImpl);
    expect(login.kind).toBe("ok");
    if (login.kind === "ok") expect(login.sessionId).toBe(SESSION_ID);

    const session = await fetchDistributorSession(fetchImpl);
    expect(session).toEqual({
      ok: true,
      authenticated: true,
      discountPercent: 20,
      expiresAt: "2026-11-11T20:00:00.000Z",
      sessionId: SESSION_ID,
    });
  });

  it("sin identificador de sesión la continuidad NO queda demostrada (nunca se fabrica)", async () => {
    /* El backend no lo envía (backend anterior): el resultado lo lleva
       ausente. No se sustituye por el descuento ni por el vencimiento. */
    const sinIdentificador = vi.fn(async () =>
      jsonResponse(200, {
        ok: true,
        authenticated: true,
        discountPercent: 20,
        expiresAt: "2026-11-11T20:00:00.000Z",
      }),
    ) as unknown as typeof fetch;

    const login = await loginDistributor("20111111112", "secreto", sinIdentificador);
    expect(login).toEqual({
      kind: "ok",
      discountPercent: 20,
      expiresAt: "2026-11-11T20:00:00.000Z",
      sessionId: null,
    });

    const session = await fetchDistributorSession(sinIdentificador);
    expect(session).toEqual({
      ok: true,
      authenticated: true,
      discountPercent: 20,
      expiresAt: "2026-11-11T20:00:00.000Z",
      sessionId: null,
    });
  });

  it("un identificador de sesión vacío o con espacios no prueba continuidad", async () => {
    for (const sessionId of ["", "   ", "con espacio"]) {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(200, {
          ok: true,
          authenticated: true,
          discountPercent: 20,
          expiresAt: "2026-11-11T20:00:00.000Z",
          sessionId,
        }),
      ) as unknown as typeof fetch;

      const login = await loginDistributor("20111111112", "secreto", fetchImpl);
      expect(login.kind).toBe("ok");
      if (login.kind === "ok") expect(login.sessionId).toBeNull();

      const session = await fetchDistributorSession(fetchImpl);
      expect(session).toMatchObject({ ok: true, authenticated: true, sessionId: null });
    }
  });

  it("login 401 es credenciales inválidas y 404 es backend no disponible", async () => {
    const unauthorized = vi.fn(async () =>
      jsonResponse(401, { ok: false, error: "Invalid credentials" }),
    ) as unknown as typeof fetch;
    expect(await loginDistributor("20111111112", "mal", unauthorized)).toEqual({
      kind: "error",
      error: { kind: "invalid-credentials" },
    });

    const notFound = vi.fn(async () =>
      jsonResponse(404, { ok: false, error: "Not Found" }),
    ) as unknown as typeof fetch;
    expect(await loginDistributor("20111111112", "x", notFound)).toEqual({
      kind: "error",
      error: { kind: "unavailable" },
    });
  });

  it("sesión anónima y sesión válida se distinguen sin afirmar nada ante 404", async () => {
    const anonymous = vi.fn(async () =>
      jsonResponse(200, { ok: true, authenticated: false }),
    ) as unknown as typeof fetch;
    expect(await fetchDistributorSession(anonymous)).toEqual({
      ok: true,
      authenticated: false,
    });

    const notFound = vi.fn(async () =>
      jsonResponse(404, { ok: false, error: "Not Found" }),
    ) as unknown as typeof fetch;
    expect(await fetchDistributorSession(notFound)).toEqual({
      ok: false,
      unavailable: true,
    });
  });

  it("quote mapea los importes del servidor y 401 vence la sesión", async () => {
    const ok = vi.fn(async () =>
      jsonResponse(200, {
        ok: true,
        currency: "ARS",
        discountPercent: 20,
        lines: [
          {
            productId: "eternal",
            qty: 2,
            listUnitPrice: 372000,
            netUnitPrice: 297600,
            netSubtotal: 595200,
          },
        ],
        listTotal: 744000,
        netTotal: 595200,
      }),
    ) as unknown as typeof fetch;
    const quote = await fetchDistributorQuote("eternal", 2, ok);
    expect(quote.kind).toBe("ok");
    if (quote.kind === "ok") {
      expect(quote.quote.lines[0].netSubtotal).toBe(595200);
      expect(quote.quote.netTotal).toBe(595200);
    }

    const expired = vi.fn(async () =>
      jsonResponse(401, { ok: false, error: "Unauthorized" }),
    ) as unknown as typeof fetch;
    expect(await fetchDistributorQuote("eternal", 1, expired)).toEqual({
      kind: "session-expired",
    });
  });

  it("una cotización bien formada de otro producto o cantidad no se aplica", async () => {
    const quote = (line: Record<string, unknown>) =>
      vi.fn(async () =>
        jsonResponse(200, { ok: true, currency: "ARS", discountPercent: 20, lines: [line] }),
      ) as unknown as typeof fetch;
    expect(
      await fetchDistributorQuote(
        "eternal",
        2,
        quote({ productId: "raptor+", qty: 2, netUnitPrice: 297600 }),
      ),
    ).toEqual({ kind: "error" });
    expect(
      await fetchDistributorQuote(
        "eternal",
        2,
        quote({ productId: "eternal", qty: 5, netUnitPrice: 297600 }),
      ),
    ).toEqual({ kind: "error" });
  });

  it("el cierre de sesión sólo se confirma si el servidor responde", async () => {
    const confirmado = vi.fn(async () => jsonResponse(200, { ok: true })) as unknown as typeof fetch;
    expect(await logoutDistributor(confirmado)).toEqual({ kind: "ok" });

    const sinRed = vi.fn(async () => {
      throw new Error("sin red");
    }) as unknown as typeof fetch;
    expect(await logoutDistributor(sinRed)).toEqual({ kind: "unavailable" });

    const errorDelServidor = vi.fn(async () =>
      jsonResponse(500, { ok: false }),
    ) as unknown as typeof fetch;
    expect(await logoutDistributor(errorDelServidor)).toEqual({ kind: "unavailable" });
  });

  it("el pedido distribuidor no envía catalogId ni precios, y 401 no degrada", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { ok: false, error: "Unauthorized" }),
    ) as unknown as typeof fetch;

    const result = await submitDistributorOrder(
      {
        contact: { name: "Ana", legalName: "Ana SRL", email: "ana@example.com" },
        lines: [{ productId: "eternal", qty: 1 }],
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
      },
      { fetchImpl, turnstileToken: "token-de-prueba" },
    );
    expect(result.kind).toBe("sessionExpired");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/api/distributor/orders");
    expect(init.credentials).toBe("include");
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty("catalogId");
    expect(body).not.toHaveProperty("total");
    expect(body.lines).toEqual([{ productId: "eternal", qty: 1 }]);
    expect(body.turnstileToken).toBe("token-de-prueba");
  });
});

/**
 * Turnstile en el canal distribuidor (contrato del backend candidato):
 *  · 400 "Turnstile token is required"  → token ausente, NO hay pedido.
 *  · 403 "Turnstile verification failed" → token inválido/consumido, NO hay pedido.
 *  · 503 "Turnstile verification unavailable" → la verificación no estuvo
 *    disponible (Siteverify inalcanzable o secreto ausente): el backend NO
 *    creó ningún pedido, así que NO es un resultado incierto sino una
 *    verificación nueva con la MISMA clave y el MISMO payload.
 *
 * Un 503 que NO venga de Turnstile sigue siendo un resultado incierto: el
 * cliente no puede afirmar que no se creó un pedido.
 */
describe("Turnstile en el pedido distribuidor", () => {
  const payload = {
    contact: { name: "Ana", legalName: "Ana SRL", email: "ana@example.com" },
    lines: [{ productId: "eternal", qty: 1 }],
    idempotencyKey: "00000000-0000-4000-8000-0000000000a1",
  };

  it.each([
    [400, "Turnstile token is required"],
    [403, "Turnstile verification failed"],
  ])("HTTP %i %s exige verificación nueva (no hay pedido creado)", async (status, error) => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(status, { ok: false, error }),
    ) as unknown as typeof fetch;

    const result = await submitDistributorOrder(payload, {
      fetchImpl,
      turnstileToken: "token-de-prueba",
    });
    expect(result.kind).toBe("verificationRequired");
  });

  it("HTTP 503 'Turnstile verification unavailable' NO es un resultado incierto: pide verificación nueva", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(503, { ok: false, error: "Turnstile verification unavailable" }),
    ) as unknown as typeof fetch;

    const result = await submitDistributorOrder(payload, {
      fetchImpl,
      turnstileToken: "token-de-prueba",
    });
    expect(result.kind).toBe("verificationRequired");
  });

  it("un 503 que no es de Turnstile sigue siendo un resultado incierto", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(503, { ok: false, error: "Service Unavailable" }),
    ) as unknown as typeof fetch;

    const result = await submitDistributorOrder(payload, {
      fetchImpl,
      turnstileToken: "token-de-prueba",
    });
    expect(result.kind).toBe("unknown");
  });

  it("el token viaja en el cuerpo una sola vez y la misma clave y payload se conservan", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(503, { ok: false, error: "Turnstile verification unavailable" }),
    ) as unknown as typeof fetch;

    await submitDistributorOrder(payload, { fetchImpl, turnstileToken: "token-1" });
    await submitDistributorOrder(payload, { fetchImpl, turnstileToken: "token-2" });

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    const first = JSON.parse(calls[0][1].body);
    const second = JSON.parse(calls[1][1].body);
    expect(first.turnstileToken).toBe("token-1");
    expect(second.turnstileToken).toBe("token-2");
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.lines).toEqual(first.lines);
    expect(second.contact).toEqual(first.contact);
  });
});
