import { describe, expect, it, vi } from 'vitest';
import { createBackgroundHandlers } from '../src/lib/background-handlers';
import { createCache, memoryKv } from '../src/lib/cache';
import { loadGroup, type BgCall, type LoaderDeps } from '../src/lib/loader';
import { mapStoreItem } from '../src/lib/steam/store';
import type { LoadSnapshot } from '../src/lib/types';
import { FRIEND, GROUP, PRIVATE_FRIEND, VIEWER, gamesPageHtml, membersXml, profileXml, rawItem } from './fixtures';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('background handlers', () => {
  it('uses the keyless wishlist when public, the viewer login otherwise', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url.replace(/access_token=[^&]+/, 'access_token=T'));
      if (url.includes('ajaxgetasyncconfig')) return jsonResponse({ success: 1, data: { webapi_token: 'tok' } });
      if (url.includes(`steamid=${FRIEND}`)) return jsonResponse({ response: { items: [{ appid: 1, date_added: 9 }] } });
      if (url.includes(`steamid=${VIEWER}`) && url.includes('access_token')) return jsonResponse({ response: { items: [{ appid: 2, date_added: 8 }] } });
      return jsonResponse({ response: {} });
    });
    const { handle } = createBackgroundHandlers(fetchImpl as unknown as typeof fetch);

    expect(await handle({ type: 'wishlist', steamid: FRIEND, tryLogin: true })).toEqual({
      entries: [{ appid: 1, addedAt: 9 }],
      via: 'public',
      loginAvailable: false,
    });
    expect(await handle({ type: 'wishlist', steamid: VIEWER, tryLogin: true })).toEqual({
      entries: [{ appid: 2, addedAt: 8 }],
      via: 'login',
      loginAvailable: true,
    });
    expect(await handle({ type: 'wishlist', steamid: PRIVATE_FRIEND, tryLogin: false })).toMatchObject({ entries: [], via: null });
    // The token is fetched once and reused.
    expect(calls.filter((c) => c.includes('ajaxgetasyncconfig'))).toHaveLength(1);
  });

  it('refreshes the token once on 401', async () => {
    let tokenCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('ajaxgetasyncconfig')) return jsonResponse({ success: 1, data: { webapi_token: `tok${++tokenCalls}` } });
      if (url.includes('access_token=tok1')) return new Response('Unauthorized', { status: 401 });
      if (url.includes('access_token=tok2')) return jsonResponse({ response: { items: [{ appid: 3 }] } });
      return jsonResponse({ response: {} });
    });
    const { handle } = createBackgroundHandlers(fetchImpl as unknown as typeof fetch);
    const r = await handle({ type: 'wishlist', steamid: VIEWER, tryLogin: true });
    expect(r.via).toBe('login');
    expect(tokenCalls).toBe(2);
  });

  it('batches GetItems in chunks of 200', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const json = JSON.parse(decodeURIComponent(String(input).split('input_json=')[1]));
      const ids = json.ids.map((i: { appid: number }) => i.appid);
      return jsonResponse({ response: { store_items: ids.map((a: number) => rawItem(a)) } });
    });
    const { handle } = createBackgroundHandlers(fetchImpl as unknown as typeof fetch);
    const ids = Array.from({ length: 450 }, (_, i) => i + 1);
    const items = await handle({ type: 'storeItems', appids: ids, language: 'english', country: 'DE' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(items).toHaveLength(450);
  });
});

