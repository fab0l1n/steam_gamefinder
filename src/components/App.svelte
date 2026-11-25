<script lang="ts">
  import { onMount } from 'svelte';
  import { applyView, SORT_LABELS, type SortKey } from '../lib/aggregate';
  import { EMPTY_FILTERS, filtersActive, matchesFilters, priceFormatter, priceSteps, type Filters } from '../lib/filters';
  import { DEFAULT_SETTINGS, type DataSource, type UiSettings } from '../lib/source';
  import type { GameRow, LoadSnapshot, Member } from '../lib/types';
  import { icons } from './icons';
  import MemberStrip from './MemberStrip.svelte';
  import GameRowView from './GameRow.svelte';
  import HoverPreview from './HoverPreview.svelte';
  import FilterPanel from './FilterPanel.svelte';
  import Dialog from './Dialog.svelte';
  import DebugLog from './DebugLog.svelte';
  import { clickMember, isAllSelected, newPreset, presetSelection, type Preset } from '../lib/selection';

  let { source }: { source: DataSource } = $props();

  let snap = $state<LoadSnapshot | null>(null);
  let settings = $state<UiSettings>({ ...DEFAULT_SETTINGS });
  let settingsReady = $state(false);
  /** Selected members; empty = all. */
  let selection = $state<string[]>([]);
  let presets = $state<Preset[]>([]);
  let logLines = $state<string[]>([]);
  let dialog = $state<{ kind: 'add' } | { kind: 'remove'; preset: Preset } | null>(null);
  let busy = $state(false);
  let tags = $state<Record<number, string>>({});
  let hover = $state<{ row: GameRow; rect: DOMRect } | null>(null);
  let now = $state(Date.now());
  let filters = $state<Filters>({ ...EMPTY_FILTERS });

  const members = $derived(new Map<string, Member>((snap?.members ?? []).map((m) => [m.steamid, m])));
  const allIds = $derived((snap?.members ?? []).map((m) => m.steamid));
  const effective = $derived(selection.length ? allIds.filter((id) => selection.includes(id)) : allIds);
  const allSelected = $derived(effective.length === 0 || isAllSelected(effective, allIds));
  const selectedNames = $derived.by(() => {
    const names = effective.map((id) => members.get(id)?.name ?? id);
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
  });
  /** Sorted rows after the toolbar options and member filter. */
  const baseRows = $derived(snap ? applyView(snap.rows, { ...settings, members: allSelected ? null : effective }) : []);
  /** Rows for the tag counts: every sidebar filter except tags. */
  const tagRows = $derived(baseRows.filter((r) => matchesFilters(r, filters, { ignoreTags: true })));
  const rows = $derived(tagRows.filter((r) => matchesFilters(r, filters)));
  const steps = $derived(priceSteps(snap?.rows ?? []));
  const fmt = $derived(priceFormatter(snap?.rows ?? []));
  const visibleMembers = $derived((snap?.members ?? []).filter((m) => m.wishlist.state === 'ok').length);
  const sortKeys = Object.keys(SORT_LABELS) as SortKey[];

  function ago(t: number | null): string {
    if (!t) return '';
    const min = Math.round((now - t) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
  }

  function log(line: string) {
    const t = new Date().toTimeString().slice(0, 8);
    logLines.push(`${t}  ${line}`);
    if (logLines.length > 3000) logLines.splice(0, logLines.length - 3000);
  }

  async function run(force: boolean) {
    if (busy) return;
    busy = true;
    hover = null;
    try {
      await source.load(force, $state.snapshot(settings), (s) => (snap = s), log);
    } catch (e) {
      log(`Load failed: ${String(e)}`);
      snap = snap
        ? { ...snap, phase: 'error', error: String(e) }
        : { phase: 'error', message: String(e), error: String(e), groupName: '', members: [], rows: [], viewer: { steamid: null, loggedIn: false }, updatedAt: null };
    } finally {
      busy = false;
    }
  }

  function select(next: string[]) {
    selection = isAllSelected(next, allIds) ? [] : next;
  }
  function savePresets(next: Preset[]) {
    presets = next;
    source.savePresets($state.snapshot(next));
  }

  function setLoadLibraries(v: boolean) {
    settings.loadLibraries = v;
    run(false);
  }

  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  function onRowEnter(row: GameRow, el: HTMLElement) {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => (hover = { row, rect: el.getBoundingClientRect() }), 250);
  }
  function onRowLeave() {
    clearTimeout(hoverTimer);
    hover = null;
  }

  $effect(() => {
    const s = $state.snapshot(settings);
    if (settingsReady) source.saveSettings(s);
  });

  onMount(() => {
    const tick = setInterval(() => (now = Date.now()), 30_000);
    source.getSettings().then((s) => {
      settings = { ...DEFAULT_SETTINGS, ...s };
      settingsReady = true;
      run(false);
    });
    source.tags().then((t) => (tags = t));
    source.getPresets().then((p) => (presets = p));
    return () => clearInterval(tick);
  });
