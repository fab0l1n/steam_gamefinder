<script lang="ts">
  /**
   * Avatar stack: round, slightly overlapping member avatars (leftmost on top) on a rounded,
   * colour-coded rectangle whose left edge carries the icon. `owned` = owner stack (library),
   * `wishlist` = wishlist stack.
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
    position: relative;
    isolation: isolate;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    margin-left: 9px;
    padding: 0 5px 0 13px;
    font-size: 11px;
  }
  .owned {
    --edge: #8bc53f;
    --fill: rgba(217, 238, 194, 0.1);
  }
  .wishlist {
    --edge: #67c1f5;
    --fill: rgba(210, 235, 251, 0.1);
  }
  /* The frame: 90% transparent fill, solid edge, rounded corners, with a round gap cut into the
     left edge where the icon sits. */
  .stack::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--fill);
    border: 1.5px solid var(--edge);
    border-radius: 7px;
    -webkit-mask: radial-gradient(circle 9px at 0 50%, transparent 8.5px, #000 9px);
    mask: radial-gradient(circle 9px at 0 50%, transparent 8.5px, #000 9px);
  }
  .ico {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translate(-50%, -50%);
    display: inline-flex;
    color: var(--edge);
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
    /* thin dark ring so overlapping faces stay distinct */
    box-shadow: 0 0 0 1.5px rgba(14, 20, 27, 0.95);
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
    color: #c6d4df;
    font-weight: 600;
    padding: 0 2px;
  }
</style>
