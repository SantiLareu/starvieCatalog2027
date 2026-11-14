/**
 * SONDA INDEPENDIENTE #1 — cliente HTTP de la conciliación.
 *
 * No reutiliza los tests del candidato: afirma el CONTRATO de la petición y
 * el tratamiento de respuestas. Importa el módulo REAL del repositorio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDistributorOrderResolution } from "./client";

const REF = "0df502b3-51aa-461d-a1b6-19363712c567";
const OTHER = "11111111-2222-4333-8444-555555555555";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function spyFetch(handler?: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const mock = vi.fn(async (url: unknown, init: unknown) =>
    handler ? handler(String(url), (init ?? {}) as RequestInit) : jsonResponse(200, {}),
  );
  return mock as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

beforeEach(() => {
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://probe.invalid");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("P1 · la consulta es de SOLO LECTURA y sólo lleva la referencia", () => {
  it("P1.1 un único GET, con la cookie, y NINGÚN otro dato de cuenta", async () => {
    const fetchImpl = spyFetch(() =>
      jsonResponse(200, { ok: true, reference: REF, status: "RECEIVED", decidedAt: null }),
    );
    const result = await fetchDistributorOrderResolution(REF, fetchImpl);

    expect(result.kind).toBe("ok");
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    const [rawUrl, init] = calls[0] as [string, RequestInit];
    const url = new URL(String(rawUrl));
    /* Ruta exacta del contrato, sin endpoints inventados. */
    expect(url.pathname).toBe("/api/distributor/order-resolution");
    /* Un único parámetro: la referencia. Ni CUIT, ni id de cuenta, ni email. */
    expect([...url.searchParams.keys()]).toEqual(["reference"]);
    expect(url.searchParams.get("reference")).toBe(REF);
    expect(url.search.toLowerCase()).not.toContain("cuit");
    expect(url.search.toLowerCase()).not.toContain("account");
    expect(url.search.toLowerCase()).not.toContain("distributorid");
    expect(url.search.toLowerCase()).not.toContain("email");
    /* Lectura: GET, sin cuerpo. La identidad viaja sólo en la cookie. */
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("include");
  });

  it("P1.2 el eco de OTRA referencia NO es una resolución", async () => {
    const fetchImpl = spyFetch(() =>
      jsonResponse(200, { ok: true, reference: OTHER, status: "RECEIVED", decidedAt: null }),
    );
    expect(await fetchDistributorOrderResolution(REF, fetchImpl)).toEqual({ kind: "error" });
  });

  it("P1.3 el eco debe coincidir EXACTAMENTE (ni espacios ni mayúsculas)", async () => {
    const trailing = spyFetch(() =>
      jsonResponse(200, { ok: true, reference: `${REF} `, status: "RECEIVED", decidedAt: null }),
    );
    expect(await fetchDistributorOrderResolution(REF, trailing)).toEqual({ kind: "error" });

    const cased = spyFetch(() =>
      jsonResponse(200, { ok: true, reference: REF.toUpperCase(), status: "RECEIVED", decidedAt: null }),
    );
    expect(await fetchDistributorOrderResolution(REF, cased)).toEqual({ kind: "error" });
  });

  it("P1.4 una referencia vacía, en blanco o excesiva NO sale a la red", async () => {
    const fetchImpl = spyFetch(() => jsonResponse(200, { ok: true, reference: REF, status: "RECEIVED" }));
    expect(await fetchDistributorOrderResolution("", fetchImpl)).toEqual({ kind: "error" });
    expect(await fetchDistributorOrderResolution("   ", fetchImpl)).toEqual({ kind: "error" });
    expect(await fetchDistributorOrderResolution("x".repeat(129), fetchImpl)).toEqual({ kind: "error" });
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(0);
  });

  it("P1.5 sin backend configurado NO hay ninguna petición (cero red)", async () => {
    vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", undefined as unknown as string);
    const fetchImpl = spyFetch(() => jsonResponse(200, { ok: true, reference: REF, status: "RECEIVED" }));
    expect(await fetchDistributorOrderResolution(REF, fetchImpl)).toEqual({ kind: "unavailable" });
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(0);
  });

  it("P1.6 la referencia se transporta escapada, sin inyectar parámetros", async () => {
    const weird = "a&reference=otra#x";
    const fetchImpl = spyFetch((url) => {
      const parsed = new URL(url);
      expect([...parsed.searchParams.keys()]).toEqual(["reference"]);
      expect(parsed.searchParams.get("reference")).toBe(weird);
      return jsonResponse(200, { ok: true, reference: weird, status: "UNKNOWN", decidedAt: null });
    });
    const result = await fetchDistributorOrderResolution(weird, fetchImpl);
    expect(result.kind).toBe("ok");
  });
});

describe("P1 · ningún fallo técnico se interpreta como resolución", () => {
  const cases: Array<[string, number, unknown]> = [
    ["401", 401, { ok: false, error: "Unauthorized" }],
    ["403", 403, { ok: false, error: "Forbidden" }],
    ["404", 404, { ok: false, error: "Not Found" }],
    ["400", 400, { ok: false, error: "Invalid reference" }],
    ["500", 500, { ok: false }],
    ["502", 502, { ok: false }],
    ["503", 503, { ok: false }],
  ];
  for (const [label, status, body] of cases) {
    it(`P1.7 ${label} nunca devuelve kind="ok"`, async () => {
      const fetchImpl = spyFetch(() => jsonResponse(status, body));
      const result = await fetchDistributorOrderResolution(REF, fetchImpl);
      expect(result.kind).not.toBe("ok");
    });
  }

  it("P1.8 401 se distingue como sesión vencida y 404/503 como no disponible", async () => {
    const unauth = spyFetch(() => jsonResponse(401, { ok: false }));
    expect(await fetchDistributorOrderResolution(REF, unauth)).toEqual({ kind: "session-expired" });
    const notFound = spyFetch(() => jsonResponse(404, { ok: false }));
    expect(await fetchDistributorOrderResolution(REF, notFound)).toEqual({ kind: "unavailable" });
    const unavailable = spyFetch(() => jsonResponse(503, { ok: false }));
    expect(await fetchDistributorOrderResolution(REF, unavailable)).toEqual({ kind: "unavailable" });
  });

  it("P1.9 cuerpo inválido, estado desconocido o red caída => error", async () => {
    const notOk = spyFetch(() => jsonResponse(200, { ok: false, reference: REF, status: "RECEIVED" }));
    expect(await fetchDistributorOrderResolution(REF, notOk)).toEqual({ kind: "error" });

    const unknownStatus = spyFetch(() => jsonResponse(200, { ok: true, reference: REF, status: "CANCELLED" }));
    expect(await fetchDistributorOrderResolution(REF, unknownStatus)).toEqual({ kind: "error" });

    const broken = spyFetch(() => new Response("<html>", { status: 200 }));
    expect(await fetchDistributorOrderResolution(REF, broken)).toEqual({ kind: "error" });

    const offline = (() => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await fetchDistributorOrderResolution(REF, offline)).toEqual({ kind: "error" });
  });

  it("P1.10 no hay reintentos automáticos: un fallo NO genera una segunda petición", async () => {
    const fetchImpl = spyFetch(() => jsonResponse(500, { ok: false }));
    await fetchDistributorOrderResolution(REF, fetchImpl);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1);
  });
});
