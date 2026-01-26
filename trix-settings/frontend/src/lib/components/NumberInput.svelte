<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let description: string = '';
  export let value: number = 0;
  export let min: number = 0;
  export let max: number = 100;
  export let step: number = 1;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{ change: number }>();

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const numValue = parseInt(target.value, 10);
    if (!isNaN(numValue)) {
      dispatch('change', Math.min(max, Math.max(min, numValue)));
    }
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
    type="number"
    {value}
    {min}
    {max}
    {step}
    {disabled}
    on:input={handleInput}
  />
</div>

<style>
  .input-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .input-wrapper.disabled {
    opacity: 0.5;
  }

  .input-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
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
    width: 100px;
    padding: 8px 12px;
    font-size: 14px;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    text-align: right;
    transition: border-color 0.15s;
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

  /* Hide spinner buttons */
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type=number] {
    -moz-appearance: textfield;
  }
</style>
