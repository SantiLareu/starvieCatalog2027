/** Editorial configuration only. Commerce identity and destinations stay live. */
export const MOBILE_ACCESSORY_INDEX_PAGE = 27;
export const mobileAccessorySections = [
  { title: "Paleteros", productIds: ["hard eva eternal", "t-one pro", "hard eva black bag", "pro master", "star", "neon strike"] },
  { title: "Mochilas", productIds: ["m hard eva black", "black voltage", "artic sport"] },
  { title: "Accesorios", productIds: ["neceser navy", "neceser moss"] },
] as const;

export type MobileAccessoryPresentation = {
  pageId: number;
  productId: string;
  category: string;
  title: string;
  image: string;
  accent: string;
  ref: string;
  ean: string;
  specs: ReadonlyArray<readonly [string, string]>;
  /** Reserve one extra line above the footer when a specification wraps. */
  extendedSpecs?: boolean;
  features: ReadonlyArray<{ title: string; description: string }>;
};

/** Several products on one leaf, with independent native modal identities. */
export type MobileAccessoryPairPresentation = {
  pageId: number;
  category: string;
  accent: string;
  products: ReadonlyArray<Pick<MobileAccessoryPresentation, "productId" | "title" | "image" | "ref" | "ean"> & { materials: string }>;
};

export const mobileNecessairesPresentation: MobileAccessoryPairPresentation = {
  pageId: 37,
  category: "NECESERES",
  accent: "#b5bec8",
  products: [
    {
      productId: "neceser navy", title: "NAVY",
      // Real PT01 photographs supplied in references/mobile, not generated artwork.
      image: "mobile/neceser-navy.webp", materials: "PVC RUBBER",
      ref: "NSTNAVY51000", ean: "8436612942216",
    },
    {
      productId: "neceser moss", title: "MOSS",
      image: "mobile/neceser-moss.webp", materials: "PVC RUBBER",
      ref: "NSTMOSS51000", ean: "8436612942223",
    },
  ],
};

const hardEvaBlackPresentation: MobileAccessoryPresentation = {
  pageId: 28,
  productId: "hard eva black bag",
  category: "PALETEROS",
  title: "HARD EVA BLACK",
  // Optimized real PT03 photograph supplied in references/mobile; no generated artwork.
  image: "mobile/hard-eva-black.webp",
  accent: "#b5bec8",
  ref: "BSTHEB51000",
  ean: "8436612942124",
  specs: [["DIMENSIONES", "62x35x35 cm"], ["MATERIALES", "Hard Eva y PVC"]],
  features: [
    { title: "Hard Eva material", description: "Material duro EVA en bolsillo lateral" },
    { title: "Compartimento individual", description: "Para guardar calzado" },
    { title: "Bolsillo individual", description: "Para bote de pelotas" },
    { title: "Doble sistema de transporte", description: "" },
    { title: "Compartimento Thermotech", description: "Para palas de pádel" },
  ],
};

