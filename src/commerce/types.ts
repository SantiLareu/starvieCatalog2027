/** Tipos del catálogo comercial (fuente: generated/products.json vía Excel). */

export type CommerceProduct = {
  id: string;
  /** Referencia oficial; "" mientras no esté asignada. La identidad es id. */
  sku: string;
  nombre: string;
  categoria: string;
  subcategoria: string;
  /** Precio positivo, o null si está pendiente (Excel vacío/0). */
  precio: number | null;
  /**
   * Disponibilidad comercial: true = "Con stock" y puede pedirse, con o sin precio;
   * false = visible pero no comprable ("Sin stock", se retira del carrito).
   * No hay stock numérico ni bandera activo/inactivo.
   */
  disponible: boolean;
  /** Rutas relativas a la raíz del sitio, p. ej. products/palas/RAPTOR+/RAPTOR1.3.webp */
  imagenes: string[];
  gama: string;
  tipoJuego: string;
  forma: string;
  plano: string;
  peso: string;
  balance: string;
  ean: string;
  pagina: number | null;
};

export type CommerceCatalog = {
  schemaVersion: 1;
  products: CommerceProduct[];
};

export type ProductsVersionManifest = {
  schemaVersion: 1;
  version: string;
  productsFile: string;
};

export type AppVersionManifest = {
  schemaVersion: 1;
  version: string;
  files: Array<{ path: string; size: number; sha256: string }>;
};

export type CartLine = {
  productId: string;
  qty: number;
};

export type CartNotice =
  | { type: "removed"; productId: string; name: string }
  | { type: "out-of-stock"; productId: string; name: string };

export type PresentedLine = {
  line: CartLine;
  product: CommerceProduct;
  /** null si la línea todavía no tiene un importe monetario calculable. */
  subtotal: number | null;
};
