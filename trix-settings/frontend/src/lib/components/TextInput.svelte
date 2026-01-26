<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let description: string = '';
  export let value: string = '';
  export let placeholder: string = '';
  export let disabled: boolean = false;
  export let type: 'text' | 'password' = 'text';

  const dispatch = createEventDispatcher<{ change: string }>();

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    dispatch('change', target.value);
  }
</script>

<div class="input-wrapper" class:disabled>
  <div class="input-text">
    <label for={label} class="input-label">{label}</label>
    {#if description}
      <span class="input-description">{description}</span>
    {/if}
  </div>
  <input
    id={label}
    {type}
    {value}
    {placeholder}
    {disabled}
    on:input={handleInput}
  />
</div>

<style>
  .input-wrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-wrapper.disabled {
    opacity: 0.5;
  }

  .input-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .input-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
  }

  .input-description {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  input {
    padding: 10px 12px;
    font-size: 14px;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    transition: border-color 0.15s;
  }

  input::placeholder {
    color: var(--text-secondary);
    opacity: 0.7;
  }

  input:hover:not(:disabled) {
    border-color: var(--accent-color);
  }

  input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
  }

  input:disabled {
    cursor: not-allowed;
    background: var(--bg-secondary);
  }
</style>
