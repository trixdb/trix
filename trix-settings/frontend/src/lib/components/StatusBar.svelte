<script lang="ts">
  import { connectionStatus, isConnected, hasChanges, isSaving, saveConfig, reconnect } from '../api';

  async function handleSave() {
    try {
      await saveConfig();
    } catch (e) {
      console.error('Failed to save:', e);
      // TODO: Show error toast
    }
  }

  async function handleReconnect() {
    await reconnect();
  }
</script>

<footer class="status-bar">
  <div class="status-left">
    <span class="status-indicator" class:connected={$isConnected}>
      <span class="status-dot" />
      {$connectionStatus.status}
    </span>
    {#if $connectionStatus.error}
      <span class="status-error">{$connectionStatus.error}</span>
    {/if}
  </div>

  <div class="status-right">
    {#if !$isConnected}
      <button class="reconnect-button" on:click={handleReconnect}>
        Reconnect
      </button>
    {:else if $hasChanges}
      <span class="unsaved-indicator">Unsaved changes</span>
      <button
        class="save-button"
        on:click={handleSave}
        disabled={$isSaving}
      >
        {$isSaving ? 'Saving...' : 'Save Changes'}
      </button>
    {/if}
  </div>
</footer>

<style>
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 24px;
    background: var(--bg-sidebar);
    border-top: 1px solid var(--border-color);
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-secondary);
    text-transform: capitalize;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warning-color);
  }

  .status-indicator.connected .status-dot {
    background: var(--success-color);
  }

  .status-error {
    font-size: 12px;
    color: var(--error-color);
  }

  .status-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .unsaved-indicator {
    font-size: 13px;
    color: var(--warning-color);
  }

  .reconnect-button,
  .save-button {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .reconnect-button {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .reconnect-button:hover {
    background: var(--border-color);
  }

  .save-button {
    background: var(--accent-color);
    color: white;
  }

  .save-button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .save-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
