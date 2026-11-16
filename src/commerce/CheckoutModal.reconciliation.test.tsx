import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillContact, proofB, purchaseMarkers, REFERENCE, renderDistributor, seedHistorical, storageBytes } from "../test/distributorCheckout";

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  vi.stubEnv("VITE_TURNSTILE_ENABLED", "false");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network"); }));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe("distributors: historical reconciliation is outside normal checkout", () => {
  it.each(["UNKNOWN", "UNRESOLVED", "accepted", "processing", "failed", "conflict", "completed"])(
    "%s history does not block a new independent order and remains byte-identical", async status => {
      seedHistorical(status);
      seedHistorical(status, true);
      const historical = storageBytes();
      const { props } = renderDistributor();
      expect(screen.queryByText(REFERENCE)).toBeNull();
      expect(screen.queryByRole("button", { name: /Consultar estado|Resolver intento|Continuar con el envío/ })).toBeNull();
      expect(screen.queryByRole("checkbox")).toBeNull();
      fillContact();
      fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
      await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
      const markers = purchaseMarkers();
      expect(markers).toHaveLength(1);
      expect(markers[0].value.idempotencyKey).not.toBe(REFERENCE);
      const after = storageBytes();
      for (const [key, value] of Object.entries(historical.local)) expect(after.local[key]).toBe(value);
      for (const [key, value] of Object.entries(historical.session)) expect(after.session[key]).toBe(value);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("does not assign malformed/expired/orphan legacy history to the current account", async () => {
    localStorage.setItem("starvie-order-attempt-v2", "broken-json");
    sessionStorage.setItem("starvie-order-attempt-v2-session", "unknown-original-owner");
    const before = storageBytes();
    const { props } = renderDistributor({ distributorSessionFingerprint: proofB });
    fillContact();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(props.submitFn).toHaveBeenCalledOnce());
    expect(localStorage.getItem("starvie-order-attempt-v2")).toBe(before.local["starvie-order-attempt-v2"]);
    expect(sessionStorage.getItem("starvie-order-attempt-v2-session")).toBe(before.session["starvie-order-attempt-v2-session"]);
    expect(purchaseMarkers()[0].key).not.toContain(proofB);
    expect(fetch).not.toHaveBeenCalled();
  });
});
