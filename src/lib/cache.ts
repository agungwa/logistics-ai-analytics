/**
 * Tiny in-process TTL cache. Right-sized for this app: the dataset is
 * immutable and analytics results are user-independent (RBAC gates access,
 * not data), so identical queries can be memoized safely.
 *
 * Deliberately NOT Redis: single-instance demo workload, sub-10ms queries.
 * A multi-instance deployment with hot caches or cross-instance rate limits
 * would move to Redis (or Upstash for serverless) — see README trade-offs.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 200;

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  const value = await fn();
  if (store.size >= MAX_ENTRIES) {
    // Bounded: drop the oldest entries (Map preserves insertion order).
    for (const k of Array.from(store.keys()).slice(0, store.size - MAX_ENTRIES + 1)) {
      store.delete(k);
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function clearCache(): void {
  store.clear();
}
