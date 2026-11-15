import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CommerceProvider, useCommerce } from "./CommerceContext";
import { DistributorProvider, useOptionalDistributor } from "./distributor/DistributorContext";
import { CART_STORAGE_KEY } from "./cart";
import { hotspotsForPage, selectLiveHotspots } from "../data/CatalogData";
import { HotspotLayer } from "../components/HotspotLayer";
import catalog from "../../generated/products.json";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear(); });

function Probe() {
  const commerce = useCommerce();
  const result = commerce.resolveProduct("hard eva black bag");
  return <>
    <output aria-label="Resolución">{result.kind}</output>
    <output aria-label="Unidades">{commerce.units}</output>
    <output aria-label="Selección">{commerce.toast}</output>
    <HotspotLayer hotspots={selectLiveHotspots(hotspotsForPage("page-28"), commerce.productNames)}
      productNames={commerce.productNames} onProductSelect={id => commerce.showToast(commerce.resolveProduct(id).kind)} />
    <button onClick={() => commerce.addToCart("hard eva black bag", 2)}>Agregar pendiente</button>
    <button onClick={() => commerce.addToCart("priced", 1)}>Agregar con precio sin SKU</button>
    <button onClick={() => commerce.setQty("hard eva black bag", 4)}>Cambiar cantidad pendiente</button>
  </>;
}

it.each([null, 0])("precio %s permite resolución/hotspot, altas, cantidades y persistencia", async precio => {
  const products = [
    { ...catalog.products[0], id: "hard eva black bag", nombre: "Hard Eva Black", precio, sku: "", pagina: 28 },
    { ...catalog.products[0], id: "priced", precio: 100, sku: "" },
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
    String(url).includes("products-version.json")
      ? { schemaVersion: 1, version: `sha256-${"a".repeat(64)}`, productsFile: "products.json" }
      : { schemaVersion: 1, products },
  ), { status: 200 })));
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ productId: "hard eva black bag", qty: 3 }]));
  render(<CommerceProvider><Probe /></CommerceProvider>);
  await waitFor(() => expect(screen.getByLabelText("Resolución")).toHaveTextContent("ok"));
  fireEvent.click(screen.getByRole("button", { name: "Abrir ficha de Hard Eva Black" }));
  expect(screen.getByLabelText("Selección")).toHaveTextContent("ok");
  fireEvent.click(screen.getByRole("button", { name: "Agregar pendiente" }));
  expect(screen.getByLabelText("Unidades")).toHaveTextContent("5");
  fireEvent.click(screen.getByRole("button", { name: "Agregar con precio sin SKU" }));
  expect(screen.getByLabelText("Unidades")).toHaveTextContent("6");
  fireEvent.click(screen.getByRole("button", { name: "Cambiar cantidad pendiente" }));
  expect(screen.getByLabelText("Unidades")).toHaveTextContent("5");
  expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)!)).toEqual([{ productId: "hard eva black bag", qty: 4 }, { productId: "priced", qty: 1 }]);
  cleanup();
  render(<CommerceProvider><Probe /></CommerceProvider>);
  await waitFor(() => expect(screen.getByLabelText("Resolución")).toHaveTextContent("ok"));
  expect(screen.getByLabelText("Unidades")).toHaveTextContent("5");
});

/* ── Disponibilidad del carrito al iniciar sesión de distribuidor (C2) ───── */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const availableProduct = {
  id: "p1",
  sku: "P1",
  nombre: "Producto 1",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 100,
  disponible: true,
  imagenes: [],
  gama: "",
  tipoJuego: "",
  forma: "",
  plano: "",
  peso: "",
  balance: "",
  ean: "",
  pagina: 1,
};

const outOfStockProduct = {
  ...availableProduct,
  id: "p2",
  sku: "P2",
  nombre: "Producto 2",
  precio: 200,
  disponible: false,
};

function CartProbe() {
  const commerce = useCommerce();
  const distributor = useOptionalDistributor();
  return (
    <>
      <output aria-label="Líneas">
        {commerce.lines.map((line) => `${line.productId}:${line.qty}`).join(",")}
      </output>
      <output aria-label="Avisos">
        {commerce.cartNotices.map((notice) => `${notice.type}:${notice.productId}`).join(",")}
      </output>
      <output aria-label="Selección">{commerce.toast}</output>
      <output aria-label="Sesión">{distributor?.auth.status ?? "none"}</output>
      <button onClick={() => void distributor?.login("20111111112", "secreto")}>Entrar</button>
      <button onClick={() => void distributor?.logout()}>Salir</button>
    </>
  );
}

