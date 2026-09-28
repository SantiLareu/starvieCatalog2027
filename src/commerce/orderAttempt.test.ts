import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canRetryAttempt,
  clearAttempt,
  getAttempt,
  getAttemptSession,
  getStoredAttemptStatus,
  getStoredSessionPresence,
  hasPendingAttempt,
  hasStoredAttempt,
  isStoredAttemptExpired,
  prepareAttempt,
  resolveAttemptForNewPurchase,
  saveAttempt,
  saveAttemptSession,
  updateAttempt,
  updateAttemptSession,
  type OrderAttemptSnapshot,
  type OrderAttemptSession,
  type OrderAttemptStatus,
  type PreparedAttemptPayload,
} from "./orderAttempt";

/* ── helpers ───────────────────────────────────────────────────────── */
const fakeStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return undefined;
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
      return undefined;
    }),
  };
};

const fakeCartLines = () => [
  { productId: "raptor+", qty: 2 },
  { productId: "panga", qty: 1 },
];

const fakeContact = () => ({
  name: "Santiago Lareu",
  legalName: "StarVie Padel SAS",
  email: "santi@example.com",
  phone: "+54 9 11 1234 5678",
  province: "Buenos Aires",
  city: "La Plata",
  address: "Calle 123",
  cuit: "20-12345678-9",
  notes: "Llamar antes",
});

const fakeOrderId = "22222222-2222-4222-8222-222222222222";

/* ── Map-backed storage globals for "default storage" tests ──────────── */
const makeGlobalStore = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
};

const localStorageStore = makeGlobalStore();
const sessionStorageStore = makeGlobalStore();

vi.stubGlobal("localStorage", {
  getItem: localStorageStore.getItem,
  setItem: localStorageStore.setItem,
  removeItem: localStorageStore.removeItem,
  clear: localStorageStore.clear,
} as unknown as Storage);
vi.stubGlobal("sessionStorage", {
  getItem: sessionStorageStore.getItem,
  setItem: sessionStorageStore.setItem,
  removeItem: sessionStorageStore.removeItem,
  clear: sessionStorageStore.clear,
} as unknown as Storage);

afterEach(() => {
  localStorageStore.clear();
  sessionStorageStore.clear();
  vi.restoreAllMocks();
});

const LOCAL_KEY = "starvie-order-attempt-v2";
const SESSION_KEY = "starvie-order-attempt-v2-session";

/* ══════════════════════════════════════════════════════════════════════
 * prepareAttempt — atomic two-write gate
 * ══════════════════════════════════════════════════════════════════════ */
