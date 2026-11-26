<script lang="ts">
  import { presetSelection, sameSelection, type Preset } from '../lib/selection';
  import type { Member, SourceStatus } from '../lib/types';
  import { icons } from './icons';

  let {
    members,
    selected,
    allSelected,
    presets,
    onselect,
    onall,
    onpreset,
    onadd,
    onremove,
  }: {
    members: Member[];
    selected: string[];
    allSelected: boolean;
    presets: Preset[];
    /** `additive` = Ctrl/⌘ held: add or remove instead of replacing the selection. */
    onselect: (steamid: string, additive: boolean) => void;
    onall: () => void;
    onpreset: (p: Preset) => void;
    onadd: () => void;
    onremove: (p: Preset) => void;
  } = $props();

  const allIds = $derived(members.map((m) => m.steamid));

  const VIA: Record<string, string> = { public: 'public', login: 'via your login', store: 'yours, via your store login' };

  function line(kind: 'Wishlist' | 'Library', s: SourceStatus): { text: string; tone: string; icon: string } {
    switch (s.state) {
      case 'ok':
        return { text: `${kind} ${s.count ?? 0}${s.stale ? ' · cached' : ''}`, tone: s.stale ? 'stale' : 'ok', icon: icons.check };
      case 'hidden':
        return { text: `${kind} hidden`, tone: 'hidden', icon: icons.eyeOff };
      case 'signin':
        return { text: `${kind}: sign in`, tone: 'hidden', icon: icons.eyeOff };
      case 'error':
        return { text: `${kind} failed`, tone: 'error', icon: icons.warn };
      case 'skipped':
        return { text: `${kind} off`, tone: 'off', icon: '' };
      default:
        return { text: `${kind} …`, tone: 'loading', icon: '' };
    }
  }

  function describe(kind: string, s: SourceStatus): string {
    const when = s.fetchedAt ? ` (fetched ${new Date(s.fetchedAt).toLocaleString()})` : '';
    switch (s.state) {
      case 'ok':
        return `${kind}: ${s.count} items, ${VIA[s.via ?? 'public'] ?? s.via}${when}${s.stale ? `. Refresh failed, showing cached data: ${s.error}` : ''}`;
      case 'loading':
        return `${kind}: loading…`;
      case 'skipped':
        return `${kind}: not loaded (switched off)`;
      default:
        return `${kind}: ${s.error ?? s.state}${when}`;
    }
  }

  function title(m: Member): string {
    const privacy = m.profilePrivacy === 'unknown' ? '' : `Profile: ${m.profilePrivacy}\n`;
    return `${m.name}${m.isViewer ? ' (you)' : ''}\n${privacy}${describe('Wishlist', m.wishlist)}\n${describe('Library', m.library)}${m.wishlist.state === 'hidden' ? '\n\nFix: Steam → Edit Profile → Privacy Settings → Game details: Public.' : ''}\n\nClick: only this member. Ctrl+click (⌘ on Mac): add or remove.`;
  }
</script>

<div class="wrap">
  <div class="presets">
    <button class="preset" class:active={allSelected} onclick={onall} title="Select all members">All</button>
    {#each presets as p (p.id)}
      <button
        class="preset"
        class:active={!allSelected && sameSelection(presetSelection(p, allIds), selected)}
        title={`${p.name}: ${presetSelection(p, allIds).map((id) => members.find((m) => m.steamid === id)?.name ?? id).join(', ')}\nRight-click to remove`}
        onclick={() => onpreset(p)}
        oncontextmenu={(e) => {
          e.preventDefault();
          onremove(p);
        }}>{p.name}</button>
    {/each}
    <button class="preset add" onclick={onadd} title="Save the current selection as a preset">+</button>

  </div>

  <div class="strip">
    {#each members as m (m.steamid)}
      {@const w = line('Wishlist', m.wishlist)}
      {@const l = line('Library', m.library)}
      <button
        class="chip"
        class:selected={!allSelected && selected.includes(m.steamid)}
        class:unselected={!allSelected && !selected.includes(m.steamid)}
        class:dim={m.wishlist.state === 'hidden' || m.wishlist.state === 'error'}
        title={title(m)}
        onclick={(e) => onselect(m.steamid, e.ctrlKey || e.metaKey)}
      >
        {#if m.avatar}
          <img class="av" src={m.avatar} alt="" />
        {:else}
          <span class="av ph">{m.name.slice(0, 1).toUpperCase()}</span>
        {/if}
        <span class="txt">
          <span class="name">{m.name}{#if m.isViewer}<span class="you">&nbsp;(you)</span>{/if}</span>
          <span class="st {w.tone}">{@html w.icon}{w.text}</span>
          <span class="st {l.tone}">{@html l.icon}{l.text}</span>
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: flex;
    gap: 8px;
    align-items: center;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 5px 10px 5px 5px;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    min-width: 150px;
  }
  .chip:hover {
    background: rgba(103, 193, 245, 0.12);
  }
  .chip.selected {
    border-color: #67c1f5;
    background: rgba(103, 193, 245, 0.18);
  }
  .chip.unselected {
    opacity: 0.45;
  }
  .chip.unselected:hover {
    opacity: 0.8;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  /* Same space above/below the label as left/right of it. */
  .preset {
    padding: 8px;
    line-height: 16px;
    border: 1px solid #3a5269;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.25);
    color: #c6d4df;
    font: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  .preset:hover {
    border-color: #67c1f5;
    color: #fff;
  }
  .preset.active {
    border-color: #67c1f5;
    background: rgba(103, 193, 245, 0.18);
    color: #fff;
  }
  .preset.add {
    min-width: 32px;
    font-weight: 600;
    color: #67c1f5;
  }
  .chip.dim .av {
    filter: grayscale(1);
    opacity: 0.55;
  }
  .av {
    width: 36px;
    height: 36px;
    border-radius: 2px;
    flex: none;
  }
  .ph {
    display: grid;
    place-items: center;
    background: #2a475e;
    color: #c6d4df;
    font-weight: 600;
  }
  .txt {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .name {
    color: #fff;
    font-size: 13px;
  }
  .you {
    color: #8f98a0;
  }
  .st {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    font-size: 11px;
  }
  .st.ok {
    color: #8bc53f;
  }
  .st.stale {
    color: #e0b33c;
  }
  .st.hidden {
    color: #8f98a0;
  }
  .st.error {
    color: #e06c5a;
  }
  .st.off,
  .st.loading {
    color: #556772;
  }
</style>
