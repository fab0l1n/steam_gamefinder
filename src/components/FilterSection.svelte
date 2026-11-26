<script lang="ts">
  /** One collapsible block of the filter sidebar. */
  import type { Snippet } from 'svelte';

  let {
    title,
    collapsed = false,
    active = false,
    ontoggle,
    children,
  }: {
    title: string;
    collapsed?: boolean;
    /** Some filter in this section is set (marked while collapsed, so it isn't forgotten). */
    active?: boolean;
    ontoggle: () => void;
    children: Snippet;
  } = $props();
</script>

<section>
  <h3>
    <button class="toggle" aria-expanded={!collapsed} onclick={ontoggle} title={collapsed ? 'Show' : 'Hide'}>
      <span class="chev" class:closed={collapsed} aria-hidden="true"></span>
      <span>{title}</span>
      {#if collapsed && active}<span class="dot" title="Filters set in this section apply"></span>{/if}
    </button>
  </h3>
  {#if !collapsed}{@render children()}{/if}
</section>

<style>
  section {
    background: rgba(0, 0, 0, 0.2);
  }
  h3 {
    display: flex;
    margin: 0;
    padding: 0;
    font-size: 13px;
    font-weight: 400;
    color: #c6d4df;
    background: rgba(103, 193, 245, 0.12);
  }
  .toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 8px 10px;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .toggle:hover {
    color: #fff;
  }
  .chev {
    flex: none;
    width: 6px;
    height: 6px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-2px) rotate(45deg);
    transition: transform 0.15s ease;
  }
  .chev.closed {
    transform: rotate(-45deg);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #67c1f5;
  }
</style>
