import { describe, expect, it } from "vitest";
import {
  addLine,
  cartTotal,
  cartUnits,
  formatNotice,
  loadCart,
  reconcileLines,
  removeLine,
  sanitizeLines,
  saveCart,
  setLineQty,
} from "./cart";
import type { CommerceProduct } from "./types";

const raptor = (overrides = {}) => ({
  id: "raptor-plus",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 320,
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
  ...overrides,
}) as CommerceProduct;

const byId = (products: CommerceProduct[]) => new Map(products.map((p) => [p.id, p]));

describe("carrito: operaciones", () => {
  it("agrega, incrementa, decrementa vía setQty, elimina y vacía", () => {
    let lines = addLine([], "raptor-plus", 1);
    expect(lines).toEqual([{ productId: "raptor-plus", qty: 1 }]);
    lines = addLine(lines, "raptor-plus", 2);
    expect(lines).toEqual([{ productId: "raptor-plus", qty: 3 }]);
    lines = setLineQty(lines, "raptor-plus", 2);
    expect(lines).toEqual([{ productId: "raptor-plus", qty: 2 }]);
    lines = removeLine(lines, "raptor-plus");
    expect(lines).toEqual([]);
  });

  it("la cantidad no tiene máximo de inventario (1, 2, 6, 8, 10, 20)", () => {
    let lines = addLine([], "raptor-plus", 6);
    expect(lines).toEqual([{ productId: "raptor-plus", qty: 6 }]);
    lines = addLine(lines, "raptor-plus", 2);
    expect(lines).toEqual([{ productId: "raptor-plus", qty: 8 }]);
    lines = setLineQty(lines, "raptor-plus", 10);
    expect(lines).toEqual([{ productId: "raptor-plus", qty: 10 }]);
    lines = setLineQty(lines, "raptor-plus", 20);
    expect(lines).toEqual([{ productId: "raptor-plus", qty: 20 }]);
  });

  it("mantiene mínimo 1 y qty <= 0 elimina la línea", () => {
    expect(addLine([], "raptor-plus", 0)).toEqual([{ productId: "raptor-plus", qty: 1 }]);
    expect(setLineQty([{ productId: "raptor-plus", qty: 5 }], "raptor-plus", 0)).toEqual([]);
    expect(setLineQty([{ productId: "raptor-plus", qty: 5 }], "raptor-plus", -3)).toEqual([]);
  });

  it("calcula subtotal por línea y total general con precio vigente", () => {
    const map = byId([raptor({ precio: 320 }), raptor({ id: "otro", nombre: "Otra", precio: 100 })]);
    const lines = [
      { productId: "raptor-plus", qty: 2 },
      { productId: "otro", qty: 1 },
    ];
    expect(cartUnits(lines)).toBe(3);
    expect(cartTotal(lines, map)).toBe(740);
  });
});

describe("carrito: persistencia mínima", () => {
  it("descarta precio/disponibilidad guardados y conserva identidad + cantidad", () => {
    const stored = [
      { productId: "raptor-plus", qty: 2, precio: 1, disponible: false, priceSnapshot: 5 },
      { productId: "", qty: 3 },
      { productId: "x", qty: "nan" },
    ];
    expect(sanitizeLines(stored)).toEqual([{ productId: "raptor-plus", qty: 2 }]);
  });

  it("roundtrip en storage", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    saveCart(storage, [{ productId: "raptor-plus", qty: 2 }]);
    expect(loadCart(storage)).toEqual([{ productId: "raptor-plus", qty: 2 }]);
    saveCart(storage, []);
    expect(loadCart(storage)).toEqual([]);
  });
});

describe("carrito: reconciliación ante catálogo nuevo", () => {
  it("el precio nuevo gana sin intervención (se usa el vigente)", () => {
    const map = byId([raptor({ precio: 350 })]);
    const lines = [{ productId: "raptor-plus", qty: 2 }];
    expect(cartTotal(lines, map)).toBe(700);
    expect(reconcileLines(lines, map).notices).toEqual([]);
  });

  it("la cantidad nunca se reduce: no hay tope de inventario", () => {
    const map = byId([raptor({ precio: 320 })]);
    const result = reconcileLines([{ productId: "raptor-plus", qty: 20 }], map);
    expect(result.lines).toEqual([{ productId: "raptor-plus", qty: 20 }]);
    expect(result.notices).toEqual([]);
  });

  it("retira producto inexistente o no disponible", () => {
    const map = byId([raptor({ id: "agotada", nombre: "Eternal", disponible: false })]);
    const result = reconcileLines(
      [
        { productId: "desaparecido", qty: 1 },
        { productId: "agotada", qty: 1 },
      ],
      map,
    );
    expect(result.lines).toEqual([]);
    expect(result.notices.map((n) => n.type)).toEqual(["removed", "out-of-stock"]);
  });
});

describe("carrito: avisos de cambio de catálogo", () => {
  it("cambio de precio 346 → 360: actualiza en silencio, sin avisos", () => {
    const lines = [{ productId: "raptor-plus", qty: 2 }];
    const nextMap = byId([raptor({ precio: 360, disponible: true })]);
    const result = reconcileLines(lines, nextMap);
    expect(result.lines).toEqual(lines);
    expect(result.notices).toEqual([]);
    // El catálogo vigente gana: precio, subtotal y total usan el valor nuevo.
    expect(nextMap.get("raptor-plus")?.precio).toBe(360);
    expect(cartTotal(result.lines, nextMap)).toBe(720);
  });

  it("disponible true → false: retira la línea y avisa", () => {
    const result = reconcileLines(
      [{ productId: "raptor-plus", qty: 2 }],
      byId([raptor({ disponible: false })]),
    );
    expect(result.lines).toEqual([]);
    expect(result.notices).toEqual([
      { type: "out-of-stock", productId: "raptor-plus", name: "Raptor+" },
    ]);
    expect(formatNotice(result.notices[0])).toBe(
      "Raptor+ se quedó sin stock y fue retirado del pedido.",
    );
  });

  it("producto eliminado del catálogo se retira con aviso", () => {
    const result = reconcileLines([{ productId: "raptor-plus", qty: 1 }], byId([]));
    expect(result.lines).toEqual([]);
    expect(result.notices.map((n) => n.type)).toEqual(["removed"]);
    expect(formatNotice(result.notices[0])).toBe(
      "raptor-plus ya no está disponible y fue retirado del pedido.",
    );
  });

  it("ningún aviso menciona precios ni cantidades máximas", () => {
    const messages = [
      formatNotice({ type: "removed", productId: "a", name: "A" }),
      formatNotice({ type: "out-of-stock", productId: "a", name: "A" }),
    ];
    for (const message of messages) {
      expect(message).not.toMatch(/máxima|máximo|unidades disponibles|Stock máximo|cambió de/i);
    }
  });
});
