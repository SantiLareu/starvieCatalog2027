import { describe, expect, it, vi } from "vitest";
import {
  buildOrderPayload,
  createMockSubmitOrder,
  newIdempotencyKey,
  ORDERS_CATALOG_ID,
  ORDERS_ENDPOINT,
  ORDERS_PRODUCTION_API,
  resolveApiBaseUrl,
  submitOrder,
  validateContact,
  type SubmitResult,
} from "./orders";
import type { CommerceProduct, PresentedLine } from "./types";

const product = (overrides = {}) =>
  ({
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
    ...overrides,
  }) as CommerceProduct;

const presented = (overrides = {}): PresentedLine[] => [
  {
    line: { productId: "raptor+", qty: 2 },
    product: product(),
    subtotal: 1000,
    ...overrides,
  },
];

const contact = () => ({
  name: "Santiago Lareu",
  legalName: "StarVie Padel SAS",
  phone: "+54 9 11 1234 5678",
  email: "santi@example.com",
  province: "Buenos Aires",
  city: "La Plata",
});

/* ── helpers ───────────────────────────────────────────────────────── */
function makeFetchResponse(
  status: number,
  body: unknown,
  extra?: Record<string, unknown>,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (extra?.["Retry-After"]) {
    headers["Retry-After"] = extra["Retry-After"] as string;
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name: string) => headers[name] ?? null },
    ...extra,
  } as Response;
}

/* ── checkout: validación del formulario ───────────────────────────── */
describe("checkout: validación del formulario", () => {
  it("acepta un formulario válido", () => {
    expect(validateContact(contact())).toEqual({});
  });

  it("rechaza email inválido", () => {
    expect(
      validateContact({ ...contact(), email: "no-es-email" }).email,
    ).toBeTruthy();
  });

  it("rechaza nombre y apellido vacío", () => {
    expect(validateContact({ ...contact(), name: "" }).name).toBeTruthy();
  });

  it("rechaza razón social vacía", () => {
    expect(
      validateContact({ ...contact(), legalName: "  " }).legalName,
    ).toBeTruthy();
  });

  it("permite teléfono, provincia, localidad, dirección, CUIT y observaciones vacíos", () => {
    expect(
      validateContact({
        name: "Santiago Lareu",
        legalName: "StarVie Padel SAS",
        email: "santi@example.com",
        phone: "",
        province: "  ",
        city: "",
        address: "",
        cuit: "",
        notes: "",
      }),
    ).toEqual({});
  });

  it("valida CUIT solo si se completa", () => {
    expect(validateContact({ ...contact(), cuit: "" })).toEqual({});
    expect(validateContact({ ...contact(), cuit: "20-12345678-9" })).toEqual(
      {},
    );
    expect(validateContact({ ...contact(), cuit: "123" }).cuit).toBeTruthy();
  });

  it("limita observaciones", () => {
    expect(
      validateContact({ ...contact(), notes: "x".repeat(501) }).notes,
    ).toBeTruthy();
  });
});

