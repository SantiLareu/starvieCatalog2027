import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { independentDistributorPurchase } from "./independentPurchase";

const contact = { name: "Test", legalName: "Test", email: "test@example.test" };
const lines = [{ productId: "raptor+", qty: 1 }];
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

it("reuses the current exact payload/key but allocates a different key only for an explicit new purchase", () => {
  const purchase = independentDistributorPurchase();
  const first = purchase.prepareAttempt(contact, lines, { channel: "distributor" });
  if (!first) throw new Error("prepare failed");
  expect(purchase.prepareAttempt(contact, lines, { channel: "distributor" })).toEqual(first);
  expect(purchase.prepareAttempt(contact, [{ productId: "another", qty: 1 }], { channel: "distributor" })).toBe(false);
  purchase.updateAttempt(lines, { status: "processing", orderId: "order-a" });
  purchase.updateAttemptSession("order-a");
  const oldLocal = Object.entries(localStorage);
  const oldSession = Object.entries(sessionStorage);
  purchase.reset();
  expect(purchase.getStoredAttemptStatus().kind).toBe("missing");
  const second = purchase.prepareAttempt(contact, lines, { channel: "distributor" });
  expect(second && second.idempotencyKey).not.toBe(first.idempotencyKey);
  for (const [key, value] of oldLocal) expect(localStorage.getItem(key)).toBe(value);
  for (const [key, value] of oldSession) expect(sessionStorage.getItem(key)).toBe(value);
});

it("keeps the current confirmed result as history instead of deleting its marker/session", () => {
  const purchase = independentDistributorPurchase();
  const first = purchase.prepareAttempt(contact, lines, { channel: "distributor" });
  if (!first) throw new Error("prepare failed");
  expect(purchase.finalizeCompletedAttempt(first.idempotencyKey, "order-a")).toBe(true);
  expect(purchase.getStoredAttemptStatus()).toMatchObject({ kind: "valid", snapshot: { status: "completed", orderId: "order-a" } });
  expect(purchase.getAttemptSession()?.orderId).toBe("order-a");
  expect(Object.keys(localStorage)).toHaveLength(1);
  expect(Object.keys(sessionStorage)).toHaveLength(1);
});

it("preserves partial writes when local persistence fails; a later new purchase never overwrites them", () => {
  const setItem = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (this === localStorage) throw new Error("Storage full");
    return setItem.call(this, key, value);
  });
  const purchase = independentDistributorPurchase();
  expect(purchase.prepareAttempt(contact, lines, { channel: "distributor" })).toBe(false);
  const oldSession = Object.entries(sessionStorage);
  expect(oldSession).toHaveLength(1);
  spy.mockRestore();
  purchase.reset();
  expect(purchase.prepareAttempt(contact, lines, { channel: "distributor" })).not.toBe(false);
  for (const [key, value] of oldSession) expect(sessionStorage.getItem(key)).toBe(value);
});
