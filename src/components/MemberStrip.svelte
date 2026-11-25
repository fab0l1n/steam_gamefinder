<script lang="ts">
  import type { Member, SourceStatus } from '../lib/types';
  import { icons } from './icons';

  let {
    members,
    selected,
    onselect,
  }: { members: Member[]; selected: string | null; onselect: (steamid: string) => void } = $props();

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
    return `${m.name}${m.isViewer ? ' (you)' : ''}\n${privacy}${describe('Wishlist', m.wishlist)}\n${describe('Library', m.library)}${m.wishlist.state === 'hidden' ? '\n\nFix: Steam → Edit Profile → Privacy Settings → Game details: Public.' : ''}\n\nClick to show only this member's wishlist.`;
  }
</script>

<div class="strip">
  {#each members as m (m.steamid)}
    {@const w = line('Wishlist', m.wishlist)}
    {@const l = line('Library', m.library)}
    <button
      class="chip"
      class:selected={selected === m.steamid}
      class:dim={m.wishlist.state === 'hidden' || m.wishlist.state === 'error'}
      title={title(m)}
      onclick={() => onselect(m.steamid)}
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

<style>
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
