/**
 * Guards de atribución del intento de pedido (canal + huella de sesión).
 *
 * Cubre el contrato de S3/S4/S5:
 *  - El canal (público/distribuidor) queda escrito en AMBOS registros
 *    (marcador en localStorage + sesión en sessionStorage) y es inmutable.
 *  - Cada canal tiene su propio compartmento de almacenamiento: una clave
 *    nunca viaja de un canal al otro.
 *  - Un registro heredado (sin canal) se conserva pero no se reenvía.
 *  - El canal distribuidor exige la MISMA prueba de sesión (el
 *    identificador opaco del backend: estable frente a una revalidación
 *    inocua, distinto ante otra cuenta): el canal público no depende de una
 *    sesión y sobrevive a una recarga.
 *  - La atribución es metadata local: nunca viaja en el cuerpo del pedido.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAttempt,
  getAttempt,
  getAttemptSession,
  getStoredAttemptStatus,
  prepareAttempt,
  updateAttempt,
  updateAttemptSession,
} from "./orderAttempt";
import {
  attemptContextAllowsRetry,
  forgetAttemptContext,
  getAttemptContext,
  rememberAttemptContext,
} from "./orderAttemptContext";
import { buildOrderPayload, type OrderPayload } from "./orders";
import type { PresentedLine } from "./types";

const LOCAL_KEY = "starvie-order-attempt-v2";
const SESSION_KEY = "starvie-order-attempt-v2-session";
const DIST_LOCAL_KEY = "starvie-order-attempt-v2-distributor";
const DIST_SESSION_KEY = "starvie-order-attempt-v2-distributor-session";

const contact = {
  name: "Ana Test",
  legalName: "StarVie Test SA",
  email: "ana@example.com",
};
const lines = [{ productId: "raptor+", qty: 2 }];

const product = {
  id: "raptor+",
  sku: "PSTRP41000",
  nombre: "Raptor+",
  categoria: "palas",
  subcategoria: "super-pro",
  precio: 500,
  disponible: true,
  imagenes: [],
  gama: "",
  tipoJuego: "",
  forma: "",
  plano: "",
  peso: "",
  balance: "",
  ean: "",
  pagina: 17,
};
const presented: PresentedLine[] = [
  { line: { productId: "raptor+", qty: 2 }, product: product as never, subtotal: 1000 },
];

function rawMarker(extra: Record<string, unknown> = {}, createdAt: string) {
  return JSON.stringify({
    version: "v2",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    orderId: null,
    lines,
    createdAt,
    ...extra,
  });
}
function rawSession(extra: Record<string, unknown> = {}, createdAt: string) {
  return JSON.stringify({
    version: "v2",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    orderId: null,
    contact,
    lines,
    createdAt,
    ...extra,
  });
}

/* Clave y pruebas exclusivas de las regresiones independientes. */
const VERIFIER_KEY = "verifier-immutable";
/* Pruebas de continuidad: el IDENTIFICADOR OPACO DE SESIÓN que devuelve el
   backend. La misma sesión revalidada produce el MISMO identificador; otra
   cuenta, otro identificador. */
const VERIFIER_PROOF_A = "Zk3vJ8xQ1nT5pR7wY2bA";
const VERIFIER_PROOF_B = "Q7wY2bA0Zk3vJ8xQ1nT5pR";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  forgetAttemptContext(VERIFIER_KEY);
});