describe("prepareAttempt", () => {
  it("genera key y anchor, escribe session + marker atomicamente", () => {
    const result = prepareAttempt(fakeContact(), fakeCartLines());

    expect(result).not.toBe(false);
    const payload = result as PreparedAttemptPayload;
    expect(typeof payload.idempotencyKey).toBe("string");
    expect(payload.lines).toEqual(fakeCartLines());
    expect(payload.contact.name).toBe("Santiago Lareu");
    expect(payload.createdAt).toBeTruthy();
    expect(typeof payload.createdAt).toBe("string");

    /* Both storages have data with same anchor. */
    const session = JSON.parse(sessionStorageStore.getItem(SESSION_KEY)!);
    const marker = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(session.createdAt).toBe(payload.createdAt);
    expect(marker.createdAt).toBe(payload.createdAt);
    expect(session.idempotencyKey).toBe(payload.idempotencyKey);
    expect(marker.idempotencyKey).toBe(payload.idempotencyKey);
  });

  it("session no contiene token Turnstile", () => {
    prepareAttempt(fakeContact(), fakeCartLines());
    const session = JSON.parse(sessionStorageStore.getItem(SESSION_KEY)!);
    expect(session).not.toHaveProperty("turnstileToken");
  });

  it("marker no contiene PII", () => {
    prepareAttempt(fakeContact(), fakeCartLines());
    const marker = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    const piiFields = [
      "contact",
      "name",
      "legalName",
      "email",
      "phone",
      "province",
      "city",
      "address",
      "cuit",
      "notes",
      "fingerprint",
    ];
    for (const f of piiFields) {
      expect(marker).not.toHaveProperty(f);
    }
  });

  it("devuelve false con líneas vacías", () => {
    expect(prepareAttempt(fakeContact(), [])).toBe(false);
  });

  /* ── Valid existing marker: exact match (lines + required contact) ── */
  it("reusa key y anchor cuando existe marcador válido + sesión exacta", () => {
    /* Simulate prior attempt: write marker + session directly. */
    const priorKey = "11111111-1111-4111-8111-111111111111";
    const priorTime = new Date(Date.now() - 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );
    sessionStorageStore.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        contact: { ...fakeContact() },
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );

    const result = prepareAttempt(fakeContact(), fakeCartLines());
    expect(result).not.toBe(false);
    const payload = result as PreparedAttemptPayload;
    /* Same key, same anchor — no regeneration. */
    expect(payload.idempotencyKey).toBe(priorKey);
    expect(payload.createdAt).toBe(priorTime);
  });

  it("rechaza línea cambiada cuando existe marcador válido", () => {
    const priorKey = "11111111-1111-4111-8111-111111111111";
    const priorTime = new Date(Date.now() - 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );
    sessionStorageStore.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        contact: { ...fakeContact() },
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );

    /* Different line — reject. */
    expect(
      prepareAttempt(fakeContact(), [{ productId: "other", qty: 5 }]),
    ).toBe(false);
  });

  it("rechaza email cambiado cuando existe sesión", () => {
    const priorKey = "11111111-1111-4111-8111-111111111111";
    const priorTime = new Date(Date.now() - 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );
    sessionStorageStore.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        contact: { ...fakeContact() },
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );

    /* Different email — reject. */
    const diffContact = { ...fakeContact(), email: "other@example.com" };
    expect(prepareAttempt(diffContact, fakeCartLines())).toBe(false);
  });

  /* ── No session, valid marker: compare against marker ── */
  it("rechaza línea cambiada sin sesión pero con marcador", () => {
    const priorKey = "11111111-1111-4111-8111-111111111111";
    const priorTime = new Date(Date.now() - 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );

    expect(
      prepareAttempt(fakeContact(), [{ productId: "other", qty: 5 }]),
    ).toBe(false);
  });

  /* Note: when there's a valid marker but no session, we only check lines
   * (marker has no PII, so contact comparison is impossible). This is safe
   * because the same user context is assumed on page reload. */
  it("bloquea cuando existe marcador válido pero no hay sesión (mismo contacto y líneas)", () => {
    const priorKey = "11111111-1111-4111-8111-111111111111";
    const priorTime = new Date(Date.now() - 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );
    /* No sessionStorage — simulates browser restart or single-tab.
     * Even exact same payload is blocked because the session
     * (which carries the contact + key anchor) is missing.
     * The user must clear the marker first to create a new attempt. */
    const result = prepareAttempt(fakeContact(), fakeCartLines());
    expect(result).toBe(false);
    /* No new session created. */
    expect(sessionStorageStore.getItem(SESSION_KEY)).toBeNull();
    /* Marker still present — not deleted. */
    expect(localStorageStore.getItem(LOCAL_KEY)).toBeTruthy();
  });

  it("bloquea intento con mismo payload cuando existe marcador pero no sesión (browser restart)", () => {
    /* Valid marker exists in localStorage, no session (browser restart scenario).
     * Even with identical contact and lines, prepareAttempt returns false.
     * This enforces that the full OrderPayload session (SS) + marker (LS) are
     * an atomic unit — missing one means the attempt state is uncertain. */
    const priorKey = "22222222-2222-4222-8222-222222222222";
    const priorTime = new Date(Date.now() - 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );
    sessionStorageStore.clear();

    const result = prepareAttempt(fakeContact(), fakeCartLines());
    expect(result).toBe(false);
    /* No new key — session not created. */
    expect(sessionStorageStore.getItem(SESSION_KEY)).toBeNull();
  });

  /* ── Invalid / expired / unavailable marker: fail closed ── */
  it("fall closed si marcador es inválido (JSON corrupto)", () => {
    localStorageStore.setItem(LOCAL_KEY, "garbage");
    expect(prepareAttempt(fakeContact(), fakeCartLines())).toBe(false);
  });

  it("fall closed si marcador expiró — no se recrea", () => {
    const oldTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: oldTime,
      }),
    );
    expect(prepareAttempt(fakeContact(), fakeCartLines())).toBe(false);
    /* Marker still present */
    expect(localStorageStore.getItem(LOCAL_KEY)).toBeTruthy();
    /* Session not created */
    expect(sessionStorageStore.getItem(SESSION_KEY)).toBeNull();
  });

  it("fall closed si marcador tiene version inválida", () => {
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v1",
        idempotencyKey: "not-uuid",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: new Date().toISOString(),
      }),
    );
    expect(prepareAttempt(fakeContact(), fakeCartLines())).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * getStoredAttemptStatus — discriminated union
 * ══════════════════════════════════════════════════════════════════════ */
