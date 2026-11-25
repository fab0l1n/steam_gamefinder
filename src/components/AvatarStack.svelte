<script lang="ts">
  /**
   * Avatar stack: round, slightly overlapping member avatars, leftmost on top.
   * `owned` = owner stack (who has it in their library), `wishlist` = wishlist stack.
   */
  import type { Member } from '../lib/types';
  import { icons } from './icons';

  const MAX_FACES = 6;

  let { kind, ids, members }: { kind: 'owned' | 'wishlist'; ids: string[]; members: Map<string, Member> } = $props();

  const label = $derived(kind === 'owned' ? 'Owned by' : 'Wishlisted by');
  const shown = $derived(ids.slice(0, MAX_FACES));
  const title = $derived(`${label} ${ids.map((id) => members.get(id)?.name ?? id).join(', ')}`);
</script>

<span class="stack {kind}" {title}>
  <span class="ico">{@html kind === 'owned' ? icons.library : icons.star}</span>
  <span class="faces">
    {#each shown as id, i (id)}
      {@const m = members.get(id)}
      <span class="face" style:z-index={shown.length - i}>
        {#if m?.avatar}
          <img src={m.avatar} alt={m.name} />
        {:else}
          <span class="ph">{(m?.name ?? '?').slice(0, 1).toUpperCase()}</span>
        {/if}
      </span>
    {/each}
  </span>
  <span class="n">{ids.length}</span>
</span>

<style>
  .stack {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #8f98a0;
  }
  .ico {
    display: inline-flex;
  }
  .owned .ico {
    color: #8bc53f;
  }
  .wishlist .ico {
    color: #67c1f5;
  }
  .faces {
    display: inline-flex;
    align-items: center;
  }
  .face {
    position: relative;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    overflow: hidden;
    flex: none;
    /* thin dark ring so overlapping faces stay distinct on any row colour */
    box-shadow: 0 0 0 1.5px rgba(14, 20, 27, 0.95);
    background: #2a475e;
  }
  .face + .face {
    margin-left: -7px;
  }
  .face img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .ph {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: #c6d4df;
    font-size: 10px;
    font-weight: 600;
  }
</style>
