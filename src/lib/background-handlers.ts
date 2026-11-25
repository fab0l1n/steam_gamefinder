/**
 * Background-worker side: every request that needs extension privileges (cross-site cookies for
 * store.steampowered.com, the viewer's web API token) runs here. The token never leaves this module.
 */
import {
  COOPTIMUS_SITE,
  coOptimusNameUrl,
  coOptimusUrl,
  coopLabel,
  findSiteGamePath,
  parseCoOptimus,
  parseCoOptimusByName,
  parseSiteGamePage,
  slugify,
} from './coop';
import type { CoopInfo } from './types';
import type { BgRequest, BgResponseMap, CoopResult, WishlistResult } from './messages';
import { mapLimit } from './util';
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
/** Parallel requests to the co-optimus API. They publish no limit; keep it light. */
const COOPTIMUS_CONCURRENCY = 2;
/** co-optimus.com's robots.txt asks crawlers for 1 s between requests; we honour it for the website. */
const SITE_DELAY_MS = 1000;

export function createBackgroundHandlers(
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  opts: { siteDelayMs?: number } = {},
) {
  let token: { value: string | null; at: number } | null = null;
  const siteDelay = opts.siteDelayMs ?? SITE_DELAY_MS;

  /** Website requests run one at a time, at least `siteDelay` apart. */
  let siteChain: Promise<unknown> = Promise.resolve();
  let siteNextAt = 0;
  function siteFetch(url: string): Promise<Response> {
    const run = siteChain.then(async () => {
      const wait = siteNextAt - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      siteNextAt = Date.now() + siteDelay;
      return fetchImpl(url, { credentials: 'include' });
    });
    siteChain = run.catch(() => undefined);
    return run;
  }

  async function text(res: Response, what: string): Promise<string> {
    if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
    return res.text();
  }

  /** API by AppID → API by name → website (verified by the Steam link on the game page). */
  async function lookupCoop(appid: number, name: string, trace: string[]): Promise<CoopInfo | null> {
    const label = `${appid} ${name}`;
    const byId = parseCoOptimus(await text(await fetchImpl(coOptimusUrl(appid), { credentials: 'omit' }), 'API'), appid);
    if (byId) {
      trace.push(`${label}: API by AppID → ${coopLabel(byId)}`);
      return byId;
    }
    if (name) {
      const byName = parseCoOptimusByName(await text(await fetchImpl(coOptimusNameUrl(name), { credentials: 'omit' }), 'API name search'), name);
      if (byName) {
        trace.push(`${label}: API by name → ${coopLabel(byName)}`);
        return byName;
      }
    }
    const slug = slugify(name);
    if (!slug) {
      trace.push(`${label}: not in the API, no title to search the website`);
      return null;
    }
    const related = await siteFetch(`${COOPTIMUS_SITE}/related-news/${slug}`);
    const path = related.status === 404 ? null : findSiteGamePath(await text(related, 'website'), slug);
    if (!path) {
      trace.push(`${label}: not in the API; website has no page for "${slug}"`);
      return null;
    }
    const url = COOPTIMUS_SITE + path;
    const page = parseSiteGamePage(await text(await siteFetch(url), 'website game page'), appid, url);
    if (page.steamId != null && page.steamId !== appid) {
      trace.push(`${label}: website ${path} belongs to Steam app ${page.steamId}, ignored`);
      return null;
    }
    trace.push(`${label}: website ${path} → ${page.coop ? coopLabel(page.coop) : 'no co-op counts on the page'}`);
    return page.coop;
  }

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

  async function coop(items: { appid: number; name: string }[]): Promise<CoopResult> {
    const result: CoopResult = { found: {}, failed: [], trace: [] };
    await mapLimit(items, COOPTIMUS_CONCURRENCY, async ({ appid, name }) => {
      try {
        result.found[appid] = await lookupCoop(appid, name, result.trace);
      } catch (e) {
        result.failed.push(appid);
        result.lastError = e instanceof Error ? e.message : String(e);
        result.trace.push(`${appid} ${name}: failed (${result.lastError})`);
      }
    });
    return result;
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
      case 'coop':
        return coop(req.items);
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
