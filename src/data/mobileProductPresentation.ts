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
  rangeLabel: MobilePresentationText;
  audienceLabel: MobilePresentationText;
  claim: string;
  mobileHero: MobileAsset | null;
  /** Explicit product choice; never inferred from the image or commercial data. */
  themeAccent: string;
  /** Full-bleed ambience is the default for future premium heroes. */
  heroBackgroundMode?: "full-bleed" | "contained";
  backgroundTheme: { background: string; asset?: { source: string; position?: string }; readabilityOverlay?: string };
  technologies: readonly MobileTechnology[];
  sweetSpot: MobileSweetSpot | null;
  gameType: MobilePresentationText;
  specs: Record<"shape" | "surface" | "weight" | "balance", MobilePresentationText>;
  gallery: MobileAsset[];
};

/** Editorial presentation only. Names, specs, availability and money live in commerce. */
export const mobileProductPresentation: Record<string, MobileProductPresentation> = {
  "raptor+": {
    pageId: 17,
    productId: "raptor+",
    rangeLabel: { field: "gama", part: 0 },
    audienceLabel: { field: "gama", part: 1 },
    claim: "BREAK THE RULES", // Brand inscription on the actual Raptor+ asset.
    mobileHero: { source: "hero/raptor-mobile.webp", role: "hero", scale: 1 }, // P17 presentation only; original PNG stays untouched.
    themeAccent: "#e84b3e",
    heroBackgroundMode: "full-bleed",
    backgroundTheme: {
      background: "radial-gradient(ellipse at 78% 46%, #64181150, transparent 62%), linear-gradient(130deg, #232326, #09090a 52%, #1a0909)",
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
    rangeLabel: "SUPER PRO",
    audienceLabel: "PROFESIONAL Y SEMI PRO",
    claim: "BREAK THE RULES",
    mobileHero: { source: "/hero/eternal-mobile.png", role: "hero", scale: 1 },
    themeAccent: "#e8b957",
    heroBackgroundMode: "full-bleed",
    backgroundTheme: {
      background: "radial-gradient(ellipse at 78% 46%, #a6772640, transparent 62%), linear-gradient(130deg, #232326, #09090a 52%, #171207)",
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
