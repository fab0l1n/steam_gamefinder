/** Sidebar filters (review score/count, discount, price, user tags). Pure, unit-tested. */
import type { GameRow } from './types';

export interface Filters {
  /** Percent positive, 0..100. Full range = any. */
  reviewMin: number;
  reviewMax: number;
  countMin: number | null;
  countMax: number | null;
  discountMin: number | null;
  discountMax: number | null;
  /** In the currency's minor unit; null = no minimum. */
  priceMinCents: number | null;
  /** In the currency's minor unit; null = any price, 0 = free only. */
  priceMaxCents: number | null;
  tagsInclude: number[];
  tagsExclude: number[];
  /** Release from (inclusive): a year or 'today'; null = no lower bound. */
  releaseFrom: number | 'today' | null;
  /**
   * Release up to (inclusive): a year or 'today'; 'any' = any date but no "To be announced" /
   * "Coming soon"; null = no upper bound (undated games stay in).
   */
  releaseTo: number | 'today' | 'any' | null;
}

export type ReleaseBound = number | 'today';

const DAY = 24 * 60 * 60 * 1000;
function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** First millisecond a bound covers (a year starts 1 Jan UTC; today starts at local midnight). */
export function boundStart(b: ReleaseBound, now = Date.now()): number {
  return b === 'today' ? startOfToday(now) : Date.UTC(b, 0, 1);
}

/** First millisecond after a bound. */
export function boundEnd(b: ReleaseBound, now = Date.now()): number {
  return b === 'today' ? startOfToday(now) + DAY : Date.UTC(b + 1, 0, 1);
}

export const EMPTY_FILTERS: Filters = {
  reviewMin: 0,
  reviewMax: 100,
  countMin: null,
  countMax: null,
  discountMin: null,
  discountMax: null,
  priceMinCents: null,
  priceMaxCents: null,
  tagsInclude: [],
  tagsExclude: [],
  releaseFrom: null,
  releaseTo: null,
};

export function filtersActive(f: Filters): boolean {
  return (
    f.reviewMin > 0 ||
    f.reviewMax < 100 ||
    f.countMin != null ||
    f.countMax != null ||
    f.discountMin != null ||
    f.discountMax != null ||
    f.priceMinCents != null ||
    f.priceMaxCents != null ||
    f.tagsInclude.length > 0 ||
    f.tagsExclude.length > 0 ||
    f.releaseFrom != null ||
    f.releaseTo != null
  );
}

export function matchesFilters(row: GameRow, f: Filters, opts: { ignoreTags?: boolean; now?: number } = {}): boolean {
  const { review, price, tagids } = row.info;

  if (f.reviewMin > 0 || f.reviewMax < 100) {
    if (!review || review.percent < f.reviewMin || review.percent > f.reviewMax) return false;
  }
  if (f.countMin != null && (!review || review.count < f.countMin)) return false;
  if (f.countMax != null && (review?.count ?? 0) > f.countMax) return false;

  const pct = price?.discountPct ?? 0;
  if (f.discountMin != null && pct < f.discountMin) return false;
  if (f.discountMax != null && pct > f.discountMax) return false;

  if (f.priceMinCents != null || f.priceMaxCents != null) {
    if (!price || price.finalCents == null) return false;
    if (f.priceMinCents != null && price.finalCents < f.priceMinCents) return false;
    if (f.priceMaxCents != null && price.finalCents > f.priceMaxCents) return false;
  }

  if (f.releaseFrom != null || f.releaseTo != null) {
    const now = opts.now ?? Date.now();
    const d = row.info.releaseDate;
    if (d == null) {
      // Undated ("To be announced", "Coming soon") counts as a future release: it passes a lower
      // bound, but any upper bound (a year, today or "Any") drops it.
      if (!row.info.comingSoon || f.releaseTo != null) return false;
    } else {
      const t = d * 1000;
      if (f.releaseFrom != null && t < boundStart(f.releaseFrom, now)) return false;
      if (f.releaseTo != null && f.releaseTo !== 'any' && t >= boundEnd(f.releaseTo, now)) return false;
    }
  }

  if (!opts.ignoreTags) {
    if (f.tagsInclude.some((t) => !tagids.includes(t))) return false;
    if (f.tagsExclude.some((t) => tagids.includes(t))) return false;
  }
  return true;
}

/** How many of `rows` carry each tag, most common first. */
export function tagCounts(rows: GameRow[]): [number, number][] {
  const counts = new Map<number, number>();
  for (const r of rows) for (const t of r.info.tagids) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

/**
 * Price slider stops in minor units, ending with Infinity (= any price). Scaled to the currency:
 * euros get 5, 10, 15 …; currencies with bigger numbers (yen, rubles) get the same stops × 10^n.
 */
export function priceSteps(rows: GameRow[]): number[] {
  const prices = rows
    .map((r) => r.info.price?.finalCents)
    .filter((c): c is number => c != null && c > 0)
    .sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] / 100 : 20;
  const scale = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(median, 1))) - 1));
  return [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70].map((v) => v * scale * 100).concat(Infinity);
}

/** Formats whole amounts like the store does ("10€", "$10", "10 zł"), learned from a sample price. */
export function priceFormatter(rows: GameRow[]): (cents: number) => string {
  const sample = rows.find((r) => r.info.price && !r.info.price.isFree && r.info.price.final)?.info.price?.final;
  const m = sample?.match(/^(.*?)(\d[\d.,\s]*\d|\d)(.*)$/);
  const prefix = m ? m[1] : '';
  const suffix = m ? m[3] : '€';
  return (cents) => `${prefix}${Math.round(cents / 100)}${suffix}`;
}

export function priceLabel(min: number | null, max: number | null, fmt: (cents: number) => string): string {
  const noMin = min == null || min <= 0;
  const noMax = max == null || max === Infinity;
  if (noMin && noMax) return 'Any Price';
  if (noMin) return max === 0 ? 'Free' : `Under ${fmt(max as number)}`;
  if (noMax) return `${fmt(min as number)} and up`;
  return `${fmt(min as number)} – ${fmt(max as number)}`;
}

/** Years with a (planned) release in `rows`, newest first, always including the current year. */
export function releaseYears(rows: GameRow[], now = Date.now()): number[] {
  const ys = new Set<number>([new Date(now).getUTCFullYear()]);
  for (const r of rows) if (r.info.releaseDate != null) ys.add(new Date(r.info.releaseDate * 1000).getUTCFullYear());
  return [...ys].sort((a, b) => b - a);
}

export function releaseLabel(from: ReleaseBound | null, to: ReleaseBound | 'any' | null): string {
  const name = (b: ReleaseBound) => (b === 'today' ? 'Today' : String(b));
  if (from == null && to == null) return 'Any release date';
  if (from == null && to === 'any') return 'Any date, no "To be announced"';
  if (from == null) return to === 'today' ? 'Released up to today' : `Up to ${to}`;
  if (to == null) return `${name(from)} or later, incl. unannounced`;
  if (to === 'any') return `${name(from)} or later, dated only`;
  return from === to ? name(from) : `${name(from)} – ${name(to)}`;
}