describe("atribución de canal del intento", () => {
  it("el canal queda escrito en el marcador y en la sesión", () => {
    const prepared = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(prepared).not.toBe(false);

    const marker = JSON.parse(localStorage.getItem(DIST_LOCAL_KEY)!);
    const session = JSON.parse(sessionStorage.getItem(DIST_SESSION_KEY)!);
    expect(marker.channel).toBe("distributor");
    expect(session.channel).toBe("distributor");
    expect(marker.idempotencyKey).toBe(session.idempotencyKey);
  });

  it("el canal es inmutable: las actualizaciones no lo reescriben", () => {
    prepareAttempt(contact, lines, { channel: "public" });
    updateAttempt(lines, { orderId: "ord-1", status: "processing" });
    updateAttemptSession("ord-1");

    expect(getAttempt()?.channel).toBe("public");
    expect(getAttemptSession()?.channel).toBe("public");
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)!).channel).toBe("public");
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).channel).toBe("public");
  });

  it("una clave creada en un canal no se reutiliza en el otro", () => {
    const prepared = prepareAttempt(contact, lines, { channel: "public" });
    expect(prepared).not.toBe(false);
    const publico = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(publico).not.toBe(false);
    /* Cada canal tiene su propia clave: la del público nunca viaja al
       distribuidor (ni al revés). */
    expect((publico as { idempotencyKey: string }).idempotencyKey).not.toBe(
      (prepared as { idempotencyKey: string }).idempotencyKey,
    );
    /* El registro original queda intacto. */
    expect(getAttempt()?.channel).toBe("public");
    expect(getAttempt()?.idempotencyKey).toBe(
      (prepared as { idempotencyKey: string }).idempotencyKey,
    );
  });

  it("un registro heredado sin canal se reenvía en el canal público y no en el distribuidor", () => {
    const createdAt = new Date().toISOString();
    localStorage.setItem(LOCAL_KEY, rawMarker({}, createdAt));
    sessionStorage.setItem(SESSION_KEY, rawSession({}, createdAt));

    expect(getStoredAttemptStatus().kind).toBe("valid");
    /* El canal público conserva las reglas de origin/main: un registro
       heredado (sin canal) se reenvía con su MISMA clave. */
    const reused = prepareAttempt(contact, lines, { channel: "public" });
    expect(reused).not.toBe(false);
    expect((reused as { idempotencyKey: string }).idempotencyKey).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    /* El canal distribuidor exige su propio canal: no adopta el registro
       heredado (arranca el suyo, con su propia clave). */
    const distribuidor = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(distribuidor).not.toBe(false);
    expect((distribuidor as { idempotencyKey: string }).idempotencyKey).not.toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    /* No se adivina ni se borra: el registro queda exactamente como estaba. */
    expect(localStorage.getItem(LOCAL_KEY)).toBe(rawMarker({}, createdAt));
    expect(sessionStorage.getItem(SESSION_KEY)).toBe(rawSession({}, createdAt));
  });

  it("un canal desconocido invalida el registro (fail closed)", () => {
    localStorage.setItem(LOCAL_KEY, rawMarker({ channel: "mayorista" }, new Date().toISOString()));
    expect(getStoredAttemptStatus().kind).toBe("invalid");
  });

  it("la atribución es metadata local: no viaja en el cuerpo del pedido", () => {
    prepareAttempt(contact, lines, { channel: "distributor" });
    const payload = buildOrderPayload(presented, contact, "clave-de-prueba");
    expect(payload).not.toBeNull();
    const body = JSON.stringify(payload as OrderPayload);
    expect(body).not.toContain("channel");
    expect(body).not.toContain("distributor");
    expect(body).not.toContain("public");
  });
});

