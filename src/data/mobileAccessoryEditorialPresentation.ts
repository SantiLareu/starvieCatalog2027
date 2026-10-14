import { SANYO_EDITORIAL_ID, TAMARA_EDITORIAL_ID } from "./bookFlow";

type EditorialImage = { src: string; alt: string; width: number; height: number };
export type MobileAccessoryEditorialPresentation = {
  id: string;
  className: string;
  label: string;
  eyebrow: string;
  title: string;
  byline: string;
  footer: string;
  portrait: EditorialImage;
  signature: EditorialImage;
};

export const eternalEditorialPresentation: MobileAccessoryEditorialPresentation = {
  id: SANYO_EDITORIAL_ID,
  className: "sanyo-editorial",
  label: "Collection Eternal, by Sanyo Gutiérrez",
  eyebrow: "COLLECTION", title: "ETERNAL", byline: "by Sanyo Gutiérrez",
  footer: "ETERNAL · COLLECTION 2027",
  portrait: {src: "mobile/eternal-sanyo-portrait.webp", alt: "Sanyo Gutiérrez junto al paletero Hard Eva Eternal", width: 405, height: 580},
  signature: {src: "mobile/eternal-sanyo-signature.webp", alt: "Firma de Sanyo Gutiérrez", width: 275, height: 108},
};

export const tamaraEditorialPresentation: MobileAccessoryEditorialPresentation = {
  id: TAMARA_EDITORIAL_ID,
  className: "tamara-editorial mobile-accessory-editorial--tamara",
  label: "T-One Pro, by Tamara Icardo",
  eyebrow: "T-ONE", title: "PRO", byline: "by Tamara Icardo",
  footer: "T-ONE PRO · COLLECTION 2027",
  portrait: {src: "mobile/tone-tamara-portrait.webp", alt: "Tamara Icardo con el paletero T-One Pro", width: 655, height: 941},
  signature: {src: "mobile/tone-tamara-signature.webp", alt: "Firma de Tamara Icardo", width: 230, height: 100},
};

export const mobileAccessoryEditorialPresentations = [eternalEditorialPresentation, tamaraEditorialPresentation] as const;
