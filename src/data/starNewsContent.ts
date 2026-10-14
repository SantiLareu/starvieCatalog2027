export type StarNewsMedia =
  | { kind: "video"; src: string; poster?: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "gallery"; images: readonly { src: string; alt: string }[] };
export type StarNewsArticle = {
  id: string;
  category: string;
  title: string;
  description: string;
  thumbnail: string;
  media: StarNewsMedia;
};

/** Editorial content only. Replace media/title here without changing the leaf.
 * An empty video src inherits the book's MP4; related cards use real assets. */
export const starNewsArticles: readonly StarNewsArticle[] = [
  { id: "collection", category: "STARNEWS", title: "Presentación colección 2027",
    description: "Conocé la colección y las novedades de StarVie para esta temporada.",
    thumbnail: "catalog/thumbnails/page-01.webp", media: { kind: "video", src: "/videos/news.mp4" } },
  { id: "eternal", category: "DISEÑO", title: "Eternal, de cerca",
    description: "Una mirada a los detalles de Eternal, de la colección 2027.",
    thumbnail: "products/palas/ETERNAL/ETERNAL1.4.webp",
    media: { kind: "gallery", images: [
      { src: "products/palas/ETERNAL/ETERNAL1.4.webp", alt: "Eternal, vista frontal" },
      { src: "products/palas/ETERNAL/ETERNAL1.3.webp", alt: "Eternal, detalle de la pala" },
    ] } },
  { id: "raptor", category: "COLECCIÓN", title: "Raptor+ 2027",
    description: "Descubrí el diseño de Raptor+ en la colección StarVie 2027.",
    thumbnail: "products/palas/RAPTOR/RAPTOR1.3.webp",
    media: { kind: "image", src: "products/palas/RAPTOR/RAPTOR1.3.webp", alt: "Raptor+ 2027" } },
];
