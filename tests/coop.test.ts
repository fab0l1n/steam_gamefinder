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

  it('labels couch-only games by their local count; no label without a co-optimus number', () => {
    expect(coopLabel({ source: 'co-optimus', online: 0, local: 2, lan: 0, splitscreen: true, dropIn: false, campaign: true, url: null })).toBe('2 Player Co-op');
    expect(coopLabel({ source: 'steam', online: 0, local: 0, lan: 0, splitscreen: false, dropIn: false, campaign: false, url: null })).toBe('');
    expect(coopLabel({ source: 'co-optimus', online: 0, local: 0, lan: 0, splitscreen: false, dropIn: false, campaign: false, url: null })).toBe('');
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
    const r = await handle({ type: 'coop', items: [1, 2, 3].map((appid) => ({ appid, name: '' })) });
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
          return {
            found: Object.fromEntries(
              (req as unknown as { items: { appid: number }[] }).items.map(({ appid: a }) => [a, a === 10 ? parseCoOptimus(coOptimusXml([{ system: 'PC', steam: 10, online: 4 }]), 10) : null]),
            ),
            failed: [],
            trace: [],
          };
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
    expect(bg.mock.calls.filter(([r]) => r.type === 'coop').flatMap(([r]) => (r as unknown as { items: { appid: number }[] }).items.map((i) => i.appid))).toEqual([10, 20]);

    // Second load: served from the 30-day cache.
    bg.mockClear();
    await loadGroup(deps, { force: false }, () => {});
    expect(bg.mock.calls.some(([r]) => r.type === 'coop')).toBe(false);

    // Refresh (force) reloads Steam data but keeps the co-op cache…
    bg.mockClear();
    await loadGroup(deps, { force: true }, () => {});
    expect(bg.mock.calls.some(([r]) => r.type === 'storeItems')).toBe(true);
    expect(bg.mock.calls.some(([r]) => r.type === 'coop')).toBe(false);

    // …and only an explicit re-check looks co-op counts up again.
    bg.mockClear();
    await loadGroup(deps, { force: false, recheckCoop: true }, () => {});
    expect(bg.mock.calls.filter(([r]) => r.type === 'coop')).toHaveLength(1);
  });
});

describe('co-op fallbacks', () => {
  const page = (steam: number | null, online: string) => `<html><body>
<a href="https://store.steampowered.com/app/${steam}/">Steam</a>
<div class="row"> <div id="coop-features" class="large-6 columns"> <h4>Core Features</h4> <dl>
<dt>Local Co-Op</dt> <dd class="clearfix"><img src="local_icon.png" /><em>Not Supported</em></dd>
<dt>Online Co-Op</dt> <dd class="clearfix"><img src="online_icon.png" /><em>${online}</em></dd>
<dt>Combo Co-Op (Local + Online)</dt> <dd class="clearfix"><em>Not Supported</em></dd>
<dt>LAN Play or System Link</dt> <dd class="last clearfix"><em>Not Supported</em></dd>
</dl> </div></body></html>`;

  it('parses the website game page and checks the Steam AppID', async () => {
    const { parseSiteGamePage, findSiteGamePath, slugify } = await import('../src/lib/coop');
    expect(slugify('Bellwright')).toBe('bellwright');
    expect(slugify("Baldur's Gate 3")).toBe('baldur-s-gate-3');
    expect(slugify('Call of Duty®: Modern Warfare® 4')).toBe('call-of-duty-modern-warfare-4');
    const related = '<a href="/game/7306/pc/carnival-hunt.html"></a><a href="https://www.co-optimus.com/game/14752/pc/bellwright.html"></a>';
    expect(findSiteGamePath(related, 'bellwright')).toBe('/game/14752/pc/bellwright.html');
    expect(findSiteGamePath('<p>nothing</p>', 'x')).toBeNull();

    const ok = parseSiteGamePage(page(1812450, '4 Players'), 1812450, 'u');
    expect(ok.coop).toMatchObject({ online: 4, local: 0, lan: 0 });
    expect(parseSiteGamePage(page(999, '4 Players'), 1812450, 'u').coop).toBeNull();
    expect(parseSiteGamePage(page(1812450, 'Not Supported'), 1812450, 'u').coop).toBeNull();
  });

  it('background: API by AppID, then API by name, then the website (paced)', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url.replace('https://', ''));
      if (url.includes('api.co-optimus.com') && url.includes('name=Old%20Game')) {
        return new Response(coOptimusXml([{ system: 'PC', online: 6 }]).replace('<title>Valheim</title>', '<title>Old Game</title>'));
      }
      if (url.includes('api.co-optimus.com')) return new Response('<games>\n</games>');
      if (url.endsWith('/related-news/bellwright')) return new Response('<a href="/game/14752/pc/bellwright.html">');
      if (url.endsWith('/related-news/unknown-thing')) return new Response('<p>no links</p>');
      if (url.endsWith('/game/14752/pc/bellwright.html')) return new Response(page(1812450, '4 Players'));
      return new Response('nope', { status: 404 });
    });
    const { handle } = createBackgroundHandlers(fetchImpl as unknown as typeof fetch, { siteDelayMs: 0 });
    const r = await handle({
      type: 'coop',
      items: [
        { appid: 1812450, name: 'Bellwright' },
        { appid: 5, name: 'Old Game' },
        { appid: 6, name: 'Unknown Thing' },
      ],
    });
    expect(r.found[1812450]).toMatchObject({ online: 4, url: 'https://www.co-optimus.com/game/14752/pc/bellwright.html' });
    expect(r.found[5]).toMatchObject({ online: 6 });
    expect(r.found[6]).toBeNull();
    expect(r.failed).toEqual([]);
    expect(r.trace.join('\n')).toMatch(/1812450 Bellwright: website \/game\/14752\/pc\/bellwright.html → 4 Player Co-op/);
    expect(r.trace.join('\n')).toMatch(/5 Old Game: API by name → 6 Player Co-op/);
    // The website is only asked when the API had nothing.
    expect(calls.filter((c) => c.startsWith('www.')).length).toBe(3);
  });
});