/* ── checkout: payload ─────────────────────────────────────────────── */
describe("checkout: payload", () => {
  it("manda identidad + cantidad, sin precios ni totales", () => {
    const payload = buildOrderPayload(presented(), contact(), "key-1");
    expect(payload).toMatchObject({
      contact: {
        name: "Santiago Lareu",
        legalName: "StarVie Padel SAS",
        phone: "+54 9 11 1234 5678",
        email: "santi@example.com",
        province: "Buenos Aires",
        city: "La Plata",
      },
      lines: [{ productId: "raptor+", qty: 2 }],
      idempotencyKey: "key-1",
    });
    expect(payload?.contact).not.toHaveProperty("company");
    expect(JSON.stringify(payload)).not.toMatch(
      /precio|subtotal|total|disponible/,
    );
  });

  it("incluye opcionales con trim y omite los vacíos", () => {
    const payload = buildOrderPayload(
      presented(),
      {
        ...contact(),
        address: "  Calle 123  ",
        cuit: "",
        notes: "  Llamar antes  ",
      },
      "key-1",
    );
    expect(payload?.contact).toMatchObject({
      address: "Calle 123",
      notes: "Llamar antes",
    });
    expect(payload?.contact).not.toHaveProperty("cuit");
  });

  it("omite todos los opcionales vacíos dejando solo name/legalName/email", () => {
    const payload = buildOrderPayload(
      presented(),
      {
        name: "  Santiago Lareu  ",
        legalName: "StarVie Padel SAS",
        email: "santi@example.com",
      },
      "key-1",
    );
    expect(payload?.contact).toEqual({
      name: "Santiago Lareu",
      legalName: "StarVie Padel SAS",
      email: "santi@example.com",
    });
  });

  it("excluye no disponibles y cantidades inválidas; vacío no permite enviar", () => {
    const lines: PresentedLine[] = [
      {
        line: { productId: "raptor+", qty: 0 },
        product: product(),
        subtotal: 0,
      },
      {
        line: { productId: "viejo", qty: 1 },
        product: product({ disponible: false }),
        subtotal: 500,
      },
    ];
    expect(buildOrderPayload(lines, contact(), "key-1")).toBeNull();
  });

  it("genera claves únicas por pedido", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it("lanza cuando crypto no tiene randomUUID", () => {
    // In Vitest/Node, crypto.randomUUID is always available.
    // The throw only happens in environments without Web Crypto.
    // We test the code path by mocking the function.
    const orig = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: undefined as unknown as () => string },
      writable: true,
      configurable: true,
    });
    expect(() => newIdempotencyKey()).toThrow("Secure random");
    Object.defineProperty(globalThis, "crypto", {
      value: orig,
      writable: true,
      configurable: true,
    });
  });
});

