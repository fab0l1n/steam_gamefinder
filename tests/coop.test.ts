import { describe, expect, it, vi } from 'vitest';
import { createBackgroundHandlers } from '../src/lib/background-handlers';
import { createCache, memoryKv } from '../src/lib/cache';
import { coopDetails, coopLabel, parseCoOptimus } from '../src/lib/coop';
import { loadGroup, type BgCall, type LoaderDeps } from '../src/lib/loader';
import { mapStoreItem } from '../src/lib/steam/store';
import { FRIEND, GROUP, VIEWER, membersXml, profileXml, rawItem } from './fixtures';

/** Shaped like api.co-optimus.com/games.php output (descriptions trimmed). */
function coOptimusXml(entries: { system: string; steam?: number; online: number; local?: number; lan?: number }[]): string {
  return `<games>\n${entries
    .map(
      (e, i) => `<game>
<id>${100 + i}</id>
<title>Valheim</title>
<system>${e.system}</system>
${e.steam ? `<steam>${e.steam}</steam>\n` : ''}<genre>Survival</genre>
<local>${e.local ?? 0}</local>
<online>${e.online}</online>
<lan>${e.lan ?? 0}</lan>
<splitscreen>0</splitscreen>
<dropindropout>1</dropindropout>
<campaign>1</campaign>
<modes>0</modes>
<featurelist>Drop-In/Drop-Out, Campaign Co-Op</featurelist>
<coopexp>Up to 10 players.</coopexp>
<url>https://www.co-optimus.com/game/${100 + i}/x.html</url>
</game>`,
    )
    .join('\n')}\n</games>\n`;
}

describe('co-optimus parsing', () => {
  it('picks the PC entry that matches the Steam AppID', () => {
    const xml = coOptimusXml([
      { system: 'Xbox Series', online: 4 },
      { system: 'PC', steam: 892970, online: 10, lan: 10 },
    ]);
    const c = parseCoOptimus(xml, 892970)!;
    expect(c).toMatchObject({ source: 'co-optimus', online: 10, lan: 10, local: 0, dropIn: true, campaign: true });
    expect(coopLabel(c)).toBe('10 Player Co-op');
    expect(coopDetails(c)).toContain('Online 10');
  });

  it('returns null when the game is not listed', () => {
    expect(parseCoOptimus('<games>\n</games>', 1)).toBeNull();
    expect(parseCoOptimus(coOptimusXml([{ system: 'PC', steam: 5, online: 2 }]), 6)).toBeNull();
  });

  it('labels couch-only games by their local count and Steam-only co-op without a number', () => {
    expect(coopLabel({ source: 'co-optimus', online: 0, local: 2, lan: 0, splitscreen: true, dropIn: false, campaign: true, url: null })).toBe('2 Player Co-op');
    expect(coopLabel({ source: 'steam', online: 0, local: 0, lan: 0, splitscreen: false, dropIn: false, campaign: false, url: null })).toBe('Co-op');
    expect(coopLabel(null)).toBe('');
  });
});

describe('co-op lookups', () => {
  it('background: looks up each app, records failures without throwing', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('steam=1')) return new Response(coOptimusXml([{ system: 'PC', steam: 1, online: 4 }]));
      if (url.includes('steam=2')) return new Response('<games>\n</games>');
      return new Response('Forbidden', { status: 403 });
    });
    const { handle } = createBackgroundHandlers(fetchImpl as unknown as typeof fetch);
    const r = await handle({ type: 'coop', appids: [1, 2, 3] });
    expect(r.found[1]?.online).toBe(4);
    expect(r.found[2]).toBeNull();
    expect(r.failed).toEqual([3]);
    expect(r.lastError).toMatch(/403/);
  });

  it('loader: only co-op games are looked up, results are cached, Steam-only co-op falls back', async () => {
    const bg = vi.fn(async (req: { type: string; steamid?: string; appids?: number[] }) => {
      switch (req.type) {
        case 'viewerStore':
          return { loggedIn: true, owned: [], wishlist: [] };
        case 'wishlist':
          return req.steamid === FRIEND
            ? { entries: [10, 20, 30].map((appid) => ({ appid, addedAt: 1 })), via: 'public', loginAvailable: false }
            : { entries: [], via: null, loginAvailable: true };
        case 'storeItems':
          return req.appids!.map((a) =>
            mapStoreItem(rawItem(a, { categories: { supported_player_categoryids: a === 30 ? [2] : [1, 9, 38] } }), a),
          );
        case 'coop':
          return { found: Object.fromEntries(req.appids!.map((a) => [a, a === 10 ? parseCoOptimus(coOptimusXml([{ system: 'PC', steam: 10, online: 4 }]), 10) : null])), failed: [] };
        default:
          return {};
      }
    });
    const deps: LoaderDeps = {
      groupBase: GROUP,
      page: { viewerSteamId: VIEWER, loggedIn: true, language: 'english', country: 'DE' },
      fetchText: async (url) => (url.includes('memberslistxml') ? membersXml([VIEWER, FRIEND]) : url.includes('/games') ? '' : profileXml(url.includes(FRIEND) ? FRIEND : VIEWER, 'x')),
      bg: bg as unknown as BgCall,
      cache: createCache(memoryKv()),
      settings: { loadLibraries: false },
    };
    const final = await loadGroup(deps, { force: false }, () => {});
    const byId = new Map(final.rows.map((r) => [r.info.appid, r]));
    expect(byId.get(10)!.coop).toMatchObject({ source: 'co-optimus', online: 4 });
    expect(byId.get(20)!.coop).toMatchObject({ source: 'steam' });
    expect(byId.get(30)!.coop).toBeNull();
    expect(final.coopProgress).toEqual({ done: 2, total: 2, failed: 0 });
    expect(bg.mock.calls.filter(([r]) => r.type === 'coop').flatMap(([r]) => r.appids)).toEqual([10, 20]);

    // Second load: served from the 30-day cache.
    bg.mockClear();
    await loadGroup(deps, { force: false }, () => {});
    expect(bg.mock.calls.some(([r]) => r.type === 'coop')).toBe(false);
  });
});
