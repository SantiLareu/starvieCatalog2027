import type { Hotspot, Product } from "../types/catalog";

export const products: Record<string, Product> = {
  "raptor-plus": {
    id: "raptor-plus",
    name: "Raptor+",
    range: "Super Pro · Profesional y semi pro",
    playStyle: "Versátil",
    shape: "Lágrima",
    surface: "3D Carbon",
    weight: "350–370 g",
    balance: "Medio",
    price: "320 €",
    streetPrice: "288 €",
    reference: "PSTRP41000",
    ean: "8436612942025",
    pageNumber: 17,
  },
};

export const hotspots: Hotspot[] = [
  {
    id: "raptor-plus-page-17",
    pageId: "page-17",
    type: "product",
    productId: "raptor-plus",
    x: 28,
    y: 13,
    width: 38,
    height: 78,
  },
];

export const hotspotsForPage = (pageId: string) =>
  hotspots.filter((hotspot) => hotspot.pageId === pageId);
