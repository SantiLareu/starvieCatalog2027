import type { CommerceProduct } from "../commerce/types";

export type MobileAsset = {
  source: string;
  role: "hero" | "front" | "back" | "detail" | "catalog";
  /** Display calibration only: original assets remain untouched. */
  scale?: number;
};
/** Editorial overrides or references to live catalog fields; never commerce copies. */
export type MobilePresentationText = string | {
  field: "gama" | "tipoJuego" | "forma" | "plano" | "peso" | "balance";
  /** Segment of the catalog's " · " separated editorial label. */
  part?: number;
};
export type MobileTechnology = {
  label: string;
  isNew?: boolean;
  icon: {
    source: string;
    /** Optional window into existing artwork; standalone icons need only source. */
    crop?: { x: number; y: number; size: number; width: number; height: number };
  };
};
export type MobileSweetSpot = {
  kind: "vector";
  viewBox: string;
  transform: string;
  outline: string;
  neck: string;
  zone: { cx: number; cy: number; rx: number; ry: number; color: string };
  perforations: ReadonlyArray<readonly [number, readonly number[]]>;
} | { kind: "asset"; source: string; width: number; height: number };
export type MobileProductPresentation = {
  pageId: number;
  productId: string;
  /** Optional editorial labels; identifier overrides never change commerce data. */
  title?: string;
  printedDetails?: { ref?: string; ean?: string; include?: string };
  rangeLabel: MobilePresentationText;
  /** Defaults to GAMA; an empty prefix keeps complete labels such as PRO-LINE. */
  rangePrefix?: string;
  audienceLabel: MobilePresentationText;
  claim: string;
  mobileHero: MobileAsset | null;
  /** Explicit product choice; never inferred from the image or commercial data. */
  themeAccent: string;
  /** Full-bleed ambience is the default for future premium heroes. */
  heroBackgroundMode?: "full-bleed" | "contained";
  backgroundTheme: {
    background: string;
    /** Independent environmental photograph without a product; displayed as cover. */
    asset?: {
      source: string;
      position?: string;
      /** False displays the prepared photo sharply, without a runtime blur filter. */
      soften?: boolean;
    };
    readabilityOverlay?: string;
  };
  technologies: readonly MobileTechnology[];
  sweetSpot: MobileSweetSpot | null;
  gameType: MobilePresentationText;
  specs: Record<"shape" | "surface" | "weight" | "balance", MobilePresentationText>;
  /** Opt in only when a long editorial value needs to wrap in the shared table. */
  wrapTechnicalSpecs?: boolean;
  gallery: MobileAsset[];
};

