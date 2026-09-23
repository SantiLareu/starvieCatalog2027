/**
 * Genera catalog/products.xlsx con el producto piloto Raptor+.
 * Las imágenes NO se guardan en el Excel: solo rutas relativas a public/.
 * Reutilizable para agregar más productos de cualquier categoría después
 * (editar ROWS y re-ejecutar): la misma estructura sirve para palas,
 * paleteros, bolsos, mochilas, accesorios, etc.
 */
import path from "node:path";
import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { HEADERS } from "./lib/products-model.mjs";

const RAPTOR_ROW = {
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
  gama: "Super Pro · Profesional y semi pro",
  tipoJuego: "Versátil",
  forma: "Lágrima",
  plano: "3D Carbon",
  peso: "350–370 g",
  balance: "Medio",
  ean: "8436612942025",
  pagina: 17,
};

const workbook = new ExcelJS.Workbook();
workbook.creator = "StarVie 2027";
const sheet = workbook.addWorksheet("Productos");
sheet.columns = HEADERS.map((header) => ({ header, key: header, width: 22 }));
sheet.getRow(1).font = { bold: true };
sheet.addRow(RAPTOR_ROW);

const outPath = path.join(process.cwd(), "catalog", "products.xlsx");
await mkdir(path.dirname(outPath), { recursive: true });
await workbook.xlsx.writeFile(outPath);
// Sello de apoyo: el binario xlsx no es diff-amigable; este JSON documenta la fila.
await writeFile(
  path.join(process.cwd(), "catalog", "products.pilot.json"),
  JSON.stringify([RAPTOR_ROW], null, 2) + "\n",
  "utf8",
);
console.log(`OK: ${outPath}`);
