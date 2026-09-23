import { describe, expect, it, vi } from "vitest";
import {
  buildOrderPayload,
  newIdempotencyKey,
  submitOrder,
  validateContact,
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
  { line: { productId: "raptor+", qty: 2 }, product: product(), subtotal: 1000, ...overrides },
];

const contact = () => ({
  name: "Santiago Lareu",
  legalName: "StarVie Padel SAS",
  phone: "+54 9 11 1234 5678",
  email: "santi@example.com",
  province: "Buenos Aires",
  city: "La Plata",
});

describe("checkout: validación del formulario", () => {
  it("acepta un formulario válido", () => {
    expect(validateContact(contact())).toEqual({});
  });

  it("rechaza email inválido", () => {
    expect(validateContact({ ...contact(), email: "no-es-email" }).email).toBeTruthy();
  });

  it("rechaza nombre y apellido vacío", () => {
    expect(validateContact({ ...contact(), name: "" }).name).toBeTruthy();
  });

  it("rechaza razón social vacía", () => {
    expect(validateContact({ ...contact(), legalName: "  " }).legalName).toBeTruthy();
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
    expect(validateContact({ ...contact(), cuit: "20-12345678-9" })).toEqual({});
    expect(validateContact({ ...contact(), cuit: "123" }).cuit).toBeTruthy();
  });

  it("limita observaciones", () => {
    expect(validateContact({ ...contact(), notes: "x".repeat(501) }).notes).toBeTruthy();
  });
});

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
    expect(JSON.stringify(payload)).not.toMatch(/precio|subtotal|total|disponible/);
  });

  it("incluye opcionales con trim y omite los vacíos", () => {
    const payload = buildOrderPayload(
      presented(),
      { ...contact(), address: "  Calle 123  ", cuit: "", notes: "  Llamar antes  " },
      "key-1",
    );
    expect(payload?.contact).toMatchObject({ address: "Calle 123", notes: "Llamar antes" });
    expect(payload?.contact).not.toHaveProperty("cuit");
  });

  it("omite todos los opcionales vacíos dejando solo name/legalName/email", () => {
    const payload = buildOrderPayload(
      presented(),
      { name: "  Santiago Lareu  ", legalName: "StarVie Padel SAS", email: "santi@example.com" },
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
      { line: { productId: "raptor+", qty: 0 }, product: product(), subtotal: 0 },
      { line: { productId: "viejo", qty: 1 }, product: product({ disponible: false }), subtotal: 500 },
    ];
    expect(buildOrderPayload(lines, contact(), "key-1")).toBeNull();
  });

  it("genera claves únicas por pedido", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe("checkout: submitOrder", () => {
  const okFetch = (data: unknown) =>
    (async () => ({ ok: true, status: 200, json: async () => data })) as unknown as typeof fetch;

  it("envía POST JSON y devuelve orderId", async () => {
    const fetchImpl = vi.fn(okFetch({ orderId: "ord-1" }));
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    const result = await submitOrder(payload, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/orders");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.stringify(JSON.parse(init.body as string))).not.toMatch(/precio/);
    expect(result).toEqual({ ok: true, orderId: "ord-1" });
  });

  it("maneja error HTTP sin romper", async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "Sin stock" }),
    })) as unknown as typeof fetch;
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    expect(await submitOrder(payload, { fetchImpl })).toEqual({ ok: false, error: "Sin stock" });
  });

  it.each([200, 201, 202])("cualquier 2xx válido con JSON confirma (status %i)", async (status) => {
    const fetchImpl = (async () => ({
      ok: true,
      status,
      json: async () => ({ orderId: "ord-1" }),
    })) as unknown as typeof fetch;
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    expect(await submitOrder(payload, { fetchImpl })).toEqual({ ok: true, orderId: "ord-1" });
  });

  it.each([400, 409, 429, 500])("HTTP %i con JSON válido es error y no confirma", async (status) => {
    const fetchImpl = (async () => ({
      ok: false,
      status,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    const result = await submitOrder(payload, { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(status));
  });

  it("maneja JSON inválido", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    })) as unknown as typeof fetch;
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    expect(await submitOrder(payload, { fetchImpl })).toEqual({
      ok: false,
      error: "Respuesta inválida del servidor.",
    });
  });

  it("maneja error de red", async () => {
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    expect(await submitOrder(payload, { fetchImpl })).toEqual({
      ok: false,
      error: "Sin conexión con el servidor. Reintentá.",
    });
  });

  it("maneja timeout con AbortController", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const payload = buildOrderPayload(presented(), contact(), "key-1")!;
    expect(await submitOrder(payload, { fetchImpl, timeoutMs: 20 })).toEqual({
      ok: false,
      error: "El envío tardó demasiado. Reintentá.",
    });
  });
});
