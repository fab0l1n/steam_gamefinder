<script lang="ts">
  import type { GameRow, Member } from '../lib/types';
  import { formatReleaseDate } from '../lib/steam/store';

  let {
    row,
    rect,
    members,
    tags,
  }: { row: GameRow; rect: DOMRect; members: Map<string, Member>; tags: Record<number, string> } = $props();

  const WIDTH = 324;
  const EST_HEIGHT = 460;
  const info = $derived(row.info);

  /** Beside the row if there is room (like Steam search), otherwise below/above it, never on top of it. */
  const pos = $derived.by(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right + 12 + WIDTH <= vw - 8) return { left: rect.right + 12, top: Math.max(8, Math.min(rect.top - 10, vh - EST_HEIGHT)) };
    if (rect.left - 12 - WIDTH >= 8) return { left: rect.left - 12 - WIDTH, top: Math.max(8, Math.min(rect.top - 10, vh - EST_HEIGHT)) };
    const left = Math.max(8, Math.min(rect.right - WIDTH - 180, vw - WIDTH - 8));
    const top = vh - rect.bottom >= EST_HEIGHT + 6 ? rect.bottom + 6 : Math.max(8, rect.top - EST_HEIGHT - 6);
    return { left, top };
  });
  const image = $derived(info.screenshots[0] ?? info.header);
  const tagNames = $derived(info.tagids.map((t) => tags[t]).filter(Boolean).slice(0, 6));
  const name = (id: string) => members.get(id)?.name ?? id;
  const hours = (min: number) => (min >= 60 ? `${Math.round(min / 60)} h` : min > 0 ? `${min} min` : '');
</script>

<div class="hover" style:left="{pos.left}px" style:top="{pos.top}px" style:width="{WIDTH}px">
  <div class="title">{info.name}</div>
  <div class="sub">
    {info.comingSoon ? info.releaseText : `Released ${info.releaseText}`}
  </div>
  {#if image}<img class="shot" src={image} alt="" />{/if}
  {#if info.review}
    <div class="block">
      <div class="label">Overall user reviews</div>
      <div class="rev">{info.review.label}</div>
      <div class="muted">({info.review.percent}% of {info.review.count.toLocaleString('en-US')} reviews are positive)</div>
    </div>
  {/if}
  {#if tagNames.length}
    <div class="tags">{#each tagNames as t (t)}<span>{t}</span>{/each}</div>
  {/if}
  {#if info.shortDescription}<div class="desc">{info.shortDescription}</div>{/if}
  <div class="block">
    <div class="label">Wishlisted by</div>
    {#each row.wishlistedBy as w (w.steamid)}
      <div>{name(w.steamid)}{#if w.addedAt}<span class="muted">&nbsp;· since {formatReleaseDate(w.addedAt)}</span>{/if}</div>
    {/each}
  </div>
  {#if row.ownedBy.length}
    <div class="block">
      <div class="label">Owned by</div>
      {#each row.ownedBy as o (o.steamid)}
        <div>{name(o.steamid)}{#if o.playtime}<span class="muted">&nbsp;· {hours(o.playtime)} played</span>{/if}</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hover {
    position: fixed;
    z-index: 10000;
    pointer-events: none;
    background: linear-gradient(to bottom, #e3eaef 5%, #c7d5e0 95%);
    color: #30455a;
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.8);
    padding: 12px 14px;
    font-size: 12px;
    border-radius: 2px;
  }
  .title {
    font-size: 15px;
    color: #222d3d;
    font-weight: 500;
  }
  .sub {
    font-size: 11px;
    color: #6b7c8e;
    margin-bottom: 8px;
  }
  .shot {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
    margin-bottom: 8px;
    background: #9fb1c1;
  }
  .block {
    margin-top: 8px;
  }
  .label {
    font-size: 10px;
    text-transform: uppercase;
    color: #6b7c8e;
    letter-spacing: 0.04em;
  }
  .rev {
    color: #1a5d84;
    font-weight: 500;
  }
  .muted {
    color: #6b7c8e;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }
  .tags span {
    background: #96a3ae;
    color: #e3eaef;
    padding: 1px 6px;
    font-size: 11px;
    border-radius: 2px;
  }
  .desc {
    margin-top: 8px;
    line-height: 1.4;
  }
</style>
