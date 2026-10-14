import { eternalEditorialPresentation } from "../../data/mobileAccessoryEditorialPresentation";
import { MobileAccessoryEditorial } from "./MobileAccessoryEditorial";

export const eternalEditorialAssets = {
  portrait: eternalEditorialPresentation.portrait.src,
  signature: eternalEditorialPresentation.signature.src,
} as const;

/** Real regions extracted from the official master; text is recomposed in HTML.
 * No controls or commerce identity: the original book owns every gesture. */
export function MobileEternalEditorial(props: {visible: boolean; load?: boolean}) {
  return <MobileAccessoryEditorial presentation={eternalEditorialPresentation} {...props} />;
}
