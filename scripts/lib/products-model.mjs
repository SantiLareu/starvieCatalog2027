/**
 * Modelo comercial puro de StarVie 2027 (sin dependencias de Node ni de React).
 *
 * Lo usa el importador (scripts/import-products.mjs) y lo importan los tests
 * de vitest. El frontend consume el JSON ya generado, no este módulo.
 *
 * Modelo comercial: precio + disponible (booleano) + imágenes + descriptivos.
 * No existe stock numérico ni bandera activo/inactivo: si el producto está
 * en el Excel, forma parte del catálogo; para retirarlo se elimina la fila.
 */

export const COMMERCE_SCHEMA_VERSION = 1;
export const PRODUCTS_FILE = "products.json";

export const HEADERS = [
  "id",
  "sku",
  "nombre",
  "categoria",
  "subcategoria",
  "precio",
  "disponible",
  "imagenPrincipal",
  "imagen2",
  "imagen3",
  "imagen4",
  "gama",
  "tipoJuego",
  "forma",
  "plano",
  "peso",
  "balance",
  "ean",
  "pagina",
];

/**
 * Columnas obligatorias del Excel (deben existir como encabezados).
 * Valores obligatorios por fila: id, sku, nombre, precio, disponible.
 * Valores opcionales (pueden quedar vacíos para cualquier categoría, p. ej.
 * productos que no sean palas): categoria, subcategoria, gama, tipoJuego,
 * forma, plano, peso, balance, ean y pagina (vacía = null, sin hotspot
 * asociado hasta que se le asigne página). imagen2...imagenN son opcionales
 * y se descubren dinámicamente; HEADERS conserva imagen2..4 solo como
 * plantilla inicial para seed-pilot-xlsx.mjs y compatibilidad con el archivo
 * existente. La columna ean también es opcional como encabezado: si falta,
 * validateRows la normaliza a "" (misma convención que los demás
 * descriptivos opcionales).
 */
export const REQUIRED_HEADERS = HEADERS.filter(
  (header) => header !== "ean" && !/^imagen[1-9]\d*$/.test(header),
);

const NUMBERED_IMAGE_HEADER_PATTERN = /^imagen([1-9]\d*)$/;

/**
 * Devuelve las columnas de imagen presentes en una fila en orden natural:
 * imagenPrincipal primero y luego imagen1, imagen2...imagen10, etc.
 * BigInt evita imponer un límite artificial al sufijo numérico.
 */
