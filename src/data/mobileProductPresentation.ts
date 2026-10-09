import type { CommerceProduct } from "../commerce/types";

export type MobileAsset = {
  source: string;
  role: "hero" | "front" | "back" | "detail" | "catalog";
  /** Display calibration only: original assets remain untouched. */
  scale?: number;
};
export type MobileProductPresentation = {
  claim: string;
  mobileHero: MobileAsset | null;
  gallery: MobileAsset[];
};

/** Editorial presentation only. Names, specs, availability and money live in commerce. */
export const mobileProductPresentation: Record<string, MobileProductPresentation> = {
  "raptor+": {
    claim: "BREAK THE RULES", // Brand inscription on the actual Raptor+ asset.
    mobileHero: { source: "hero/raptor-mobile.webp", role: "hero", scale: 1 }, // P17 presentation only; original PNG stays untouched.
    gallery: [], // Future real front/back/detail assets can be configured here.
  },
};

export function mobileAssets(product: CommerceProduct, surface: "page" | "gallery" = "page") {
  const presentation = mobileProductPresentation[product.id];
  // A page hero is promotional presentation, not a commercial gallery image.
  const configured = (surface === "page" ? [presentation?.mobileHero] : presentation?.gallery ?? [])
    .filter((asset): asset is MobileAsset => !!asset);
  const fallback = product.imagenes.map(source => ({ source, role: "catalog" as const, scale: 1.35 }));
  const unique = new Map<string, MobileAsset>();
  for (const asset of [...configured, ...fallback]) if (!unique.has(asset.source)) unique.set(asset.source, asset);
  return { presentation, assets: [...unique.values()], provisional: !presentation?.mobileHero };
}

export function mainProductFeatures(product: CommerceProduct): Array<[string, string]> {
  return [["Plano", product.plano], ["Forma", product.forma], ["Peso", product.peso], ["Balance", product.balance]]
    .filter(([, value]) => !!value) as Array<[string, string]>;
}
