import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_HEADERS,
  buildCatalogVersion,
  getImageHeaders,
  isValidImagePath,
  parseDisponible,
  serializeCatalog,
  serializeCatalogVersion,
  validateRows,
} from "./products-model.mjs";

const baseRow = () => ({
  id: "raptor-plus",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 320,
  disponible: true,
  imagenPrincipal: "products/palas/RAPTOR+/RAPTOR1.3.webp",
  imagen2: "",
  imagen3: "",
  imagen4: "",
  gama: "Super Pro",
  tipoJuego: "Versátil",
  forma: "Lágrima",
  plano: "3D Carbon",
  peso: "350–370 g",
  balance: "Medio",
  ean: "8436612942025",
  pagina: 17,
});

describe("importador: validaciones", () => {
  it("acepta un producto válido", () => {
    const result = validateRows([baseRow()]);
    expect(result.errors).toEqual([]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({ id: "raptor-plus", precio: 320, disponible: true });
    expect(result.products[0].imagenes).toEqual(["products/palas/RAPTOR+/RAPTOR1.3.webp"]);
  });

  it("acepta productos de cualquier categoría con campos técnicos vacíos", () => {
    const paletero = {
      ...baseRow(),
      id: "tour-bag",
      sku: "PSTTB00100",
      nombre: "Tour Bag",
      categoria: "bolsos",
      subcategoria: "paleteros",
      imagenPrincipal: "products/bolsos/TOUR BAG/Negro/frontal.jpeg",
      gama: "",
      tipoJuego: "",
      forma: "",
      plano: "",
      peso: "",
      balance: "",
      ean: "",
      pagina: 30,
    };
    const sinPagina = { ...paletero, id: "llavero", sku: "PSTAC00100", nombre: "Llavero", pagina: "" };
    const result = validateRows([paletero, sinPagina]);
    expect(result.errors).toEqual([]);
    expect(result.products).toHaveLength(2);
    expect(result.products[0]).toMatchObject({ id: "tour-bag", categoria: "bolsos", pagina: 30 });
    expect(result.products[1].pagina).toBeNull();
  });

  it("ean no es columna obligatoria y se conserva cuando existe", () => {
    expect(REQUIRED_HEADERS).not.toContain("ean");
    const result = validateRows([baseRow()]);
    expect(result.errors).toEqual([]);
    expect(result.products[0].ean).toBe("8436612942025");
  });

  it("acepta fila sin clave ean (columna eliminada) y la normaliza a vacío", () => {
    const rowWithoutEan = { ...baseRow() };
    delete rowWithoutEan.ean;
    const result = validateRows([rowWithoutEan]);
    expect(result.errors).toEqual([]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].ean).toBe("");
  });

  it("no genera propiedades de stock numérico ni activo", () => {
    const result = validateRows([baseRow()]);
    expect(result.products[0]).not.toHaveProperty("stock");
    expect(result.products[0]).not.toHaveProperty("activo");
    expect(JSON.stringify(result.products[0])).not.toMatch(/stock|activo/);
  });

  it("rechaza IDs duplicados", () => {
    const result = validateRows([baseRow(), { ...baseRow(), sku: "OTRO" }]);
    expect(result.errors.some((e) => e.includes("id duplicado"))).toBe(true);
    expect(result.products).toHaveLength(1);
  });

  it("rechaza SKUs duplicados", () => {
    const result = validateRows([baseRow(), { ...baseRow(), id: "otro" }]);
    expect(result.errors.some((e) => e.includes("sku duplicado"))).toBe(true);
  });

  it("rechaza nombre faltante, precio inválido y disponible inválido", () => {
    expect(validateRows([{ ...baseRow(), nombre: " " }]).errors.some((e) => e.includes("nombre"))).toBe(true);
    expect(validateRows([{ ...baseRow(), precio: "caro" }]).errors.some((e) => e.includes("precio"))).toBe(true);
    expect(validateRows([{ ...baseRow(), precio: 0 }]).errors.some((e) => e.includes("precio"))).toBe(true);
    expect(validateRows([{ ...baseRow(), disponible: "quizás" }]).errors.some((e) => e.includes("disponible"))).toBe(true);
    expect(validateRows([{ ...baseRow(), disponible: "" }]).errors.some((e) => e.includes("disponible"))).toBe(true);
  });

  it("acepta el formato natural de Excel VERDADERO/FALSO y variantes", () => {
    expect(parseDisponible(true)).toEqual({ value: true });
    expect(parseDisponible(false)).toEqual({ value: false });
    for (const raw of ["VERDADERO", "verdadero", "TRUE", "true", "sí", "SÍ", "si", 1, "1"]) {
      expect(parseDisponible(raw)).toEqual({ value: true });
    }
    for (const raw of ["FALSO", "falso", "FALSE", "false", "no", "NO", 0, "0"]) {
      expect(parseDisponible(raw)).toEqual({ value: false });
    }
  });

  it("normaliza disponible como booleano en el JSON", () => {
    const verdad = validateRows([{ ...baseRow(), disponible: "VERDADERO" }]);
    expect(verdad.errors).toEqual([]);
    expect(verdad.products[0].disponible).toBe(true);
    const falso = validateRows([{ ...baseRow(), disponible: "FALSO" }]);
    expect(falso.errors).toEqual([]);
    expect(falso.products[0].disponible).toBe(false);
  });

  it("rechaza rutas de imagen inválidas y avisa con producto sin imagen", () => {
    const bad = validateRows([{ ...baseRow(), imagenPrincipal: "../secreto.webp" }]);
    expect(bad.errors.some((e) => e.includes("ruta inválida"))).toBe(true);
    const empty = validateRows([{ ...baseRow(), imagenPrincipal: "" }]);
    expect(empty.errors).toEqual([]);
    expect(empty.products[0].imagenes).toEqual([]);
    expect(empty.warnings.length).toBeGreaterThan(0);
  });

  it("avisa si el asset no existe en public/", () => {
    const result = validateRows([baseRow()], { existingFiles: new Set() });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("no existe el asset"))).toBe(true);
  });
});

