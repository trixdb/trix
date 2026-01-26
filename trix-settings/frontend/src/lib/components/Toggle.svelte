<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let description: string = '';
  export let checked: boolean = false;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{ change: boolean }>();

  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    dispatch('change', target.checked);
  }
</script>

<label class="toggle-wrapper" class:disabled>
  <div class="toggle-text">
    <span class="toggle-label">{label}</span>
    {#if description}
      <span class="toggle-description">{description}</span>
    {/if}
  </div>
  <div class="toggle-control">
    <input
      type="checkbox"
      {checked}
      {disabled}
      on:change={handleChange}
    />
    <span class="toggle-switch" />
  </div>
</label>

<style>
  .toggle-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    cursor: pointer;
  }

  .toggle-wrapper.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .toggle-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .toggle-description {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .toggle-control {
    position: relative;
    flex-shrink: 0;
  }

  .toggle-control input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-switch {
    display: block;
    width: 44px;
    height: 24px;
    background: var(--border-color);
    border-radius: 12px;
    transition: background-color 0.2s;
    position: relative;
  }

  .toggle-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .toggle-control input:checked + .toggle-switch {
    background: var(--accent-color);
  }

  .toggle-control input:checked + .toggle-switch::after {
    transform: translateX(20px);
  }

  .toggle-control input:focus + .toggle-switch {
    outline: 2px solid var(--accent-color);
    outline-offset: 2px;
  }

  .toggle-wrapper.disabled .toggle-switch {
    cursor: not-allowed;
  }
</style>
