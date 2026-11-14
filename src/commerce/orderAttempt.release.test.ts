import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  canResolveAttemptLocally,
  getStoredAttemptStatus,
  prepareAttempt,
  resolveAttemptForNewPurchase,
  updateAttempt,
} from "./orderAttempt";

const localKey = "starvie-order-attempt-v2";
const sessionKey = "starvie-order-attempt-v2-session";
const contact = { name: "Test User", legalName: "Test Shop", email: "test@example.com" };
const lines = [{ productId: "raptor+", qty: 2 }];
/* Reloj inyectado: el paso del tiempo se simula, nunca se espera. */
const T0 = Date.parse("2026-03-01T12:00:00.000Z");
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { localStorage.clear(); sessionStorage.clear(); });
function bytes() { return [localStorage.getItem(localKey), sessionStorage.getItem(sessionKey)]; }

/**
 * Pedido público que el servidor recibió y cuya respuesta se perdió:
 * el marcador queda "accepted" (resultado INCIERTO), no confirmado.
 */
function uncertainPublicAttempt(): string {
  const prepared = prepareAttempt(contact, lines, { channel: "public" });
  expect(prepared).not.toBe(false);
  updateAttempt(lines, { orderId: "ord-perdido", status: "accepted" });
  return (prepared as { idempotencyKey: string }).idempotencyKey;
}

it.each(["distributor", "legacy", "expired-distributor", "orphan-distributor", "invalid-marker"])(
  "S4 refuses unverified release of %s even with confirmedUncertain=true", (scenario) => {
    expect(prepareAttempt(contact, lines, { channel: "distributor" })).not.toBe(false);
    if (scenario === "orphan-distributor") localStorage.removeItem(localKey);
    else if (scenario === "invalid-marker") localStorage.setItem(localKey, "broken-json");
    else if (scenario !== "distributor") {
      for (const [storage, key] of [[localStorage, localKey], [sessionStorage, sessionKey]] as const) {
        const value = JSON.parse(storage.getItem(key)!);
        if (scenario === "legacy") delete value.channel;
        else value.createdAt = new Date(Date.now() - 24 * 3600_000).toISOString();
        storage.setItem(key, JSON.stringify(value));
      }
    }
    const before = bytes();
    expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), true)).toBe(false);
    expect(bytes()).toEqual(before);
  },
);

/**
 * S4/S11 · La liberación local sólo existe para un resultado DEFINITIVO.
 * Un intento público incierto (accepted/processing), vencido o huérfano se
 * conserva: su expiración NO demuestra que el servidor no recibiera el
 * pedido.
 */
it.each([23, 24, 48, 72])("S4 an uncertain public attempt of %i h is not released locally", (hours) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(T0);
    uncertainPublicAttempt();
    vi.setSystemTime(T0 + hours * 3600_000);
    const status = getStoredAttemptStatus();
    const before = bytes();
    expect.soft(canResolveAttemptLocally(status)).toBe(false);
    expect.soft(resolveAttemptForNewPurchase(status, true)).toBe(false);
    expect.soft(bytes()).toEqual(before);
  } finally {
    vi.useRealTimers();
  }
});

it("S4 an uncertain public attempt inside the safe window is not released either", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(T0);
    uncertainPublicAttempt();
    vi.setSystemTime(T0 + 3600_000);
    const status = getStoredAttemptStatus();
    expect(status.kind).toBe("valid");
    const before = bytes();
    expect(canResolveAttemptLocally(status)).toBe(false);
    expect(resolveAttemptForNewPurchase(status, true)).toBe(false);
    expect(bytes()).toEqual(before);
  } finally {
    vi.useRealTimers();
  }
});

it("S8 the legitimate retry inside the safe window reuses the same key", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(T0);
    const key = uncertainPublicAttempt();
    vi.setSystemTime(T0 + 3600_000);
    const retried = prepareAttempt(contact, lines, { channel: "public" });
    expect(retried).not.toBe(false);
    expect((retried as { idempotencyKey: string }).idempotencyKey).toBe(key);
    /* El marcador y la sesión siguen siendo los mismos: no se rotó la clave. */
    expect(JSON.parse(localStorage.getItem(localKey)!).idempotencyKey).toBe(key);
    expect(JSON.parse(sessionStorage.getItem(sessionKey)!).idempotencyKey).toBe(key);
  } finally {
    vi.useRealTimers();
  }
});

it("S4 a public orphan session is not released locally either", () => {
  prepareAttempt(contact, lines, { channel: "public" });
  localStorage.removeItem(localKey);
  const before = bytes();
  expect(canResolveAttemptLocally(getStoredAttemptStatus())).toBe(false);
  expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), true)).toBe(false);
  expect(bytes()).toEqual(before);
});

/**
 * S4 (verificación de estados definitivos) · Un rechazo DEFINITIVO sin
 * pedido creado en el servidor (`validation`, 400/403) sigue siendo liberable:
 * el cliente no puede quedar atrapado por un rechazo que no creó nada.
 */
it("S7 un rechazo definitivo sin pedido creado (validation) se libera localmente", () => {
  prepareAttempt(contact, lines, { channel: "public" });
  updateAttempt(lines, { orderId: null, status: "validation" });
  expect(canResolveAttemptLocally(getStoredAttemptStatus())).toBe(true);
  expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), false)).toBe(true);
  expect(bytes()).toEqual([null, null]);
});

