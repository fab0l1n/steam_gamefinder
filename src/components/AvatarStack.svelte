<script lang="ts">
  /**
   * Avatar stack: round, slightly overlapping member avatars (leftmost on top) on a rounded,
   * colour-coded rectangle. `owned` = owner stack (library), `wishlist` = wishlist stack.
   * Trying two icon placements: owner icon inside the rectangle, wishlist icon on its left edge.
   */
  import type { Member } from '../lib/types';
  import { icons } from './icons';

  const MAX_FACES = 5;

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
  {#if ids.length > MAX_FACES}<span class="n">{ids.length}</span>{/if}
</span>

<style>
  .stack {
    --edge: #8bc53f;
    --fill: #d9eec2;
    position: relative;
    isolation: isolate;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 4px 0 6px;
    font-size: 11px;
  }
  /* The rectangle: opaque lighter fill, solid edge, rounded corners. */
  .stack::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--fill);
    border: 1.5px solid var(--edge);
    border-radius: 7px;
  }
  .owned {
    --edge: #8bc53f;
    --fill: #d9eec2;
  }
  .owned .ico {
    display: inline-flex;
    color: #3d6b16;
  }
  .wishlist {
    --edge: #67c1f5;
    --fill: #d2ebfb;
    margin-left: 9px;
    padding-left: 13px;
  }
  /* Cut a round gap into the left edge so the icon interrupts the edge line. */
  .wishlist::before {
    -webkit-mask: radial-gradient(circle 9px at 0 50%, transparent 8.5px, #000 9px);
    mask: radial-gradient(circle 9px at 0 50%, transparent 8.5px, #000 9px);
  }
  .wishlist .ico {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translate(-50%, -50%);
    display: inline-flex;
    color: #67c1f5;
  }
  .faces {
    display: inline-flex;
    align-items: center;
  }
  .face {
    position: relative;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    overflow: hidden;
    flex: none;
    /* ring in the fill colour so overlapping faces stay distinct */
    box-shadow: 0 0 0 1.5px var(--fill);
    background: #2a475e;
  }
  .face + .face {
    margin-left: -6px;
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
  .n {
    color: #1b2838;
    font-weight: 600;
    padding: 0 2px;
  }
</style>
