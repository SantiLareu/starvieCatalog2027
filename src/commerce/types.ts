/** Tipos del catálogo comercial (fuente: generated/products.json vía Excel). */

export type CommerceProduct = {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  subcategoria: string;
  /** Precio comercial numérico; la moneda se aplica únicamente al presentarlo. */
  precio: number;
  /**
   * Disponibilidad comercial: true = visible y comprable ("Con stock");
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
  subtotal: number;
};
