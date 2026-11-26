import { describe, expect, it } from 'vitest';
import { applyView, buildRows, type ViewOptions } from '../src/lib/aggregate';
import { mapStoreItem } from '../src/lib/steam/store';
import type { GameInfo, Member } from '../src/lib/types';
import { FRIEND, VIEWER, rawItem } from './fixtures';

const member = (steamid: string, isViewer = false): Member => ({
  steamid,
  name: steamid.slice(-1),
  avatar: null,
  profilePrivacy: 'public',
  isViewer,
  wishlist: { state: 'ok' },
  library: { state: 'ok' },
});

function game(appid: number, over: Record<string, unknown> = {}): GameInfo {
  return mapStoreItem(rawItem(appid, over), appid);
}

const games = new Map<number, GameInfo>([
  [1, game(1, { name: 'Alpha', best_purchase_option: { formatted_final_price: '10€', final_price_in_cents: 1000, discount_pct: 0 } })],
  [2, game(2, { name: 'Bravo', best_purchase_option: { formatted_final_price: '5€', formatted_original_price: '20€', final_price_in_cents: 500, discount_pct: 75 } })],
  [3, game(3, { name: 'Charlie', type: 10 })], // hardware
  [4, game(4, { name: 'Delta', release: { steam_release_date: 1500000000 }, reviews: { summary_filtered: { review_score: 5, review_count: 10, percent_positive: 60, review_score_label: 'Mixed' } } })],
]);

const rows = buildRows({
  members: [member(VIEWER, true), member(FRIEND)],
  wishlists: new Map([
    [VIEWER, [{ appid: 1, addedAt: 100 }, { appid: 2, addedAt: 300 }]],
    [FRIEND, [{ appid: 2, addedAt: 200 }, { appid: 3, addedAt: 1 }, { appid: 4, addedAt: 2 }, { appid: 99, addedAt: 3 }]],
  ]),
  libraries: new Map([[FRIEND, new Map([[1, 120]])]]),
  games,
  viewer: { loggedIn: true, owned: [4], wishlist: [1, 2] },
});

const view = (o: Partial<ViewOptions>) => applyView(rows, { sort: 'wishlisted', includeExtras: false, hideOwned: false, members: null, ...o }).map((r) => r.info.appid);

describe('buildRows', () => {
  it('merges wishlists, owners and viewer flags', () => {
    const bravo = rows.find((r) => r.info.appid === 2)!;
    expect(bravo.wishlistedBy).toEqual([{ steamid: FRIEND, addedAt: 200 }, { steamid: VIEWER, addedAt: 300 }]);
    expect(bravo.viewerWishlisted).toBe(true);

    const alpha = rows.find((r) => r.info.appid === 1)!;
    expect(alpha.ownedBy).toEqual([{ steamid: FRIEND, playtime: 120 }]);

    const delta = rows.find((r) => r.info.appid === 4)!;
    expect(delta.viewerOwns).toBe(true);
  });

  it('keeps apps without store data as unavailable rows', () => {
    const missing = rows.find((r) => r.info.appid === 99)!;
    expect(missing.info.available).toBe(false);
  });
});

describe('applyView', () => {
  it('sorts by most wishlisted, hides extras, unavailable last', () => {
    // 2 has two wishlisters; 4 (30% off, fixture default) beats 1 (no discount) on the tie-break.
    expect(view({})).toEqual([2, 4, 1, 99]);
  });
  it('includes hardware/DLC on request', () => {
    expect(view({ includeExtras: true })).toContain(3);
  });
  it('sorts by owners and by members who wishlisted or own a game', () => {
    expect(view({ sort: 'owned' })).toEqual([1, 2, 4, 99]); // only 1 is owned; then by wishlists
    // 1 (one wishlist + one owner) ties 2 (two wishlists) at two members; more wishlists wins.
    expect(view({ sort: 'interest' })).toEqual([2, 1, 4, 99]);
  });
  it('sorts by discount, price, rating and name, biggest first (name A–Z)', () => {
    expect(view({ sort: 'discount' })[0]).toBe(2);
    expect(view({ sort: 'price' })).toEqual([4, 1, 2, 99]); // 41,99 > 10 > 5
    expect(view({ sort: 'price', reverse: true })).toEqual([2, 1, 4, 99]);
    expect(view({ sort: 'rating' }).indexOf(4)).toBeGreaterThan(view({ sort: 'rating' }).indexOf(1));
    expect(view({ sort: 'name' })).toEqual([1, 2, 4, 99]);
  });
  it('sorts release dates newest first and reverses any order; unavailable apps stay last', () => {
    expect(view({ sort: 'release' })).toEqual([1, 2, 4, 99]); // Delta is older; 1 and 2 tie → by name
    expect(view({ sort: 'release', reverse: true })).toEqual([4, 2, 1, 99]);
    expect(view({ sort: 'name', reverse: true })).toEqual([4, 2, 1, 99]);
    expect(view({ sort: 'wishlisted', reverse: true }).at(0)).not.toBe(2);
  });
  it('keeps games without a price or reviews last in both directions', () => {
    const cheap = { formatted_final_price: '5€', final_price_in_cents: 500, discount_pct: 0 };
    const extra = buildRows({
      members: [member(VIEWER, true)],
      wishlists: new Map([[VIEWER, [5, 6, 7].map((appid) => ({ appid, addedAt: 1 }))]]),
      libraries: new Map(),
      games: new Map([
        [5, game(5, { name: 'Echo', best_purchase_option: undefined, reviews: undefined, release: {} })],
        [6, game(6, { name: 'Fox' })],
        [7, game(7, { name: 'Golf', best_purchase_option: cheap, release: { steam_release_date: 1500000000 } })],
      ]),
      viewer: { loggedIn: true, owned: [], wishlist: [] },
    });
    const v = (o: Partial<ViewOptions>) =>
      applyView(extra, { sort: 'price', includeExtras: false, hideOwned: false, members: null, ...o }).map((r) => r.info.appid);
    expect(v({})).toEqual([6, 7, 5]);
    expect(v({ reverse: true })).toEqual([7, 6, 5]);
    expect(v({ sort: 'rating' }).at(-1)).toBe(5);
    expect(v({ sort: 'rating', reverse: true }).at(-1)).toBe(5);
    // Without a date Steam says "Coming soon": that counts as the newest, so first, and last reversed.
    expect(v({ sort: 'release' })).toEqual([5, 6, 7]);
    expect(v({ sort: 'release', reverse: true })).toEqual([7, 6, 5]);
  });
  it('falls back to "most wishlisted" for an unknown sort option (old saved settings)', () => {
    expect(view({ sort: 'bogus' as ViewOptions['sort'] })).toEqual(view({}));
  });
  it('hides games on the viewer\'s wishlist', () => {
    expect(view({ hideWishlisted: true })).toEqual([4, 99]);
  });
  it('filters by member and hides owned games', () => {
    expect(view({ members: [VIEWER] })).toEqual([2, 1]);
    expect(view({ hideOwned: true })).not.toContain(4);
  });
});
