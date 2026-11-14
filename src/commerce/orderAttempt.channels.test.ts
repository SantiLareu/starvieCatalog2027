/**
 * S4 · Aislamiento por canal de los intentos de pedido.
 *
 * Cada canal tiene su PROPIO compartmento de almacenamiento:
 *
 *   público      → "starvie-order-attempt-v2" / "…-v2-session"
 *   distributor → "starvie-order-attempt-v2-distributor" /
 *                  "…-v2-distributor-session"
 *
 * Reglas que se comprueban acá:
 *  - un intento pendiente del DISTRIBUIDOR no bloquea una compra pública
 *    nueva del mismo navegador y la compra pública no borra ni libera el
 *    registro del distributor (referencia, clave y estado sobreviven);
 *  - ningún canal reutiliza el intento del otro (la clave de idempotencia
 *    nunca viaja de un canal al otro);
 *  - cambiar de canal (distributor → público → distributor) no pierde
 *    ningún intento;
 *  - los registros heredados (persistidos SIN el campo `channel`, en el
 *    compartmento público) se reenvían como los reutilizaba origin/main y
 *    el canal distributor nunca los adopta ni los borra.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAttempt,
  finalizeCompletedAttempt,
  getAttempt,
  getAttemptSession,
  getStoredAttemptStatus,
  prepareAttempt,
  updateAttempt,
} from "./orderAttempt";

const PUBLIC_LOCAL = "starvie-order-attempt-v2";
const PUBLIC_SESSION = "starvie-order-attempt-v2-session";
const DIST_LOCAL = "starvie-order-attempt-v2-distributor";
const DIST_SESSION = "starvie-order-attempt-v2-distributor-session";

const contact = {
  name: "Ana Test",
  legalName: "StarVie Test SA",
  email: "ana@example.com",
};
const lines = [{ productId: "raptor+", qty: 2 }];

function keyOf(storage: Storage, key: string): string | null {
  const raw = storage.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as { idempotencyKey: string }).idempotencyKey;
}

function bytes(): (string | null)[] {
  return [
    localStorage.getItem(PUBLIC_LOCAL),
    localStorage.getItem(DIST_LOCAL),
    sessionStorage.getItem(PUBLIC_SESSION),
    sessionStorage.getItem(DIST_SESSION),
  ];
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("S4 · compartmentos por canal", () => {
  it("el canal público conserva las claves históricas de origin/main", () => {
    const prepared = prepareAttempt(contact, lines, { channel: "public" });
    expect(prepared).not.toBe(false);
    expect(localStorage.getItem(PUBLIC_LOCAL)).not.toBeNull();
    expect(sessionStorage.getItem(PUBLIC_SESSION)).not.toBeNull();
    expect(localStorage.getItem(DIST_LOCAL)).toBeNull();
    expect(sessionStorage.getItem(DIST_SESSION)).toBeNull();
  });

  it("el canal distributor usa su propio compartmento", () => {
    const prepared = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(prepared).not.toBe(false);
    expect(localStorage.getItem(DIST_LOCAL)).not.toBeNull();
    expect(sessionStorage.getItem(DIST_SESSION)).not.toBeNull();
    expect(localStorage.getItem(PUBLIC_LOCAL)).toBeNull();
    expect(sessionStorage.getItem(PUBLIC_SESSION)).toBeNull();
  });

  it("un intento pendiente del distributor NO bloquea una compra pública nueva", () => {
    const distributor = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(distributor).not.toBe(false);
    const before = bytes();

    const publico = prepareAttempt(contact, lines, { channel: "public" });
    expect(publico).not.toBe(false);
    /* La compra pública es INDEPENDIENTE: su propia clave. */
    expect((publico as { idempotencyKey: string }).idempotencyKey).not.toBe(
      (distributor as { idempotencyKey: string }).idempotencyKey,
    );
    /* Y el registro del distributor sobrevive intacto. */
    expect(localStorage.getItem(DIST_LOCAL)).toBe(before[1]);
    expect(sessionStorage.getItem(DIST_SESSION)).toBe(before[3]);
    expect(keyOf(localStorage, DIST_LOCAL)).toBe(
      (distributor as { idempotencyKey: string }).idempotencyKey,
    );
  });

  it("el canal distributor NUNCA reutiliza un intento público", () => {
    const publico = prepareAttempt(contact, lines, { channel: "public" });
    expect(publico).not.toBe(false);
    const before = bytes();

    const distributor = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(distributor).not.toBe(false);
    expect((distributor as { idempotencyKey: string }).idempotencyKey).not.toBe(
      (publico as { idempotencyKey: string }).idempotencyKey,
    );
    /* El registro público no se toca. */
    expect(localStorage.getItem(PUBLIC_LOCAL)).toBe(before[0]);
    expect(sessionStorage.getItem(PUBLIC_SESSION)).toBe(before[2]);
  });

  it("el canal público NUNCA reutiliza un intento distributor", () => {
    const distributor = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(distributor).not.toBe(false);
    const before = bytes();

    const publico = prepareAttempt(contact, lines, { channel: "public" });
    expect(publico).not.toBe(false);
    expect((publico as { idempotencyKey: string }).idempotencyKey).not.toBe(
      (distributor as { idempotencyKey: string }).idempotencyKey,
    );
    expect(localStorage.getItem(DIST_LOCAL)).toBe(before[1]);
    expect(sessionStorage.getItem(DIST_SESSION)).toBe(before[3]);
  });

  it("cambiar de canal (distributor → público → distributor) no pierde ningún intento", () => {
    const distributor = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(distributor).not.toBe(false);
    const distKey = (distributor as { idempotencyKey: string }).idempotencyKey;
    updateAttempt(lines, { channel: "distributor", orderId: "ord-dist", status: "accepted" });

    const publico = prepareAttempt(contact, lines, { channel: "public" });
    expect(publico).not.toBe(false);
    const publicKey = (publico as { idempotencyKey: string }).idempotencyKey;

    /* Vuelta al canal distributor: su intento sigue ahí, con su estado. */
    const reuso = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(reuso).not.toBe(false);
    expect((reuso as { idempotencyKey: string }).idempotencyKey).toBe(distKey);
    expect(getAttempt({ channel: "distributor" })?.status).toBe("accepted");
    expect(getAttempt({ channel: "distributor" })?.orderId).toBe("ord-dist");
    /* Y el público conserva el suyo. */
    expect(getAttempt({ channel: "public" })?.idempotencyKey).toBe(publicKey);
  });

  it("limpiar el intento de un canal no borra el registro del otro", () => {
    const distributor = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(distributor).not.toBe(false);
    const distKey = (distributor as { idempotencyKey: string }).idempotencyKey;

    prepareAttempt(contact, lines, { channel: "public" });
    clearAttempt({ channel: "public" });

    expect(localStorage.getItem(PUBLIC_LOCAL)).toBeNull();
    expect(sessionStorage.getItem(PUBLIC_SESSION)).toBeNull();
    expect(keyOf(localStorage, DIST_LOCAL)).toBe(distKey);
    expect(getAttemptSession({ channel: "distributor" })?.idempotencyKey).toBe(distKey);
  });

  it("finalizar un pedido público no toca el intento del distributor", () => {
    const distributor = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(distributor).not.toBe(false);
    const distKey = (distributor as { idempotencyKey: string }).idempotencyKey;

    const publico = prepareAttempt(contact, lines, { channel: "public" });
    expect(publico).not.toBe(false);
    const publicKey = (publico as { idempotencyKey: string }).idempotencyKey;
    updateAttempt(lines, { channel: "public", orderId: "ord-public", status: "completed", completed: true });

    expect(finalizeCompletedAttempt(publicKey, "ord-public", { channel: "public" })).toBe(true);
    expect(localStorage.getItem(PUBLIC_LOCAL)).toBeNull();
    /* El registro del distributor sigue intacto. */
    expect(keyOf(localStorage, DIST_LOCAL)).toBe(distKey);
  });
});

