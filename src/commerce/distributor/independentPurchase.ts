import * as attempts from "../orderAttempt";

/** One explicit purchase, never a recovery of historical attempts.
 * Each purchase has its own storage keys. Session continuity stays in memory
 * through the backend fingerprint: it is never persisted or used to assign
 * historical records to a new login. No previous purchase is loaded here.
 */
export function independentDistributorPurchase() {
  let reference: string | null = null;
  function storageFor(kind: "localStorage" | "sessionStorage"): Storage {
    const keyFor = (key: string) => `${key}:purchase:${reference}`;
    return {
      getItem: (key: string) => reference === null ? null : globalThis[kind].getItem(keyFor(key)),
      setItem: (key: string, value: string) => {
        const parsed = JSON.parse(value) as { idempotencyKey: string };
        if (!parsed.idempotencyKey || (reference && reference !== parsed.idempotencyKey)) {
          throw new Error("Purchase reference changed");
        }
        reference = parsed.idempotencyKey;
        globalThis[kind].setItem(keyFor(key), value);
      },
      // Historical records, including partial writes, are never removed.
      removeItem: () => {},
    } as unknown as Storage;
  }
  const storage = storageFor("localStorage");
  const sessionStorage = storageFor("sessionStorage");
  const channel = "distributor" as const;
  const options = { storage, sessionStorage, channel };
  return {
    reset: () => { reference = null; },
    getStoredAttemptStatus: (_options?: Parameters<typeof attempts.getStoredAttemptStatus>[0]) => attempts.getStoredAttemptStatus({ storage, channel }),
    getAttemptSession: (_options?: Parameters<typeof attempts.getAttemptSession>[0]) => attempts.getAttemptSession({ storage: sessionStorage, channel }),
    getStoredSessionPresence: (_options?: Parameters<typeof attempts.getStoredSessionPresence>[0]) => attempts.getStoredSessionPresence({ storage: sessionStorage, channel }),
    prepareAttempt: (contact: Parameters<typeof attempts.prepareAttempt>[0], lines: Parameters<typeof attempts.prepareAttempt>[1], context: Parameters<typeof attempts.prepareAttempt>[2]) =>
      context?.channel === "distributor" && attempts.prepareAttempt(contact, lines, { ...context, ...options }),
    updateAttempt: (lines: Parameters<typeof attempts.updateAttempt>[0], update: Parameters<typeof attempts.updateAttempt>[1]) =>
      attempts.updateAttempt(lines, { ...update, storage, channel }),
    updateAttemptSession: (id: string | null, _options?: Parameters<typeof attempts.updateAttemptSession>[1]) => attempts.updateAttemptSession(id, { storage: sessionStorage, channel }),
    finalizeCompletedAttempt: (key: string, id: string, _options?: Parameters<typeof attempts.finalizeCompletedAttempt>[2]) => {
      const state = attempts.getStoredAttemptStatus({ storage, channel });
      if (state.kind !== "valid" || state.snapshot.idempotencyKey !== key) return false;
      const updated = attempts.updateAttempt(state.snapshot.lines, { storage, channel, status: "completed", completed: true, orderId: id });
      return updated && attempts.updateAttemptSession(id, { storage: sessionStorage, channel });
    },
    // Public checkout's explicit local cleanup is never used for this channel.
    resolveAttemptForNewPurchase: (..._args: Parameters<typeof attempts.resolveAttemptForNewPurchase>) => false,
  };
}
