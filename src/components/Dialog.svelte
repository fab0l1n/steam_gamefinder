<script lang="ts">
  /** Small modal in Steam's style: a name prompt (with `input`) or a confirmation. */
  let {
    title,
    message = '',
    input = false,
    placeholder = '',
    confirmLabel,
    danger = false,
    onconfirm,
    oncancel,
  }: {
    title: string;
    message?: string;
    input?: boolean;
    placeholder?: string;
    confirmLabel: string;
    danger?: boolean;
    onconfirm: (value: string) => void;
    oncancel: () => void;
  } = $props();

  let value = $state('');
  let inputEl = $state<HTMLInputElement>();
  let confirmEl = $state<HTMLButtonElement>();

  $effect(() => {
    (input ? inputEl : confirmEl)?.focus();
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (input && !value.trim()) return;
    onconfirm(value.trim());
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={oncancel}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title} onclick={(e) => e.stopPropagation()} {onkeydown}>
  <form onsubmit={submit}>
    <h4>{title}</h4>
    {#if message}<p>{message}</p>{/if}
    {#if input}
      <input bind:this={inputEl} bind:value {placeholder} maxlength="40" />
    {/if}
    <div class="actions">
      <button type="button" class="cancel" onclick={oncancel}>Cancel</button>
      <button type="submit" class="ok" class:danger bind:this={confirmEl} disabled={input && !value.trim()}>{confirmLabel}</button>
    </div>
  </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10001;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.6);
  }
  .dialog {
    width: 340px;
    background: radial-gradient(circle at top left, rgba(74, 81, 92, 0.4) 0%, rgba(75, 81, 92, 0) 60%), #25282e;
    box-shadow: 0 0 12px #000;
    padding: 18px 20px 16px;
    color: #c6d4df;
    font-size: 13px;
  }
  h4 {
    margin: 0 0 10px;
    font-size: 17px;
    font-weight: 400;
    color: #fff;
  }
  p {
    margin: 0 0 12px;
    color: #acb2b8;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    background: #10161d;
    border: 1px solid #2a3f5a;
    border-radius: 2px;
    color: #c6d4df;
    padding: 7px 9px;
    font: inherit;
  }
  input::placeholder {
    color: #556772;
    font-style: italic;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
  button {
    border: 0;
    border-radius: 2px;
    padding: 6px 14px;
    font: inherit;
    cursor: pointer;
  }
  .cancel {
    background: rgba(255, 255, 255, 0.1);
    color: #c6d4df;
  }
  .ok {
    background: linear-gradient(to right, #47bfff 0%, #1a44c2 100%);
    color: #fff;
  }
  .ok.danger {
    background: #a8392a;
  }
  .ok:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
