<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let description: string = '';
  export let value: string = '';
  export let disabled: boolean = false;
  export let optional: boolean = false;

  const dispatch = createEventDispatcher<{ change: string }>();

  let recording = false;
  let displayValue = value;

  function startRecording() {
    if (disabled) return;
    recording = true;
    displayValue = 'Press keys...';
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!recording) return;

    event.preventDefault();
    event.stopPropagation();

    // Ignore modifier-only presses
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      return;
    }

    // Build the hotkey string
    const parts: string[] = [];

    if (event.ctrlKey || event.metaKey) {
      parts.push('Ctrl');
    }
    if (event.altKey) {
      parts.push('Alt');
    }
    if (event.shiftKey) {
      parts.push('Shift');
    }

    // Get the key name
    let key = event.key;
    if (key === ' ') {
      key = 'Space';
    } else if (key.length === 1) {
      key = key.toUpperCase();
    }

    parts.push(key);

    const hotkey = parts.join('+');
    displayValue = hotkey;
    recording = false;

    dispatch('change', hotkey);
  }

  function handleBlur() {
    if (recording) {
      recording = false;
      displayValue = value;
    }
  }

  function clearHotkey() {
    displayValue = '';
    dispatch('change', '');
  }

  $: if (!recording) {
    displayValue = value;
  }
</script>

<div class="hotkey-wrapper" class:disabled>
  <div class="hotkey-text">
    <span class="hotkey-label">
      {label}
      {#if optional}
        <span class="optional">(optional)</span>
      {/if}
    </span>
    {#if description}
      <span class="hotkey-description">{description}</span>
    {/if}
  </div>
  <div class="hotkey-input-group">
    <button
      class="hotkey-input"
      class:recording
      class:empty={!displayValue}
      on:click={startRecording}
      on:keydown={handleKeyDown}
      on:blur={handleBlur}
      {disabled}
    >
      {displayValue || 'Click to set'}
    </button>
    {#if value && !disabled}
      <button
        class="clear-button"
        on:click={clearHotkey}
        title="Clear hotkey"
      >
        x
      </button>
    {/if}
  </div>
</div>

<style>
  .hotkey-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .hotkey-wrapper.disabled {
    opacity: 0.5;
  }

  .hotkey-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .hotkey-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .optional {
    font-weight: 400;
    color: var(--text-secondary);
  }

  .hotkey-description {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .hotkey-input-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .hotkey-input {
    min-width: 140px;
    padding: 8px 12px;
    font-size: 13px;
    font-family: monospace;
    color: var(--text-primary);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
    text-align: center;
  }

  .hotkey-input.empty {
    color: var(--text-secondary);
    font-style: italic;
    font-family: inherit;
  }

  .hotkey-input:hover:not(:disabled) {
    border-color: var(--accent-color);
  }

  .hotkey-input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
  }

  .hotkey-input.recording {
    background: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
    font-style: italic;
    font-family: inherit;
  }

  .hotkey-input:disabled {
    cursor: not-allowed;
  }

  .clear-button {
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 14px;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
  }

  .clear-button:hover {
    background: var(--bg-secondary);
    color: var(--error-color);
  }
</style>
