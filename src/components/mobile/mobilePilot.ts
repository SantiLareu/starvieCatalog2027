import { useSyncExternalStore } from "react";

export const MOBILE_PILOT_QUERY = "(max-width: 599px) and (orientation: portrait)";
export const MOBILE_PREMIUM_PAGES = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] as const;
export type PilotPage = typeof MOBILE_PREMIUM_PAGES[number];

/** Opt-in leaf only; Magazine and its navigation always remain mounted. */
export function pilotPageFromSearch(search: string): PilotPage | null {
  const params = new URLSearchParams(search);
  const value = params.get("mobile-pilot");
  return value === "15" ? 15 : value === "16" ? 16 : value === "18" ? 18 : value === "19" ? 19 : value === "20" ? 20 : value === "21" ? 21 : value === "22" ? 22 : value === "23" ? 23 : value === "24" ? 24 : value === "25" ? 25 : value === "26" ? 26 : value === "17" || value === "" ? 17 : null;
}
function subscribeViewport(update: () => void) {
  const media = window.matchMedia(MOBILE_PILOT_QUERY);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
export function usePilotViewport() {
  return useSyncExternalStore(subscribeViewport, () => window.matchMedia(MOBILE_PILOT_QUERY).matches, () => false);
}
