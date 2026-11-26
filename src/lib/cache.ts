/**
 * Small TTL cache over an async key-value store (browser.storage.local in the extension, a Map in
 * tests). On refresh failure the stale value is returned, flagged, so the UI can say "from cache".
 */
export interface KvStore {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  keys?(): Promise<string[]>;
}

interface Entry<T> {
  v: T;
  t: number;
}

export interface CachedResult<T> {
  value: T;
  fetchedAt: number;
  fromCache: boolean;
  stale: boolean;
  error?: string;
}

export const PREFIX = 'sgf:v1:';

export function createCache(kv: KvStore, now: () => number = Date.now) {
  async function getMany<T>(keys: string[]): Promise<Map<string, Entry<T>>> {
    const raw = await kv.get(keys.map((k) => PREFIX + k));
    const out = new Map<string, Entry<T>>();
    for (const k of keys) {
      const e = raw[PREFIX + k] as Entry<T> | undefined;
      if (e && typeof e.t === 'number') out.set(k, e);
    }
    return out;
  }

  async function setMany<T>(items: Map<string, T>): Promise<void> {
    const t = now();
    const payload: Record<string, unknown> = {};
    for (const [k, v] of items) payload[PREFIX + k] = { v, t } satisfies Entry<T>;
    if (Object.keys(payload).length) await kv.set(payload);
  }

  /** Returns the cached value if younger than ttl, else calls `load`; falls back to stale on error. */
  async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, force = false): Promise<CachedResult<T>> {
    const hit = (await getMany<T>([key])).get(key);
    if (hit && !force && now() - hit.t < ttlMs) {
      return { value: hit.v, fetchedAt: hit.t, fromCache: true, stale: false };
    }
    try {
      const value = await load();
      await setMany(new Map([[key, value]]));
      return { value, fetchedAt: now(), fromCache: false, stale: false };
    } catch (e) {
      if (hit) return { value: hit.v, fetchedAt: hit.t, fromCache: true, stale: true, error: errorText(e) };
      throw e;
    }
  }

  /** Drops entries older than maxAgeMs (keeps storage from growing forever). */
  async function prune(maxAgeMs: number): Promise<number> {
    if (!kv.keys) return 0;
    const all = (await kv.keys()).filter((k) => k.startsWith(PREFIX));
    if (!all.length) return 0;
    const raw = await kv.get(all);
    const old = all.filter((k) => {
      const e = raw[k] as Entry<unknown> | undefined;
      return !e || now() - e.t > maxAgeMs;
    });
    if (old.length) await kv.remove(old);
    return old.length;
  }

  return { cached, getMany, setMany, prune };
}

export type Cache = ReturnType<typeof createCache>;

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** In-memory KvStore for tests and the UI harness. */
export function memoryKv(): KvStore {
  const m = new Map<string, unknown>();
  return {
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (m.has(k)) out[k] = structuredClone(m.get(k));
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) m.set(k, structuredClone(v));
    },
    async remove(keys) {
      for (const k of keys) m.delete(k);
    },
    async keys() {
      return [...m.keys()];
    },
  };
}