describe("getStoredAttemptStatus", () => {
  it("missing cuando no hay marcador", () => {
    expect(getStoredAttemptStatus()).toEqual({ kind: "missing" });
  });

  it("unavailable cuando storage no tiene getItem (null inyectado)", () => {
    /* Inject null storage — falls through to global, which exists in jsdom.
     * For a true unavailable test, the global itself must fail, or we
     * need storage that throws. Use the latter for reliability. */
    const broken = {
      getItem: () => {
        throw new DOMException("Permission denied", "SecurityError");
      },
      removeItem: () => {},
      setItem: () => {},
    };
    expect(
      getStoredAttemptStatus({
        storage: broken as unknown as Pick<Storage, "getItem">,
      }),
    ).toEqual({
      kind: "unavailable",
    });
  });

  it("unavailable cuando getItem throws", () => {
    const broken = {
      getItem: () => {
        throw new DOMException("Permission denied", "SecurityError");
      },
      removeItem: () => {},
      setItem: () => {},
    };
    expect(
      getStoredAttemptStatus({
        storage: broken as unknown as Pick<Storage, "getItem">,
      }),
    ).toEqual({
      kind: "unavailable",
    });
  });

  it("invalid cuando key existe pero JSON es corrupto", () => {
    localStorageStore.setItem(LOCAL_KEY, "corrupt-json");
    expect(getStoredAttemptStatus()).toEqual({ kind: "invalid" });
  });

  it("invalid cuando version no es v2", () => {
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v1",
        idempotencyKey: "bad",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: new Date().toISOString(),
      }),
    );
    expect(getStoredAttemptStatus()).toEqual({ kind: "invalid" });
  });

  it("invalid cuando idempotencyKey no es UUID", () => {
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "not-a-uuid",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: new Date().toISOString(),
      }),
    );
    expect(getStoredAttemptStatus()).toEqual({ kind: "invalid" });
  });

  it("expired cuando marcador válido pero pasó 23h", () => {
    const oldTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: oldTime,
      }),
    );
    const result = getStoredAttemptStatus();
    expect(result.kind).toBe("expired");
    /* Marker still present — not deleted */
    expect(localStorageStore.getItem(LOCAL_KEY)).toBeTruthy();
  });

  it("valid cuando marcador nuevo", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    const result = getStoredAttemptStatus();
    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.snapshot.idempotencyKey).toBe(
        "11111111-1111-4111-8111-111111111111",
      );
    }
  });

  it("invalid con storage inyectado", () => {
    /* Use localStorageStore directly as the injected storage — avoids
     * vi.fn() closure issues in test environment. */
    localStorageStore.setItem(LOCAL_KEY, "bad-json");
    const result = getStoredAttemptStatus({ storage: localStorageStore });
    expect(result).toEqual({ kind: "invalid" });
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * updateAttempt — immutable contract
 * ══════════════════════════════════════════════════════════════════════ */
describe("updateAttempt — immutable contract", () => {
  it("rechaza líneas cambiadas", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    /* Change lines — should fail. */
    expect(updateAttempt([{ productId: "other", qty: 99 }])).toBe(false);
    /* Snapshot unchanged */
    const marker = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(marker.lines).toEqual(fakeCartLines());
  });

  it("preserva orderId cuando se omite — fix del defecto null", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
      { orderId: fakeOrderId },
    );
    /* No orderId in options → preserve existing. */
    const result = updateAttempt(fakeCartLines());
    expect(result).toBe(true);
    const marker = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(marker.orderId).toBe(fakeOrderId);
  });

  it("no borra estado terminal (completed)", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
      { completed: true, status: "completed" },
    );
    expect(updateAttempt(fakeCartLines(), { status: "processing" })).toBe(
      false,
    );
    const marker = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(marker.status).toBe("completed");
    expect(marker.completedAt).toBeTruthy();
  });

  it("no borra estado terminal (failed)", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
      { status: "failed" },
    );
    expect(updateAttempt(fakeCartLines(), { orderId: fakeOrderId })).toBe(
      false,
    );
  });

  it.each(["conflict", "validation"] as const)("no reutiliza un intento terminal %s", (status) => {
    const prepared = prepareAttempt(fakeContact(), fakeCartLines());
    expect(prepared).not.toBe(false);
    expect(updateAttempt(fakeCartLines(), { status })).toBe(true);
    expect(prepareAttempt(fakeContact(), fakeCartLines())).toBe(false);
    expect(hasPendingAttempt()).toBe(false);
  });

  it("actualiza status accepted sin tocar createdAt ni orderId", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    const markerBefore = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    const createdAt = markerBefore.createdAt;
    const orderId = markerBefore.orderId;

    updateAttempt(fakeCartLines(), { status: "accepted" });

    const marker = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(marker.createdAt).toBe(createdAt);
    expect(marker.orderId).toBe(orderId);
    expect(marker.status).toBe("accepted");
  });

  it("updateAttempt falla sin snapshot", () => {
    expect(updateAttempt(fakeCartLines())).toBe(false);
  });

  it("preserva completedAt si completed no se setea", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
      { completed: true },
    );
    const before = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    const completedAt = before.completedAt;

    updateAttempt(fakeCartLines(), { orderId: fakeOrderId });

    const after = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(after.completedAt).toBe(completedAt);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * updateAttemptSession — immutable contract
 * ══════════════════════════════════════════════════════════════════════ */
