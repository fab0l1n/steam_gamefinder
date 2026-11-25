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
  [4, game(4, { name: 'Delta', reviews: { summary_filtered: { review_score: 5, review_count: 10, percent_positive: 60, review_score_label: 'Mixed' } } })],
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
  it('sorts by discount, price, rating and name', () => {
    expect(view({ sort: 'discount' })[0]).toBe(2);
    expect(view({ sort: 'price' }).slice(0, 2)).toEqual([2, 1]);
    expect(view({ sort: 'rating' }).indexOf(4)).toBeGreaterThan(view({ sort: 'rating' }).indexOf(1));
    expect(view({ sort: 'name' })).toEqual([1, 2, 4, 99]);
  });
  it('filters by member and hides owned games', () => {
    expect(view({ members: [VIEWER] })).toEqual([2, 1]);
    expect(view({ hideOwned: true })).not.toContain(4);
  });
});