export function getImageHeaders(row) {
  const numbered = Object.keys(row)
    .map((header) => {
      const match = NUMBERED_IMAGE_HEADER_PATTERN.exec(header);
      return match ? { header, order: BigInt(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  return ["imagenPrincipal", ...numbered.map(({ header }) => header)];
}

/** Extensiones de imagen aceptadas (comparación case-insensitive). */
export const IMAGE_EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png"];

/**
 * Segmento de carpeta/archivo: letras (incluye unicode), dígitos, espacio
 * y signos habituales (+ - _ . paréntesis). Empieza con letra o dígito,
 * así que "", "." y ".." (traversal) se descartan de forma natural.
 */
const IMAGE_SEGMENT_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .+\-_()]*$/u;

/**
 * Rutas de imagen válidas: relativas a la raíz del sitio, bajo products/,
 * con subcarpetas anidadas de profundidad libre y extensión webp/jpg/jpeg/png.
 * Ej: products/palas/RAPTOR+/RAPTOR1.3.webp
 *     products/palas/RAPTOR+/galeria/detalle carbono.png
 *     products/bolsos/TOUR BAG/Negro/frontal.jpeg
 *
 * Rechaza: rutas fuera de products/, segmentos vacíos, "." y "..",
 * backslashes, rutas absolutas (C:\, C:/, /...), protocolos
 * (http://, https://, file://) y extensiones no listadas.
 * La existencia y la contención física bajo public/products/ se comprueban
 * aparte en el importador (scripts/import-products.mjs); aquí no se toca disco.
 */
export function isValidImagePath(raw) {
  if (typeof raw !== "string") return false;
  const value = raw.trim();
  if (value === "") return false;
  if (value.includes("\\")) return false;
  if (value.includes("://")) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (value.startsWith("/")) return false;
  const parts = value.split("/");
  // products/ + al menos una subcarpeta + archivo.
  if (parts.length < 3 || parts[0] !== "products") return false;
  if (parts.some((part) => part === "")) return false;
  if (parts.some((part) => part === "." || part === "..")) return false;
  const file = parts[parts.length - 1];
  const lower = file.toLowerCase();
  const ext = IMAGE_EXTENSIONS.find((candidate) => lower.endsWith(candidate));
  if (!ext) return false;
  const name = file.slice(0, -ext.length);
  if (!IMAGE_SEGMENT_PATTERN.test(name)) return false;
  if (name === "." || name === "..") return false;
  return parts.slice(1, -1).every((segment) => IMAGE_SEGMENT_PATTERN.test(segment));
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Acepta el formato natural de Excel (VERDADERO/FALSO como booleanos) más
 * TRUE/FALSE, 1/0, sí/no. Devuelve { value } o { error }.
 */
export function parseDisponible(raw) {
  if (typeof raw === "boolean") return { value: raw };
  if (typeof raw === "number") {
    if (raw === 1) return { value: true };
    if (raw === 0) return { value: false };
    return { error: `disponible inválido: ${JSON.stringify(raw)} (usar VERDADERO/FALSO)` };
  }
  if (isEmpty(raw)) return { error: "disponible faltante (es obligatorio, usar VERDADERO/FALSO)" };
  const text = toText(raw).toLowerCase();
  if (["true", "verdadero", "sí", "si", "1"].includes(text)) return { value: true };
  if (["false", "falso", "no", "0"].includes(text)) return { value: false };
  return { error: `disponible inválido: ${JSON.stringify(raw)} (usar VERDADERO/FALSO)` };
}

function parsePrecio(raw) {
  if (isEmpty(raw)) return { error: "precio faltante (es obligatorio)" };
  const value = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(value)) return { error: `precio inválido: ${JSON.stringify(raw)}` };
  if (value <= 0) return { error: `precio no positivo: ${JSON.stringify(raw)}` };
  return { value: Math.round(value * 100) / 100 };
}

function parsePagina(raw) {
  if (isEmpty(raw)) return { value: null };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return { error: `pagina inválida: ${JSON.stringify(raw)} (entero >= 1)` };
  }
  return { value };
}

/**
 * Normaliza y valida las filas del Excel (objetos { header: valor }).
 * Devuelve { products, errors, warnings }.
 * - errors: bloquean la importación.
 * - warnings: no bloquean (p. ej. imagen inexistente, producto sin imagen).
 */
export function validateRows(rows, options = {}) {
  const errors = [];
  const warnings = [];
  const products = [];
  const seenIds = new Map();
  const seenSkus = new Map();
  const existingFiles = options.existingFiles || null;

  rows.forEach((row, index) => {
    const line = index + 2; // +1 por header 1-based, +1 por fila de títulos
    const where = `Fila ${line}`;
    const fail = (code) => errors.push(`${where}: ${code}`);

    const id = toText(row.id);
    const sku = toText(row.sku);
    const nombre = toText(row.nombre);
    if (!id) {
      fail("id faltante");
      return;
    }
    if (seenIds.has(id)) {
      fail(`id duplicado: "${id}" (también en fila ${seenIds.get(id)})`);
      return;
    }
    seenIds.set(id, line);
    if (!sku) {
      fail(`"${id}": sku faltante`);
      return;
    }
    if (seenSkus.has(sku)) {
      fail(`"${id}": sku duplicado: "${sku}" (también en fila ${seenSkus.get(sku)})`);
      return;
    }
    seenSkus.set(sku, line);
    if (!nombre) {
      fail(`"${id}": nombre faltante`);
      return;
    }

    const precio = parsePrecio(row.precio);
    if (precio.error) {
      fail(`"${id}": ${precio.error}`);
      return;
    }
    const disponible = parseDisponible(row.disponible);
    if (disponible.error) {
      fail(`"${id}": ${disponible.error}`);
      return;
    }
    const pagina = parsePagina(row.pagina);
    if (pagina.error) {
      fail(`"${id}": ${pagina.error}`);
      return;
    }

    const imagenes = [];
    for (const key of getImageHeaders(row)) {
      const raw = toText(row[key]);
      if (!raw) continue;
      if (!isValidImagePath(raw)) {
        fail(`"${id}": ${key} con ruta inválida: "${raw}" (usar products/<subcarpeta>/.../<archivo>.(webp|jpg|jpeg|png), sin traversal ni rutas absolutas)`);
        return;
      }
      if (imagenes.includes(raw)) {
        warnings.push(`${where} ("${id}"): ${key} repite una imagen ya listada, se ignora.`);
        continue;
      }
      imagenes.push(raw);
    }
    if (imagenes.length === 0) {
      warnings.push(`${where} ("${id}"): sin imágenes, el modal usará la imagen de página o un fallback.`);
    } else if (existingFiles) {
      for (const image of imagenes) {
        if (!existingFiles.has(image)) {
          warnings.push(`${where} ("${id}"): no existe el asset "${image}" bajo public/.`);
        }
      }
    }

    products.push({
      id,
      sku,
      nombre,
      categoria: toText(row.categoria),
      subcategoria: toText(row.subcategoria),
      precio: precio.value,
      disponible: disponible.value,
      imagenes,
      gama: toText(row.gama),
      tipoJuego: toText(row.tipoJuego),
      forma: toText(row.forma),
      plano: toText(row.plano),
      peso: toText(row.peso),
      balance: toText(row.balance),
      ean: toText(row.ean),
      pagina: pagina.value,
    });
  });

  // Orden determinista: por página (null al final) y luego por id.
  products.sort((a, b) => (a.pagina ?? 9999) - (b.pagina ?? 9999) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { products, errors, warnings };
}

export function serializeCatalog(products) {
  return JSON.stringify({ schemaVersion: COMMERCE_SCHEMA_VERSION, products }, null, 2) + "\n";
}

export function buildCatalogVersion(catalogContents, hashHex) {
  return {
    schemaVersion: COMMERCE_SCHEMA_VERSION,
    version: `sha256-${hashHex}`,
    productsFile: PRODUCTS_FILE,
  };
}

export function serializeCatalogVersion(versionObject) {
  return JSON.stringify(versionObject, null, 2) + "\n";
}