/** Editorial presentation only. Product identity, availability and money stay in commerce. */
export const mobileProductPresentation: Record<string, MobileProductPresentation> = {
  "raptor+": {
    pageId: 17,
    productId: "raptor+",
    printedDetails: { ref: "PSTRP41000", ean: "8436612942025" },
    rangeLabel: { field: "gama", part: 0 },
    audienceLabel: { field: "gama", part: 1 },
    claim: "BREAK THE RULES", // Brand inscription on the actual Raptor+ asset.
    mobileHero: { source: "hero/raptor-mobile.webp", role: "hero", scale: 1 }, // P17 presentation only; original PNG stays untouched.
    themeAccent: "#e84b3e",
    heroBackgroundMode: "full-bleed",
    backgroundTheme: {
      background: "radial-gradient(ellipse at 78% 46%, #64181150, transparent 62%), linear-gradient(130deg, #232326, #09090a 52%, #1a0909)",
      asset: { source: "/hero/raptor-ambient.webp", soften: false },
      readabilityOverlay: "linear-gradient(0deg, #070709b3, transparent 28%, transparent 78%, #07070966), linear-gradient(90deg, #07070999, #07070980 24%, transparent 42%, transparent 58%, #07070966 76%, #07070980)",
    },
    technologies: ([
      ["3D Carbon Hybrid", 178, 187], ["M-Eva Balance", 213, 251],
      ["Air Booster", 297, 317], ["Tri-Force Core", 336, 382],
      ["Hexa Cell", 363, 449], ["A-Shock", 381, 516],
      ["Spin Boost Tech", 382, 586], ["Longer Handgrip", 387, 660],
      ["Z-shock", 390, 729],
    ] as const).map(([label, x, y]) => ({
      label,
      icon: { source: "catalog/pages/page-17.webp", crop: { x, y, size: 50, width: 1920, height: 1080 } },
    })),
    // The approved sweet-spot outline and zone are editorial vector artwork.
    sweetSpot: {
      kind: "vector", viewBox: "0 0 100 156", transform: "translate(3.25 -13.15) scale(.55)",
      outline: "M85 33C46 31 15 52 15 87C13 119 27 151 46 175L51 183C57 185 68 206 74 216L73 290Q72 296 78 296H88Q94 296 93 290V216C100 207 111 186 120 182L127 173C147 147 159 118 158 89C158 52 126 31 85 33Z",
      neck: "M68 182Q85 185 103 182L99 190Q85 194 73 190ZM76 199H94L90 208H80ZM74 216H93",
      zone: { cx: 85, cy: 89.5, rx: 58, ry: 50.5, color: "#d72b29" },
      perforations: [
        [63, [49, 64, 86, 109, 124]], [76, [46, 59, 73, 86, 99, 112, 126]],
        [88, [32, 45, 58, 72, 86, 99, 112, 126, 139]],
        [104, [32, 45, 59, 72, 85, 99, 113, 126, 139]],
        [120, [32, 45, 59, 72, 85, 99, 113, 126, 139]],
        [133, [46, 59, 72, 85, 99, 112, 125]], [144, [49, 62, 85, 109, 123]],
      ],
    },
    gameType: { field: "tipoJuego" },
    specs: { shape: { field: "forma" }, surface: { field: "plano" }, weight: { field: "peso" }, balance: { field: "balance" } },
    gallery: [], // ProductModal continues to use the real catalog gallery.
  },
  // ETERNAL / P15: approved editorial values; commerce stays in the catalog.
  "eternal": {
    pageId: 15,
    productId: "eternal",
    printedDetails: { ref: "PSTETE41000", ean: "8436612941998" },
    rangeLabel: "SUPER PRO",
    audienceLabel: "PROFESIONAL Y SEMI PRO",
    claim: "BREAK THE RULES",
    mobileHero: { source: "/hero/eternal-mobile.png", role: "hero", scale: 1 },
    themeAccent: "#e8b957",
    heroBackgroundMode: "full-bleed",
    backgroundTheme: {
      background: "radial-gradient(ellipse at 78% 46%, #a6772640, transparent 62%), linear-gradient(130deg, #232326, #09090a 52%, #171207)",
      asset: { source: "/hero/eternal-ambient.webp", soften: false },
      readabilityOverlay: "linear-gradient(0deg, #070709b3, transparent 28%, transparent 78%, #07070966), linear-gradient(90deg, #07070999, #07070980 24%, transparent 42%, transparent 58%, #07070966 76%, #07070980)",
    },
    technologies: ([
      ["18K Carbon Hybrid", 143, 194], ["M-Eva Balance", 212, 250],
      ["Aero Drive", 285, 315], ["V-Force Bridge", 327, 382],
      ["Hexa Cell", 362, 447], ["Power Balance", 377, 513],
      ["A-Shock", 391, 581], ["Spin Boost Tech", 392, 647],
      ["Longer Handgrip", 391, 715], ["Z-Shock", 398, 782],
    ] as const).map(([label, x, y]) => ({
      label,
      icon: { source: "catalog/pages/page-15.webp", crop: { x, y, size: 50, width: 1920, height: 1080 } },
    })),
    // Byte-identical copy of references/mobile/eternal-sweetspot.png.
    // Keeps the exact supplied outline, red zone and perforations; no tracing.
    sweetSpot: { kind: "asset", source: "mobile/eternal-sweetspot.png", width: 162, height: 255 },
    gameType: "VERSÁTIL",
    specs: {
      shape: "HÍBRIDA",
      surface: "18K CARBON",
      weight: "350–370 GR",
      balance: "MEDIO",
    },
    gallery: [], // The original ProductModal keeps Eternal's real catalog gallery.
  },
  "triton t-one": {
    pageId: 16,
    productId: "triton t-one",
    title: "TRITÓN T-ONE",
    printedDetails: { include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "SUPER PRO", // The shared masthead adds the existing GAMA prefix.
    audienceLabel: "PROFESIONAL Y SEMI PRO",
    claim: "BREAK THE RULES",
    mobileHero: { source: "/hero/tone-mobile.png", role: "hero", scale: 1 },
    themeAccent: "#8b3046",
    heroBackgroundMode: "full-bleed",
    backgroundTheme: {
      background: "radial-gradient(ellipse at 78% 46%, #68233750, transparent 62%), linear-gradient(130deg, #232326, #09090a 52%, #190c11)",
      asset: { source: "/hero/tone-ambient.webp", soften: false },
      readabilityOverlay: "linear-gradient(0deg, #070709b3, transparent 28%, transparent 78%, #07070966), linear-gradient(90deg, #07070999, #07070980 24%, transparent 42%, transparent 58%, #07070966 76%, #07070980)",
    },
    technologies: ([
      ["18K Carbon Hybrid", 143, 194, false], ["M-Eva Balance", 213, 251, false],
      ["Air Booster", 297, 317, true], ["Tri-Force Core", 336, 382, true],
      ["Hexa Cell", 363, 449, true], ["A-Shock", 381, 516, true],
      ["Spin Boost Tech", 382, 586, false], ["Longer Handgrip", 387, 660, false],
      ["Z-shock", 390, 729, false],
    ] as const).map(([label, x, y, isNew]) => ({
      label, isNew,
      icon: { source: "catalog/pages/page-16.webp", crop: { x, y, size: 50, width: 1920, height: 1080 } },
    })),
    // Byte-identical runtime copy of the supplied references/mobile/tone.png.
    sweetSpot: { kind: "asset", source: "mobile/tone.png", width: 186, height: 276 },
    gameType: "VERSÁTIL",
    specs: { shape: "DIAMANTE", surface: "18K CARBON", weight: "347-366 GR", balance: "MEDIO" },
    gallery: [], // The original ProductModal keeps Tritón T-One's real catalog gallery.
  },
  "black titan": {
    pageId: 18,
    productId: "black titan",
    title: "BLACK TITAN",
    printedDetails: { ref: "PSTBT41000", ean: "8436612942018", include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "SUPER PRO", // The shared masthead adds GAMA.
    audienceLabel: "PROFESIONAL Y SEMI PRO",
    claim: "BREAK THE RULES",
    mobileHero: { source: "/hero/titan-mobile.png", role: "hero", scale: 1 },
    themeAccent: "#36b9e8",
    heroBackgroundMode: "full-bleed",
    backgroundTheme: {
      background: "radial-gradient(ellipse at 78% 46%, #174b6350, transparent 62%), linear-gradient(130deg, #232326, #09090a 52%, #09141b)",
      asset: { source: "/hero/titan-ambient.webp", soften: false },
      readabilityOverlay: "linear-gradient(0deg, #070709b3, transparent 28%, transparent 78%, #07070966), linear-gradient(90deg, #07070999, #07070980 24%, transparent 42%, transparent 58%, #07070966 76%, #07070980)",
    },
    technologies: ([
      ["24K Carbon Master", 239, 254, 50], ["H-Eva Power", 297, 330, 50],
      ["Spin Boost Tech", 331, 402, 50], ["Anti-Vibe", 357, 475, 50],
      ["Dynamic Star", 382, 550, 50], ["Five Sides Tech", 393, 623, 50],
      ["Reactive Holes", 404, 697, 50], ["Z-shock", 439, 776, 110],
    ] as const).map(([label, x, y, size]) => ({
      label,
      icon: { source: "catalog/pages/page-18.webp", crop: { x, y, size, width: 1920, height: 1080 } },
    })),
    // Byte-identical runtime copy of references/mobile/dulcetitan.png.
    sweetSpot: { kind: "asset", source: "mobile/dulcetitan.png", width: 303, height: 435 },
    gameType: "ATAQUE",
    specs: { shape: "HÍBRIDO", surface: "24K CARBON", weight: "350-370 GR", balance: "ALTO" },
    gallery: [], // The original ProductModal keeps Black Titan's real catalog gallery.
  },
  "triton+ power": {
    pageId: 19,
    productId: "triton+ power",
    title: "TRITÓN + POWER",
    printedDetails: { ref: "PSTTP41000", ean: "8436612942056", include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "PRO-LINE",
    rangePrefix: "",
    audienceLabel: "HIGH LEVEL",
    claim: "BREAK THE RULES",
    mobileHero: { source: "/hero/power-mobile.png", role: "hero", scale: 1 },
    themeAccent: "#28bdf0",
    heroBackgroundMode: "full-bleed",
    backgroundTheme: {
      background: "radial-gradient(ellipse at 78% 46%, #16516b50, transparent 62%), linear-gradient(130deg, #232326, #09090a 52%, #081620)",
      asset: { source: "/hero/power-ambient.webp", soften: false },
      readabilityOverlay: "linear-gradient(0deg, #070709b3, transparent 28%, transparent 78%, #07070966), linear-gradient(90deg, #07070999, #07070980 24%, transparent 42%, transparent 58%, #07070966 76%, #07070980)",
    },
    technologies: ([
      ["18K Carbon Hybrid", 239, 254, 50], ["H-Eva Power", 297, 325, 50],
      ["Spin Boost Tech", 331, 402, 50], ["TriTech Core", 363, 475, 54],
      ["Five Sides Tech", 382, 548, 52], ["Anatomic Bridge Design", 393, 619, 52],
      ["Longer Handgrip", 402, 697, 50], ["Z-shock", 417, 770, 110],
    ] as const).map(([label, x, y, size]) => ({
      label,
      icon: { source: "catalog/pages/page-19.webp", crop: { x, y, size, width: 1920, height: 1080 } },
    })),
    // Byte-identical runtime copy of references/mobile/dulcepower.png.
    sweetSpot: { kind: "asset", source: "mobile/dulcepower.png", width: 168, height: 285 },
    gameType: "ATAQUE",
    specs: { shape: "DIAMANTE", surface: "18K CARBON", weight: "350-370 GR", balance: "ALTO" },
    gallery: [], // The original ProductModal keeps Tritón + Power's real catalog gallery.
  },
  "triton+ balance": {
    pageId: 20,
    productId: "triton+ balance",
    title: "TRITÓN + BALANCE",
    printedDetails: { ref: "PSTTB41000", ean: "8436612942049", include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "PRO-LINE",
    rangePrefix: "",
    audienceLabel: "HIGH LEVEL",
    claim: "BREAK THE RULES",
    mobileHero: { source: "/hero/balance-mobile.png", role: "hero", scale: 1 },
    themeAccent: "#f2d326",
    heroBackgroundMode: "full-bleed",
    backgroundTheme: {
      background: "radial-gradient(ellipse at 78% 46%, #725d1650, transparent 62%), linear-gradient(130deg, #232326, #09090a 52%, #181507)",
      asset: { source: "/hero/balance-ambient.webp", soften: false },
      readabilityOverlay: "linear-gradient(0deg, #070709b3, transparent 28%, transparent 78%, #07070966), linear-gradient(90deg, #07070999, #07070980 24%, transparent 42%, transparent 58%, #07070966 76%, #07070980)",
    },
    technologies: ([
      ["18K Carbon Hybrid", 239, 254, 50], ["M-Eva Balance", 299, 329, 50],
      ["Spin Boost Tech", 331, 402, 50], ["TriTech Core", 363, 475, 54],
      ["Five Sides Tech", 382, 548, 52], ["Anatomic Bridge Design", 393, 619, 52],
      ["Longer Handgrip", 402, 697, 50], ["Z-shock", 417, 770, 110],
    ] as const).map(([label, x, y, size]) => ({
      label,
      icon: { source: "catalog/pages/page-20.webp", crop: { x, y, size, width: 1920, height: 1080 } },
    })),
    // Byte-identical copy of Screenshot 2026-10-09 233808.png, confirmed by the user.
    sweetSpot: { kind: "asset", source: "mobile/dulcebalance.png", width: 180, height: 268 },
    gameType: "VERSÁTIL",
    specs: { shape: "DIAMANTE", surface: "18K CARBON", weight: "350-370 GR", balance: "MEDIO" },
    gallery: [], // The original ProductModal keeps Tritón + Balance's real catalog gallery.
  },
  "astrum+": {
    pageId: 21,
    productId: "astrum+",
    title: "ASTRUM+",
    printedDetails: { ref: "PSTAMP41000", ean: "8436612942032", include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "PREMIUM", // The shared masthead adds GAMA.
    audienceLabel: "INTERMEDIO",
    claim: "BREAK THE RULES",
    mobileHero: { source: "products/palas/ASTRUM/ASTRUM1.1.webp", role: "front", scale: 0.9 },
    themeAccent: "#b7c4d2",
    heroBackgroundMode: "contained",
    backgroundTheme: { background: "#111418" }, // Shared court; no individual environment.
    technologies: ([
      ["12K Carbon Hyper", 239, 255, 52], ["M-Eva Balance", 302, 330, 50],
      ["Spin Boost Tech", 331, 405, 50], ["Air Booster", 357, 475, 52],
      ["Shock Shield", 380, 548, 54], ["Five Sides Tech", 393, 624, 52],
      ["Z-shock", 409, 688, 110],
    ] as const).map(([label, x, y, size]) => ({
      label,
      icon: { source: "catalog/pages/page-21.webp", crop: { x, y, size, width: 1920, height: 1080 } },
    })),
    // Byte-identical copy of references/mobile/Screenshot 2026-10-11 005709.png.
    sweetSpot: { kind: "asset", source: "mobile/astrum-sweetspot.png", width: 165, height: 259 },
    gameType: "VERSÁTIL",
    specs: { shape: "LÁGRIMA", surface: "12K CARBON HYPER", weight: "350–370 GR", balance: "MEDIO" },
    wrapTechnicalSpecs: true,
    gallery: [], // ProductModal keeps the original commerce gallery.
  },
  "metheora+": {
    pageId: 22,
    productId: "metheora+",
    title: "METHEORA+",
    printedDetails: { ref: "PSTMP41000", ean: "8436612942063", include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "PREMIUM", // The shared masthead adds GAMA.
    audienceLabel: "INTERMEDIO",
    claim: "BREAK THE RULES",
    mobileHero: { source: "products/palas/METHEORA/METHE1.4.webp", role: "front", scale: 0.9 },
    themeAccent: "#a6b6aa",
    heroBackgroundMode: "contained",
    backgroundTheme: { background: "#111418" }, // Shared court; no individual environment.
    technologies: ([
      ["12K Carbon Hyper", 221, 237, 52, false], ["M-Eva Balance", 276, 303, 50, false],
      ["Spin Boost Tech", 312, 368, 50, false], ["Precision Bridge", 350, 437, 52, true],
      ["Core Axis", 380, 499, 52, true], ["Reactive Holes", 380, 565, 52, false],
      ["Longer Handgrip", 386, 639, 52, false], ["Z-shock", 398, 708, 110, false],
    ] as const).map(([label, x, y, size, isNew]) => ({
      label,
      isNew,
      icon: { source: "catalog/pages/page-22.webp", crop: { x, y, size, width: 1920, height: 1080 } },
    })),
    // Byte-identical copy of references/mobile/Screenshot 2026-10-11 100453.png.
    sweetSpot: { kind: "asset", source: "mobile/metheora-sweetspot.png", width: 169, height: 286 },
    gameType: "VERSÁTIL",
    specs: { shape: "HÍBRIDA", surface: "12K CARBON HYPER", weight: "350–370 GR", balance: "MEDIO" },
    wrapTechnicalSpecs: true,
    gallery: [], // ProductModal keeps the original commerce gallery.
  },
  "phantom": {
    pageId: 23,
    productId: "phantom",
    title: "PHANTOM",
    printedDetails: { ref: "PSTP41000", ean: "8436612942070", include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "PREMIUM", // The shared masthead adds GAMA.
    audienceLabel: "INTERMEDIO",
    claim: "BREAK THE RULES",
    mobileHero: { source: "products/palas/PHANTOM/PHANTON1.1.webp", role: "front", scale: 0.9 },
    themeAccent: "#c7aaa5",
    heroBackgroundMode: "contained",
    backgroundTheme: { background: "#111418" }, // Shared court; no individual environment.
    technologies: ([
      ["12K Carbon Hyper", 221, 237, 52, false], ["S-Eva Flex", 279, 296, 52, false],
      ["Spin Boost Tech", 312, 368, 50, false], ["Precision Bridge", 350, 437, 52, true],
      ["Core Axis", 380, 499, 52, true], ["Reactive Holes", 380, 565, 52, false],
      ["Longer Handgrip", 386, 639, 52, false], ["Z-shock", 398, 708, 110, false],
    ] as const).map(([label, x, y, size, isNew]) => ({
      label,
      isNew,
      icon: { source: "catalog/pages/page-23.webp", crop: { x, y, size, width: 1920, height: 1080 } },
    })),
    // Byte-identical copy of references/mobile/Screenshot 2026-10-11 101639.png.
    sweetSpot: { kind: "asset", source: "mobile/phantom-sweetspot.png", width: 157, height: 279 },
    gameType: "CONTROL",
    specs: { shape: "REDONDA", surface: "12K CARBON HYPER", weight: "347–365 GR", balance: "BAJO" },
    wrapTechnicalSpecs: true,
    gallery: [], // ProductModal keeps the original commerce gallery.
  },
  "drax+": {
    pageId: 24,
    productId: "drax+",
    title: "DRAX+",
    printedDetails: { ref: "PSTDP31000", ean: "8436612941073", include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "PREMIUM", // The shared masthead adds GAMA.
    audienceLabel: "INTERMEDIO",
    claim: "BREAK THE RULES",
    mobileHero: { source: "products/palas/DRAX/DRAX1.5.webp", role: "front", scale: 0.9 },
    themeAccent: "#8eaad5",
    heroBackgroundMode: "contained",
    backgroundTheme: { background: "#111418" }, // Shared court; no individual environment.
    technologies: ([
      ["12K Carbon Hyper", 221, 237, 52], ["M-Eva Balance", 276, 303, 50],
      ["Spin Boost Tech", 312, 368, 50], ["Hepta Bridge", 335, 435, 52],
      ["Shock Shield", 365, 499, 52], ["Reactive Holes", 380, 565, 52],
      ["Longer Handgrip", 390, 635, 54], ["Air Flow Design", 404, 710, 54],
      ["Z-shock", 419, 791, 110],
    ] as const).map(([label, x, y, size]) => ({
      label,
      icon: { source: "catalog/pages/page-24.webp", crop: { x, y, size, width: 1920, height: 1080 } },
    })),
    // Byte-identical copy of references/mobile/Screenshot 2026-10-11 102345.png.
    sweetSpot: { kind: "asset", source: "mobile/drax-sweetspot.png", width: 139, height: 249 },
    gameType: "CONTROL",
    specs: { shape: "LÁGRIMA", surface: "12K CARBON HYPER", weight: "350–370 GR", balance: "MEDIO" },
    wrapTechnicalSpecs: true,
    gallery: [], // ProductModal keeps the original commerce gallery.
  },
  "shade": {
    pageId: 25,
    productId: "shade",
    title: "SHADE",
    printedDetails: { ref: "PSTS41000", ean: "8436612942094", include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "ADVANCE", // The shared masthead adds GAMA.
    audienceLabel: "PRINCIPIANTES",
    claim: "BREAK THE RULES",
    mobileHero: { source: "products/palas/SHADE/SHADE1.1.webp", role: "front", scale: 0.9 },
    themeAccent: "#a0bf93",
    heroBackgroundMode: "contained",
    backgroundTheme: { background: "#111418" }, // Shared court; no individual environment.
    technologies: ([
      ["Aluminized X-Glass", 256, 253, 56, true], ["S-Eva Flex", 294, 330, 54, false],
      ["Geo Bridge", 325, 401, 54, false], ["Reactive Holes", 348, 471, 54, false],
      ["Longer Handgrip", 367, 543, 56, false],
    ] as const).map(([label, x, y, size, isNew]) => ({
      label,
      isNew,
      icon: { source: "catalog/pages/page-25.webp", crop: { x, y, size, width: 1920, height: 1080 } },
    })),
    // Byte-identical copy of references/mobile/Screenshot 2026-10-11 103147.png.
    sweetSpot: { kind: "asset", source: "mobile/shade-sweetspot.png", width: 168, height: 274 },
    gameType: "CONTROL",
    specs: { shape: "REDONDA", surface: "ALUMINIZED X-GLASS", weight: "350–370 GR", balance: "BAJO" },
    wrapTechnicalSpecs: true,
    gallery: [], // ProductModal keeps the original commerce gallery.
  },
  "kyra": {
    pageId: 26,
    productId: "kyra",
    title: "KYRA",
    printedDetails: { ref: "PSTS41000", ean: "8436612942094", include: "ECOFRIENDLY GYMSACK" },
    rangeLabel: "ADVANCE", // The shared masthead adds GAMA.
    audienceLabel: "PRINCIPIANTES",
    claim: "BREAK THE RULES",
    mobileHero: { source: "products/palas/KYRA/KYRA1.2.webp", role: "front", scale: 0.9 },
    themeAccent: "#cba393",
    heroBackgroundMode: "contained",
    backgroundTheme: { background: "#111418" }, // Shared court; no individual environment.
    technologies: ([
      ["X-Glass Tech", 256, 253, 58], ["S-Eva Flex", 294, 330, 54],
      ["Geo Bridge", 337, 402, 54], ["Reactive Holes", 361, 479, 54],
      ["Longer Handgrip", 375, 552, 56],
    ] as const).map(([label, x, y, size]) => ({
      label,
      icon: { source: "catalog/pages/page-26.webp", crop: { x, y, size, width: 1920, height: 1080 } },
    })),
    // Byte-identical copy of references/mobile/Screenshot 2026-10-11 104224.png.
    sweetSpot: { kind: "asset", source: "mobile/kyra-sweetspot.png", width: 154, height: 262 },
    gameType: "CONTROL",
    specs: { shape: "REDONDA", surface: "X-GLASS TECH", weight: "340–360 GR", balance: "BAJO" },
    wrapTechnicalSpecs: true,
    gallery: [], // ProductModal keeps the original commerce gallery.
  },
};

export function mobilePresentationForPage(pageId: number) {
  return Object.values(mobileProductPresentation).find(presentation => presentation.pageId === pageId);
}

export function mobilePresentationText(value: MobilePresentationText, product: CommerceProduct | null): string {
  if (typeof value === "string") return value;
  const text = product?.[value.field] ?? "";
  return value.part === undefined ? text : text.split(" · ")[value.part] ?? "";
}

export function mobileAssets(product: CommerceProduct, surface: "page" | "gallery" = "page", presentation = mobileProductPresentation[product.id]) {
  // A page hero is promotional presentation, not a commercial gallery image.
  const configured = (surface === "page" ? [presentation?.mobileHero] : presentation?.gallery ?? [])
    .filter((asset): asset is MobileAsset => !!asset);
  const fallback = product.imagenes.map(source => ({ source, role: "catalog" as const, scale: 1.35 }));
  const unique = new Map<string, MobileAsset>();
  for (const asset of [...configured, ...fallback]) if (!unique.has(asset.source)) unique.set(asset.source, asset);
  return { presentation, assets: [...unique.values()], provisional: !presentation?.mobileHero };
}

export function mobileProductSpecs(product: CommerceProduct | null, presentation: MobileProductPresentation) {
  const read = (key: keyof MobileProductPresentation["specs"]) => mobilePresentationText(presentation.specs[key], product);
  return { shape: read("shape"), surface: read("surface"), weight: read("weight"), balance: read("balance") };
}

export function mainProductFeatures(product: CommerceProduct, presentation = mobileProductPresentation[product.id]): Array<[string, string]> {
  const specs = presentation ? mobileProductSpecs(product, presentation) : { surface: product.plano, shape: product.forma, weight: product.peso, balance: product.balance };
  return [["Plano", specs.surface], ["Forma", specs.shape], ["Peso", specs.weight], ["Balance", specs.balance]]
    .filter(([, value]) => !!value) as Array<[string, string]>;
}
