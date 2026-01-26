<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let description: string = '';
  export let options: { value: string; label: string }[] = [];
  export let value: string = '';
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{ change: string }>();

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    dispatch('change', target.value);
  }
</script>

<div class="select-wrapper" class:disabled>
  <div class="select-text">
    <label for={label} class="select-label">{label}</label>
    {#if description}
      <span class="select-description">{description}</span>
    {/if}
  </div>
  <select
    id={label}
    {value}
    {disabled}
    on:change={handleChange}
  >
    {#each options as option}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</div>

<style>
  .select-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .select-wrapper.disabled {
    opacity: 0.5;
  }

  .select-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .select-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
  }

  .select-description {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  select {
    min-width: 140px;
    padding: 8px 12px;
    font-size: 14px;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  select:hover:not(:disabled) {
    border-color: var(--accent-color);
  }

  select:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
  }

  select:disabled {
    cursor: not-allowed;
    background: var(--bg-secondary);
  }
</style>
