<script lang="ts">
  import type { GameRow, Member } from '../lib/types';
  import { coopDetails, coopLabel } from '../lib/coop';
  import AvatarStack from './AvatarStack.svelte';
  import { icons, reviewTone } from './icons';

  let {
    row,
    members,
    onenter,
    onleave,
  }: {
    row: GameRow;
    members: Map<string, Member>;
    onenter: (row: GameRow, el: HTMLElement) => void;
    onleave: () => void;
  } = $props();

  const info = $derived(row.info);
  const coop = $derived(coopLabel(row.coop));
  const highlight = $derived(row.viewerOwns ? 'owned' : row.viewerWishlisted ? 'wish' : '');
  const tone = $derived(reviewTone(info.review?.score ?? 0));
  const reviewIcon = $derived(tone === 'negative' ? icons.thumbDown : tone === 'mixed' ? icons.tilde : icons.thumbUp);
  const reviewTitle = $derived(
    info.review
      ? `${info.review.label}: ${info.review.percent}% of ${info.review.count.toLocaleString('en-US')} user reviews are positive`
      : 'No user reviews yet',
  );
</script>

<a
  class="row {highlight}"
  class:unavailable={!info.available}
  href={info.storeUrl}
  target="_blank"
  rel="noopener noreferrer"
  onmouseenter={(e) => onenter(row, e.currentTarget)}
  onmouseleave={onleave}
>
  <div class="capsule">
    {#if info.capsule}
      <img src={info.capsule} alt="" loading="lazy" />
    {:else}
      <div class="noimg"></div>
    {/if}
    {#if row.viewerOwns}
      <span class="flag owned" title="In your library">{@html icons.library}</span>
    {:else if row.viewerWishlisted}
      <span class="flag wish" title="On your wishlist">{@html icons.star}</span>
    {/if}
  </div>

  <div class="main">
    <div class="name">{info.name}</div>
    <div class="meta">
      {#if row.ownedBy.length}
        <AvatarStack kind="owned" ids={row.ownedBy.map((o) => o.steamid)} {members} />
      {/if}
      <AvatarStack kind="wishlist" ids={row.wishlistedBy.map((w) => w.steamid)} {members} />
    </div>
  </div>

  <div class="coop" title={coop && row.coop ? coopDetails(row.coop) : undefined}>{coop}</div>

  <div class="date">{info.releaseText}</div>

  <div class="review {tone}" title={reviewTitle}>
    {#if info.review}
      <span class="thumb">{@html reviewIcon}</span>
      <span class="rv-pct">{info.review.percent}%</span>
      <span class="rv-count">({info.review.count.toLocaleString('en-US')})</span>
    {/if}
  </div>

  <div class="price">
    {#if info.price && info.price.discountPct > 0}
      <span class="pct">-{info.price.discountPct}%</span>
    {/if}
    <span class="prices">
      {#if info.price?.original}<span class="orig">{info.price.original}</span>{/if}
      <span class="final">{info.price?.final ?? ''}</span>
    </span>
  </div>
</a>

<style>
  .row {
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr) 104px 92px 124px 140px;
    align-items: center;
    gap: 12px;
    min-height: 69px;
    padding-right: 10px;
    background: rgba(0, 0, 0, 0.22);
    color: inherit;
    text-decoration: none;
    transition: background 0.15s;
  }
  .row:hover {
    background-color: rgba(42, 71, 94, 0.75);
  }
  .row.owned {
    background: linear-gradient(135deg, rgba(var(--owned), 0.1) 10%, rgba(var(--owned), 0.5) 100%);
  }
  .row.wish {
    background: linear-gradient(135deg, rgba(var(--wish), 0.1) 10%, rgba(var(--wish), 0.5) 100%);
  }
  .row.owned:hover,
  .row.wish:hover {
    filter: brightness(1.15);
  }
  .row.unavailable {
    opacity: 0.5;
  }
  .capsule {
    position: relative;
    width: 184px;
    height: 69px;
    overflow: hidden;
  }
  .capsule img,
  .noimg {
    width: 184px;
    height: 69px;
    object-fit: cover;
    display: block;
    background: #101822;
  }
  .flag {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 2px;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
  }
  .flag.owned {
    background: #1a9fff;
    color: #fff;
  }
  .flag.wish {
    background: #fff;
    color: #0e1a26;
  }
  .main {
    min-width: 0;
  }
  .name {
    color: #c6d4df;
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row:hover .name {
    color: #fff;
  }
  .meta {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-top: 6px;
    min-height: 22px;
    color: #8f98a0;
  }
  .date,
  .coop {
    color: #8f98a0;
    font-size: 12px;
    text-align: right;
  }
  .review {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    white-space: nowrap;
  }
  .thumb {
    display: inline-flex;
    width: 16px;
    justify-content: center;
  }
  .rv-count {
    color: #8f98a0;
  }
  .review.positive {
    color: #66c0f4;
  }
  .review.mixed {
    color: #b9a074;
  }
  .review.negative {
    color: #a34c25;
  }
  .price {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
  }
  .pct {
    background: #4c6b22;
    color: #beee11;
    font-size: 16px;
    font-weight: 500;
    padding: 2px 6px;
  }
  .prices {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .orig {
    color: #738895;
    font-size: 11px;
    text-decoration: line-through;
  }
  .final {
    color: #fff;
    font-size: 14px;
  }
</style>
