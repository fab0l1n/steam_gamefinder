import { describe, expect, it } from 'vitest';
import { createCache, memoryKv, PREFIX } from '../src/lib/cache';

describe('cache', () => {
  it('keeps entries younger than the prune age (co-op counts live 30 days)', async () => {
    const kv = memoryKv();
    let now = 0;
    const cache = createCache(kv, () => now);
    const day = 24 * 60 * 60e3;
    await cache.setMany(new Map([['coop2:1', { online: 4 }]]));
    now = 10 * day;
    await cache.setMany(new Map([['coop2:2', { online: 2 }]]));
    now = 35 * day; // entry 1 is 35 days old, entry 2 is 25 days old
    expect(await cache.prune(31 * day)).toBe(1);
    expect(Object.keys(await kv.get([`${PREFIX}coop2:1`, `${PREFIX}coop2:2`]))).toEqual([`${PREFIX}coop2:2`]);
  });

  it('serves stale data when a refresh fails', async () => {
    let now = 0;
    const cache = createCache(memoryKv(), () => now);
    await cache.cached('k', 1000, async () => 'old');
    now = 5000;
    const r = await cache.cached('k', 1000, async () => {
      throw new Error('offline');
    });
    expect(r).toMatchObject({ value: 'old', stale: true, error: 'offline' });
  });
});
