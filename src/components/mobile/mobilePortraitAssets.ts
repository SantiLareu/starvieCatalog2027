import { MOBILE_PREMIUM_PAGES } from "./mobilePilot";
import { MOBILE_ACCESSORY_INDEX_PAGE, mobileAccessoryPresentations, mobileNecessairesPresentation } from "../../data/mobileAccessoryPresentation";
import { MOBILE_ACCESSORY_SHOWCASE_PAGE } from "../../data/mobileAccessoryShowcase";

/** Original PDF sheets replaced by portrait HTML. Technology artwork and modal
 * fallbacks still request their PDF on demand; desktop warmup remains unchanged.
 */
export const mobilePortraitReplacementPages: ReadonlySet<number> = new Set([
  ...MOBILE_PREMIUM_PAGES,
  MOBILE_ACCESSORY_INDEX_PAGE,
  ...mobileAccessoryPresentations.map(presentation => presentation.pageId),
  mobileNecessairesPresentation.pageId,
  MOBILE_ACCESSORY_SHOWCASE_PAGE,
]);
