/** Merges members' wishlists and libraries with store data into display rows, and sorts/filters them. */
import { mapStoreItem } from './steam/store';
import { StoreAppType, type GameInfo, type GameRow, type Member, type SteamId, type ViewerStoreData, type WishlistEntry } from './types';

export interface AggregateInput {
  members: Member[];
  wishlists: Map<SteamId, WishlistEntry[]>;
  /** appid -> playtime minutes, per member. */
  libraries: Map<SteamId, Map<number, number>>;
  games: Map<number, GameInfo>;
  viewer: ViewerStoreData;
}

export function unionAppids(wishlists: Map<SteamId, WishlistEntry[]>): number[] {
  const s = new Set<number>();
  for (const list of wishlists.values()) for (const e of list) s.add(e.appid);
  return [...s];
}

export function buildRows(input: AggregateInput): GameRow[] {
  const viewerOwned = new Set(input.viewer.owned);
  const viewerWish = new Set(input.viewer.wishlist);
  const rows = new Map<number, GameRow>();

  for (const m of input.members) {
    for (const e of input.wishlists.get(m.steamid) ?? []) {
      let row = rows.get(e.appid);
      if (!row) {
        row = {
          info: input.games.get(e.appid) ?? mapStoreItem({}, e.appid),
          wishlistedBy: [],
          ownedBy: [],
          viewerOwns: viewerOwned.has(e.appid),
          viewerWishlisted: viewerWish.has(e.appid),
        };
        rows.set(e.appid, row);
      }
      if (!row.wishlistedBy.some((w) => w.steamid === m.steamid)) {
        row.wishlistedBy.push({ steamid: m.steamid, addedAt: e.addedAt });
      }
    }
  }

  for (const row of rows.values()) {
    for (const m of input.members) {
      const lib = input.libraries.get(m.steamid);
      if (lib?.has(row.info.appid)) row.ownedBy.push({ steamid: m.steamid, playtime: lib.get(row.info.appid) ?? 0 });
    }
    row.wishlistedBy.sort((a, b) => a.addedAt - b.addedAt);
  }
  return [...rows.values()];
}

export type SortKey = 'wishlisted' | 'discount' | 'price' | 'rating' | 'release' | 'name';

export const SORT_LABELS: Record<SortKey, string> = {
  wishlisted: 'Most wishlisted',
  discount: 'Biggest discount',
  price: 'Lowest price',
  rating: 'Best rated',
  release: 'Release date',
  name: 'Name',
};

export interface ViewOptions {
  sort: SortKey;
  /** Show DLC, hardware, soundtracks, demos etc. */
  includeExtras: boolean;
  hideOwned: boolean;
  /** Only games at least one of these members wishlisted or owns; null = everyone. */
  members: SteamId[] | null;
}

const MAIN_TYPES = new Set<number>([StoreAppType.Game, StoreAppType.Software]);

export function isExtra(info: GameInfo): boolean {
  return info.available && !MAIN_TYPES.has(info.type);
}

const byName = (a: GameRow, b: GameRow) => a.info.name.localeCompare(b.info.name);
const discount = (r: GameRow) => r.info.price?.discountPct ?? 0;
const rating = (r: GameRow) => (r.info.review ? r.info.review.score * 1e9 + r.info.review.percent * 1e7 + r.info.review.count : -1);
const release = (r: GameRow) => (r.info.comingSoon ? Number.MAX_SAFE_INTEGER : r.info.releaseDate ?? 0);
const price = (r: GameRow) => r.info.price?.finalCents ?? Number.MAX_SAFE_INTEGER;

const comparators: Record<SortKey, (a: GameRow, b: GameRow) => number> = {
  wishlisted: (a, b) => b.wishlistedBy.length - a.wishlistedBy.length || discount(b) - discount(a) || byName(a, b),
  discount: (a, b) => discount(b) - discount(a) || b.wishlistedBy.length - a.wishlistedBy.length || byName(a, b),
  price: (a, b) => price(a) - price(b) || byName(a, b),
  rating: (a, b) => rating(b) - rating(a) || byName(a, b),
  release: (a, b) => release(b) - release(a) || byName(a, b),
  name: byName,
};

export function applyView(rows: GameRow[], opts: ViewOptions): GameRow[] {
  const filtered = rows.filter(
    (r) =>
      (opts.includeExtras || !isExtra(r.info)) &&
      (!opts.hideOwned || !r.viewerOwns) &&
      (!opts.members ||
        r.wishlistedBy.some((w) => opts.members!.includes(w.steamid)) ||
        r.ownedBy.some((o) => opts.members!.includes(o.steamid))),
  );
  const cmp = comparators[opts.sort];
  // Apps that vanished from the store always go last.
  return filtered.sort((a, b) => Number(!a.info.available) - Number(!b.info.available) || cmp(a, b));
}