it("S7 an already confirmed public order is released without extra confirmation", () => {  prepareAttempt(contact, lines, { channel: "public" });
  updateAttempt(lines, { orderId: "ord-1", status: "completed", completed: true });
  expect(canResolveAttemptLocally(getStoredAttemptStatus())).toBe(true);
  expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), false)).toBe(true);
  expect(bytes()).toEqual([null, null]);
});

it("S7 un rechazo definitivo (validation) sigue resoluble tras la ventana de retención", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(T0);
    prepareAttempt(contact, lines, { channel: "public" });
    updateAttempt(lines, { orderId: null, status: "validation" });
    vi.setSystemTime(T0 + 48 * 3600_000);
    const status = getStoredAttemptStatus();
    expect(status.kind).toBe("expired");
    /* Vencido no es incierto: el rechazo está confirmado por el servidor. */
    expect(canResolveAttemptLocally(status)).toBe(true);
    expect(resolveAttemptForNewPurchase(status, true)).toBe(true);
    expect(bytes()).toEqual([null, null]);
  } finally {
    vi.useRealTimers();
  }
});

/**
 * S1/S5 · Un pedido de distribuidor DEFINITIVAMENTE RECHAZADO sin pedido
 * creado (validation) se resuelve sin confirmación adicional.
 */
it("S1/S5 un pedido de distribuidor rechazado sin pedido creado (validation) se resuelve", () => {
  prepareAttempt(contact, lines, { channel: "distributor" });
  updateAttempt(lines, { status: "validation", orderId: null });
  expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), false)).toBe(true);
  expect(bytes()).toEqual([null, null]);
});

/* ══════════════════════════════════════════════════════════════════════
 * S4 · Verificación de estados definitivos.
 *
 * La liberación local exige evidencia de que NO queda un pedido pendiente en
 * el servidor:
 *
 *   completed  → el pedido está confirmado y se resuelve solo.
 *   validation → el servidor rechaza ANTES de crear el pedido.
 *   failed     → 502 con orderId: el pedido EXISTE, persiste hasta 7 días y
 *                el cliente puede haber recibido YA el correo de aviso.
 *   conflict   → 409: puede haber un pedido anterior con la misma clave y el
 *                cuerpo de la respuesta no lo demuestra ni lo desmiente.
 *
 * `failed` y `conflict` NO se liberan en ningún canal: liberarlos borra la
 * única traza local de un pedido que puede existir en el servidor.
 * ══════════════════════════════════════════════════════════════════════ */

it.each(["completed", "validation"] as const)(
  "S4 un resultado %s concede la liberación local",
  (result) => {
    prepareAttempt(contact, lines, { channel: "public" });
    updateAttempt(lines, {
      orderId: result === "completed" ? "ord-1" : null,
      status: result,
      completed: result === "completed",
    });
    expect(canResolveAttemptLocally(getStoredAttemptStatus())).toBe(true);
  },
);

it.each(["failed", "conflict"] as const)(
  "S4 un resultado %s NO concede la liberación local (vigente)",
  (result) => {
    prepareAttempt(contact, lines, { channel: "public" });
    updateAttempt(lines, { orderId: result === "failed" ? "fail-1" : null, status: result });
    expect(canResolveAttemptLocally(getStoredAttemptStatus())).toBe(false);
  },
);

it.each(["failed", "conflict"] as const)(
  "S4 un resultado %s NO concede la liberación local (vencido)",
  (result) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(T0);
      prepareAttempt(contact, lines, { channel: "public" });
      updateAttempt(lines, { orderId: result === "failed" ? "fail-1" : null, status: result });
      vi.setSystemTime(T0 + 48 * 3600_000);
      const observed = getStoredAttemptStatus();
      expect(observed.kind).toBe("expired");
      expect(canResolveAttemptLocally(observed)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  },
);

it.each(["accepted", "processing"] as const)(
  "S4 un resultado incierto %s sigue sin liberarse",
  (result) => {
    prepareAttempt(contact, lines, { channel: "public" });
    updateAttempt(lines, { orderId: "ord-incierto", status: result });
    expect(canResolveAttemptLocally(getStoredAttemptStatus())).toBe(false);
    expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), true)).toBe(false);
  },
);

/**
 * S4 · El registro de un pedido que el servidor conservó NO se borra: ni
 * siquiera con la afirmación del usuario, porque no existe una conciliación
 * verificable desde el frontend.
 */
it.each(["failed", "conflict"] as const)(
  "S4 el registro %s no se borra ni se libera, ni con confirmedUncertain=true",
  (result) => {
    prepareAttempt(contact, lines, { channel: "public" });
    updateAttempt(lines, { orderId: result === "failed" ? "fail-1" : null, status: result });
    const before = bytes();
    const uuid = vi.spyOn(crypto, "randomUUID");
    try {
      expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), true)).toBe(false);
      expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), false)).toBe(false);
      expect(bytes()).toEqual(before);
      expect(uuid).not.toHaveBeenCalled();
    } finally {
      uuid.mockRestore();
    }
  },
);

it.each(["channel", "key"])("S4 does not clear a public marker paired with foreign session %s", (mismatch) => {
  prepareAttempt(contact, lines, { channel: "public" });
  const value = JSON.parse(sessionStorage.getItem(sessionKey)!);
  if (mismatch === "channel") value.channel = "distributor";
  else value.idempotencyKey = "22222222-2222-4222-8222-222222222222";
  sessionStorage.setItem(sessionKey, JSON.stringify(value));
  const before = bytes();
  expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), true)).toBe(false);
  expect(bytes()).toEqual(before);
});
