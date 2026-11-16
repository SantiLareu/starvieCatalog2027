import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CartDrawer } from "./CartDrawer";
import { useCommerce } from "./CommerceContext";
import { DistributorProvider, useDistributor } from "./distributor/DistributorContext";
import { fillContact, presented, purchaseMarkers, storageBytes } from "../test/distributorCheckout";
import type { OrderPayload } from "./orders";

vi.mock("./CommerceContext", async original => ({ ...(await original<typeof import("./CommerceContext")>()), useCommerce: vi.fn() }));
const clearCart = vi.fn();
let session = false;
let expiredOrder = false;
let activeSessionId = "server-initial-session";
let current!: ReturnType<typeof useDistributor>;
const posts: { channel: string; payload: OrderPayload }[] = [];
function Harness() {
  current = useDistributor();
  return <span data-testid="auth">{current.auth.status}</span>;
}
function renderApp() { return render(<DistributorProvider><Harness /><CartDrawer /></DistributorProvider>); }
async function login(account = "20123456786") {
  await act(async () => { await current.login(account, "fake-password"); });
  expect(current.isAuthenticated).toBe(true);
}
async function openCheckout() {
  fireEvent.click(screen.getByRole("button", { name: "Finalizar pedido" }));
  await screen.findByRole("dialog", { name: "Finalizar pedido" });
}
function closeCheckout() { fireEvent.click(screen.getByRole("button", { name: "Cerrar checkout" })); }
async function send() {
  fillContact();
  const count = posts.length;
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  await waitFor(() => expect(posts).toHaveLength(count + 1));
  await screen.findByRole("alert");
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); posts.length = 0; session = false; expiredOrder = false; clearCart.mockClear();
  vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
  vi.stubEnv("VITE_DISTRIBUTOR_API_BASE_URL", "https://distributor.test");
  vi.mocked(useCommerce).mockReturnValue({ cartOpen: true, setCartOpen: vi.fn(), setUiBusy: vi.fn(), presented,
    units: 2, total: 1000, setQty: vi.fn(), removeFromCart: vi.fn(), clearCart, cartNotices: [], dismissNotices: vi.fn() } as unknown as ReturnType<typeof useCommerce>);
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (path.endsWith("/login")) { session = true; activeSessionId = "server-session-" + String(JSON.parse(String(init?.body)).cuit); }
    if (path.endsWith("/logout")) session = false;
    if (/\/(session|login|logout)$/.test(path)) return json({ ok: true, authenticated: session, sessionId: session ? activeSessionId : null, discountPercent: 20, expiresAt: new Date(Date.now() + 3600000).toISOString() });
    if (path.endsWith("/quote")) return json({ ok: true, currency: "ARS", discountPercent: 20,
      lines: [{ productId: "raptor+", qty: 2, listUnitPrice: 500, netUnitPrice: 400, netSubtotal: 800 }], listTotal: 1000, netTotal: 800 });
    if (path.endsWith("/orders")) {
      posts.push({ channel: path, payload: JSON.parse(String(init?.body)) });
      if (expiredOrder) return json({ error: "Expired" }, 401);
      return json({ orderId: "mock-order", status: "ambiguous" });
    }
    throw new Error(`Unexpected request ${path}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it("a dealer purchase never recovers or sends the public pending payload", async () => {
  renderApp();
  await openCheckout(); await send();
  const publicPayload = posts[0].payload;
  const raw = localStorage.getItem("starvie-order-attempt-v2");
  closeCheckout(); await login(); await openCheckout();
  expect(screen.queryByText(publicPayload.idempotencyKey)).toBeNull();
  await send();
  expect(posts.map(post => post.channel)).toEqual(["/api/orders", "/api/distributor/orders"]);
  expect(posts[1].payload.idempotencyKey).not.toBe(publicPayload.idempotencyKey);
  expect(localStorage.getItem("starvie-order-attempt-v2")).toBe(raw);
});

it("logout, account B, and returning to account A each leave previous purchases unchanged", async () => {
  renderApp(); await login(); await openCheckout(); await send();
  const keyA = posts[0].payload.idempotencyKey;
  const before = storageBytes();
  closeCheckout(); await act(async () => { await current.logout(); });
  await login("27123456780"); await openCheckout();
  expect(screen.queryByText(keyA)).toBeNull();
  expect(screen.getByLabelText("Nombre y apellido *")).toHaveValue("");
  await send();
  closeCheckout(); await login(); await openCheckout(); await send();
  expect(new Set(posts.map(post => post.payload.idempotencyKey)).size).toBe(3);
  for (const [key, value] of Object.entries(before.local)) expect(localStorage.getItem(key)).toBe(value);
  for (const [key, value] of Object.entries(before.session)) expect(sessionStorage.getItem(key)).toBe(value);
  expect(purchaseMarkers()).toHaveLength(3);
  expect(clearCart).not.toHaveBeenCalled();
});

it("reload with a valid cookie needs no recovery or administrative step to start a new purchase", async () => {
  renderApp(); await login(); await openCheckout(); await send();
  const first = posts[0].payload.idempotencyKey;
  const before = storageBytes();
  cleanup(); renderApp();
  await waitFor(() => expect(current.isAuthenticated).toBe(true));
  await openCheckout();
  expect(screen.queryByText(first)).toBeNull();
  await send();
  expect(posts[1].payload.idempotencyKey).not.toBe(first);
  expect(purchaseMarkers()[1].key).not.toContain(activeSessionId);
  for (const [key, value] of Object.entries(before.local)) expect(localStorage.getItem(key)).toBe(value);
});

it("logout while checkout is open revokes submission without changing the old records", async () => {
  renderApp(); await login(); await openCheckout(); fillContact();
  const before = storageBytes();
  await act(async () => { await current.logout(); });
  expect(screen.getByRole("alert")).toHaveTextContent(/Ingresá como distribuidor/);
  expect(screen.queryByRole("button", { name: "Enviar pedido" })).toBeNull();
  expect(posts).toHaveLength(0);
  expect(storageBytes()).toEqual(before);
});

it("401 never falls back to public checkout and re-login starts a separate authenticated purchase", async () => {
  expiredOrder = true;
  renderApp(); await login(); await openCheckout(); await send();
  await waitFor(() => expect(current.isAuthenticated).toBe(false));
  const first = posts[0].payload.idempotencyKey;
  closeCheckout(); expiredOrder = false; await login(); await openCheckout(); await send();
  expect(posts.map(post => post.channel)).toEqual(["/api/distributor/orders", "/api/distributor/orders"]);
  expect(posts[1].payload.idempotencyKey).not.toBe(first);
  expect(purchaseMarkers()).toHaveLength(2);
});
