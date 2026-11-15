/**
 * Propiedad de atribución del intento de pedido (HALLAZGO 2 y HALLAZGO 3).
 *
 *  - Todo intento NUEVO escribe su canal: el canal público nunca escribe en
 *    las claves del distribuidor ni al revés.
 *  - Un registro SIN atribución (`channel` ausente) es un registro heredado
 *    de un pedido PÚBLICO anterior al sistema de distribuidores: el canal
 *    público lo reutiliza como lo reutilizaba origin/main y el canal
 *    distribuidor nunca lo adopta ni lo borra.
 *  - Un registro ATRIBUIDO al distribuidor (incluso si alguien lo deja en las
 *    claves públicas) NUNCA lo adopta ni lo libera el canal público: su
 *    clave y su pedido pertenecen al otro canal y reenviarlos allí los
 *    duplicaría.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getStoredAttemptStatus,
  prepareAttempt,
  resolveAttemptForNewPurchase,
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

function snapshot(): (string | null)[] {
  return [
    localStorage.getItem(PUBLIC_LOCAL),
    localStorage.getItem(DIST_LOCAL),
    sessionStorage.getItem(PUBLIC_SESSION),
    sessionStorage.getItem(DIST_SESSION),
  ];
}

/** Siembra en las claves PÚBLICAS un registro atribuido al distribuidor. */
function seedDistributorRecordInPublicSlot(): string {
  const key = "11111111-1111-4111-8111-111111111111";
  const marker = {
    version: "v2",
    idempotencyKey: key,
    orderId: null,
    lines,
    createdAt: new Date().toISOString(),
    status: "accepted",
    channel: "distributor",
  };
  localStorage.setItem(PUBLIC_LOCAL, JSON.stringify(marker));
  sessionStorage.setItem(PUBLIC_SESSION, JSON.stringify({ ...marker, contact }));
  return key;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("atribución del intento de pedido", () => {
  it("todo intento nuevo escribe su canal y no toca las claves del otro canal", () => {
    const publicPrepared = prepareAttempt(contact, lines, { channel: "public" });
    expect(publicPrepared).not.toBe(false);
    expect(
      (JSON.parse(localStorage.getItem(PUBLIC_LOCAL)!) as { channel?: string }).channel,
    ).toBe("public");
    expect(localStorage.getItem(DIST_LOCAL)).toBeNull();
    expect(sessionStorage.getItem(DIST_SESSION)).toBeNull();

    localStorage.clear();
    sessionStorage.clear();

    const distributorPrepared = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(distributorPrepared).not.toBe(false);
    expect(
      (JSON.parse(localStorage.getItem(DIST_LOCAL)!) as { channel?: string }).channel,
    ).toBe("distributor");
    expect(localStorage.getItem(PUBLIC_LOCAL)).toBeNull();
    expect(sessionStorage.getItem(PUBLIC_SESSION)).toBeNull();
  });

  it("el canal público NO adopta un registro atribuido al distribuidor", () => {
    const key = seedDistributorRecordInPublicSlot();
    const before = snapshot();
    expect(prepareAttempt(contact, lines, { channel: "public" })).toBe(false);
    /* El registro ajeno sobrevive intacto: ni se borra ni se reescribe. */
    expect(snapshot()).toEqual(before);
    expect(
      (JSON.parse(localStorage.getItem(PUBLIC_LOCAL)!) as { idempotencyKey: string })
        .idempotencyKey,
    ).toBe(key);
  });

  it("el canal público NO libera un registro atribuido al distribuidor", () => {
    seedDistributorRecordInPublicSlot();
    const before = snapshot();
    const status = getStoredAttemptStatus({ channel: "public" });
    expect(status.kind).toBe("valid");
    expect(resolveAttemptForNewPurchase(status, true, { channel: "public" })).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it("un registro heredado SIN canal sí lo adopta el canal público (origin/main)", () => {
    const key = "22222222-2222-4222-8222-222222222222";
    const marker = {
      version: "v2",
      idempotencyKey: key,
      orderId: null,
      lines,
      createdAt: new Date().toISOString(),
      status: "accepted",
    };
    localStorage.setItem(PUBLIC_LOCAL, JSON.stringify(marker));
    sessionStorage.setItem(PUBLIC_SESSION, JSON.stringify({ ...marker, contact }));
    const prepared = prepareAttempt(contact, lines, { channel: "public" });
    expect(prepared).not.toBe(false);
    expect(
      (prepared as { idempotencyKey: string }).idempotencyKey,
    ).toBe(key);
    /* El canal distribuidor no lo adopta ni lo borra. */
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(PUBLIC_LOCAL, JSON.stringify(marker));
    sessionStorage.setItem(PUBLIC_SESSION, JSON.stringify({ ...marker, contact }));
    expect(prepareAttempt(contact, lines, { channel: "distributor" })).not.toBe(false);
    expect(
      (JSON.parse(localStorage.getItem(PUBLIC_LOCAL)!) as { idempotencyKey: string })
        .idempotencyKey,
    ).toBe(key);
  });
});
