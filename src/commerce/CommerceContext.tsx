/**
 * Estado comercial vivo: catálogo publicado + carrito + polling.
 * - El catálogo en memoria es la única fuente de precio/disponibilidad.
 * - El carrito persiste identidad + cantidad; al hidratar y ante cada
 *   actualización se reconcilia (precio nuevo gana, disponible nuevo gana).
 * - Polling liviano de products-version.json y app-version.json.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addLine,
  cartTotal,
  cartUnits,
  formatNotice,
  loadCart,
  reconcileLines,
  removeLine,
  saveCart,
  setLineQty,
} from "./cart";
import { byId, loadPublishedCommerce } from "./catalog";
import { APP_POLL_INTERVAL_MS, COMMERCE_POLL_INTERVAL_MS, createAppChecker, createCatalogChecker, startPolling } from "./polling";
import type { CartLine, CartNotice, CommerceCatalog, CommerceProduct, PresentedLine } from "./types";
import { presentLines } from "./cart";

declare const __STARVIE_APP_VERSION__: string | undefined;

export type ResolvedProduct =
  | { kind: "ok"; product: CommerceProduct }
  | { kind: "missing" };

type CommerceContextValue = {
  catalog: CommerceCatalog | null;
  version: string | null;
  catalogError: string | null;
  products: CommerceProduct[];
  resolveProduct: (id: string) => ResolvedProduct;
  productNames: Record<string, string>;
  lines: CartLine[];
  presented: PresentedLine[];
  units: number;
  total: number;
  addToCart: (productId: string, qty: number) => void;
  setQty: (productId: string, qty: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  /** Avisos de la última reconciliación con cambios (banner del carrito). */
  cartNotices: CartNotice[];
  dismissNotices: () => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  setUiBusy: (busy: boolean) => void;
  toast: string;
  showToast: (message: string) => void;
};

const CommerceContext = createContext<CommerceContextValue | null>(null);

export function CommerceProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<CommerceCatalog | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>(() =>
    typeof window === "undefined" ? [] : loadCart(window.localStorage),
  );
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [cartNotices, setCartNotices] = useState<CartNotice[]>([]);
  const catalogRef = useRef<CommerceCatalog | null>(null);
  const versionRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const linesRef = useRef<CartLine[]>(lines);

  catalogRef.current = catalog;
  versionRef.current = version;
  linesRef.current = lines;

  const showToast = useCallback((message: string) => {
    window.clearTimeout(timerRef.current);
    setToast(message);
    timerRef.current = window.setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Persistencia: solo identidad + cantidad.
  useEffect(() => {
    saveCart(window.localStorage, lines);
  }, [lines]);

  const applyCatalog = useCallback(
    (next: CommerceCatalog, nextVersion: string) => {
      const map = byId(next);
      // El catálogo vigente gana; los avisos se generan solo ante cambios
      // reales de disponibilidad. Los cambios de precio son silenciosos.
      const { lines: reconciled, notices } = reconcileLines(linesRef.current, map);
      setLines(reconciled);
      if (notices.length > 0) {
        // Banner persistente en el carrito + toast resumido y no invasivo.
        setCartNotices(notices);
        showToast(
          notices.length === 1
            ? formatNotice(notices[0])
            : "Se actualizaron algunos productos de tu pedido.",
        );
      }
      setCatalog(next);
      setVersion(nextVersion);
      setCatalogError(null);
    },
    [showToast],
  );

  // Carga inicial.
  useEffect(() => {
    let cancelled = false;
    loadPublishedCommerce()
      .then(({ catalog: initial, version: initialVersion }) => {
        if (!cancelled) applyCatalog(initial, initialVersion);
      })
      .catch(() => {
        if (!cancelled) setCatalogError("No se pudo cargar la información comercial (products.json).");
      });
    return () => {
      cancelled = true;
    };
  }, [applyCatalog]);

  // Polling de catálogo: señal liviana, descarga completa solo si cambió.
  const checkCatalogRef = useRef<() => Promise<void>>(() => Promise.resolve());
  checkCatalogRef.current = async () => {
    const check = createCatalogChecker({ getCurrentVersion: () => versionRef.current });
    const result = await check();
    if (result.status === "updated") {
      applyCatalog(result.catalog, result.version);
    }
  };
  useEffect(() => {
    const stop = startPolling(() => void checkCatalogRef.current(), {
      intervalMs: COMMERCE_POLL_INTERVAL_MS,
    });
    return stop;
  }, []);

  // Polling de app: recarga segura cuando cambia el frontend.
  useEffect(() => {
    const loadedVersion =
      typeof __STARVIE_APP_VERSION__ !== "undefined"
        ? __STARVIE_APP_VERSION__
        : document.querySelector('meta[name="starvie-app-version"]')?.getAttribute("content");
    if (!loadedVersion) return;
    const check = createAppChecker({
      loadedVersion,
      storage: window.sessionStorage,
      isReloadSafe: () => !busyRef.current,
    });
    const stop = startPolling(() => void check(), { intervalMs: APP_POLL_INTERVAL_MS });
    return stop;
  }, []);

  const map = useMemo(() => (catalog ? byId(catalog) : new Map<string, CommerceProduct>()), [catalog]);

  const resolveProduct = useCallback(
    (id: string): ResolvedProduct => {
      // Si el producto existe en el catálogo, forma parte de él (aunque esté
      // no disponible: el modal lo muestra como "Sin stock"). Para retirarlo
      // se elimina la fila del Excel.
      const product = map.get(id);
      if (!product) return { kind: "missing" };
      return { kind: "ok", product };
    },
    [map],
  );

  const addToCart = useCallback(
    (productId: string, qty: number) => {
      const product = map.get(productId);
      if (!product || !product.disponible) {
        showToast("Este producto no está disponible ahora.");
        return;
      }
      setLines((current) => addLine(current, productId, qty));
    },
    [map, showToast],
  );

  const setQty = useCallback((productId: string, qty: number) => {
    setLines((current) => setLineQty(current, productId, qty));
  }, []);

  const dismissNotices = useCallback(() => setCartNotices([]), []);

  const removeFromCart = useCallback((productId: string) => {
    setLines((current) => removeLine(current, productId));
    // El aviso de un producto que ya salió del pedido deja de ser relevante.
    setCartNotices((current) => current.filter((notice) => notice.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
    setCartNotices([]);
  }, []);

  const presented = useMemo(() => presentLines(lines, map), [lines, map]);

  const value: CommerceContextValue = {
    catalog,
    version,
    catalogError,
    products: catalog?.products ?? [],
    resolveProduct,
    productNames: useMemo(() => {
      const names: Record<string, string> = {};
      for (const product of map.values()) names[product.id] = product.nombre;
      return names;
    }, [map]),
    lines,
    presented,
    units: cartUnits(lines),
    total: cartTotal(lines, map),
    addToCart,
    setQty,
    removeFromCart,
    clearCart,
    cartNotices,
    dismissNotices,
    cartOpen,
    setCartOpen,
    setUiBusy: useCallback((busy: boolean) => {
      busyRef.current = busy;
    }, []),
    toast,
    showToast,
  };

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce(): CommerceContextValue {
  const value = useContext(CommerceContext);
  if (!value) throw new Error("useCommerce debe usarse dentro de CommerceProvider");
  return value;
}
