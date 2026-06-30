export interface SessionSnapshotStore<TValue> {
  get: (key: string) => TValue | undefined;
  invalidate: (predicate: (key: string, value: TValue) => boolean) => void;
  set: (key: string, value: TValue) => void;
}

interface SessionSnapshotEntry<TValue> {
  lastUsedAtMs: number;
  value: TValue;
}

export function createSessionSnapshotKey({
  accountId,
  parts,
}: {
  accountId: string;
  parts: Array<number | string | null | undefined>;
}): string {
  const normalizedParts = parts.map((part) => String(part ?? '').trim());
  return ['account', accountId.trim(), ...normalizedParts].join('::');
}

export function createSessionSnapshotStore<TValue>({
  maxEntries = 20,
  now = () => Date.now(),
}: {
  maxEntries?: number;
  now?: () => number;
} = {}): SessionSnapshotStore<TValue> {
  const entries = new Map<string, SessionSnapshotEntry<TValue>>();
  const boundedMaxEntries = Math.max(1, maxEntries);

  function prune() {
    while (entries.size > boundedMaxEntries) {
      const oldest = Array.from(entries.entries()).sort(
        (left, right) => left[1].lastUsedAtMs - right[1].lastUsedAtMs
      )[0]?.[0];

      if (!oldest) {
        return;
      }

      entries.delete(oldest);
    }
  }

  return {
    get(key) {
      const entry = entries.get(key);

      if (!entry) {
        return undefined;
      }

      entry.lastUsedAtMs = now();
      return entry.value;
    },
    invalidate(predicate) {
      for (const [key, entry] of entries) {
        if (predicate(key, entry.value)) {
          entries.delete(key);
        }
      }
    },
    set(key, value) {
      entries.set(key, {
        lastUsedAtMs: now(),
        value,
      });
      prune();
    },
  };
}