it("al iniciar sesión de distribuidor reconcilia la disponibilidad sin volver a pedir el catálogo", async () => {
  // El módulo se importa en runtime: la prueba falla sola si el puente todavía
  // no existe, sin romper el resto del archivo.
  const bridgePath = "./DistributorAvailabilityBridge";
  const { DistributorAvailabilityBridge } = await import(/* @vite-ignore */ bridgePath);
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "http://localhost:8787");
  const catalog = deferred<Response>();
  let productsCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) {
        return json({
          ok: true,
          authenticated: true,
          discountPercent: 20,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
      }
      if (url.includes("/api/distributor/login")) {
        return json({
          ok: true,
          authenticated: true,
          discountPercent: 20,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
      }
      if (url.includes("products-version.json")) {
        return json({
          schemaVersion: 1,
          version: `sha256-${"a".repeat(64)}`,
          productsFile: "products.json",
        });
      }
      if (url.includes("products.json")) {
        productsCalls += 1;
        return catalog.promise;
      }
      throw new Error(`fetch inesperado: ${url}`);
    }),
  );
  localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([
      { productId: "p1", qty: 2 },
      { productId: "p2", qty: 1 },
    ]),
  );

  render(
    <CommerceProvider>
      <DistributorProvider>
        <DistributorAvailabilityBridge />
        <CartProbe />
      </DistributorProvider>
    </CommerceProvider>,
  );

  // El carrito hidratado conserva las dos líneas hasta que hay catálogo.
  await waitFor(() => expect(screen.getByLabelText("Líneas").textContent).toBe("p1:2,p2:1"));

  // La sesión se autentica: la reconciliación usa el catálogo YA cargado.
  // Como el catálogo todavía no llegó, el carrito NO se toca (nunca se vacía).
  await waitFor(() => expect(screen.getByLabelText("Sesión").textContent).toBe("authenticated"));
  expect(screen.getByLabelText("Líneas").textContent).toBe("p1:2,p2:1");

  // Con el catálogo cargado, la línea sin stock se retira con el aviso
  // vigente y la línea válida conserva su cantidad.
  catalog.resolve(json({ schemaVersion: 1, products: [availableProduct, outOfStockProduct] }));
  await waitFor(() => expect(screen.getByLabelText("Líneas").textContent).toBe("p1:2"));
  expect(screen.getByLabelText("Avisos").textContent).toBe("out-of-stock:p2");
  expect(screen.getByLabelText("Selección").textContent).toContain("sin stock");

  // El inicio de sesión no pidió el catálogo otra vez.
  expect(productsCalls).toBe(1);
});

it("el carrito conserva sus bytes en localStorage tras la invalidación y la reconciliación", async () => {
  const bridgePath = "./DistributorAvailabilityBridge";
  const { DistributorAvailabilityBridge } = await import(/* @vite-ignore */ bridgePath);
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "http://localhost:8787");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/distributor/session")) {
        return json({
          ok: true,
          authenticated: true,
          discountPercent: 20,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
      }
      if (url.includes("/api/distributor/login")) {
        return json({
          ok: true,
          authenticated: true,
          discountPercent: 20,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
      }
      if (url.includes("/api/distributor/logout")) {
        return json({ ok: true, authenticated: false });
      }
      if (url.includes("products-version.json")) {
        return json({
          schemaVersion: 1,
          version: `sha256-${"a".repeat(64)}`,
          productsFile: "products.json",
        });
      }
      if (url.includes("products.json")) {
        return json({ schemaVersion: 1, products: [availableProduct] });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }),
  );
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ productId: "p1", qty: 2 }]));

  render(
    <CommerceProvider>
      <DistributorProvider>
        <DistributorAvailabilityBridge />
        <CartProbe />
      </DistributorProvider>
    </CommerceProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText("Sesión").textContent).toBe("authenticated"));
  await waitFor(() => expect(screen.getByLabelText("Líneas").textContent).toBe("p1:2"));
  const before = localStorage.getItem(CART_STORAGE_KEY);

  // Revalidación de sesión: invalida cotizaciones, el carrito no se toca.
  window.dispatchEvent(new Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(before);

  // Salir y volver a entrar: la reconciliación de disponibilidad tampoco
  // altera el carrito (no hay líneas que retirar).
  fireEvent.click(screen.getByRole("button", { name: "Salir" }));
  await waitFor(() => expect(screen.getByLabelText("Sesión").textContent).toBe("anonymous"));
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  await waitFor(() => expect(screen.getByLabelText("Sesión").textContent).toBe("authenticated"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(before);
  expect(screen.getByLabelText("Avisos").textContent).toBe("");
});