describe("S4 · registros heredados (sin canal)", () => {
  const LEGACY_KEY = "11111111-1111-4111-8111-111111111111";

  function seedLegacy(): void {
    const createdAt = new Date().toISOString();
    localStorage.setItem(PUBLIC_LOCAL, JSON.stringify({
      version: "v2",
      idempotencyKey: LEGACY_KEY,
      orderId: null,
      lines,
      createdAt,
    }));
    sessionStorage.setItem(PUBLIC_SESSION, JSON.stringify({
      version: "v2",
      idempotencyKey: LEGACY_KEY,
      orderId: null,
      contact,
      lines,
      createdAt,
    }));
  }

  it("el canal público lo reenvía con su MISMA clave (como origin/main)", () => {
    seedLegacy();
    const reutilizado = prepareAttempt(contact, lines, { channel: "public" });
    expect(reutilizado).not.toBe(false);
    expect((reutilizado as { idempotencyKey: string }).idempotencyKey).toBe(LEGACY_KEY);
  });

  it("el canal distributor NUNCA lo adopta ni lo borra", () => {
    seedLegacy();
    const before = bytes();

    const distributor = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(distributor).not.toBe(false);
    expect((distributor as { idempotencyKey: string }).idempotencyKey).not.toBe(LEGACY_KEY);
    /* El registro heredado queda byte a byte igual. */
    expect(localStorage.getItem(PUBLIC_LOCAL)).toBe(before[0]);
    expect(sessionStorage.getItem(PUBLIC_SESSION)).toBe(before[2]);
  });

  it("un registro SIN atribución en el compartmento del distributor no se adopta", () => {
    const createdAt = new Date().toISOString();
    localStorage.setItem(DIST_LOCAL, JSON.stringify({
      version: "v2",
      idempotencyKey: LEGACY_KEY,
      orderId: null,
      lines,
      createdAt,
    }));
    sessionStorage.setItem(DIST_SESSION, JSON.stringify({
      version: "v2",
      idempotencyKey: LEGACY_KEY,
      orderId: null,
      contact,
      lines,
      createdAt,
    }));

    expect(prepareAttempt(contact, lines, { channel: "distributor" })).toBe(false);
    /* El registro se conserva: no se adivina ni se borra. */
    expect(getStoredAttemptStatus({ channel: "distributor" }).kind).toBe("valid");
    expect(keyOf(localStorage, DIST_LOCAL)).toBe(LEGACY_KEY);
  });
});