describe("importador: columnas de imagen dinámicas", () => {
  it.each([1, 4, 6, 10])("importa %i imagen(es) sin un máximo fijo", (count) => {
    const row = { ...baseRow(), imagenPrincipal: "products/palas/RAPTOR/front.webp" };
    const expected = [row.imagenPrincipal];
    for (let number = 2; number <= count; number += 1) {
      const path = `products/palas/RAPTOR/detail-${number}.webp`;
      row[`imagen${number}`] = path;
      expected.push(path);
    }
    const result = validateRows([row]);
    expect(result.errors).toEqual([]);
    expect(result.products[0].imagenes).toEqual(expected);
  });

  it("ordena naturalmente, conserva huecos e ignora columnas no relacionadas", () => {
    const row = {
      ...baseRow(),
      imagenPrincipal: "products/palas/RAPTOR/front.webp",
      imagen10: "products/palas/RAPTOR/detail-10.png",
      imagen2: "products/palas/RAPTOR/detail-2.jpg",
      imagen9: "products/palas/RAPTOR/detail-9.jpeg",
      imagen6: "",
      imagen0: "products/palas/RAPTOR/ignored-zero.webp",
      imagenExtra: "products/palas/RAPTOR/ignored-extra.webp",
      foto11: "products/palas/RAPTOR/ignored-photo.webp",
    };
    expect(getImageHeaders(row)).toEqual([
      "imagenPrincipal",
      "imagen2",
      "imagen3",
      "imagen4",
      "imagen6",
      "imagen9",
      "imagen10",
    ]);
    const result = validateRows([row]);
    expect(result.errors).toEqual([]);
    expect(result.products[0].imagenes).toEqual([
      "products/palas/RAPTOR/front.webp",
      "products/palas/RAPTOR/detail-2.jpg",
      "products/palas/RAPTOR/detail-9.jpeg",
      "products/palas/RAPTOR/detail-10.png",
    ]);
    expect(result.products[0]).not.toHaveProperty("imagen10");
    expect(result.products[0]).not.toHaveProperty("imagenExtra");
  });

  it("aplica la misma validación de rutas a cualquier imagenN", () => {
    const result = validateRows([{ ...baseRow(), imagen12: "products/../../secret.webp" }]);
    expect(result.errors.some((error) => error.includes("imagen12 con ruta inválida"))).toBe(true);
    expect(result.products).toEqual([]);
  });
});