describe("prueba viva de sesión (canal distribuidor)", () => {
  it("el canal público se reenvía aunque no quede prueba en memoria", () => {
    expect(
      attemptContextAllowsRetry({
        idempotencyKey: "k-public",
        persistedChannel: "public",
        channel: "public",
        distributorProof: null,
      }),
    ).toBe(true);
  });

  it("el canal distribuidor exige la MISMA prueba de sesión", () => {
    const fingerprintA = "Zk3vJ8xQ1nT5pR7wY2bA";
    const fingerprintB = "Q7wY2bA0Zk3vJ8xQ1nT5pR";
    rememberAttemptContext("k-dist", { channel: "distributor", distributorProof: fingerprintA });

    expect(
      attemptContextAllowsRetry({
        idempotencyKey: "k-dist",
        persistedChannel: "distributor",
        channel: "distributor",
        distributorProof: fingerprintA,
      }),
    ).toBe(true);
    /* Otra cuenta (otro identificador de sesión): no es la misma sesión,
       aunque comparta descuento y vencimiento. */
    expect(
      attemptContextAllowsRetry({
        idempotencyKey: "k-dist",
        persistedChannel: "distributor",
        channel: "distributor",
        distributorProof: fingerprintB,
      }),
    ).toBe(false);
    /* Sin prueba viva (recarga / cierre de sesión): conservador. */
    expect(
      attemptContextAllowsRetry({
        idempotencyKey: "k-dist",
        persistedChannel: "distributor",
        channel: "distributor",
        distributorProof: null,
      }),
    ).toBe(false);
  });

  it("S3 · una revalidación inocua de la MISMA sesión conserva el reenvío", () => {
    /* La revalidación (montaje, foco, visibilidad, temporizador) construye
       un objeto de autenticación NUEVO con el MISMO identificador de
       sesión: la prueba no cambia y el intento sigue siendo reenviable,
       liberable y conciliable. */
    const fingerprint = "Zk3vJ8xQ1nT5pR7wY2bA";
    rememberAttemptContext("k-reval", { channel: "distributor", distributorProof: fingerprint });

    const revalidated = {
      status: "authenticated" as const,
      discountPercent: 20,
      expiresAt: "2026-11-11T20:00:00.000Z",
      sessionId: fingerprint,
    };
    const otroObjeto = { ...revalidated };
    /* El objeto es otro (la identidad cambió) pero el VALOR es el mismo. */
    expect(otroObjeto).not.toBe(revalidated);
    expect(otroObjeto).toEqual(revalidated);
    expect(
      attemptContextAllowsRetry({
        idempotencyKey: "k-reval",
        persistedChannel: "distributor",
        channel: "distributor",
        distributorProof: fingerprint,
      }),
    ).toBe(true);
  });

  it("S3 · la prueba de sesión NUNCA se persiste", () => {
    const fingerprint = "Zk3vJ8xQ1nT5pR7wY2bA";
    const prepared = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(prepared).not.toBe(false);
    const key = (prepared as { idempotencyKey: string }).idempotencyKey;
    rememberAttemptContext(key, { channel: "distributor", distributorProof: fingerprint });

    const dump = [
      ...Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.getItem(localStorage.key(index) ?? ""),
      ),
      ...Array.from({ length: sessionStorage.length }, (_, index) =>
        sessionStorage.getItem(sessionStorage.key(index) ?? ""),
      ),
    ].join("|");
    expect(dump).not.toContain(fingerprint);
    expect(dump).not.toContain("sessionId");
  });

  it("un registro sin canal no se reenvía por ningún canal", () => {
    rememberAttemptContext("k-legacy", {
      channel: "distributor",
      distributorProof: "Zk3vJ8xQ1nT5pR7wY2bA",
    });
    expect(
      attemptContextAllowsRetry({
        idempotencyKey: "k-legacy",
        persistedChannel: undefined,
        channel: "distributor",
        distributorProof: "Zk3vJ8xQ1nT5pR7wY2bA",
      }),
    ).toBe(false);
  });

  it("olvidar el contexto cierra la prueba viva de ese intento", () => {
    const proof = "Zk3vJ8xQ1nT5pR7wY2bA";
    rememberAttemptContext("k-1", { channel: "distributor", distributorProof: proof });
    expect(getAttemptContext("k-1")?.channel).toBe("distributor");
    forgetAttemptContext("k-1");
    expect(getAttemptContext("k-1")).toBeNull();
    expect(
      attemptContextAllowsRetry({
        idempotencyKey: "k-1",
        persistedChannel: "distributor",
        channel: "distributor",
        distributorProof: proof,
      }),
    ).toBe(false);
  });

  it("limpiar el intento olvida también su prueba viva", () => {
    const prepared = prepareAttempt(contact, lines, { channel: "distributor" });
    expect(prepared).not.toBe(false);
    const key = (prepared as { idempotencyKey: string }).idempotencyKey;
    rememberAttemptContext(key, {
      channel: "distributor",
      distributorProof: "Zk3vJ8xQ1nT5pR7wY2bA",
    });
    clearAttempt({ channel: "distributor" });
    expect(getAttemptContext(key)).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Regresiones independientes S3/S4 (especificación del verificador).
 * ══════════════════════════════════════════════════════════════════════ */
describe("regresiones independientes del vínculo en memoria", () => {
  const key = VERIFIER_KEY;
  const proofA = VERIFIER_PROOF_A;
  const proofB = VERIFIER_PROOF_B;
  function allows(proof: string | null) {
    return attemptContextAllowsRetry({
      idempotencyKey: key,
      persistedChannel: "distributor",
      channel: "distributor",
      distributorProof: proof,
    });
  }

  it("S3/S4 null is never authenticated continuity", () => {
    rememberAttemptContext(key, { channel: "distributor", distributorProof: null });
    expect(allows(null)).toBe(false);
  });

  it("S3 bound key cannot be rebound by remembering B", () => {
    rememberAttemptContext(key, { channel: "distributor", distributorProof: proofA });
    rememberAttemptContext(key, { channel: "distributor", distributorProof: proofB });
    expect.soft(allows(proofB)).toBe(false);
    expect(allows(proofA)).toBe(true);
  });

  it("S3 caller cannot mutate the original context into B", () => {
    const context = { channel: "distributor" as const, distributorProof: proofA };
    rememberAttemptContext(key, context);
    try { context.distributorProof = proofB; } catch { /* Freezing is acceptable. */ }
    expect.soft(allows(proofB)).toBe(false);
    expect(allows(proofA)).toBe(true);
  });

  it("S3 getter cannot mutate bound context into B", () => {
    rememberAttemptContext(key, { channel: "distributor", distributorProof: proofA });
    const context = getAttemptContext(key);
    if (context) { try { context.distributorProof = proofB; } catch { /* Freezing is acceptable. */ } }
    expect.soft(allows(proofB)).toBe(false);
    expect(allows(proofA)).toBe(true);
  });

  it("S3 rebound to null must not authorize absent proof", () => {
    rememberAttemptContext(key, { channel: "distributor", distributorProof: proofA });
    rememberAttemptContext(key, { channel: "distributor", distributorProof: null });
    expect.soft(allows(null)).toBe(false);
    expect(allows(proofA)).toBe(true);
  });
});
