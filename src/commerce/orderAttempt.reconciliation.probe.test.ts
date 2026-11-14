/**
 * SONDA INDEPENDIENTE #2 — cierre del intento por conciliación
 * (src/commerce/orderAttempt.ts :: canCloseAttemptByReconciliation /
 * closeAttemptByReconciliation).
 *
 * Comprueba QUÉ se puede liberar y QUÉ queda intacto, con hash byte a byte
 * del almacenamiento antes/después de cada rechazo.
 *
 * Regla vigente:
 *  · `RECEIVED` (RealStep confirmó la recepción) cierra CUALQUIER estado del
 *    intento DISTRIBUIDOR cuya referencia persistida sea EXACTA: no queda
 *    nada pendiente en el servidor que pueda duplicarse, y la compra nueva
 *    es independiente.
 *  · `NOT_RECEIVED` no amplía ningún permiso: sólo cierra los estados
 *    INCIERTOS (`accepted`, `processing` o sin estado). `failed`, `conflict`,
 *    `validation` y `completed` siguen bloqueados.
 *  · Con NINGUNA decisión se cierra: el canal público, un registro heredado
 *    sin canal, otra referencia, un marcador ausente o inválido, o un
 *    marcador que cambió entre la consulta y el clic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canCloseAttemptByReconciliation,
  closeAttemptByReconciliation,
  type ReconciliationDecision,
} from "./orderAttempt";
import { getAttemptContext, rememberAttemptContext } from "./orderAttemptContext";

const LOCAL_KEY = "starvie-order-attempt-v2";
const SESSION_KEY = "starvie-order-attempt-v2-session";
const REF = "0df502b3-51aa-461d-a1b6-19363712c567";
const OTHER_REF = "11111111-2222-4333-8444-555555555555";

/** Decisiones administrativas del backend. */
const DECISIONS: ReconciliationDecision[] = ["RECEIVED", "NOT_RECEIVED"];

/** Estados persistidos de un intento (incluido "sin estado"). */
const ALL_STATUSES: Array<string | null> = [
  "accepted",
  "processing",
  "failed",
  "conflict",
  "validation",
  "completed",
  null,
];

/** Estados INCIERTOS: los únicos que `NOT_RECEIVED` puede cerrar. */
const UNCERTAIN_STATUSES: Array<string | null> = ["accepted", "processing", null];

function hashStorage(): string {
  const raw = [
    localStorage.getItem(LOCAL_KEY) ?? "",
    sessionStorage.getItem(SESSION_KEY) ?? "",
  ].join("|");
  /* Compara los bytes crudos: sin dependencias de Node. */
  return raw;
}

type Seed = {
  reference?: string;
  /** `undefined` ⇒ "accepted"; `null` ⇒ el registro no tiene campo status. */
  status?: string | null;
  channel?: string | undefined;
  createdAt?: string;
};

function seed(seedOptions: Seed = {}): void {
  const reference = seedOptions.reference ?? REF;
  const status = seedOptions.status === undefined ? "accepted" : seedOptions.status;
  const channel = seedOptions.channel;
  const createdAt = seedOptions.createdAt ?? new Date().toISOString();
  const lines = [{ productId: "raptor+", qty: 2 }];
  const marker: Record<string, unknown> = {
    version: "v2", idempotencyKey: reference, orderId: null, lines, createdAt,
  };
  if (status !== null) marker.status = status;
  if (channel !== undefined) marker.channel = channel;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(marker));
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    ...marker,
    contact: { name: "Cliente", legalName: "Empresa", email: "cliente@example.test" },
  }));
}