describe("importador: rutas con subcarpetas anidadas y nombres libres", () => {
  it("acepta el caso real RAPTOR+ con subcarpetas, +, espacios y puntos", () => {
    for (const image of [
      "products/palas/RAPTOR+/RAPTOR1.3.webp",
      "products/palas/RAPTOR+/front.jpg",
      "products/palas/RAPTOR+/front.jpeg",
      "products/palas/RAPTOR+/front.png",
      "products/palas/RAPTOR+/FRONT.JPG",
      "products/palas/RAPTOR 2027/front.webp",
      "products/palas/RAPTOR+/detalles/carbono 1.jpg",
      "products/palas/RAPTOR-PRO/RAPTOR_01.webp",
      "products/palas/ETERNAL/imagen 01.webp",
      "products/palas/RAPTOR+/galeria/detalle carbono.png",
      "products/bolsos/TOUR BAG/Negro/frontal.jpeg",
      "products/bolsos/tour-bag/black.webp",
    ]) {
      expect(isValidImagePath(image)).toBe(true);
      const result = validateRows([{ ...baseRow(), imagenPrincipal: image }]);
      expect(result.errors).toEqual([]);
      expect(result.products[0].imagenes).toEqual([image]);
    }
  });

  it("conserva la ruta original del Excel sin encoding en el JSON", () => {
    const image = "products/palas/RAPTOR+/RAPTOR1.3.webp";
    const result = validateRows([baseRow()]);
    expect(result.products[0].imagenes).toEqual([image]);
    expect(serializeCatalog(result.products)).toContain(image);
  });

  it("rechaza traversal, absolutas, protocolos y extensiones no listadas", () => {
    for (const image of [
      "../secret.webp",
      "products/../../secret.webp",
      "products/../secreto.webp",
      "C:/imagen.webp",
      "C:\\imagen.webp",
      "..\\secreto.webp",
      "/products/palas/test.webp",
      "https://example.com/test.webp",
      "http://example.com/test.webp",
      "file:///tmp/test.webp",
      "products/palas/test.gif",
      "products/palas/test.exe",
      "products/palas/test.bmp",
      "products/front.webp",
      "other/palas/front.webp",
      "products/palas//front.webp",
    ]) {
      expect(isValidImagePath(image)).toBe(false);
      const result = validateRows([{ ...baseRow(), imagenPrincipal: image }]);
      expect(result.errors.some((e) => e.includes("ruta inválida"))).toBe(true);
    }
  });

  it("avisa cuando un asset con subcarpeta no existe en public/", () => {
    const image = "products/palas/RAPTOR+/RAPTOR1.3.webp";
    const result = validateRows([{ ...baseRow(), imagenPrincipal: image }], { existingFiles: new Set() });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes(`no existe el asset "${image}"`))).toBe(true);
  });

  it("no avisa cuando el asset existe bajo public/", () => {
    const image = "products/palas/RAPTOR+/RAPTOR1.3.webp";
    const result = validateRows([{ ...baseRow(), imagenPrincipal: image }], {
      existingFiles: new Set([image]),
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("importador: versionado determinista", () => {
  const hashOf = (contents) => createHash("sha256").update(contents, "utf8").digest("hex");

  it("misma entrada → misma versión; distinto dato → distinta versión", () => {
    const contentsA = serializeCatalog(validateRows([baseRow()]).products);
    const contentsB = serializeCatalog(validateRows([baseRow()]).products);
    expect(contentsA).toBe(contentsB);
    const versionA = serializeCatalogVersion(buildCatalogVersion(contentsA, hashOf(contentsA)));
    const versionB = serializeCatalogVersion(buildCatalogVersion(contentsB, hashOf(contentsB)));
    expect(versionA).toBe(versionB);
    expect(versionA).toMatch(/"version": "sha256-[a-f0-9]{64}"/);

    const changed = serializeCatalog(validateRows([{ ...baseRow(), precio: 350 }]).products);
    const versionChanged = serializeCatalogVersion(buildCatalogVersion(changed, hashOf(changed)));
    expect(versionChanged).not.toBe(versionA);

    const toggled = serializeCatalog(validateRows([{ ...baseRow(), disponible: false }]).products);
    const versionToggled = serializeCatalogVersion(buildCatalogVersion(toggled, hashOf(toggled)));
    expect(versionToggled).not.toBe(versionA);
  });
});