/* ── checkout: submitOrder — contrato de backend ───────────────────── */
describe("checkout: submitOrder — contrato de backend", () => {
  it("usa la URL correcta: base + endpoint", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        makeFetchResponse(201, { orderId: "RS-uuid-123", status: "accepted" }),
      ),
    ) as unknown as typeof fetch;
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    const result = await submitOrder(payload, {
      fetchImpl,
      baseUrl: "http://localhost:8787",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
    ];
    expect(url).toBe("http://localhost:8787/api/orders");
    expect(result).toEqual({ kind: "processing", orderId: "RS-uuid-123" });
  });

  it("incluye catalogId: 'starvie' en el body", async () => {
    let capturedBody: string | undefined;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string | undefined;
      return Promise.resolve(
        makeFetchResponse(201, { orderId: "RS-uuid-123", status: "accepted" }),
      );
    }) as unknown as typeof fetch;
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    await submitOrder(payload, { fetchImpl, baseUrl: "http://localhost:8787" });

    const parsed = JSON.parse(capturedBody as string);
    expect(parsed.catalogId).toBe("starvie");
  });

  it("incluye turnstileToken si se provee", async () => {
    let capturedBody: string | undefined;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string | undefined;
      return Promise.resolve(
        makeFetchResponse(201, { orderId: "RS-uuid-123", status: "accepted" }),
      );
    }) as unknown as typeof fetch;
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    await submitOrder(payload, {
      fetchImpl,
      baseUrl: "http://localhost:8787",
      turnstileToken: "cf-token-abc",
    });

    const parsed = JSON.parse(capturedBody as string);
    expect(parsed.turnstileToken).toBe("cf-token-abc");
  });

  /* ── 200 — completed ──────────────────────────────────────────────── */
  describe("200 — completed", () => {
    it("resultado completed con body status:completed", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(200, {
            orderId: "RS-uuid-100",
            status: "completed",
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "completed",
        orderId: "RS-uuid-100",
      });
    });

    it("resultado processing con body status:processing", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(200, {
            orderId: "RS-uuid-101",
            status: "processing",
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "processing",
        orderId: "RS-uuid-101",
      });
    });

    it("200 sin orderId → unknown", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(200, { foo: "bar" }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "unknown",
        error: "Respuesta inválida del servidor.",
      });
    });

    it("200 con body statusless → unknown (falla cerrado)", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(200, { orderId: "RS-uuid-102" }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "unknown",
        error: "Respuesta ambigua del servidor.",
      });
    });

    it("200 con body status:accepted → processing", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(200, {
            orderId: "RS-uuid-103",
            status: "accepted",
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "processing",
        orderId: "RS-uuid-103",
      });
    });
  });

  /* ── 201 — created / accepted ─────────────────────────────────────── */
  describe("201 — created / accepted", () => {
    it("resultado processing con body status:accepted", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(201, {
            orderId: "RS-uuid-200",
            status: "accepted",
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "processing",
        orderId: "RS-uuid-200",
      });
    });

    it("resultado completed con body status:completed", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(201, {
            orderId: "RS-uuid-201",
            status: "completed",
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "completed",
        orderId: "RS-uuid-201",
      });
    });

    it("201 sin campo status → unknown (falla cerrado)", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(201, { orderId: "RS-uuid-202" }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "unknown",
        error: "Respuesta ambigua del servidor.",
      });
    });

    it("201 sin orderId → unknown", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(201, { foo: "bar" }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "unknown",
        error: "Respuesta inválida del servidor.",
      });
    });

    it("201 con body status:processing → processing", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(201, {
            orderId: "RS-uuid-203",
            status: "processing",
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "processing",
        orderId: "RS-uuid-203",
      });
    });
  });

  /* ── 202 — processing (existing order) ────────────────────────────── */
  describe("202 — processing (existing order)", () => {
    it("result processing con body status:processing", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(202, {
            orderId: "RS-uuid-300",
            status: "processing",
            nextRetryAt: 1700000000000,
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "processing",
        orderId: "RS-uuid-300",
        nextRetryAt: 1700000000000,
      });
    });

    it("202 sin campo status → processing (always processing for 202)", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(202, { orderId: "RS-uuid-301" }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "processing",
        orderId: "RS-uuid-301",
      });
    });

    it("202 con body status:completed → processing (202 is always processing)", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(202, {
            orderId: "RS-uuid-302",
            status: "completed",
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "processing",
        orderId: "RS-uuid-302",
      });
    });

    it("202 sin orderId → unknown", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(202, { status: "processing" }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "unknown",
        error: "Respuesta inválida del servidor.",
      });
    });
  });

  /* ── 409 — conflict ───────────────────────────────────────────────── */
  describe("409 — conflict", () => {
    it("devuelve error con mensaje del backend", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(409, {
            error: "Idempotency key already used with a different request",
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "conflict",
        error: "Idempotency key already used with a different request",
      });
    });

    it("409 sin JSON body", async () => {
      const fetchImpl = () => Promise.resolve(makeFetchResponse(409, {}));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      const result = await submitOrder(payload, { fetchImpl });
      expect(result).toMatchObject({ kind: "conflict" });
      if (result.kind === "conflict") expect(result.error).toContain("409");
    });
  });

  /* ── 429 — rate limit ─────────────────────────────────────────────── */
  describe("429 — rate limit", () => {
    it("parsea Retry-After como segundos", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(
            429,
            { error: "Too many requests" },
            { "Retry-After": "30" },
          ),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      const result = await submitOrder(payload, { fetchImpl });
      expect(result.kind).toBe("rateLimited");
      if (result.kind === "rateLimited") expect(result.retryAfter).toBe(30);
    });

    it("Retry-After como fecha HTTP (bounded 24h)", async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 60_000);
      const httpDate = future.toUTCString();

      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(
            429,
            { error: "Too many requests" },
            { "Retry-After": httpDate },
          ),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      const result = await submitOrder(payload, { fetchImpl });
      expect(result.kind).toBe("rateLimited");
      if (result.kind === "rateLimited")
        expect(result.retryAfter).toBeGreaterThanOrEqual(55);
    });

    it("Retry-After fuera de rango → fallback bounded", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(
            429,
            { error: "Too many requests" },
            { "Retry-After": "abc" },
          ),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      const result = await submitOrder(payload, { fetchImpl });
      expect(result.kind).toBe("rateLimited");
      if (result.kind === "rateLimited") expect(result.retryAfter).toBe(60);
    });

    it("sin Retry-After → fallback general", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(429, { error: "Too many requests" }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      const result = await submitOrder(payload, { fetchImpl });
      expect(result.kind).toBe("rateLimited");
      if (result.kind === "rateLimited") expect(result.retryAfter).toBe(60);
    });
  });

  /* ── 502 — failed (terminal) ──────────────────────────────────────── */
  describe("502 — failed (terminal)", () => {
    it("devuelve failed con orderId en body", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(502, {
            error: "Email delivery failed",
            orderId: "RS-uuid-fail",
            status: "failed",
          }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      const result = await submitOrder(payload, { fetchImpl });
      expect(result.kind).toBe("failed");
      if (result.kind === "failed") expect(result.orderId).toBe("RS-uuid-fail");
    });

    it("502 sin confirmación de pedido fallido → unknown", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(502, { error: "Email delivery failed" }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      const result = await submitOrder(payload, { fetchImpl });
      expect(result.kind).toBe("unknown");
    });

    it("502 con orderId pero sin status failed → unknown", async () => {
      const fetchImpl = () => Promise.resolve(makeFetchResponse(502, { orderId: "RS-uuid-fail" }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect((await submitOrder(payload, { fetchImpl })).kind).toBe("unknown");
    });

    it("502 con cuerpo no JSON → unknown", async () => {
      const fetchImpl = () => Promise.resolve(makeFetchResponse(502, {}, {
        json: async () => { throw new Error("bad json"); },
      }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect((await submitOrder(payload, { fetchImpl })).kind).toBe("unknown");
    });
  });

  /* ── 503 — retryable unknown ──────────────────────────────────────── */
  describe("503 — retryable unknown", () => {
    it("devuelve unknown error genérico", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(503, { error: "Service temporarily unavailable" }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      const result = await submitOrder(payload, { fetchImpl });
      expect(result.kind).toBe("unknown");
    });
  });

  /* ── malformed / invalid JSON ─────────────────────────────────────── */
  describe("malformed / invalid JSON", () => {
    it("falla con JSON inválido", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(200, null) as Response);
      (fetchImpl as any).json = async () => {
        throw new Error("bad json");
      };
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(
        await submitOrder(payload, {
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      ).toEqual({
        kind: "unknown",
        error: "Respuesta inválida del servidor.",
      });
    });

    it("falla con body no object (string)", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(201, "just-string"));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "unknown",
        error: "Respuesta inválida del servidor.",
      });
    });

    it("falla con array body", async () => {
      const fetchImpl = () =>
        Promise.resolve(makeFetchResponse(201, [{ orderId: "x" }]));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "unknown",
        error: "Respuesta inválida del servidor.",
      });
    });
  });

  /* ── timeout y red ────────────────────────────────────────────────── */
  describe("timeout y red", () => {
    it("timeout → AbortError", async () => {
      const fetchImpl = ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        })) as unknown as typeof fetch;
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl, timeoutMs: 20 })).toEqual({
        kind: "unknown",
        error: "El envío tardó demasiado. Reintentá.",
      });
    });

    it("error de red", async () => {
      const fetchImpl = (async () => {
        throw new Error("down");
      }) as unknown as typeof fetch;
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect(await submitOrder(payload, { fetchImpl })).toEqual({
        kind: "unknown",
        error: "Sin conexión con el servidor. Reintentá.",
      });
    });
  });

  /* ── otros HTTP errors ────────────────────────────────────────────── */
  describe("otros HTTP errors", () => {
    it.each([
      [400, "Turnstile token is required"],
      [403, "Turnstile verification failed"],
    ])("HTTP %i con error Turnstile requiere un token nuevo", async (status, error) => {
      const fetchImpl = () => Promise.resolve(makeFetchResponse(status, { error }));
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      expect((await submitOrder(payload, { fetchImpl })).kind).toBe("verificationRequired");
    });

    it.each([400, 401, 403, 500])(
      "HTTP %i — validation/unknown",
      async (status) => {
        const fetchImpl = () => Promise.resolve(makeFetchResponse(status, {}));
        const payload = buildOrderPayload(presented(), contact(), "key-1")!;
        const result = await submitOrder(payload, { fetchImpl });
        expect(result.kind).toBe(status < 500 ? "validation" : "unknown");
      },
    );

    it("400 con mensaje del servidor", async () => {
      const fetchImpl = () =>
        Promise.resolve(
          makeFetchResponse(400, { error: "contact.name is required" }),
        );
      const payload = buildOrderPayload(presented(), contact(), "key-1")!;
      const result = await submitOrder(payload, { fetchImpl });
      expect(result.kind).toBe("validation");
      if (result.kind === "validation")
        expect(result.error).toBe("contact.name is required");
    });
  });
});

