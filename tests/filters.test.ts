import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  filtersActive,
  matchesFilters,
  priceFormatter,
  priceLabel,
  priceSteps,
  tagCounts,
  type Filters,
} from '../src/lib/filters';
import { mapStoreItem } from '../src/lib/steam/store';
import type { GameRow } from '../src/lib/types';
import { rawItem } from './fixtures';

function row(appid: number, over: Record<string, unknown> = {}): GameRow {
  return { info: mapStoreItem(rawItem(appid, over), appid), wishlistedBy: [], ownedBy: [], viewerOwns: false, viewerWishlisted: false };
}

const rev = (percent: number, count: number) => ({
  reviews: { summary_filtered: { percent_positive: percent, review_count: count, review_score: 8, review_score_label: 'x' } },
});
const price = (cents: number, pct = 0) => ({
  best_purchase_option: { final_price_in_cents: cents, formatted_final_price: `${(cents / 100).toFixed(2).replace('.', ',')}€`, discount_pct: pct },
});

const rows = [
  row(1, { ...rev(96, 765203), ...price(4199, 30), tagids: [1, 2] }),
  row(2, { ...rev(62, 18003), ...price(2699, 55), tagids: [2, 3] }),
  row(3, { reviews: undefined, best_purchase_option: undefined, tagids: [3] }), // coming soon, no data
  row(4, { ...rev(88, 2004), is_free: true, best_purchase_option: undefined, tagids: [1] }),
];
const ids = (f: Partial<Filters>) => rows.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, ...f })).map((r) => r.info.appid);