describe('loadGroup', () => {
  function setup(opts: { loggedIn?: boolean; failMembers?: boolean } = {}) {
    const loggedIn = opts.loggedIn ?? true;
    const fetchText = vi.fn(async (url: string) => {
      if (url.includes('memberslistxml')) {
        if (opts.failMembers) throw new Error('HTTP 500');
        return membersXml([VIEWER, FRIEND, PRIVATE_FRIEND]);
      }
      if (url.endsWith(`${VIEWER}/?xml=1`)) return profileXml(VIEWER, 'me', 'friendsonly');
      if (url.endsWith(`${FRIEND}/?xml=1`)) return profileXml(FRIEND, 'Vitu');
      if (url.endsWith(`${PRIVATE_FRIEND}/?xml=1`)) return profileXml(PRIVATE_FRIEND, 'Shy', 'private');
      if (url.includes(`${FRIEND}/games`)) return gamesPageHtml(FRIEND, [{ appid: 10, name: 'Ten', playtime_forever: 600 }]);
      if (url.includes(`${PRIVATE_FRIEND}/games`)) return gamesPageHtml(PRIVATE_FRIEND, null);
      throw new Error(`unexpected ${url}`);
    });
    const bgImpl = vi.fn(async (req: { type: string; steamid?: string; appids?: number[] }) => {
      switch (req.type) {
        case 'viewerStore':
          return { loggedIn: true, owned: [10, 11], wishlist: [20, 21] };
        case 'wishlist':
          if (req.steamid === FRIEND) return { entries: [{ appid: 10, addedAt: 1 }, { appid: 20, addedAt: 2 }], via: 'public', loginAvailable: false };
          return { entries: [], via: null, loginAvailable: true };
        case 'storeItems':
          return req.appids!.map((a) => mapStoreItem(rawItem(a), a));
        default:
          return {};
      }
    });
    const deps: LoaderDeps = {
      groupBase: GROUP,
      page: { viewerSteamId: loggedIn ? VIEWER : null, loggedIn, language: 'english', country: 'DE' },
      fetchText,
      bg: bgImpl as unknown as BgCall,
      cache: createCache(memoryKv()),
      settings: { loadLibraries: true },
    };
    return { deps, fetchText, bgImpl };
  }

  it('loads members with per-source status and builds rows', async () => {
    const { deps } = setup();
    const snaps: LoadSnapshot[] = [];
    const final = await loadGroup(deps, { force: false }, (s) => snaps.push(s));

    expect(final.phase).toBe('done');
    expect(final.groupName).toBe('TestGroup');
    const [me, vitu, shy] = final.members;
    expect(me).toMatchObject({ name: 'me', isViewer: true, wishlist: { state: 'ok', count: 2, via: 'store' }, library: { state: 'ok', count: 2, via: 'store' } });
    expect(vitu).toMatchObject({ name: 'Vitu', wishlist: { state: 'ok', count: 2, via: 'public' }, library: { state: 'ok', count: 1, via: 'login' } });
    expect(shy).toMatchObject({ name: 'Shy', profilePrivacy: 'private', wishlist: { state: 'hidden' }, library: { state: 'hidden' } });

    const byId = new Map(final.rows.map((r) => [r.info.appid, r]));
    expect([...byId.keys()].sort((a, b) => a - b)).toEqual([10, 20, 21]);
    expect(byId.get(20)!.wishlistedBy.map((w) => w.steamid).sort()).toEqual([FRIEND, VIEWER].sort());
    // Vitu wishlisted 10 but owns it? No: Vitu owns 10 per library; viewer owns 10 too.
    expect(byId.get(10)!.ownedBy.map((o) => o.steamid).sort()).toEqual([FRIEND, VIEWER].sort());
    expect(byId.get(10)!.viewerOwns).toBe(true);
    expect(byId.get(21)!.viewerWishlisted).toBe(true);

    // Progress went members -> wishlists -> details -> done.
    expect(snaps.map((s) => s.phase)).toEqual(expect.arrayContaining(['members', 'wishlists', 'details', 'done']));
  });

  it('serves the second load from cache', async () => {
    const { deps, fetchText, bgImpl } = setup();
    await loadGroup(deps, { force: false }, () => {});
    const textCalls = fetchText.mock.calls.length;
    const bgCalls = bgImpl.mock.calls.length;
    await loadGroup(deps, { force: false }, () => {});
    expect(fetchText.mock.calls.length).toBe(textCalls);
    expect(bgImpl.mock.calls.length).toBe(bgCalls);
    await loadGroup(deps, { force: true }, () => {});
    expect(fetchText.mock.calls.length).toBeGreaterThan(textCalls);
  });

  it('asks logged-out viewers to sign in for libraries', async () => {
    const { deps } = setup({ loggedIn: false });
    const final = await loadGroup(deps, { force: false }, () => {});
    expect(final.members.every((m) => m.library.state === 'signin')).toBe(true);
    expect(final.members.find((m) => m.steamid === FRIEND)!.wishlist.state).toBe('ok');
  });

  it('reports a member-list failure', async () => {
    const { deps } = setup({ failMembers: true });
    const final = await loadGroup(deps, { force: false }, () => {});
    expect(final.phase).toBe('error');
    expect(final.error).toMatch(/member list/);
  });
});
