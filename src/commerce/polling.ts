/**
 * Polling liviano (concepto de Head: startCatalogPolling + publishedApp).
 * Solo consulta los version files; el catálogo completo se descarga
 * únicamente cuando la versión cambió.
 */
import { fetchPublishedCatalog, fetchPublishedVersion } from "./catalog";
import type { CommerceCatalog } from "./types";

export const COMMERCE_POLL_INTERVAL_MS = 60_000;
export const APP_POLL_INTERVAL_MS = 60_000;
export const APP_RELOAD_STORAGE_KEY = "starvie-app-reload-target";

type TimerFns = {
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
};

/** Polling consciente de visibilidad: no chequea con la pestaña oculta. */
export function startPolling(
  check: (options?: { background?: boolean }) => void,
  options: {
    intervalMs: number;
    documentTarget?: Document;
    windowTarget?: Window;
  } & TimerFns = { intervalMs: COMMERCE_POLL_INTERVAL_MS },
): () => void {
  const {
    intervalMs,
    documentTarget = document,
    windowTarget = window,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
  } = options;
  const checkWhenActive = () => {
    if (!documentTarget.hidden) check({ background: true });
  };
  const intervalId = setIntervalImpl(checkWhenActive, intervalMs);
  documentTarget.addEventListener("visibilitychange", checkWhenActive);
  windowTarget.addEventListener("focus", checkWhenActive);
  return () => {
    clearIntervalImpl(intervalId);
    documentTarget.removeEventListener("visibilitychange", checkWhenActive);
    windowTarget.removeEventListener("focus", checkWhenActive);
  };
}

export type CatalogCheckResult =
  | { status: "current"; version: string }
  | { status: "updated"; catalog: CommerceCatalog; version: string }
  | { status: "unavailable" }
  | { status: "invalid" };

/** Una sola pasada de chequeo de catálogo (testeable sin timers). */
export function createCatalogChecker(options: {
  getCurrentVersion: () => string | null;
  fetchImpl?: typeof fetch;
  base?: string;
}): () => Promise<CatalogCheckResult> {
  const { getCurrentVersion, fetchImpl = fetch, base } = options;
  return async () => {
    let version: string;
    try {
      version = await fetchPublishedVersion(fetchImpl, base);
    } catch {
      return { status: "unavailable" };
    }
    const current = getCurrentVersion();
    if (current && version === current) return { status: "current", version };
    try {
      const catalog = await fetchPublishedCatalog(version, fetchImpl, base);
      return { status: "updated", catalog, version };
    } catch {
      return { status: "invalid" };
    }
  };
}

function readStorage(storage: Pick<Storage, "getItem"> | null | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(
  storage: Pick<Storage, "setItem"> | null | undefined,
  key: string,
  value: string,
): boolean {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export type AppCheckResult =
  | { status: "current" | "unavailable" | "invalid" | "deferred" | "reload-loop-guard"; reloaded: boolean }
  | { status: "reload_requested"; reloaded: true; version: string };

/**
 * Chequeo de app-version: si cambió el frontend y es seguro recargar
 * (modal y carrito cerrados), recarga automáticamente sin pedir F5.
 * Si no es seguro, difiere hasta el próximo chequeo.
 */
function resolveAppVersionUrl(base: string | undefined, override: string | undefined): string {
  if (override) return override;
  if (base) return new URL("app-version.json", base).href;
  if (typeof window !== "undefined") {
    return new URL("app-version.json", new URL(import.meta.env.BASE_URL, window.location.href)).href;
  }
  throw new Error("createAppChecker necesita base o versionUrl fuera del navegador");
}

export function createAppChecker(options: {
  loadedVersion: string | null;
  fetchImpl?: typeof fetch;
  base?: string;
  versionUrl?: string;
  reload?: () => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  isReloadSafe?: () => boolean;
}): () => Promise<AppCheckResult> {
  const {
    loadedVersion,
    fetchImpl = fetch,
    base,
    reload = () => window.location.reload(),
    storage = null,
    isReloadSafe = () => true,
  } = options;
  let reloadRequested = false;
  const versionUrl = resolveAppVersionUrl(base, options.versionUrl);
  return async () => {
    if (!loadedVersion || reloadRequested) return { status: "current", reloaded: false };
    let response;
    try {
      response = await fetchImpl(`${versionUrl}?check=${Date.now()}`, { cache: "no-store" });
    } catch {
      return { status: "unavailable", reloaded: false };
    }
    if (!response.ok) return { status: "unavailable", reloaded: false };
    let manifest: { schemaVersion?: unknown; version?: unknown } | null = null;
    try {
      manifest = (await response.json()) as { schemaVersion?: unknown; version?: unknown };
    } catch {
      return { status: "invalid", reloaded: false };
    }
    if (!manifest || manifest.schemaVersion !== 1 || typeof manifest.version !== "string") {
      return { status: "invalid", reloaded: false };
    }
    if (manifest.version === loadedVersion) return { status: "current", reloaded: false };
    if (!isReloadSafe()) return { status: "deferred", reloaded: false };
    if (storage && readStorage(storage, APP_RELOAD_STORAGE_KEY) === manifest.version) {
      return { status: "reload-loop-guard", reloaded: false };
    }
    if (storage && !writeStorage(storage, APP_RELOAD_STORAGE_KEY, manifest.version)) {
      return { status: "deferred", reloaded: false };
    }
    reloadRequested = true;
    reload();
    return { status: "reload_requested", reloaded: true, version: manifest.version };
  };
}
