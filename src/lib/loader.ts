/**
 * Orchestrates loading a group's data and reports progress as snapshots. All I/O is injected so the
 * flow can be unit-tested and reused by the UI harness.
 */
import { buildRows, unionAppids } from './aggregate';
import { mapLimit } from './util';
import { errorText, type Cache } from './cache';
import type { BgRequest, BgResponseMap, WishlistResult } from './messages';
import { parseMembersXml, parseOwnedGamesPage, parseProfileXml, type PageContext } from './steam/community';
import type { CoopInfo, GameInfo, LoadSnapshot, Member, SourceStatus, SteamId, ViewerStoreData, WishlistEntry } from './types';

export const TTL = {
  members: 60 * 60e3,
  profile: 24 * 60 * 60e3,
  wishlist: 60 * 60e3,
  library: 24 * 60 * 60e3,
  viewerStore: 10 * 60e3,
  storeItem: 3 * 60 * 60e3,
  tags: 7 * 24 * 60 * 60e3,
  coop: 30 * 24 * 60 * 60e3,
};

/** Co-op lookups per background call (the background runs them two at a time). */
const COOP_CHUNK = 10;

const MAX_MEMBER_PAGES = 10;

export type BgCall = <K extends BgRequest['type']>(req: Extract<BgRequest, { type: K }>) => Promise<BgResponseMap[K]>;

export interface LoaderDeps {
  groupBase: string;
  page: PageContext;
  /** Same-origin GET on steamcommunity.com, with the viewer's cookies. */
  fetchText: (url: string) => Promise<string>;
  bg: BgCall;
  cache: Cache;
  settings: { loadLibraries: boolean };
  now?: () => number;
}

export { mapLimit };

function status(state: SourceStatus['state'], extra: Partial<SourceStatus> = {}): SourceStatus {
  return { state, ...extra };
}