</script>

<div class="sgf" onscroll={onRowLeave}>
  <DebugLog lines={logLines} onclear={() => (logLines = [])} bind:open={settings.debugOpen} />

  <div class="head">
    <h2>Wishlists{#if snap?.groupName}<span class="group">&nbsp;· {snap.groupName}</span>{/if}</h2>
    <div class="updated">
      {#if snap?.updatedAt}Updated {ago(snap.updatedAt)}{/if}
      <button class="btn" onclick={() => run(true)} disabled={busy} title="Reload everything from Steam, ignoring the cache">
        {@html icons.refresh} Refresh
      </button>
    </div>
  </div>

  {#if snap && snap.members.length}
    <MemberStrip
      members={snap.members}
      selected={effective}
      {allSelected}
      {presets}
      onselect={(id, additive) => select(clickMember(effective, id, additive, allIds))}
      onall={() => select([])}
      onpreset={(p) => select(presetSelection(p, allIds))}
      onadd={() => (dialog = { kind: 'add' })}
      onremove={(p) => (dialog = { kind: 'remove', preset: p })}
    />
  {/if}

  <div class="layout">
  <div class="results">
  <div class="toolbar">
    <label>
      Sort by
      <select bind:value={settings.sort}>
        {#each sortKeys as k (k)}<option value={k}>{SORT_LABELS[k]}</option>{/each}
      </select>
    </label>
    <label><input type="checkbox" bind:checked={settings.includeExtras} /> Include DLC &amp; hardware</label>
    <label><input type="checkbox" bind:checked={settings.hideOwned} /> Hide games I own</label>
    <label title="Reads each member's games page (about 1 MB each, cached for a day). Needs you to be signed in to Steam.">
      <input type="checkbox" checked={settings.loadLibraries} onchange={(e) => setLoadLibraries(e.currentTarget.checked)} disabled={busy} />
      Load libraries
    </label>
  </div>

  <div class="summary" class:error={snap?.phase === 'error'}>
    {#if !snap}
      Starting…
    {:else if snap.phase === 'done'}
      {#if !allSelected}
        Showing {rows.length} games wishlisted or owned by {selectedNames} ·
        <button class="link" onclick={() => select([])}>show all</button>
      {:else}
        Showing {rows.length} of {snap.rows.length} games from the wishlists of {visibleMembers} of {snap.members.length} members
      {/if}
      {#if snap.coopProgress && snap.coopProgress.done < snap.coopProgress.total}
        <span>&nbsp;· loading co-op counts {snap.coopProgress.done}/{snap.coopProgress.total}</span>
      {/if}
      {#if snap.error}<span class="warn">&nbsp;· {snap.error}</span>{/if}
    {:else}
      {snap.message}
    {/if}
  </div>

  {#if snap?.phase === 'done' && rows.length === 0}
    {@const fm = !allSelected && effective.length === 1 ? members.get(effective[0]) : undefined}
    <div class="empty">
      {#if fm && fm.wishlist.state !== 'ok'}
        <strong>{fm.name}'s wishlist couldn't be read.</strong><br />
        {fm.wishlist.error ?? 'Steam returned nothing.'}<br />
        <span class="hint">To share it: Steam → Edit Profile → Privacy Settings → Game details: Public.</span>
      {:else if snap.rows.length}
        No games match the current options.
        {#if filtersActive(filters)}<button class="link" onclick={() => (filters = { ...EMPTY_FILTERS })}>Clear filters</button>{/if}
      {:else}
        No wishlists could be read. The member strip above shows why for each member.
      {/if}
    </div>
  {/if}

  <div class="list">
    {#each rows as row (row.info.appid)}
      <GameRowView {row} {members} onenter={onRowEnter} onleave={onRowLeave} />
    {/each}
  </div>

  {#if busy && snap?.phase !== 'done'}
    <div class="loading"><span class="spinner"></span> {snap?.message ?? 'Loading…'}</div>
  {/if}
  </div>

  <FilterPanel bind:filters {tagRows} tagNames={tags} {steps} {fmt} />
  </div>

  {#if hover}
    <HoverPreview row={hover.row} rect={hover.rect} {members} {tags} />
  {/if}

  {#if dialog?.kind === 'add'}
    <Dialog
      title="New preset"
      message={`Save the current selection (${allSelected ? 'all members' : selectedNames}) as a preset.`}
      input
      placeholder="Preset name, e.g. Friday co-op"
      confirmLabel="Save"
      onconfirm={(name) => {
        savePresets([...presets, newPreset(name, allSelected ? allIds : effective)]);
        dialog = null;
      }}
      oncancel={() => (dialog = null)}
    />
  {:else if dialog?.kind === 'remove'}
    {@const p = dialog.preset}
    <Dialog
      title="Remove preset"
      message={`Remove the preset “${p.name}”? This can't be undone.`}
      confirmLabel="Remove"
      danger
      onconfirm={() => {
        savePresets(presets.filter((x) => x.id !== p.id));
        dialog = null;
      }}
      oncancel={() => (dialog = null)}
    />
  {/if}

  <div class="footer">
    Steam Gamefinder · game data from Steam (prices for your store region) · co-op player counts from
    <a href="https://www.co-optimus.com/" target="_blank" rel="noopener noreferrer">co-optimus.com</a>
  </div>
</div>

<style>
  .sgf {
    --owned: 0, 206, 103;
    --wish: 4, 145, 191;
    font-family: 'Motiva Sans', Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #c6d4df;
    display: block;
    padding: 14px 0 24px;
    line-height: 1.35;
    /* Wider than Steam's 948px group column (room for the filter sidebar), centred on the page.
       Margins instead of transform, so the fixed-position hover preview keeps the viewport as reference. */
    box-sizing: border-box;
    width: min(1240px, calc(100vw - 40px));
    margin-left: calc(50% - min(620px, calc(50vw - 20px)));
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 16px;
    align-items: start;
    margin-top: 10px;
  }
  .results {
    min-width: 0;
  }
  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .layout > :global(.panel) {
      order: -1;
    }
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 300;
    color: #fff;
    letter-spacing: 0.02em;
  }
  .group {
    color: #8f98a0;
    font-size: 16px;
  }
  .updated {
    color: #8f98a0;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .btn {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    background: rgba(103, 193, 245, 0.2);
    color: #67c1f5;
    border: 0;
    border-radius: 2px;
    padding: 5px 10px;
    font: inherit;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    background: linear-gradient(-60deg, #417a9b 5%, #67c1f5 95%);
    color: #fff;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    align-items: center;
    background: rgba(0, 0, 0, 0.2);
    padding: 8px 10px;
    margin: 0 0 6px;
    color: #8f98a0;
  }
  .toolbar label {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    cursor: pointer;
  }
  select {
    background: rgba(103, 193, 245, 0.15);
    color: #67c1f5;
    border: 0;
    border-radius: 2px;
    padding: 4px 6px;
    font: inherit;
  }
  option {
    background: #1b2838;
    color: #c6d4df;
  }
  input[type='checkbox'] {
    accent-color: #67c1f5;
    margin: 0;
  }
  .summary {
    color: #8f98a0;
    margin: 6px 2px 8px;
    min-height: 18px;
  }
  .summary.error,
  .warn {
    color: #e0b33c;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: #67c1f5;
    font: inherit;
    cursor: pointer;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .empty {
    padding: 30px;
    text-align: center;
    color: #8f98a0;
    background: rgba(0, 0, 0, 0.2);
  }
  .empty strong {
    color: #c6d4df;
    font-weight: 500;
  }
  .hint {
    display: inline-block;
    margin-top: 8px;
    color: #67c1f5;
  }
  .loading {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 18px 4px;
    color: #8f98a0;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(103, 193, 245, 0.3);
    border-top-color: #67c1f5;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .footer {
    margin-top: 16px;
    color: #556772;
    font-size: 11px;
  }
  .footer a {
    color: #8f98a0;
  }
</style>
