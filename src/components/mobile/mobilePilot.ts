import { useSyncExternalStore } from "react";

export const MOBILE_PILOT_QUERY = "(max-width: 599px) and (orientation: portrait)";
export type PilotPage = 17;

/** Opt-in leaf only; Magazine and its navigation always remain mounted. */
export function pilotPageFromSearch(search: string): PilotPage | null {
  const params = new URLSearchParams(search);
  const value = params.get("mobile-pilot");
  return value === "17" || value === "" ? 17 : null;
}
function subscribeViewport(update: () => void) {
  const media = window.matchMedia(MOBILE_PILOT_QUERY);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
export function usePilotViewport() {
  return useSyncExternalStore(subscribeViewport, () => window.matchMedia(MOBILE_PILOT_QUERY).matches, () => false);
}
