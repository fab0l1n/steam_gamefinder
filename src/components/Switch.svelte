<script lang="ts">
  /** Two-position switch with a label on each side; `checked` = knob on the right. */
  let {
    checked = $bindable(false),
    left,
    right,
    prefix = '',
    title = '',
    ariaLabel,
  }: { checked?: boolean; left: string; right: string; prefix?: string; title?: string; ariaLabel: string } = $props();
</script>

<span class="wrap" {title}>
  {#if prefix}<span class="prefix">{prefix}</span>{/if}
  <button class="switch" role="switch" aria-checked={checked} aria-label={ariaLabel} onclick={() => (checked = !checked)}>
    <span class="side" class:on={!checked}>{left}</span>
    <span class="track" class:right={checked}><span class="knob"></span></span>
    <span class="side" class:on={checked}>{right}</span>
  </button>
</span>

<style>
  .wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    background: none;
    border: 0;
    color: #8f98a0;
    font: inherit;
    cursor: pointer;
  }
  .side.on {
    color: #fff;
  }
  .track {
    position: relative;
    width: 38px;
    height: 20px;
    box-sizing: border-box;
    border-radius: 10px;
    background: #2a3f5a;
    border: 1px solid #3a5269;
    transition: background 0.15s;
  }
  .track.right {
    background: rgba(103, 193, 245, 0.35);
    border-color: #67c1f5;
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #c6d4df;
    transition: transform 0.15s;
  }
  .track.right .knob {
    transform: translateX(18px);
    background: #fff;
  }
  .switch:focus-visible .track {
    outline: 2px solid #67c1f5;
    outline-offset: 2px;
  }
</style>
