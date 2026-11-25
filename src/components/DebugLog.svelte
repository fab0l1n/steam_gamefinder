<script lang="ts">
  /** Debug panel: a read-only text box with everything the loader logged, plus copy/clear. */
  let {
    lines,
    onclear,
    onrecheck,
    busy = false,
    open = $bindable(false),
  }: { lines: string[]; onclear: () => void; onrecheck: () => void; busy?: boolean; open?: boolean } = $props();

  let box = $state<HTMLTextAreaElement>();
  let copied = $state(false);

  $effect(() => {
    void lines.length;
    if (box) box.scrollTop = box.scrollHeight;
  });

  async function copy() {
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      box?.select();
      document.execCommand?.('copy');
    }
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<section class="debug">
  <header>
    <button class="toggle" onclick={() => (open = !open)} aria-expanded={open}>
      {open ? '▾' : '▸'} Debug log <span class="n">({lines.length} lines)</span>
    </button>
    {#if open}
      <span class="actions">
        <button onclick={onrecheck} disabled={busy} title="Look up every co-op game on co-optimus again (normally cached for 30 days)">Re-check co-op</button>
        <button onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button onclick={onclear}>Clear</button>
      </span>
    {/if}
  </header>
  {#if open}
    <textarea bind:this={box} readonly spellcheck="false" value={lines.join('\n')}></textarea>
  {/if}
</section>

<style>
  .debug {
    margin: 0 0 12px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid #2a3f5a;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
  }
  button {
    background: none;
    border: 0;
    color: #8f98a0;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 4px;
  }
  button:hover:not(:disabled) {
    color: #fff;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .n {
    color: #556772;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 200px;
    margin: 0;
    padding: 8px;
    resize: vertical;
    border: 0;
    border-top: 1px solid #2a3f5a;
    background: #0b1016;
    color: #a9c0d3;
    font: 11px/1.45 Consolas, 'Courier New', monospace;
    white-space: pre;
  }
</style>