/** Marcador corrupto: el registro NO es válido (fail closed). */
function seedInvalidMarker(): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ version: "v1", idempotencyKey: REF }));
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    version: "v1",
    idempotencyKey: REF,
    contact: { name: "Cliente", legalName: "Empresa", email: "cliente@example.test" },
  }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("P2 · RECEIVED cierra cualquier estado del intento distribuidor", () => {
  it("P2.1 intento incierto del canal distribuidor + referencia EXACTA => se cierra", () => {
    seed({ status: "accepted", channel: "distributor" });
    rememberAttemptContext(REF, { channel: "distributor", distributorProof: { id: "A" } });
    expect(getAttemptContext(REF)).not.toBeNull();

    expect(closeAttemptByReconciliation(REF, "RECEIVED")).toBe(true);
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    /* La prueba viva se olvida: no habilita ningún reenvío posterior. */
    expect(getAttemptContext(REF)).toBeNull();
  });

  it("P2.2 también se cierra un intento 'processing' (estado incierto del servidor)", () => {
    seed({ status: "processing", channel: "distributor" });
    expect(closeAttemptByReconciliation(REF, "RECEIVED")).toBe(true);
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
  });

  it("P2.3 cierra un intento VENCIDO (la ventana de 24 h del backend ya pasó)", () => {
    seed({
      status: "accepted",
      channel: "distributor",
      createdAt: new Date(Date.now() - 25 * 3600_000).toISOString(),
    });
    expect(closeAttemptByReconciliation(REF, "RECEIVED")).toBe(true);
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
  });

  it("P2.4 'failed' SE cierra con RECEIVED (el servidor confirmó la recepción)", () => {
    seed({ status: "failed", channel: "distributor" });
    expect(closeAttemptByReconciliation(REF, "RECEIVED")).toBe(true);
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("P2.5 'conflict' SE cierra con RECEIVED (no queda nada pendiente por duplicar)", () => {
    seed({ status: "conflict", channel: "distributor" });
    expect(closeAttemptByReconciliation(REF, "RECEIVED")).toBe(true);
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("P2.6 'validation' SE cierra con RECEIVED", () => {
    seed({ status: "validation", channel: "distributor" });
    expect(closeAttemptByReconciliation(REF, "RECEIVED")).toBe(true);
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
  });

  it("P2.7 'completed' SE cierra con RECEIVED", () => {
    seed({ status: "completed", channel: "distributor" });
    expect(closeAttemptByReconciliation(REF, "RECEIVED")).toBe(true);
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
  });
});

describe("P2 · NOT_RECEIVED sólo cierra los estados inciertos", () => {
  for (const [label, status] of [
    ["accepted", "accepted"],
    ["processing", "processing"],
    ["sin estado persistido", null],
  ] as Array<[string, string | null]>) {
    it(`P2.8 un intento '${label}' SE cierra con NOT_RECEIVED`, () => {
      seed({ status, channel: "distributor" });
      expect(closeAttemptByReconciliation(REF, "NOT_RECEIVED")).toBe(true);
      expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });
  }

  const rejected: Array<[string, Seed]> = [
    ["P2.9 failed (el servidor conserva el pedido)", { status: "failed", channel: "distributor" }],
    ["P2.10 conflict (409 no verificable)", { status: "conflict", channel: "distributor" }],
    ["P2.11 validation (rechazo previo a la creación)", { status: "validation", channel: "distributor" }],
    ["P2.12 completed (ya confirmado)", { status: "completed", channel: "distributor" }],
    ["P2.13 canal público", { status: "accepted", channel: "public" }],
    ["P2.14 registro heredado sin canal", { status: "accepted" }],
  ];
  for (const [label, seedOptions] of rejected) {
    it(`${label} => false con NOT_RECEIVED y el almacenamiento no cambia`, () => {
      seed(seedOptions);
      const before = hashStorage();
      expect(closeAttemptByReconciliation(REF, "NOT_RECEIVED")).toBe(false);
      expect(hashStorage()).toBe(before);
      expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
    });
  }

  it("P2.15 otra referencia NO libera este intento con NOT_RECEIVED", () => {
    seed({ status: "accepted", channel: "distributor" });
    const before = hashStorage();
    expect(closeAttemptByReconciliation(OTHER_REF, "NOT_RECEIVED")).toBe(false);
    expect(hashStorage()).toBe(before);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey).toBe(REF);
  });
});

describe("P2 · lo que NUNCA se puede cerrar (y el storage queda byte a byte igual)", () => {
  it("P2.16 el canal público no se cierra con NINGUNA decisión", () => {
    for (const decision of DECISIONS) {
      seed({ status: "accepted", channel: "public" });
      const before = hashStorage();
      expect(closeAttemptByReconciliation(REF, decision)).toBe(false);
      expect(hashStorage()).toBe(before);
      expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
    }
  });

  it("P2.17 un registro heredado sin canal no se cierra con NINGUNA decisión", () => {
    for (const decision of DECISIONS) {
      seed({ status: "accepted" });
      const before = hashStorage();
      expect(closeAttemptByReconciliation(REF, decision)).toBe(false);
      expect(hashStorage()).toBe(before);
      expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull();
    }
  });

  it("P2.18 otra referencia no libera este intento con NINGUNA decisión", () => {
    for (const decision of DECISIONS) {
      seed({ status: "failed", channel: "distributor" });
      const before = hashStorage();
      expect(closeAttemptByReconciliation(OTHER_REF, decision)).toBe(false);
      expect(hashStorage()).toBe(before);
      expect(JSON.parse(localStorage.getItem(LOCAL_KEY)!).idempotencyKey).toBe(REF);
    }
  });

  it("P2.19 referencia vacía o en blanco => false, sin cambios", () => {
    for (const decision of DECISIONS) {
      seed({ status: "accepted", channel: "distributor" });
      const before = hashStorage();
      expect(closeAttemptByReconciliation("", decision)).toBe(false);
      expect(closeAttemptByReconciliation("   ", decision)).toBe(false);
      expect(hashStorage()).toBe(before);
    }
  });

  it("P2.20 sin intento persistido => false", () => {
    for (const decision of DECISIONS) {
      expect(closeAttemptByReconciliation(REF, decision)).toBe(false);
    }
  });

  it("P2.21 un marcador INVÁLIDO no se cierra con NINGUNA decisión", () => {
    for (const decision of DECISIONS) {
      seedInvalidMarker();
      const before = hashStorage();
      expect(closeAttemptByReconciliation(REF, decision)).toBe(false);
      expect(hashStorage()).toBe(before);
    }
  });

  it("P2.22 si el marcador cambió entre la consulta y el clic, no se borra nada", () => {
    seed({ status: "failed", channel: "distributor" });
    const original = localStorage.getItem(LOCAL_KEY)!;
    const mutated = JSON.stringify({
      ...JSON.parse(original),
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    let calls = 0;
    const removals: string[] = [];
    const proxy = {
      getItem: (name: string) => {
        if (name !== LOCAL_KEY) return localStorage.getItem(name);
        calls += 1;
        /* 1: originalRaw, 2: lectura del estado, 3: lectura posterior. */
        return calls >= 3 ? mutated : localStorage.getItem(name);
      },
      setItem: (name: string, value: string) => localStorage.setItem(name, value),
      removeItem: (name: string) => { removals.push(name); localStorage.removeItem(name); },
      clear: () => localStorage.clear(),
    } as unknown as Storage;

    expect(closeAttemptByReconciliation(REF, "RECEIVED", { storage: proxy })).toBe(false);
    expect(removals).toHaveLength(0);
    expect(localStorage.getItem(LOCAL_KEY)).toBe(original);
  });
});

describe("P2 · la conciliación no genera claves ni toca el historial", () => {
  it("P2.23 ni el cierre ni un rechazo invocan el generador de claves", () => {
    const uuid = vi.spyOn(globalThis.crypto, "randomUUID");
    seed({ status: "failed", channel: "distributor" });
    expect(closeAttemptByReconciliation(OTHER_REF, "RECEIVED")).toBe(false);
    expect(closeAttemptByReconciliation(REF, "RECEIVED")).toBe(true);
    expect(uuid).not.toHaveBeenCalled();
    /* Tras el cierre no queda ninguna clave persistida. */
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe("P2 · el predicado y la acción coinciden", () => {
  it("P2.24 canCloseAttemptByReconciliation coincide con closeAttemptByReconciliation en todos los estados y decisiones", () => {
    for (const decision of DECISIONS) {
      for (const status of ALL_STATUSES) {
        seed({ status, channel: "distributor" });
        const before = hashStorage();
        const canClose = canCloseAttemptByReconciliation(REF, decision);
        const closed = closeAttemptByReconciliation(REF, decision);
        expect(closed).toBe(canClose);
        if (canClose) {
          expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
          expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
        } else {
          /* Un rechazo NO toca el almacenamiento: byte a byte igual. */
          expect(hashStorage()).toBe(before);
        }
      }
    }
  });

  it("P2.25 el predicado refleja la regla: RECEIVED cierra todo, NOT_RECEIVED sólo lo incierto", () => {
    for (const status of ALL_STATUSES) {
      seed({ status, channel: "distributor" });
      const received = canCloseAttemptByReconciliation(REF, "RECEIVED");
      const notReceived = canCloseAttemptByReconciliation(REF, "NOT_RECEIVED");
      expect(received).toBe(true);
      expect(notReceived).toBe(UNCERTAIN_STATUSES.includes(status));
    }
  });
});
