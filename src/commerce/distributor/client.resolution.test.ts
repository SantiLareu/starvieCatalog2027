import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDistributorOrderResolution } from "./client";

/**
 * Cliente HTTP de la conciliación administrativa del canal distribuidor.
 *
 * Contrato verificado (backend candidato, sólo lectura):
 *   GET /api/distributor/order-resolution?reference=<idempotencyKey>
 *   200 { ok: true, reference, status, decidedAt }
 *   status ∈ RECEIVED | NOT_RECEIVED | UNRESOLVED | UNKNOWN | EXPIRED
 *
 * Reglas que este archivo fija:
 *  - la consulta es de SOLO LECTURA: un GET, con la cookie de sesión;
 *  - 401 → sesión vencida; 404/503 → no disponible; el resto → error;
 *  - NADA se interpreta como resolución válida si el eco de la referencia no
 *    coincide con la consultada, si el estado es desconocido o si el cuerpo
 *    no es válido;
 *  - sin backend configurado NO hay ninguna solicitud;
 *  - una referencia vacía o excesiva NO sale a la red.
 */

const REFERENCE = "0df502b3-51aa-461d-a1b6-19363712c567";
const OTHER_REFERENCE = "11111111-2222-4333-8444-555555555555";

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

function fakeFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  const mock = vi.fn(async (url: unknown, init: unknown) =>
    handler(String(url), (init ?? {}) as RequestInit),
  );
  return mock as unknown as typeof fetch;
}

describe("consulta de conciliación (GET /api/distributor/order-resolution)", () => {
  it("200 con cuerpo válido devuelve el estado y la fecha de decisión", async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse(200, {
        ok: true,
        reference: REFERENCE,
        status: "RECEIVED",
        decidedAt: "2026-11-12T10:00:00.000Z",
      }),
    );

    const result = await fetchDistributorOrderResolution(REFERENCE, fetchImpl);
    expect(result).toEqual({
      kind: "ok",
      resolution: {
        ok: true,
        reference: REFERENCE,
        status: "RECEIVED",
        decidedAt: "2026-11-12T10:00:00.000Z",
      },
    });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/api/distributor/order-resolution?reference=");
    expect(String(url)).toContain(REFERENCE);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
  });

  it("un estado sin decisión llega con decidedAt null", async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse(200, {
        ok: true,
        reference: REFERENCE,
        status: "UNRESOLVED",
        decidedAt: null,
      }),
    );

    const result = await fetchDistributorOrderResolution(REFERENCE, fetchImpl);
    expect(result).toEqual({
      kind: "ok",
      resolution: {
        ok: true,
        reference: REFERENCE,
        status: "UNRESOLVED",
        decidedAt: null,
      },
    });
  });

  it("una fecha de decisión ilegible se trata como null, nunca como un estado inventado", async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse(200, {
        ok: true,
        reference: REFERENCE,
        status: "NOT_RECEIVED",
        decidedAt: "no-es-una-fecha",
      }),
    );

    const result = await fetchDistributorOrderResolution(REFERENCE, fetchImpl);
    expect(result).toEqual({
      kind: "ok",
      resolution: {
        ok: true,
        reference: REFERENCE,
        status: "NOT_RECEIVED",
        decidedAt: null,
      },
    });
  });

  it("un eco de OTRA referencia no se aplica: es un error, nunca una resolución", async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse(200, {
        ok: true,
        reference: OTHER_REFERENCE,
        status: "RECEIVED",
        decidedAt: "2026-11-12T10:00:00.000Z",
      }),
    );

    expect(await fetchDistributorOrderResolution(REFERENCE, fetchImpl)).toEqual({ kind: "error" });
  });

  it("un estado desconocido no se aplica", async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse(200, {
        ok: true,
        reference: REFERENCE,
        status: "CANCELLED",
        decidedAt: null,
      }),
    );

    expect(await fetchDistributorOrderResolution(REFERENCE, fetchImpl)).toEqual({ kind: "error" });
  });

  it("un cuerpo inválido (ok distinto de true o no-objeto) es un error", async () => {
    const notOk = fakeFetch(() => jsonResponse(200, { ok: false, reference: REFERENCE, status: "RECEIVED" }));
    expect(await fetchDistributorOrderResolution(REFERENCE, notOk)).toEqual({ kind: "error" });

    const notAnObject = fakeFetch(() => jsonResponse(200, ["RECEIVED"]));
    expect(await fetchDistributorOrderResolution(REFERENCE, notAnObject)).toEqual({ kind: "error" });
  });

  it("401 es sesión vencida y no habilita nada", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(401, { ok: false, error: "Unauthorized" }));
    expect(await fetchDistributorOrderResolution(REFERENCE, fetchImpl)).toEqual({
      kind: "session-expired",
    });
  });

  it("404 y 503 son 'no disponible', nunca una resolución", async () => {
    const notFound = fakeFetch(() => jsonResponse(404, { ok: false, error: "Not Found" }));
    expect(await fetchDistributorOrderResolution(REFERENCE, notFound)).toEqual({
      kind: "unavailable",
    });

    const unavailable = fakeFetch(() => jsonResponse(503, { ok: false, error: "Service Unavailable" }));
    expect(await fetchDistributorOrderResolution(REFERENCE, unavailable)).toEqual({
      kind: "unavailable",
    });
  });

  it("500 y otros códigos inesperados son un error técnico", async () => {
    const serverError = fakeFetch(() => jsonResponse(500, { ok: false }));
    expect(await fetchDistributorOrderResolution(REFERENCE, serverError)).toEqual({ kind: "error" });

    const badRequest = fakeFetch(() => jsonResponse(400, { ok: false, error: "Invalid reference" }));
    expect(await fetchDistributorOrderResolution(REFERENCE, badRequest)).toEqual({ kind: "error" });
  });

  it("un fallo de red es un error técnico, nunca una resolución", async () => {
    const fetchImpl = (() => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    expect(await fetchDistributorOrderResolution(REFERENCE, fetchImpl)).toEqual({ kind: "error" });
  });

  it("sin backend configurado no hay ninguna solicitud", async () => {
    /* `undefined` elimina la variable: el caso "sin configurar" es real,
       aunque el entorno tenga un .env.local con la base configurada. */
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", undefined as unknown as string);
    const fetchImpl = fakeFetch(() => jsonResponse(200, { ok: true, reference: REFERENCE, status: "RECEIVED" }));

    expect(await fetchDistributorOrderResolution(REFERENCE, fetchImpl)).toEqual({
      kind: "unavailable",
    });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("una referencia vacía o excesiva no sale a la red", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(200, { ok: true, reference: REFERENCE, status: "RECEIVED" }));

    expect(await fetchDistributorOrderResolution("", fetchImpl)).toEqual({ kind: "error" });
    expect(await fetchDistributorOrderResolution("   ", fetchImpl)).toEqual({ kind: "error" });
    expect(await fetchDistributorOrderResolution("a".repeat(129), fetchImpl)).toEqual({ kind: "error" });

    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("una referencia de 128 caracteres sí se consulta", async () => {
    const reference = "a".repeat(128);
    const fetchImpl = fakeFetch(() =>
      jsonResponse(200, { ok: true, reference, status: "EXPIRED", decidedAt: null }),
    );

    const result = await fetchDistributorOrderResolution(reference, fetchImpl);
    expect(result.kind).toBe("ok");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