/* ── createMockSubmitOrder ──────────────────────────────────────────── */
describe("createMockSubmitOrder", () => {
  it("devuelve completed", async () => {
    const mock = createMockSubmitOrder({
      kind: "completed",
      orderId: "mock-123",
    });
    expect(await mock({} as any)).toEqual({
      kind: "completed",
      orderId: "mock-123",
    });
  });

  it("devuelve processing", async () => {
    const mock = createMockSubmitOrder({
      kind: "processing",
      orderId: "mock-123",
    });
    expect(await mock({} as any)).toEqual({
      kind: "processing",
      orderId: "mock-123",
    });
  });

  it("devuelve failed", async () => {
    const mock = createMockSubmitOrder({ kind: "failed", orderId: null });
    expect(await mock({} as any)).toEqual({ kind: "failed", orderId: null });
  });

  it("devuelve conflict", async () => {
    const mock = createMockSubmitOrder({ kind: "conflict", error: "Conflict" });
    expect(await mock({} as any)).toEqual({
      kind: "conflict",
      error: "Conflict",
    });
  });

  it("devuelve rateLimited", async () => {
    const mock = createMockSubmitOrder({
      kind: "rateLimited",
      error: "Rate limited",
      retryAfter: 30,
    });
    expect(await mock({} as any)).toEqual({
      kind: "rateLimited",
      error: "Rate limited",
      retryAfter: 30,
    });
  });

  it("devuelve unknown", async () => {
    const mock = createMockSubmitOrder({ kind: "unknown", error: "Unknown" });
    expect(await mock({} as any)).toEqual({
      kind: "unknown",
      error: "Unknown",
    });
  });

  it("devuelve validation", async () => {
    const mock = createMockSubmitOrder({
      kind: "validation",
      error: "Validation",
    });
    expect(await mock({} as any)).toEqual({
      kind: "validation",
      error: "Validation",
    });
  });

  it("delay funciona", async () => {
    const delay = 10;
    const mock = createMockSubmitOrder(
      { kind: "completed", orderId: "mock-123" },
      delay,
    );
    const start = Date.now();
    const result = await mock({} as any);
    expect(result).toEqual({ kind: "completed", orderId: "mock-123" });
    expect(Date.now() - start).toBeGreaterThanOrEqual(delay - 5);
  });
});

/* ── ORDERS_CATALOG_ID ──────────────────────────────────────────────── */
describe("ORDERS_CATALOG_ID", () => {
  it("siempre es 'starvie'", () => {
    expect(ORDERS_CATALOG_ID).toBe("starvie");
  });
});

/* ── resolveApiBaseUrl ─────────────────────────────────────────────── */
describe("resolveApiBaseUrl", () => {
  it("devuelve la URL de producción por defecto", () => {
    expect(resolveApiBaseUrl()).toBe(ORDERS_PRODUCTION_API);
  });
});
