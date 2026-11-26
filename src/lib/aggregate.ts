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

export type SortKey = 'wishlisted' | 'owned' | 'interest' | 'discount' | 'price' | 'rating' | 'release' | 'name';

/** The "Sort by" options, in dropdown order. */
export const SORT_LABELS: Record<SortKey, string> = {
  wishlisted: 'Most wishlisted',
  owned: 'Most owned',
  interest: 'Most wishlisted+owned',
  discount: 'Discount',
  price: 'Price',
  rating: 'Reviews',
  release: 'Release date',
  name: 'Name',
};

/**
 * How the list runs: [default (arrow down), reversed (arrow up)]. Every option starts with the
 * biggest/newest/best first; Name starts with A–Z.
 */
export const SORT_ORDER: Record<SortKey, [string, string]> = {
  wishlisted: ['most wishlisted first', 'fewest wishlists first'],
  owned: ['most owners first', 'fewest owners first'],
  interest: ['most members first (wishlisted or owned)', 'fewest members first (wishlisted or owned)'],
  discount: ['biggest discount first', 'smallest discount first'],
  price: ['highest price first', 'lowest price first'],
  rating: ['best reviews first', 'worst reviews first'],
  release: ['newest first', 'oldest first'],
  name: ['A–Z', 'Z–A'],
};

export const isSortKey = (k: unknown): k is SortKey => typeof k === 'string' && Object.hasOwn(SORT_LABELS, k);

export interface ViewOptions {
  sort: SortKey;
  /** Show DLC, hardware, soundtracks, demos etc. */
  includeExtras: boolean;
  hideOwned: boolean;
  /** Hide games on the viewer's own wishlist. */
  hideWishlisted?: boolean;
  /** Reverse the sort order (the arrow next to "Sort by"). */
  reverse?: boolean;
  /** Only games these members wishlisted or own; null = no member filter. */
  members: SteamId[] | null;
  /** false = any of `members` (default), true = every one of them. */
  matchAll?: boolean;
}

/** The member has the game on their wishlist or in their library. */
export function memberHas(r: GameRow, id: SteamId): boolean {
  return r.wishlistedBy.some((w) => w.steamid === id) || r.ownedBy.some((o) => o.steamid === id);
}

const MAIN_TYPES = new Set<number>([StoreAppType.Game, StoreAppType.Software]);

export function isExtra(info: GameInfo): boolean {
  return info.available && !MAIN_TYPES.has(info.type);
}

const byName = (a: GameRow, b: GameRow) => a.info.name.localeCompare(b.info.name);
const wished = (r: GameRow) => r.wishlistedBy.length;
const owners = (r: GameRow) => r.ownedBy.length;
/** Members who have the game on their wishlist or in their library, each counted once. */
const interested = (r: GameRow) => new Set([...r.wishlistedBy, ...r.ownedBy].map((x) => x.steamid)).size;
const discount = (r: GameRow) => r.info.price?.discountPct ?? 0;
const price = (r: GameRow) => r.info.price?.finalCents ?? null;
const rating = (r: GameRow) => (r.info.review ? r.info.review.score * 1e9 + r.info.review.percent * 1e7 + r.info.review.count : null);
/** Undated "coming soon" games count as the newest; undated released ones have no date to sort by. */
const release = (r: GameRow) => r.info.releaseDate ?? (r.info.comingSoon ? Number.MAX_SAFE_INTEGER : null);
const desc = (f: (r: GameRow) => number | null) => (a: GameRow, b: GameRow) => (f(b) ?? 0) - (f(a) ?? 0);

/** The default (arrow down) order of each option; the arrow reverses it as a whole. */
const comparators: Record<SortKey, (a: GameRow, b: GameRow) => number> = {
  wishlisted: (a, b) => desc(wished)(a, b) || desc(discount)(a, b) || byName(a, b),
  owned: (a, b) => desc(owners)(a, b) || desc(wished)(a, b) || byName(a, b),
  interest: (a, b) => desc(interested)(a, b) || desc(wished)(a, b) || byName(a, b),
  discount: (a, b) => desc(discount)(a, b) || desc(wished)(a, b) || byName(a, b),
  price: (a, b) => desc(price)(a, b) || byName(a, b),
  rating: (a, b) => desc(rating)(a, b) || byName(a, b),
  release: (a, b) => desc(release)(a, b) || byName(a, b),
  name: byName,
};

/** Games with nothing to sort by for an option (no price, no reviews, no date) go last either way. */
const lacks: Partial<Record<SortKey, (r: GameRow) => boolean>> = {
  price: (r) => price(r) == null,
  rating: (r) => rating(r) == null,
  release: (r) => release(r) == null,
};

export function applyView(rows: GameRow[], opts: ViewOptions): GameRow[] {
  const filtered = rows.filter(
    (r) =>
      (opts.includeExtras || !isExtra(r.info)) &&
      (!opts.hideOwned || !r.viewerOwns) &&
      (!opts.hideWishlisted || !r.viewerWishlisted) &&
      (!opts.members ||
        (opts.matchAll ? opts.members.every((id) => memberHas(r, id)) : opts.members.some((id) => memberHas(r, id)))),
  );
  const key = isSortKey(opts.sort) ? opts.sort : 'wishlisted';
  const cmp = comparators[key];
  const lacking = lacks[key] ?? (() => false);
  const dir = opts.reverse ? -1 : 1;
  // Apps that vanished from the store go last, then games without a value for this option;
  // both stay at the bottom in either direction.
  return filtered.sort(
    (a, b) =>
      Number(!a.info.available) - Number(!b.info.available) ||
      Number(lacking(a)) - Number(lacking(b)) ||
      dir * cmp(a, b),
  );
}
