<script lang="ts">
  /** Right-hand filter sidebar, modelled on Steam search with Augmented Steam's extra filters. */
  import { boundEnd, boundStart, EMPTY_FILTERS, filtersActive, priceLabel, releaseLabel, tagCounts, type Filters, type ReleaseBound } from '../lib/filters';
  import type { GameRow } from '../lib/types';
  import FilterSection from './FilterSection.svelte';

  let {
    filters = $bindable(),
    includeExtras = $bindable(false),
    hideOwned = $bindable(false),
    hideWishlisted = $bindable(false),
    collapsed = $bindable([]),
    tagRows,
    tagNames,
    steps,
    fmt,
    years,
  }: {
    filters: Filters;
    /** Show DLC, hardware, soundtracks… (saved setting). */
    includeExtras: boolean;
    /** Hide games in your library (saved setting). */
    hideOwned: boolean;
    /** Hide games on your own wishlist (saved setting). */
    hideWishlisted: boolean;
    /** Ids of collapsed sections (saved setting). */
    collapsed: string[];
    /** Rows after every filter except the tag filter (for tag counts). */
    tagRows: GameRow[];
    tagNames: Record<number, string>;
    steps: number[];
    fmt: (cents: number) => string;
    /** Release years present in the list, newest first. */
    years: number[];
  } = $props();

  const TOP_TAGS = 10;
  /** Which sections have something set; a collapsed one shows a dot then. */
  const active = $derived({
    reviews:
      filters.reviewMin > 0 || filters.reviewMax < 100 || filters.countMin != null || filters.countMax != null ||
      filters.discountMin != null || filters.discountMax != null,
    price: filters.priceMinCents != null || filters.priceMaxCents != null,
    release: filters.releaseFrom != null || filters.releaseTo != null,
    tags: filters.tagsInclude.length > 0 || filters.tagsExclude.length > 0,
    content: includeExtras || hideOwned || hideWishlisted,
  });
  const anyActive = $derived(filtersActive(filters) || active.content);
  function clearAll() {
    filters = { ...EMPTY_FILTERS };
    includeExtras = false;
    hideOwned = false;
    hideWishlisted = false;
  }
  const isCollapsed = (id: string) => collapsed.includes(id);
  const toggle = (id: string) => (collapsed = isCollapsed(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id]);
  let tagQuery = $state('');

  const reviewLabel = $derived(
    filters.reviewMin <= 0 && filters.reviewMax >= 100 ? 'Any review score' : `${filters.reviewMin}% – ${filters.reviewMax}% positive`,
  );
  const indexOf = (cents: number) => Math.max(0, steps.findIndex((s) => s >= cents));
  const priceMinIndex = $derived(filters.priceMinCents == null ? 0 : indexOf(filters.priceMinCents));
  const priceMaxIndex = $derived(filters.priceMaxCents == null ? steps.length - 1 : indexOf(filters.priceMaxCents));
  const pctOf = (i: number) => (i / (steps.length - 1)) * 100;

  const counts = $derived(tagCounts(tagRows).filter(([t]) => tagNames[t]));
  const pinned = $derived([...filters.tagsInclude, ...filters.tagsExclude]);
  const tagList = $derived.by(() => {
    const q = tagQuery.trim().toLowerCase();
    const countOf = new Map(counts);
    const others = counts
      .filter(([t]) => !pinned.includes(t) && (!q || tagNames[t].toLowerCase().includes(q)))
      .slice(0, TOP_TAGS);
    return [...pinned.map((t) => [t, countOf.get(t) ?? 0] as [number, number]), ...others];
  });

  function num(v: string): number | null {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function setReview(which: 'min' | 'max', v: number) {
    if (which === 'min') filters.reviewMin = Math.min(v, filters.reviewMax);
    else filters.reviewMax = Math.max(v, filters.reviewMin);
  }
  function setPrice(which: 'min' | 'max', i: number) {
    if (which === 'min') {
      const idx = Math.min(i, priceMaxIndex);
      filters.priceMinCents = idx === 0 ? null : steps[idx];
    } else {
      const idx = Math.max(i, priceMinIndex);
      filters.priceMaxCents = steps[idx] === Infinity ? null : steps[idx];
    }
  }
  const bound = (v: string): ReleaseBound | null => (v === '' ? null : v === 'today' ? 'today' : Number(v));
  /** True when "from" starts after "to" ends; the field just changed wins and the other follows. */
  const crossed = (from: ReleaseBound | null, to: ReleaseBound | 'any' | null) =>
    from != null && to != null && to !== 'any' && boundStart(from) >= boundEnd(to);

  function setReleaseFrom(v: string) {
    const from = bound(v);
    filters.releaseFrom = from;
    if (crossed(from, filters.releaseTo)) filters.releaseTo = from;
  }
  function setReleaseTo(v: string) {
    const to = v === 'any' ? 'any' : bound(v);
    filters.releaseTo = to;
    if (to !== 'any' && crossed(filters.releaseFrom, to)) filters.releaseFrom = to;
  }

  function toggleInclude(t: number) {
    filters.tagsExclude = filters.tagsExclude.filter((x) => x !== t);
    filters.tagsInclude = filters.tagsInclude.includes(t) ? filters.tagsInclude.filter((x) => x !== t) : [...filters.tagsInclude, t];
  }
  function toggleExclude(t: number) {
    filters.tagsInclude = filters.tagsInclude.filter((x) => x !== t);
    filters.tagsExclude = filters.tagsExclude.includes(t) ? filters.tagsExclude.filter((x) => x !== t) : [...filters.tagsExclude, t];
  }
</script>

<aside class="panel">
  <FilterSection title="Narrow by reviews & discount" collapsed={isCollapsed('reviews')} active={active.reviews} ontoggle={() => toggle('reviews')}>
    <div class="body">
      <div class="dual" style:--lo="{filters.reviewMin}%" style:--hi="{filters.reviewMax}%">
        <div class="track"></div>
        <input type="range" min="0" max="100" step="5" value={filters.reviewMin} style:z-index={filters.reviewMin > 50 ? 3 : 1}
          aria-label="Minimum percent positive" oninput={(e) => setReview('min', +e.currentTarget.value)} />
        <input type="range" min="0" max="100" step="5" value={filters.reviewMax}
          aria-label="Maximum percent positive" oninput={(e) => setReview('max', +e.currentTarget.value)} />
      </div>
      <div class="center">{reviewLabel}</div>

      <div class="label">Reviews count:</div>
      <div class="pair">
        <input type="number" min="0" placeholder="min count" value={filters.countMin ?? ''}
          oninput={(e) => (filters.countMin = num(e.currentTarget.value))} />
        <span>-</span>
        <input type="number" min="0" placeholder="max count" value={filters.countMax ?? ''}
          oninput={(e) => (filters.countMax = num(e.currentTarget.value))} />
      </div>

      <div class="label">Discount percent:</div>
      <div class="pair short">
        <input type="number" min="0" max="100" placeholder="Min %" value={filters.discountMin ?? ''}
          oninput={(e) => (filters.discountMin = num(e.currentTarget.value))} />
        <span>-</span>
        <input type="number" min="0" max="100" placeholder="Max %" value={filters.discountMax ?? ''}
          oninput={(e) => (filters.discountMax = num(e.currentTarget.value))} />
      </div>
    </div>
  </FilterSection>

  <FilterSection title="Narrow by Price" collapsed={isCollapsed('price')} active={active.price} ontoggle={() => toggle('price')}>
    <div class="body">
      <div class="dual" style:--lo="{pctOf(priceMinIndex)}%" style:--hi="{pctOf(priceMaxIndex)}%">
        <div class="track"></div>
        <input type="range" min="0" max={steps.length - 1} step="1" value={priceMinIndex}
          style:z-index={priceMinIndex > (steps.length - 1) / 2 ? 3 : 1}
          aria-label="Minimum price" oninput={(e) => setPrice('min', +e.currentTarget.value)} />
        <input type="range" min="0" max={steps.length - 1} step="1" value={priceMaxIndex}
          aria-label="Maximum price" oninput={(e) => setPrice('max', +e.currentTarget.value)} />
      </div>
      <div class="center">{priceLabel(filters.priceMinCents, filters.priceMaxCents, fmt)}</div>
    </div>
  </FilterSection>

  <FilterSection title="Narrow by release date" collapsed={isCollapsed('release')} active={active.release} ontoggle={() => toggle('release')}>
    <div class="body">
      <div class="pair dates">
        <label>
          <span>From</span>
          <select value={filters.releaseFrom == null ? '' : String(filters.releaseFrom)} onchange={(e) => setReleaseFrom(e.currentTarget.value)}>
            <option value="">—</option>
            <option value="today">Today</option>
            {#each years as y (y)}<option value={String(y)}>{y}</option>{/each}
          </select>
        </label>
        <span>-</span>
        <label>
          <span>To</span>
          <select value={filters.releaseTo == null ? '' : String(filters.releaseTo)} onchange={(e) => setReleaseTo(e.currentTarget.value)}
            title={'"Any": any release date, but hides "To be announced" and "Coming soon"'}>
            <option value="">—</option>
            <option value="any">Any</option>
            <option value="today">Today</option>
            {#each years as y (y)}<option value={String(y)}>{y}</option>{/each}
          </select>
        </label>
      </div>
      <div class="center">{releaseLabel(filters.releaseFrom, filters.releaseTo)}</div>
    </div>
  </FilterSection>

  <FilterSection title="Narrow by tag" collapsed={isCollapsed('tags')} active={active.tags} ontoggle={() => toggle('tags')}>
    <div class="body tags">
      {#each tagList as [t, n] (t)}
        {@const inc = filters.tagsInclude.includes(t)}
        {@const exc = filters.tagsExclude.includes(t)}
        <div class="tag" class:inc class:exc>
          <label>
            <input type="checkbox" checked={inc} onchange={() => toggleInclude(t)} />
            <span class="tname">{tagNames[t]}</span>
            <span class="tcount">{n}</span>
          </label>
          <button class="minus" title={exc ? 'Stop excluding this tag' : 'Exclude games with this tag'} onclick={() => toggleExclude(t)}>−</button>
        </div>
      {:else}
        <div class="muted">{tagQuery ? 'No matching tags' : 'Tags appear once games are loaded'}</div>
      {/each}
      <input class="search" type="search" placeholder="search for more tags" bind:value={tagQuery} />
    </div>
  </FilterSection>

  <FilterSection title="Narrow by content" collapsed={isCollapsed('content')} active={active.content} ontoggle={() => toggle('content')}>
    <div class="body checks">
      <label><input type="checkbox" bind:checked={includeExtras} /> Include DLC &amp; hardware</label>
      <label><input type="checkbox" bind:checked={hideOwned} /> Hide games I own</label>
      <label><input type="checkbox" bind:checked={hideWishlisted} /> Hide games on my wishlist</label>
    </div>
  </FilterSection>

  <!-- Below the last section, so it appearing doesn't move anything. -->
  {#if anyActive}
    <div class="clearrow"><button class="clear" onclick={clearAll}>Clear all</button></div>
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: #c6d4df;
    font-size: 13px;
  }
  .clearrow {
    display: flex;
    justify-content: flex-end;
    margin-top: -4px;
    padding: 0 2px;
  }
  .body {
    padding: 12px 12px 14px;
  }
  .checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .checks label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .checks input {
    accent-color: #67c1f5;
    margin: 0;
  }
  .center {
    text-align: center;
    color: #67c1f5;
    margin: 6px 0 4px;
  }
  .label {
    margin: 12px 0 6px;
  }
  .pair {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pair.short input {
    width: 70px;
  }
  .dates label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  .dates label span {
    color: #8f98a0;
  }
  select {
    flex: 1;
    min-width: 0;
    background: #10161d;
    border: 1px solid #2a3f5a;
    border-radius: 2px;
    color: #c6d4df;
    padding: 5px 6px;
    font: inherit;
  }
  option {
    background: #1b2838;
  }
  input[type='number'],
  .search {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    background: #10161d;
    border: 1px solid #2a3f5a;
    border-radius: 2px;
    color: #c6d4df;
    padding: 6px 8px;
    font: inherit;
  }
  /* no spinner arrows: they eat the room the placeholder needs */
  input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  input[type='number']::-webkit-inner-spin-button,
  input[type='number']::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type='number']::placeholder,
  .search::placeholder {
    color: #556772;
    font-style: italic;
  }

  /* Range sliders: two overlaid inputs for a min/max range, one for price. */
  .dual {
    position: relative;
    height: 22px;
  }
  .dual input[type='range'] {
    z-index: 2;
  }
  .track {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 9px;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(
      to right,
      #2a3f5a var(--lo, 0%),
      #67c1f5 var(--lo, 0%),
      #67c1f5 var(--hi, 100%),
      #2a3f5a var(--hi, 100%)
    );
  }
  input[type='range'] {
    position: absolute;
    inset: 0;
    width: 100%;
    margin: 0;
    background: none;
    appearance: none;
    -webkit-appearance: none;
    pointer-events: none;
  }
  input[type='range']::-webkit-slider-runnable-track {
    background: none;
    height: 22px;
  }
  input[type='range']::-moz-range-track {
    background: none;
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    pointer-events: auto;
    width: 16px;
    height: 16px;
    margin-top: 3px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #1b2838;
    cursor: pointer;
  }
  input[type='range']:focus {
    outline: none;
  }
  input[type='range']:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px rgba(103, 193, 245, 0.55);
  }
  input[type='range']:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 3px rgba(103, 193, 245, 0.55);
  }
  input[type='range']::-moz-range-thumb {
    pointer-events: auto;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #1b2838;
    cursor: pointer;
  }

  .tags {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tag {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 3px 0;
  }
  .tag label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    min-width: 0;
  }
  .tag input[type='checkbox'] {
    accent-color: #67c1f5;
    margin: 0;
  }
  .tname {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tcount {
    color: #8f98a0;
    font-style: italic;
  }
  .tag.inc .tname {
    color: #67c1f5;
  }
  .tag.exc .tname {
    color: #e06c5a;
    text-decoration: line-through;
  }
  .minus {
    flex: none;
    width: 20px;
    height: 18px;
    line-height: 16px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: #3d4450;
    color: #c6d4df;
    cursor: pointer;
    font: inherit;
  }
  .tag.exc .minus {
    background: #a8392a;
    color: #fff;
  }
  .search {
    margin-top: 8px;
  }
  .muted {
    color: #8f98a0;
  }
  .clear {
    background: none;
    border: 0;
    padding: 0;
    color: #67c1f5;
    font: inherit;
    cursor: pointer;
  }
</style>
