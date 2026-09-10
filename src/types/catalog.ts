export type CatalogPage = {
  id: string;
  number: number;
  src: string;
  thumbnail: string;
  width: number;
  height: number;
  bytes: number;
  thumbnailBytes: number;
};

export type CatalogMetadata = {
  title: string;
  source: string;
  sourceBytes: number;
  pageCount: number;
  sourcePage: {
    width: number;
    height: number;
    aspectRatio: number;
  };
  output: {
    format: "webp";
    width: number;
    quality: number;
    thumbnailWidth: number;
    thumbnailQuality: number;
  };
  pages: CatalogPage[];
};

export type Product = {
  id: string;
  name: string;
  range: string;
  playStyle: string;
  shape: string;
  surface: string;
  weight: string;
  balance: string;
  price: string;
  streetPrice: string;
  reference: string;
  ean: string;
  pageNumber: number;
};

export type Hotspot = {
  id: string;
  pageId: string;
  type: "product";
  productId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