describe('filters', () => {
  it('passes everything when empty', () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
    expect(ids({})).toEqual([1, 2, 3, 4]);
  });
  it('filters by review percent and count', () => {
    expect(ids({ reviewMin: 80 })).toEqual([1, 4]);
    expect(ids({ reviewMax: 70 })).toEqual([2]);
    expect(ids({ countMin: 10000 })).toEqual([1, 2]);
    expect(ids({ countMax: 20000 })).toEqual([2, 3, 4]);
  });
  it('filters by discount and price', () => {
    expect(ids({ discountMin: 50 })).toEqual([2]);
    expect(ids({ discountMax: 40 })).toEqual([1, 3, 4]);
    expect(ids({ priceMaxCents: 3000 })).toEqual([2, 4]);
    expect(ids({ priceMaxCents: 0 })).toEqual([4]);
    expect(ids({ priceMinCents: 3000 })).toEqual([1]);
    expect(ids({ priceMinCents: 2000, priceMaxCents: 3000 })).toEqual([2]);
  });
  it('includes all selected tags and excludes the excluded ones', () => {
    expect(ids({ tagsInclude: [2] })).toEqual([1, 2]);
    expect(ids({ tagsInclude: [1, 2] })).toEqual([1]);
    expect(ids({ tagsExclude: [3] })).toEqual([1, 4]);
    expect(rows.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, tagsInclude: [9] }, { ignoreTags: true }))).toHaveLength(4);
  });
  it('filters by release year; undated games pass a lower bound but no upper bound', () => {
    const dated = [
      row(10, { release: { steam_release_date: Date.UTC(2019, 5, 1) / 1000 } }),
      row(11, { release: { steam_release_date: Date.UTC(2023, 7, 3) / 1000 } }),
      row(12, { release: { is_coming_soon: true, coming_soon_display: 'date_quarter', steam_release_date: Date.UTC(2027, 11, 31) / 1000 } }),
      row(13, { release: { is_coming_soon: true, coming_soon_display: 'text_tba', custom_release_date_message: 'To be announced' } }),
    ];
    const pick = (f: Partial<Filters>) => dated.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, ...f })).map((r) => r.info.appid);
    expect(pick({})).toEqual([10, 11, 12, 13]);
    expect(pick({ releaseTo: 'any' })).toEqual([10, 11, 12]);
    expect(pick({ releaseFrom: 2020 })).toEqual([11, 12, 13]);
    expect(pick({ releaseFrom: 2020, releaseTo: 'any' })).toEqual([11, 12]);
    expect(pick({ releaseTo: 2023 })).toEqual([10, 11]);
    expect(pick({ releaseFrom: 2020, releaseTo: 2023 })).toEqual([11]);
    expect(filtersActive({ ...EMPTY_FILTERS, releaseTo: 'any' })).toBe(true);
  });

  it('supports "today" on both ends', () => {
    const now = new Date(2026, 10, 26, 15, 0).getTime(); // 26 Nov 2026, 15:00 local
    const at = (y: number, m: number, d: number, h = 12) => Math.floor(new Date(y, m, d, h).getTime() / 1000);
    const games = [
      row(30, { release: { steam_release_date: at(2026, 10, 25) } }), // yesterday
      row(31, { release: { steam_release_date: at(2026, 10, 26, 9) } }), // today, earlier than now
      row(32, { release: { is_coming_soon: true, coming_soon_display: 'date_full', steam_release_date: at(2026, 10, 27) } }), // tomorrow
      row(33, { release: { is_coming_soon: true, coming_soon_display: 'text_tba', custom_release_date_message: 'To be announced' } }),
    ];
    const pick = (f: Partial<Filters>) => games.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, ...f }, { now })).map((r) => r.info.appid);
    expect(pick({ releaseFrom: 'today' })).toEqual([31, 32, 33]);
    expect(pick({ releaseFrom: 'today', releaseTo: 'any' })).toEqual([31, 32]);
    expect(pick({ releaseTo: 'today' })).toEqual([30, 31]);
    expect(pick({ releaseFrom: 'today', releaseTo: 'today' })).toEqual([31]);
    expect(pick({ releaseFrom: 2026, releaseTo: 'today' })).toEqual([30, 31]);
  });

  it('lists release years and labels the range', async () => {
    const { releaseYears, releaseLabel } = await import('../src/lib/filters');
    const ys = releaseYears([row(20, { release: { steam_release_date: Date.UTC(2019, 0, 2) / 1000 } })], Date.UTC(2026, 10, 25));
    expect(ys).toEqual([2026, 2019]);
    expect(releaseLabel(null, null)).toBe('Any release date');
    expect(releaseLabel(null, 'any')).toBe('Any date, no "To be announced"');
    expect(releaseLabel(2020, null)).toBe('2020 or later, incl. unannounced');
    expect(releaseLabel(2020, 'any')).toBe('2020 or later, dated only');
    expect(releaseLabel(null, 2023)).toBe('Up to 2023');
    expect(releaseLabel(2020, 2023)).toBe('2020 – 2023');
    expect(releaseLabel('today', null)).toBe('Today or later, incl. unannounced');
    expect(releaseLabel(null, 'today')).toBe('Released up to today');
    expect(releaseLabel(2025, 'today')).toBe('2025 – Today');
  });

  it('counts tags, most common first', () => {
    expect(tagCounts(rows)).toEqual([[1, 2], [2, 2], [3, 2]]);
    expect(tagCounts(rows.slice(0, 2))[0]).toEqual([2, 2]);
  });
  it('builds price stops and labels in the store currency', () => {
    const steps = priceSteps(rows);
    expect(steps.slice(0, 3)).toEqual([0, 500, 1000]);
    expect(steps.at(-1)).toBe(Infinity);
    const fmt = priceFormatter(rows);
    expect(priceLabel(null, 1000, fmt)).toBe('Under 10€');
    expect(priceLabel(null, 0, fmt)).toBe('Free');
    expect(priceLabel(null, null, fmt)).toBe('Any Price');
    expect(priceLabel(2000, null, fmt)).toBe('20€ and up');
    expect(priceLabel(1000, 3000, fmt)).toBe('10€ – 30€');
    const yen = [row(9, { best_purchase_option: { final_price_in_cents: 498000, formatted_final_price: '¥ 4,980', discount_pct: 0 } })];
    expect(priceSteps(yen)[1]).toBe(500 * 100); // ¥500 (Steam reports yen ×100 too)
    expect(priceFormatter(yen)(50000)).toBe('¥ 500');
  });
});
