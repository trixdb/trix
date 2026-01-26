<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let description: string = '';
  export let tags: string[] = [];
  export let disabled: boolean = false;
  export let placeholder: string = 'Add item...';

  const dispatch = createEventDispatcher<{ change: string[] }>();

  let inputValue = '';

  function addTag() {
    const value = inputValue.trim();
    if (value && !tags.includes(value)) {
      const newTags = [...tags, value];
      dispatch('change', newTags);
      inputValue = '';
    }
  }

  function removeTag(index: number) {
    const newTags = tags.filter((_, i) => i !== index);
    dispatch('change', newTags);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag();
    }
  }
</script>

<div class="tag-input-wrapper" class:disabled>
  <div class="tag-input-text">
    <label for={label} class="tag-input-label">{label}</label>
    {#if description}
      <span class="tag-input-description">{description}</span>
    {/if}
  </div>

  <div class="tag-container">
    {#each tags as tag, index}
      <span class="tag">
        <span class="tag-text">{tag}</span>
        {#if !disabled}
          <button
            class="tag-remove"
            on:click={() => removeTag(index)}
            title="Remove"
          >
            x
          </button>
        {/if}
      </span>
    {/each}

    {#if !disabled}
      <div class="tag-input-field">
        <input
          id={label}
          type="text"
          bind:value={inputValue}
          on:keydown={handleKeyDown}
          {placeholder}
          {disabled}
        />
        <button
          class="add-button"
          on:click={addTag}
          disabled={!inputValue.trim()}
        >
          Add
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .tag-input-wrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tag-input-wrapper.disabled {
    opacity: 0.5;
  }

  .tag-input-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tag-input-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .tag-input-description {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .tag-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
  }

  .tag {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 13px;
  }

  .tag-text {
    color: var(--text-primary);
    font-family: monospace;
  }

  .tag-remove {
    width: 16px;
    height: 16px;
    padding: 0;
    font-size: 12px;
    line-height: 1;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
  }

  .tag-remove:hover {
    background: var(--error-color);
    color: white;
  }

  .tag-input-field {
    display: flex;
    gap: 8px;
    flex: 1;
    min-width: 200px;
  }

  .tag-input-field input {
    flex: 1;
    padding: 6px 8px;
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
  }

  .tag-input-field input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .tag-input-field input::placeholder {
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .add-button {
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 500;
    color: white;
    background: var(--accent-color);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .add-button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .add-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