describe("updateAttemptSession — immutable contract", () => {
  it("preserva createdAt tras update", () => {
    saveAttemptSession(
      fakeContact(),
      fakeCartLines(),
      "11111111-1111-4111-8111-111111111111",
    );
    const before = JSON.parse(sessionStorageStore.getItem(SESSION_KEY)!);
    const createdAt = before.createdAt;

    updateAttemptSession(fakeOrderId);

    const after = JSON.parse(sessionStorageStore.getItem(SESSION_KEY)!);
    expect(after.createdAt).toBe(createdAt);
    expect(after.orderId).toBe(fakeOrderId);
  });

  it("falla sin sesión", () => {
    expect(updateAttemptSession(fakeOrderId)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Storage permission denied — fail-closed
 * ══════════════════════════════════════════════════════════════════════ */
describe("storage permission denied — fail-closed", () => {
  it("prepareAttempt returns false when storage throws", () => {
    const brokenStorage = {
      getItem: () => {
        throw new DOMException("Permission denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Permission denied", "SecurityError");
      },
      removeItem: () => {},
    } as unknown as Storage;
    expect(
      prepareAttempt(fakeContact(), fakeCartLines(), {
        storage: brokenStorage,
      }),
    ).toBe(false);
  });

  it("saveAttempt fails when storage throws", () => {
    const brokenStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => {},
    };
    expect(
      saveAttempt(
        "11111111-1111-4111-8111-111111111111",
        fakeCartLines(),
        fakeContact(),
        {
          storage: brokenStorage,
        },
      ),
    ).toBe(false);
  });

  it("saveAttemptSession fails when storage throws", () => {
    const brokenStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => {},
    };
    expect(
      saveAttemptSession(
        fakeContact(),
        fakeCartLines(),
        "11111111-1111-4111-8111-111111111111",
        undefined,
        {
          storage: brokenStorage,
        },
      ),
    ).toBe(false);
  });

  it("updateAttempt fails when storage throws", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    const brokenStorage = {
      getItem: () => localStorageStore.getItem(LOCAL_KEY),
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => {},
    };
    expect(
      updateAttempt(fakeCartLines(), {
        orderId: fakeOrderId,
        storage: brokenStorage,
      }),
    ).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Double-tab: marker exists, no session — blocked
 * ══════════════════════════════════════════════════════════════════════ */
describe("double-tab: marker + no session", () => {
  it("bloquea cuando otro tab tiene marcador pero no sesión (double-tab guard)", () => {
    /* Tab A saved marker + session. Tab B has only marker (session is per-tab).
     * prepareAttempt rejects — the full atomic unit (marker+session) must exist
     * in the same tab. The user must clear the marker first. */
    const priorKey = "11111111-1111-4111-8111-111111111111";
    const priorTime = new Date(Date.now() - 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );
    /* No sessionStorage — simulates different tab (session is per-tab). */
    sessionStorageStore.clear();

    const result = prepareAttempt(fakeContact(), fakeCartLines());
    expect(result).toBe(false);
    /* No new session created — double-tab blocked. */
    expect(sessionStorageStore.getItem(SESSION_KEY)).toBeNull();
  });

  it("prepareAttempt bloquea cuando hay sesión con líneas distintas (double-tab guard)", () => {
    const priorKey = "11111111-1111-4111-8111-111111111111";
    const priorTime = new Date(Date.now() - 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );
    sessionStorageStore.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: priorKey,
        orderId: null,
        contact: { ...fakeContact() },
        lines: fakeCartLines(),
        createdAt: priorTime,
      }),
    );

    /* Tab B changes cart — block. */
    expect(
      prepareAttempt(fakeContact(), [{ productId: "other", qty: 5 }]),
    ).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Loss after POST — clearAttempt
 * ══════════════════════════════════════════════════════════════════════ */
describe("loss after POST — clearAttempt", () => {
  it("clearAttempt elimina localStorage y sessionStorage", () => {
    prepareAttempt(fakeContact(), fakeCartLines());
    expect(localStorageStore.getItem(LOCAL_KEY)).toBeTruthy();
    expect(sessionStorageStore.getItem(SESSION_KEY)).toBeTruthy();

    clearAttempt();

    expect(localStorageStore.getItem(LOCAL_KEY)).toBeNull();
    expect(sessionStorageStore.getItem(SESSION_KEY)).toBeNull();
  });

  it("clearAttempt con storage inyectado", () => {
    const ls = fakeStorage();
    const ss = fakeStorage();
    ls.setItem(LOCAL_KEY, "marker");
    ss.setItem(SESSION_KEY, "session");
    clearAttempt({ storage: ls, sessionStorage: ss });
    expect(ls.removeItem).toHaveBeenCalledWith(LOCAL_KEY);
    expect(ss.removeItem).toHaveBeenCalledWith(SESSION_KEY);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Same payload reuse
 * ══════════════════════════════════════════════════════════════════════ */
describe("same payload reuse", () => {
  it("prepareAttempt reutiliza key cuando mismo payload", () => {
    const contact = fakeContact();
    const lines = fakeCartLines();

    const first = prepareAttempt(contact, lines);
    expect(first).not.toBe(false);
    const key1 = (first as PreparedAttemptPayload).idempotencyKey;

    /* Call again with same payload — should reuse. */
    const second = prepareAttempt(contact, lines);
    expect(second).not.toBe(false);
    const key2 = (second as PreparedAttemptPayload).idempotencyKey;

    expect(key2).toBe(key1);
  });

  it("prepareAttempt reutiliza anchor createdAt", () => {
    const contact = fakeContact();
    const lines = fakeCartLines();

    const first = prepareAttempt(contact, lines);
    expect(first).not.toBe(false);
    const anchor1 = (first as PreparedAttemptPayload).createdAt;

    const second = prepareAttempt(contact, lines);
    expect(second).not.toBe(false);
    const anchor2 = (second as PreparedAttemptPayload).createdAt;

    expect(anchor2).toBe(anchor1);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Changed optional fields — refused when session exists
 * ══════════════════════════════════════════════════════════════════════ */
describe("changed optional fields — refused", () => {
  it("note cambiada con sesión: se rechaza (contacto completo, immutable)", () => {
    const contact = fakeContact();
    const lines = fakeCartLines();
    prepareAttempt(contact, lines);

    /* Even optional fields are immutable once session exists.
     * The full SHA-256 fingerprint includes all optional fields. */
    const diffContact = { ...contact, notes: "Different note" };
    expect(prepareAttempt(diffContact, lines)).toBe(false);
  });

  it("email diferente con sesión: se rechaza (required field)", () => {
    const contact = fakeContact();
    const lines = fakeCartLines();
    prepareAttempt(contact, lines);

    const diffContact = { ...contact, email: "other@example.com" };
    expect(prepareAttempt(diffContact, lines)).toBe(false);
  });

  it("name diferente con sesión: se rechaza (required field)", () => {
    const contact = fakeContact();
    const lines = fakeCartLines();
    prepareAttempt(contact, lines);

    const diffContact = { ...contact, name: "Other Name" };
    expect(prepareAttempt(diffContact, lines)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Expired marker: never deleted, no new key
 * ══════════════════════════════════════════════════════════════════════ */
describe("expired marker: never deleted, no new key", () => {
  it("expired no se borra con getAttempt", () => {
    const oldTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: oldTime,
      }),
    );
    expect(getAttempt()).toBeNull();
    /* Still present — not deleted. */
    expect(localStorageStore.getItem(LOCAL_KEY)).toBeTruthy();
  });

  it("expired no se borra con hasPendingAttempt", () => {
    const oldTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: oldTime,
      }),
    );
    expect(hasPendingAttempt()).toBe(false);
    expect(localStorageStore.getItem(LOCAL_KEY)).toBeTruthy();
  });

  it("expired no crea nueva key con prepareAttempt", () => {
    const oldTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: oldTime,
      }),
    );
    const result = prepareAttempt(fakeContact(), fakeCartLines());
    expect(result).toBe(false);
    /* No new key — marker untouched. */
    const marker = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(marker.idempotencyKey).toBe("11111111-1111-4111-8111-111111111111");
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * updateAttempt: update ID / anchor / lines strictness
 * ══════════════════════════════════════════════════════════════════════ */
describe("updateAttempt: update ID / anchor / lines strict", () => {
  it("actualiza orderId cuando se provee", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    updateAttempt(fakeCartLines(), { orderId: fakeOrderId });
    const marker = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(marker.orderId).toBe(fakeOrderId);
  });

  it("no actualiza createdAt nunca", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    const markerBefore = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    const createdAt = markerBefore.createdAt;

    updateAttempt(fakeCartLines(), {
      orderId: fakeOrderId,
      status: "processing",
    });
    const marker = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(marker.createdAt).toBe(createdAt);
  });

  it("rechaza líneas con cantidad diferente", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    expect(
      updateAttempt([
        { productId: "raptor+", qty: 99 },
        { productId: "panga", qty: 1 },
      ]),
    ).toBe(false);
  });

  it("rechaza líneas con producto diferente", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    expect(
      updateAttempt([
        { productId: "other", qty: 2 },
        { productId: "panga", qty: 1 },
      ]),
    ).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Marker write fail: rollback session
 * ══════════════════════════════════════════════════════════════════════ */
describe("marker write fail: rollback session", () => {
  it("rollback SS cuando LS write fails (prepareAttempt)", () => {
    /* LS write fails, SS was already written — should be rolled back. */
    const lsBroken = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => {},
    } as unknown as Storage;
    const ssGood = fakeStorage() as unknown as Storage;

    const result = prepareAttempt(fakeContact(), fakeCartLines(), {
      storage: lsBroken,
      sessionStorage: ssGood,
    });
    expect(result).toBe(false);
    /* Session was rolled back. */
    expect(ssGood.removeItem).toHaveBeenCalledWith(SESSION_KEY);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Session storage write fail: returns false
 * ══════════════════════════════════════════════════════════════════════ */
describe("session storage write fail: returns false", () => {
  it("prepareAttempt returns false when SS write fails", () => {
    const lsGood = fakeStorage() as unknown as Storage;
    const ssBroken = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => {},
    } as unknown as Storage;

    expect(
      prepareAttempt(fakeContact(), fakeCartLines(), {
        storage: lsGood,
        sessionStorage: ssBroken,
      }),
    ).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Legacy API: saveAttempt / saveAttemptSession / getAttempt / etc.
 * ══════════════════════════════════════════════════════════════════════ */
describe("saveAttempt — backward compat", () => {
  it("guarda snapshot v2 en localStorage sin PII", () => {
    const storage = fakeStorage();
    const lines = fakeCartLines();
    const result = saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      lines,
      fakeContact(),
      { storage },
    );

    expect(result).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(LOCAL_KEY, expect.any(String));
    const stored = JSON.parse(storage.setItem.mock.calls[0][1] as string);
    expect(stored.version).toBe("v2");
    expect(stored.idempotencyKey).toBe("11111111-1111-4111-8111-111111111111");
    expect(stored.orderId).toBeNull();
    expect(stored.lines).toHaveLength(2);
    expect(stored.createdAt).toBeTruthy();
    expect(stored).not.toHaveProperty("contact");
    expect(stored).not.toHaveProperty("fingerprint");
  });

  it("guarda con default storage (globalThis.localStorage)", () => {
    const lines = fakeCartLines();
    const result = saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      lines,
      fakeContact(),
    );

    expect(result).toBe(true);
    expect(localStorageStore.getItem(LOCAL_KEY)).toBeTruthy();
    const stored = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    expect(stored.version).toBe("v2");
    expect(stored.idempotencyKey).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("no guarda con líneas vacías", () => {
    const storage = fakeStorage();
    expect(
      saveAttempt("11111111-1111-4111-8111-111111111111", [], fakeContact(), {
        storage,
      }),
    ).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("registra completedAt cuando completed=true", () => {
    const storage = fakeStorage();
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
      {
        storage,
        completed: true,
      },
    );
    const stored = JSON.parse(storage.setItem.mock.calls[0][1] as string);
    expect(stored.completedAt).toBeTruthy();
    expect(stored.version).toBe("v2");
  });

  it("registra status cuando se provee", () => {
    const storage = fakeStorage();
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
      {
        storage,
        orderId: fakeOrderId,
        status: "processing",
      },
    );
    const stored = JSON.parse(storage.setItem.mock.calls[0][1] as string);
    expect(stored.status).toBe("processing");
    expect(stored.orderId).toBe(fakeOrderId);
  });
});

describe("saveAttemptSession — backward compat", () => {
  it("guarda contacto exacto con todos los opcionales", () => {
    const storage = fakeStorage();
    const contact = fakeContact();
    const result = saveAttemptSession(
      contact,
      fakeCartLines(),
      "11111111-1111-4111-8111-111111111111",
      undefined,
      { storage },
    );

    expect(result).toBe(true);
    const stored = JSON.parse(storage.setItem.mock.calls[0][1] as string);
    expect(stored.version).toBe("v2");
    expect(stored.idempotencyKey).toBe("11111111-1111-4111-8111-111111111111");
    expect(stored.contact.name).toBe("Santiago Lareu");
    expect(stored.contact.legalName).toBe("StarVie Padel SAS");
    expect(stored.contact.email).toBe("santi@example.com");
    expect(stored.contact.phone).toBe("+54 9 11 1234 5678");
    expect(stored.contact.province).toBe("Buenos Aires");
    expect(stored.contact.city).toBe("La Plata");
    expect(stored.contact.address).toBe("Calle 123");
    expect(stored.contact.cuit).toBe("20-12345678-9");
    expect(stored.contact.notes).toBe("Llamar antes");
    expect(stored.createdAt).toBeTruthy();
  });

  it("guarda con default storage (globalThis.sessionStorage)", () => {
    const contact = fakeContact();
    const result = saveAttemptSession(
      contact,
      fakeCartLines(),
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result).toBe(true);
    expect(sessionStorageStore.getItem(SESSION_KEY)).toBeTruthy();
    const stored = JSON.parse(sessionStorageStore.getItem(SESSION_KEY)!);
    expect(stored.version).toBe("v2");
    expect(stored.idempotencyKey).toBe("11111111-1111-4111-8111-111111111111");
    expect(stored.contact.name).toBe("Santiago Lareu");
  });

  it("guarda orderId cuando se provee", () => {
    const storage = fakeStorage();
    saveAttemptSession(
      fakeContact(),
      fakeCartLines(),
      "11111111-1111-4111-8111-111111111111",
      fakeOrderId,
      {
        storage,
      },
    );
    const stored = JSON.parse(storage.setItem.mock.calls[0][1] as string);
    expect(stored.orderId).toBe(fakeOrderId);
  });

  it("guarda null orderId cuando se provee null", () => {
    const storage = fakeStorage();
    saveAttemptSession(
      fakeContact(),
      fakeCartLines(),
      "11111111-1111-4111-8111-111111111111",
      null,
      {
        storage,
      },
    );
    const stored = JSON.parse(storage.setItem.mock.calls[0][1] as string);
    expect(stored.orderId).toBeNull();
  });

  it("no guarda con líneas vacías", () => {
    const storage = fakeStorage();
    expect(
      saveAttemptSession(
        fakeContact(),
        [],
        "11111111-1111-4111-8111-111111111111",
        undefined,
        { storage },
      ),
    ).toBe(false);
  });

  it("incluye las líneas exactas del carrito", () => {
    const storage = fakeStorage();
    const lines = fakeCartLines();
    saveAttemptSession(
      fakeContact(),
      lines,
      "11111111-1111-4111-8111-111111111111",
      undefined,
      { storage },
    );
    const stored = JSON.parse(storage.setItem.mock.calls[0][1] as string);
    expect(stored.lines).toEqual(lines);
  });
});

describe("getAttempt — v2 marker read", () => {
  it("devuelve null cuando no hay nada", () => {
    expect(getAttempt()).toBeNull();
  });

  it("devuelve el snapshot v2 guardado (default storage)", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    const result = getAttempt();

    expect(result).toBeTruthy();
    expect(result!.orderId).toBeNull();
    expect(result!.idempotencyKey).toBe("11111111-1111-4111-8111-111111111111");
    expect(result!.completedAt).toBeUndefined();
    expect(result!.version).toBe("v2");
  });

  it("NO borra el marcador expirado — solo devuelve null", () => {
    const oldTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: oldTime,
      }),
    );
    expect(getAttempt()).toBeNull();
    const raw = localStorageStore.getItem(LOCAL_KEY);
    expect(raw).toBeTruthy();
  });
});

describe("getAttemptSession", () => {
  it("devuelve la sesión guardada (default storage)", () => {
    saveAttemptSession(
      fakeContact(),
      fakeCartLines(),
      "11111111-1111-4111-8111-111111111111",
    );
    const result = getAttemptSession();

    expect(result).toBeTruthy();
    expect(result!.contact.name).toBe("Santiago Lareu");
    expect(result!.idempotencyKey).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("devuelve null para JSON corrupto", () => {
    sessionStorageStore.setItem(SESSION_KEY, "bad-json");
    expect(getAttemptSession()).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * isStoredAttemptExpired — still exported, backward compat
 * ══════════════════════════════════════════════════════════════════════ */
describe("isStoredAttemptExpired — backward compat", () => {
  it("missing cuando no hay marcador", () => {
    expect(isStoredAttemptExpired()).toBe("missing");
  });

  it("valid cuando hay marcador válido", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    expect(isStoredAttemptExpired()).toBe("valid");
  });

  it("expired cuando el marcador expiró", () => {
    const oldTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: oldTime,
      }),
    );
    expect(isStoredAttemptExpired()).toBe("expired");
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * hasPendingAttempt / hasStoredAttempt / canRetryAttempt
 * ══════════════════════════════════════════════════════════════════════ */
describe("hasPendingAttempt", () => {
  it("true cuando hay intento sin completar", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    expect(hasPendingAttempt()).toBe(true);
  });

  it("false cuando está completado", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
      {
        completed: true,
      },
    );
    expect(hasPendingAttempt()).toBe(false);
  });

  it("false si expiró", () => {
    const oldTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: oldTime,
      }),
    );
    expect(hasPendingAttempt()).toBe(false);
  });
});

describe("canRetryAttempt", () => {
  it("true cuando hay intento válido", () => {
    saveAttempt(
      "11111111-1111-4111-8111-111111111111",
      fakeCartLines(),
      fakeContact(),
    );
    expect(canRetryAttempt()).toBe(true);
  });

  it("false cuando expiró", () => {
    const oldTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    localStorageStore.setItem(
      LOCAL_KEY,
      JSON.stringify({
        version: "v2",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orderId: null,
        lines: fakeCartLines(),
        createdAt: oldTime,
      }),
    );
    expect(canRetryAttempt()).toBe(false);
  });
});

describe("resolución explícita y guardados heredados", () => {
  it("saveAttempt no reemplaza un marcador activo ni corrupto", () => {
    const key = "11111111-1111-4111-8111-111111111111";
    expect(saveAttempt(key, fakeCartLines(), fakeContact())).toBe(true);
    const original = localStorageStore.getItem(LOCAL_KEY);
    expect(saveAttempt("33333333-3333-4333-8333-333333333333", fakeCartLines(), fakeContact())).toBe(false);
    expect(localStorageStore.getItem(LOCAL_KEY)).toBe(original);
    localStorageStore.setItem(LOCAL_KEY, "bad-json");
    expect(saveAttempt(key, fakeCartLines(), fakeContact())).toBe(false);
    expect(localStorageStore.getItem(LOCAL_KEY)).toBe("bad-json");
  });

  it("saveAttemptSession no reemplaza contacto ni clave existentes", () => {
    const key = "11111111-1111-4111-8111-111111111111";
    expect(saveAttemptSession(fakeContact(), fakeCartLines(), key)).toBe(true);
    const original = sessionStorageStore.getItem(SESSION_KEY);
    expect(saveAttemptSession({ ...fakeContact(), email: "other@example.com" }, fakeCartLines(), key)).toBe(false);
    expect(sessionStorageStore.getItem(SESSION_KEY)).toBe(original);
    expect(getStoredSessionPresence()).toBe("present");
    expect(saveAttempt(key, fakeCartLines(), fakeContact())).toBe(false);
  });

  it("saveAttemptSession no crea una sesión ajena a un marcador activo", () => {
    prepareAttempt(fakeContact(), fakeCartLines());
    sessionStorageStore.clear();
    expect(saveAttemptSession(fakeContact(), fakeCartLines(), "33333333-3333-4333-8333-333333333333")).toBe(false);
    expect(getStoredSessionPresence()).toBe("missing");
  });

  it("un storage parcial usa el setItem real en lugar de simular éxito", () => {
    const storage = fakeStorage();
    expect(saveAttempt("11111111-1111-4111-8111-111111111111", fakeCartLines(), fakeContact(), {
      storage: { getItem: storage.getItem, setItem: storage.setItem },
    })).toBe(true);
    expect(storage.getItem(LOCAL_KEY)).toBeTruthy();
  });

  it("no limpia un intento activo sin confirmación y luego genera otra clave", () => {
    const first = prepareAttempt(fakeContact(), fakeCartLines());
    expect(first).not.toBe(false);
    const status = getStoredAttemptStatus();
    expect(resolveAttemptForNewPurchase(status, false)).toBe(false);
    expect(getStoredAttemptStatus().kind).toBe("valid");
    expect(resolveAttemptForNewPurchase(status, true)).toBe(true);
    expect(getStoredAttemptStatus().kind).toBe("missing");
    expect(getStoredSessionPresence()).toBe("missing");
    const second = prepareAttempt(fakeContact(), fakeCartLines());
    expect(second).not.toBe(false);
    if (first && second) expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("no limpia una referencia que cambió en otra pestaña", () => {
    prepareAttempt(fakeContact(), fakeCartLines());
    const observed = getStoredAttemptStatus();
    updateAttempt(fakeCartLines(), { orderId: fakeOrderId, status: "processing" });
    expect(resolveAttemptForNewPurchase(observed, true)).toBe(false);
    expect(getStoredAttemptStatus().kind).toBe("valid");
  });

  it("libera completed sin confirmación adicional", () => {
    prepareAttempt(fakeContact(), fakeCartLines());
    updateAttempt(fakeCartLines(), { orderId: fakeOrderId, status: "completed", completed: true });
    expect(resolveAttemptForNewPurchase(getStoredAttemptStatus(), false)).toBe(true);
    expect(getStoredAttemptStatus().kind).toBe("missing");
  });

  it("un marcador vencido conserva orderId y exige confirmación", () => {
    const first = prepareAttempt(fakeContact(), fakeCartLines());
    expect(first).not.toBe(false);
    updateAttempt(fakeCartLines(), { orderId: fakeOrderId, status: "processing" });
    const raw = JSON.parse(localStorageStore.getItem(LOCAL_KEY)!);
    raw.createdAt = new Date(Date.now() - 24 * 3600_000).toISOString();
    localStorageStore.setItem(LOCAL_KEY, JSON.stringify(raw));
    const status = getStoredAttemptStatus();
    expect(status.kind).toBe("expired");
    if (status.kind === "expired") expect(status.snapshot.orderId).toBe(fakeOrderId);
    expect(resolveAttemptForNewPurchase(status, false)).toBe(false);
    expect(resolveAttemptForNewPurchase(status, true)).toBe(true);
  });

  it("un marcador corrupto no se elimina sin confirmación", () => {
    localStorageStore.setItem(LOCAL_KEY, "bad-json");
    const status = getStoredAttemptStatus();
    expect(status.kind).toBe("invalid");
    expect(resolveAttemptForNewPurchase(status, false)).toBe(false);
    expect(localStorageStore.getItem(LOCAL_KEY)).toBe("bad-json");
    expect(resolveAttemptForNewPurchase(status, true)).toBe(true);
    expect(localStorageStore.getItem(LOCAL_KEY)).toBeNull();
  });

  it("una sesión huérfana se reconoce y se resuelve expresamente", () => {
    saveAttemptSession(fakeContact(), fakeCartLines(), "11111111-1111-4111-8111-111111111111");
    expect(getStoredSessionPresence()).toBe("present");
    expect(resolveAttemptForNewPurchase({ kind: "missing" }, false)).toBe(false);
    expect(resolveAttemptForNewPurchase({ kind: "missing" }, true)).toBe(true);
    expect(getStoredSessionPresence()).toBe("missing");
  });

  it("si falla la limpieza de sessionStorage conserva el marcador y bloquea compra nueva", () => {
    const local = fakeStorage();
    const session = fakeStorage();
    prepareAttempt(fakeContact(), fakeCartLines(), {
      storage: local as unknown as Storage,
      sessionStorage: session as unknown as Storage,
    });
    const expected = getStoredAttemptStatus({ storage: local });
    session.removeItem.mockImplementation(() => { throw new Error("denied"); });
    expect(resolveAttemptForNewPurchase(expected, true, {
      storage: local as unknown as Storage,
      sessionStorage: session as unknown as Storage,
    })).toBe(false);
    expect(local.getItem(LOCAL_KEY)).toBeTruthy();
  });
});
