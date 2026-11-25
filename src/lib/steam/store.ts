/** Steam store data: request builders and mappers for IStoreBrowseService/GetItems and friends. */
import type { GameInfo, PriceInfo, ReviewSummary, WishlistEntry } from '../types';

export const STORE_ASSET_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/';
export const GET_ITEMS_BATCH = 200;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3 Aug, 2023" — the format Steam search uses. */
export function formatReleaseDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
}

export function buildGetItemsUrl(appids: number[], language: string, country: string | null): string {
  const input = {
    ids: appids.map((appid) => ({ appid })),
    context: { language, ...(country ? { country_code: country } : {}) },
    data_request: {
      include_assets: true,
      include_release: true,
      include_platforms: true,
      include_reviews: true,
      include_basic_info: true,
      include_screenshots: true,
      include_tag_count: 20,
    },
  };
  return (
    'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' +
    encodeURIComponent(JSON.stringify(input))
  );
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* Raw GetItems item, only the fields we read. */
interface RawStoreItem {
  appid?: number;
  id?: number;
  success?: number;
  visible?: boolean;
  name?: string;
  type?: number;
  is_free?: boolean;
  store_url_path?: string;
  tagids?: number[];
  assets?: { asset_url_format?: string; small_capsule?: string; header?: string };
  release?: {
    steam_release_date?: number;
    is_coming_soon?: boolean;
    custom_release_date_message?: string;
    coming_soon_display?: string;
  };
  platforms?: {
    windows?: boolean;
    mac?: boolean;
    steamos_linux?: boolean;
    linux?: boolean;
    steam_deck_compat_category?: number;
  };
  reviews?: {
    summary_filtered?: {
      review_score?: number;
      review_score_label?: string;
      percent_positive?: number;
      review_count?: number;
    };
  };
  best_purchase_option?: {
    formatted_final_price?: string;
    formatted_original_price?: string;
    discount_pct?: number;
    final_price_in_cents?: string | number;
    hide_discount_pct_for_compliance?: boolean;
  };
  basic_info?: { short_description?: string };
  screenshots?: { all_ages_screenshots?: { filename?: string }[] };
}

function assetUrl(fmt: string | undefined, file: string | undefined): string | null {
  if (!fmt || !file) return null;
  return STORE_ASSET_BASE + fmt.replace('${FILENAME}', file);
}

function mapReview(raw: RawStoreItem['reviews']): ReviewSummary | null {
  const s = raw?.summary_filtered;
  if (!s || !s.review_count) return null;
  return {
    score: s.review_score ?? 0,
    label: s.review_score_label ?? '',
    percent: s.percent_positive ?? 0,
    count: s.review_count ?? 0,
  };
}

function mapPrice(raw: RawStoreItem): PriceInfo | null {
  if (raw.is_free) return { isFree: true, final: 'Free', original: null, discountPct: 0, finalCents: 0 };
  const p = raw.best_purchase_option;
  if (!p || !p.formatted_final_price) return null;
  const pct = p.hide_discount_pct_for_compliance ? 0 : p.discount_pct ?? 0;
  return {
    isFree: false,
    final: p.formatted_final_price,
    original: pct > 0 ? p.formatted_original_price ?? null : null,
    discountPct: pct,
    finalCents: p.final_price_in_cents != null ? Number(p.final_price_in_cents) : null,
  };
}

/** Maps one GetItems entry. `appid` is used when Steam returns an unavailable stub. */
export function mapStoreItem(raw: RawStoreItem, appid: number): GameInfo {
  const id = raw.appid ?? raw.id ?? appid;
  const available = raw.success === 1 && raw.visible !== false && !!raw.name;
  const rel = raw.release ?? {};
  const comingSoon = !!rel.is_coming_soon || (!rel.steam_release_date && available);
  const releaseText = rel.steam_release_date && !rel.is_coming_soon
    ? formatReleaseDate(rel.steam_release_date)
    : rel.custom_release_date_message || (comingSoon ? 'Coming soon' : '');
  const fmt = raw.assets?.asset_url_format;
  const p = raw.platforms ?? {};
  return {
    appid: id,
    available,
    name: available ? (raw.name as string) : `App ${id} (not on the store)`,
    type: raw.type ?? 0,
    storeUrl: `https://store.steampowered.com/${raw.store_url_path || `app/${id}`}`,
    capsule: assetUrl(fmt, raw.assets?.small_capsule),
    header: assetUrl(fmt, raw.assets?.header),
    releaseDate: rel.is_coming_soon ? null : rel.steam_release_date ?? null,
    releaseText,
    comingSoon,
    review: mapReview(raw.reviews),
    price: mapPrice(raw),
    platforms: {
      windows: !!p.windows,
      mac: !!p.mac,
      linux: !!(p.steamos_linux || p.linux),
      deck: p.steam_deck_compat_category ?? 0,
    },
    tagids: raw.tagids ?? [],
    screenshots: (raw.screenshots?.all_ages_screenshots ?? [])
      .slice(0, 4)
      .map((s) => (s.filename ? STORE_ASSET_BASE + s.filename : ''))
      .filter(Boolean),
    shortDescription: raw.basic_info?.short_description ?? '',
  };
}

/** Maps a GetItems response; every requested appid gets an entry (unavailable stubs included). */
export function mapGetItemsResponse(json: unknown, requested: number[]): GameInfo[] {
  const items = ((json as { response?: { store_items?: RawStoreItem[] } })?.response?.store_items ?? []) as RawStoreItem[];
  const byId = new Map<number, RawStoreItem>();
  for (const it of items) {
    const id = it.appid ?? it.id;
    if (typeof id === 'number') byId.set(id, it);
  }
  return requested.map((appid) => mapStoreItem(byId.get(appid) ?? {}, appid));
}

/** Parses IWishlistService/GetWishlist. An empty `{"response":{}}` means private or empty. */
export function parseWishlistResponse(json: unknown): WishlistEntry[] {
  const items = (json as { response?: { items?: { appid?: number; date_added?: number }[] } })?.response?.items ?? [];
  return items
    .filter((i) => typeof i.appid === 'number')
    .map((i) => ({ appid: i.appid as number, addedAt: i.date_added ?? 0 }));
}

/** Parses store.steampowered.com/dynamicstore/userdata/. */
export function parseUserData(json: unknown): { loggedIn: boolean; owned: number[]; wishlist: number[] } {
  const j = (json ?? {}) as { rgOwnedApps?: number[]; rgWishlist?: number[]; rgOwnedPackages?: number[] };
  const owned = Array.isArray(j.rgOwnedApps) ? j.rgOwnedApps : [];
  const wishlist = Array.isArray(j.rgWishlist) ? j.rgWishlist : [];
  const packages = Array.isArray(j.rgOwnedPackages) ? j.rgOwnedPackages : [];
  // Logged-out responses carry empty arrays; any owned package/app or wishlist entry means a session.
  return { loggedIn: owned.length + wishlist.length + packages.length > 0, owned, wishlist };
}
