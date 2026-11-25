/**
 * Background-worker side: every request that needs extension privileges (cross-site cookies for
 * store.steampowered.com, the viewer's web API token) runs here. The token never leaves this module.
 */
import type { BgRequest, BgResponseMap, WishlistResult } from './messages';
import {
  GET_ITEMS_BATCH,
  buildGetItemsUrl,
  chunk,
  mapGetItemsResponse,
  parseUserData,
  parseWishlistResponse,
} from './steam/store';

type Fetch = typeof fetch;

const TOKEN_TTL_MS = 30 * 60 * 1000;

export function createBackgroundHandlers(fetchImpl: Fetch = (input, init) => fetch(input, init)) {
  let token: { value: string | null; at: number } | null = null;

  async function getJson(url: string, init?: RequestInit): Promise<unknown> {
    const res = await fetchImpl(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).pathname}`);
    return res.json();
  }

  /** The viewer's store web API token (null when logged out). Same source Steam's own pages use. */
  async function webApiToken(forceRefresh = false): Promise<string | null> {
    if (!forceRefresh && token && Date.now() - token.at < TOKEN_TTL_MS) return token.value;
    try {
      const j = (await getJson('https://store.steampowered.com/pointssummary/ajaxgetasyncconfig', {
        credentials: 'include',
        cache: 'no-store',
      })) as { success?: number | boolean; data?: Record<string, unknown> };
      const v = j?.data?.webapi_token;
      token = { value: typeof v === 'string' && v ? v : null, at: Date.now() };
    } catch {
      token = { value: null, at: Date.now() };
    }
    return token.value;
  }

  async function wishlist(steamid: string, tryLogin: boolean): Promise<WishlistResult> {
    const base = 'https://api.steampowered.com/IWishlistService/GetWishlist/v1/';
    const anon = parseWishlistResponse(await getJson(`${base}?steamid=${steamid}`, { credentials: 'omit' }));
    if (anon.length > 0) return { entries: anon, via: 'public', loginAvailable: false };
    if (!tryLogin) return { entries: [], via: null, loginAvailable: false };

    let t = await webApiToken();
    if (!t) return { entries: [], via: null, loginAvailable: false };
    const call = (tok: string) =>
      fetchImpl(`${base}?steamid=${steamid}&access_token=${encodeURIComponent(tok)}`, { credentials: 'omit' });
    let res = await call(t);
    if (res.status === 401 || res.status === 403) {
      t = await webApiToken(true);
      if (!t) return { entries: [], via: null, loginAvailable: false };
      res = await call(t);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for GetWishlist (login)`);
    const entries = parseWishlistResponse(await res.json());
    return { entries, via: entries.length ? 'login' : null, loginAvailable: true };
  }

  async function handle<K extends BgRequest['type']>(req: Extract<BgRequest, { type: K }>): Promise<BgResponseMap[K]>;
  async function handle(req: BgRequest): Promise<BgResponseMap[BgRequest['type']]> {
    switch (req.type) {
      case 'viewerStore': {
        const json = await getJson(`https://store.steampowered.com/dynamicstore/userdata/?t=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        return parseUserData(json);
      }
      case 'wishlist':
        return wishlist(req.steamid, req.tryLogin);
      case 'storeItems': {
        const out = [];
        for (const batch of chunk(req.appids, GET_ITEMS_BATCH)) {
          const json = await getJson(buildGetItemsUrl(batch, req.language, req.country), { credentials: 'omit' });
          out.push(...mapGetItemsResponse(json, batch));
        }
        return out;
      }
      case 'tags': {
        const json = (await getJson(
          `https://store.steampowered.com/tagdata/populartags/${encodeURIComponent(req.language)}`,
          { credentials: 'omit' },
        )) as { tagid: number; name: string }[];
        const map: Record<number, string> = {};
        for (const t of json ?? []) map[t.tagid] = t.name;
        return map;
      }
    }
  }

  return { handle };
}