export const mobileAccessoryPresentations: readonly MobileAccessoryPresentation[] = [
  hardEvaBlackPresentation,
  {
    ...hardEvaBlackPresentation,
    pageId: 29,
    productId: "hard eva eternal",
    title: "HARD EVA ETERNAL",
    image: "mobile/hard-eva-eternal.webp",
    ref: "BSTETE51000",
    ean: "8436612942131",
  },
  {
    pageId: 30,
    productId: "t-one pro",
    category: "PALETEROS",
    title: "T-ONE PRO",
    image: "mobile/t-one-pro.webp",
    accent: "#9b1939",
    ref: "BSTONE51000",
    ean: "8436612942148",
    specs: [["DIMENSIONES", "60X34X33 CM"], ["MATERIALES", "POLYESTER"]],
    features: [
      { title: "DOS COMPARTIMENTOS TERMOTECH", description: "PARA PALAS DE PÁDEL" },
      { title: "COMPARTIMENTO INDIVIDUAL", description: "PARA GUARDAR CALZADO" },
      { title: "BOLSILLO INDIVIDUAL", description: "PARA BOTE DE PELOTAS" },
      { title: "DOBLE SISTEMA DE TRANSPORTE", description: "" },
    ],
  },
  {
    pageId: 31,
    productId: "pro master",
    category: "PALETEROS",
    title: "PRO MASTER",
    // Real PT01 photograph; only empty margins removed and WebP optimized.
    image: "mobile/pro-master.webp",
    accent: "#b5bec8",
    ref: "BSTPM51000",
    ean: "8436612942155",
    specs: [["DIMENSIONES", "62X32X35 CM"], ["MATERIALES", "POLYESTER AND SIMIL CARBON"]],
    extendedSpecs: true,
    features: [
      { title: "DOS COMPARTIMENTOS TERMOTECH", description: "PARA PALAS DE PÁDEL" },
      { title: "COMPARTIMENTO INDIVIDUAL", description: "PARA GUARDAR CALZADO" },
      { title: "BOLSILLO LATERAL", description: "PARA ACCESORIOS PEQUEÑOS" },
      { title: "SISTEMA DE TRANSPORTE DOBLE", description: "" },
    ],
  },
  {
    pageId: 32,
    productId: "star",
    category: "PALETEROS",
    title: "STAR",
    // Real PT01 photograph supplied in references/mobile; no generated artwork.
    image: "mobile/star-bag.webp",
    accent: "#b5bec8",
    ref: "BSTSTAR51000",
    ean: "8436612942162",
    specs: [["DIMENSIONES", "56X29X28 CM"], ["MATERIALES", "POLYESTER"]],
    features: [
      { title: "GRAN CAPACIDAD DE ALMACENAMIENTO", description: "" },
      { title: "COMPARTIMENTO INDIVIDUAL", description: "PARA GUARDAR EL CALZADO" },
      { title: "REFUERZO EXTRA EN SUS ASAS", description: "" },
      { title: "BOLSILLO LATERAL", description: "PARA PEQUEÑOS ACCESORIOS" },
    ],
  },
  {
    pageId: 33,
    productId: "neon strike",
    category: "PALETEROS",
    title: "NEON STRIKE",
    // Real MAIN photograph supplied in references/mobile; no generated artwork.
    image: "mobile/neon-strike.webp",
    accent: "#b5bec8",
    ref: "BSTNEON51000",
    ean: "8436612942179",
    specs: [["DIMENSIONES", "53X28X24 CM"], ["MATERIALES", "POLYESTER"]],
    features: [
      { title: "COMPARTIMENTO PARA PALAS DE PÁDEL", description: "" },
      { title: "REFUERZO EXTRA EN SUS ASAS", description: "" },
    ],
  },
  {
    pageId: 34,
    productId: "m hard eva black",
    category: "MOCHILAS",
    title: "HARD EVA BLACK",
    // Real frontal MAIN photograph, trimmed/optimized without altering the product.
    image: "mobile/hard-eva-black-backpack-front.webp",
    accent: "#b5bec8",
    ref: "MSTHEB51000",
    ean: "8436612942186",
    specs: [["DIMENSIONES", "32X50X22 CM"], ["MATERIALES", "HARD EVA Y POLYESTER"]],
    features: [
      { title: "MATERIAL DURO EVA EN EL BOLSILLO DELANTERO", description: "" },
      { title: "GRAN CAPACIDAD DE ALMACENAMIENTO", description: "" },
      { title: "COMPARTIMENTO PARA PORTÁTIL", description: "" },
      { title: "COMPARTIMENTO INDIVIDUAL PARA GUARDAR EL CALZADO", description: "" },
    ],
  },
  {
    pageId: 35,
    productId: "artic sport",
    category: "MOCHILAS",
    title: "ARTIC SPORT",
    // Real frontal MAIN photograph; same optimization as Hard Eva Black.
    image: "mobile/artic-sport-backpack.webp",
    accent: "#b5bec8",
    ref: "MSTAR51000",
    ean: "8436612942209",
    specs: [["DIMENSIONES", "50X32X18,5 CM"], ["MATERIALES", "POLYESTER"]],
    features: [
      { title: "GRAN CAPACIDAD DE ALMACENAMIENTO", description: "" },
      { title: "COMPARTIMENTO INDIVIDUAL PARA GUARDAR EL CALZADO", description: "" },
      { title: "REFUERZO EXTRA EN SUS ASAS", description: "" },
      { title: "COMPARTIMENTO PARA PORTÁTIL", description: "" },
    ],
  },
  {
    pageId: 36,
    productId: "black voltage",
    category: "MOCHILAS",
    title: "BLACK VOLTAGE",
    // Real frontal MAIN photograph; same optimization as the approved backpacks.
    image: "mobile/black-voltage-backpack.webp",
    accent: "#b5bec8",
    ref: "MSTBV51000",
    ean: "8436612942193",
    specs: [["DIMENSIONES", "50X32X18,5 CM"], ["MATERIALES", "POLIESTER Y PVC"]],
    features: [
      { title: "GRAN CAPACIDAD DE ALMACENAMIENTO", description: "" },
      { title: "REFUERZO EXTRA EN SUS ASAS", description: "" },
      { title: "STORAGE COMPARTMENTS FOR SMALL ITEMS", description: "" },
      { title: "COMPARTIMENTO PARA PORTÁTIL", description: "" },
    ],
  },
];