export async function loadGroup(
  deps: LoaderDeps,
  opts: { force: boolean },
  emit: (s: LoadSnapshot) => void,
): Promise<LoadSnapshot> {
  const { cache, page, force } = { ...deps, force: opts.force };
  const now = deps.now ?? Date.now;
  const snap: LoadSnapshot = {
    phase: 'members',
    message: 'Loading group members…',
    groupName: '',
    members: [],
    rows: [],
    viewer: { steamid: page.viewerSteamId, loggedIn: page.loggedIn },
    updatedAt: null,
  };
  const push = () => emit(structuredClone(snap));
  push();

  // 1. Member list (same origin).
  let memberIds: SteamId[];
  try {
    const res = await cache.cached(
      `members:${deps.groupBase}`,
      TTL.members,
      async () => {
        const first = parseMembersXml(await deps.fetchText(`${deps.groupBase}/memberslistxml/?xml=1`));
        const ids = [...first.steamIds];
        for (let p = 2; p <= Math.min(first.totalPages, MAX_MEMBER_PAGES); p++) {
          ids.push(...parseMembersXml(await deps.fetchText(`${deps.groupBase}/memberslistxml/?xml=1&p=${p}`)).steamIds);
        }
        return { groupName: first.groupName, ids: [...new Set(ids)] };
      },
      force,
    );
    snap.groupName = res.value.groupName;
    memberIds = res.value.ids;
  } catch (e) {
    snap.phase = 'error';
    snap.error = `Couldn't load the group's member list: ${errorText(e)}`;
    snap.message = snap.error;
    push();
    return snap;
  }

  snap.members = memberIds.map<Member>((id) => ({
    steamid: id,
    name: id,
    avatar: null,
    profilePrivacy: 'unknown',
    isViewer: id === page.viewerSteamId,
    wishlist: status('loading'),
    library: status(deps.settings.loadLibraries ? 'loading' : 'skipped'),
  }));
  snap.phase = 'wishlists';
  snap.message = `Loading ${memberIds.length} members…`;
  push();

  // 2. Profiles (names, avatars).
  await mapLimit(snap.members, 6, async (m) => {
    try {
      const res = await cache.cached(`profile:${m.steamid}`, TTL.profile, async () => {
        const p = parseProfileXml(await deps.fetchText(`https://steamcommunity.com/profiles/${m.steamid}/?xml=1`));
        if (!p) throw new Error('profile unavailable');
        return p;
      }, force);
      m.name = res.value.name;
      m.avatar = res.value.avatar;
      m.profilePrivacy = res.value.privacy;
    } catch {
      /* keep the steamid as name */
    }
  });
  push();

  // 3. The viewer's own store data (owned + wishlist) via the background (needs store cookies).
  let viewer: ViewerStoreData = { loggedIn: false, owned: [], wishlist: [] };
  if (page.loggedIn) {
    try {
      viewer = (await cache.cached(`viewerStore:${page.viewerSteamId}`, TTL.viewerStore, () => deps.bg({ type: 'viewerStore' }), force)).value;
    } catch {
      /* highlights just stay off */
    }
  }

  // 4. Wishlists and libraries, per member.
  const wishlists = new Map<SteamId, WishlistEntry[]>();
  const libraries = new Map<SteamId, Map<number, number>>();
  let done = 0;

  await mapLimit(snap.members, 3, async (m) => {
    // Wishlist
    try {
      const res = await cache.cached<WishlistResult>(
        `wishlist:${m.steamid}`,
        TTL.wishlist,
        () => deps.bg({ type: 'wishlist', steamid: m.steamid, tryLogin: page.loggedIn }),
        force,
      );
      let { entries, via } = res.value;
      let viaFinal: SourceStatus['via'] = via ?? undefined;
      if (!entries.length && m.isViewer && viewer.wishlist.length) {
        entries = viewer.wishlist.map((appid) => ({ appid, addedAt: 0 }));
        viaFinal = 'store';
      }
      if (entries.length) {
        wishlists.set(m.steamid, entries);
        m.wishlist = status('ok', { count: entries.length, via: viaFinal, fetchedAt: res.fetchedAt, stale: res.stale, error: res.error });
      } else {
        m.wishlist = status('hidden', {
          fetchedAt: res.fetchedAt,
          error: page.loggedIn
            ? 'Steam returned no wishlist, even with your login: private, friends-only (and you are not friends), or empty.'
            : 'Steam returned no wishlist: private, friends-only or empty. Sign in to Steam to try with your login.',
        });
      }
    } catch (e) {
      m.wishlist = status('error', { error: errorText(e) });
    }

    // Library
    if (deps.settings.loadLibraries) {
      if (m.isViewer && viewer.loggedIn) {
        libraries.set(m.steamid, new Map(viewer.owned.map((a) => [a, 0])));
        m.library = status('ok', { count: viewer.owned.length, via: 'store', fetchedAt: now() });
      } else if (!page.loggedIn) {
        m.library = status('signin', { error: 'Libraries load only while you are signed in to Steam.' });
      } else {
        try {
          const res = await cache.cached<[number, number][] | null>(
            `library:${m.steamid}`,
            TTL.library,
            async () => {
              const games = parseOwnedGamesPage(await deps.fetchText(`https://steamcommunity.com/profiles/${m.steamid}/games/?tab=all`));
              return games ? games.map((g) => [g.appid, g.playtime] as [number, number]) : null;
            },
            force,
          );
          if (res.value && res.value.length) {
            libraries.set(m.steamid, new Map(res.value));
            m.library = status('ok', { count: res.value.length, via: 'login', fetchedAt: res.fetchedAt, stale: res.stale, error: res.error });
          } else {
            m.library = status('hidden', { fetchedAt: res.fetchedAt, error: 'Steam showed no games: game details are private or friends-only.' });
          }
        } catch (e) {
          m.library = status('error', { error: errorText(e) });
        }
      }
    }

    done++;
    snap.message = `Loaded ${done} of ${snap.members.length} members…`;
    push();
  });

  // 5. Store details for every wishlisted app (cached per app).
  const appids = unionAppids(wishlists);
  snap.phase = 'details';
  snap.message = `Loading details for ${appids.length} games…`;
  push();

  // "app3": entries carry up to 20 tags and the co-op flag, so older cache entries are ignored.
  const keyOf = (appid: number) => `app3:${page.language}:${page.country ?? 'auto'}:${appid}`;
  const games = new Map<number, GameInfo>();
  const cachedApps = await cache.getMany<GameInfo>(appids.map(keyOf));
  const missing: number[] = [];
  for (const appid of appids) {
    const hit = cachedApps.get(keyOf(appid));
    if (hit) games.set(appid, hit.v);
    if (!hit || force || now() - hit.t >= TTL.storeItem) missing.push(appid);
  }
  if (missing.length) {
    try {
      const fresh = await deps.bg({ type: 'storeItems', appids: missing, language: page.language, country: page.country });
      for (const g of fresh) games.set(g.appid, g);
      await cache.setMany(new Map(fresh.map((g) => [keyOf(g.appid), g])));
    } catch (e) {
      snap.error = `Some game details could not be refreshed: ${errorText(e)}`;
    }
  }

  // 6. Rows (shown right away; co-op counts fill in afterwards).
  snap.rows = buildRows({ members: snap.members, wishlists, libraries, games, viewer });
  for (const r of snap.rows) if (!r.info.coopFlag) r.coop = null;
  snap.phase = 'done';
  const visible = snap.members.filter((m) => m.wishlist.state === 'ok').length;
  snap.message = `${snap.rows.length} games from the wishlists of ${visible} of ${snap.members.length} members`;
  snap.updatedAt = now();

  // 7. Co-op player counts from co-optimus, only for games Steam lists as co-op (cached 30 days).
  const coopRows = snap.rows.filter((r) => r.info.coopFlag);
  const coopKey = (appid: number) => `coop:${appid}`;
  const cachedCoop = await cache.getMany<CoopInfo | null>(coopRows.map((r) => coopKey(r.info.appid)));
  const missingCoop: number[] = [];
  const applyCoop = (appid: number, c: CoopInfo | null) => {
    for (const r of snap.rows) if (r.info.appid === appid) r.coop = c ?? steamOnlyCoop();
  };
  for (const r of coopRows) {
    const hit = cachedCoop.get(coopKey(r.info.appid));
    if (hit) applyCoop(r.info.appid, hit.v);
    if (!hit || force || now() - hit.t >= TTL.coop) missingCoop.push(r.info.appid);
  }
  snap.coopProgress = { done: coopRows.length - missingCoop.length, total: coopRows.length, failed: 0 };
  push();

  for (let i = 0; i < missingCoop.length; i += COOP_CHUNK) {
    const batch = missingCoop.slice(i, i + COOP_CHUNK);
    try {
      const res = await deps.bg({ type: 'coop', appids: batch });
      const fresh = new Map<string, CoopInfo | null>();
      for (const appid of batch) {
        if (appid in res.found) {
          applyCoop(appid, res.found[appid]);
          fresh.set(coopKey(appid), res.found[appid]);
        }
      }
      await cache.setMany(fresh);
      snap.coopProgress.failed += res.failed.length;
      if (res.failed.length) snap.error = `Some co-op counts could not be loaded: ${res.lastError ?? 'unknown error'}`;
    } catch (e) {
      snap.coopProgress.failed += batch.length;
      snap.error = `Some co-op counts could not be loaded: ${errorText(e)}`;
    }
    snap.coopProgress.done += batch.length;
    push();
  }
  return snap;
}

function steamOnlyCoop(): CoopInfo {
  return { source: 'steam', online: 0, local: 0, lan: 0, splitscreen: false, dropIn: false, campaign: false, url: null };
}

export async function loadTags(deps: Pick<LoaderDeps, 'bg' | 'cache' | 'page'>): Promise<Record<number, string>> {
  try {
    return (await deps.cache.cached(`tags:${deps.page.language}`, TTL.tags, () => deps.bg({ type: 'tags', language: deps.page.language }))).value;
  } catch {
    return {};
  }
}
