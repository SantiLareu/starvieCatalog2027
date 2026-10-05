import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CommerceProvider, useCommerce } from "./CommerceContext";
import { CART_STORAGE_KEY } from "./cart";
import { hotspotsForPage, selectLiveHotspots } from "../data/CatalogData";
import { HotspotLayer } from "../components/HotspotLayer";
import catalog from "../../generated/products.json";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

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
