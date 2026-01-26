<script lang="ts">
  import { settingsStore, updateSettings, triggerSync, daemonStatus, getDaemonStatus } from '../api';
  import { onMount } from 'svelte';
  import SettingsSection from './SettingsSection.svelte';
  import Toggle from './Toggle.svelte';
  import NumberInput from './NumberInput.svelte';

  $: memorySync = $settingsStore.memorySync;

  let syncing = false;
  let lastSyncStatus = '';

  onMount(() => {
    getDaemonStatus();
    const interval = setInterval(getDaemonStatus, 30000);
    return () => clearInterval(interval);
  });

  function handleToggle(key: keyof typeof memorySync, value: boolean) {
    updateSettings('memorySync', { [key]: value });
  }

  function handleNumber(key: keyof typeof memorySync, value: number) {
    updateSettings('memorySync', { [key]: value });
  }

  async function handleSyncNow() {
    syncing = true;
    lastSyncStatus = '';
    try {
      await triggerSync();
      lastSyncStatus = 'Sync triggered successfully';
      await getDaemonStatus();
    } catch (e) {
      lastSyncStatus = e instanceof Error ? e.message : 'Sync failed';
    } finally {
      syncing = false;
    }
  }
</script>

<div class="settings-page">
  <h2>Memory & Sync Settings</h2>

  {#if $daemonStatus}
    <div class="status-card">
      <div class="status-item">
        <span class="status-label">Cache entries</span>
        <span class="status-value">{$daemonStatus.cacheEntries}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Last sync</span>
        <span class="status-value">{$daemonStatus.lastSync || 'Never'}</span>
      </div>
      <div class="status-item">
        <span class="status-label">API status</span>
        <span class="status-value" class:healthy={$daemonStatus.apiStatus === 'connected'}>
          {$daemonStatus.apiStatus}
        </span>
      </div>
    </div>
  {/if}

  <SettingsSection title="Synchronization">
    <Toggle
      label="Enable sync"
      description="Automatically sync memories with the Trix API"
      checked={memorySync.syncEnabled}
      on:change={(e) => handleToggle('syncEnabled', e.detail)}
    />

    <Toggle
      label="Offline mode"
      description="Store memories locally without syncing (useful when traveling)"
      checked={memorySync.offlineMode}
      on:change={(e) => handleToggle('offlineMode', e.detail)}
    />

    <div class="sync-now">
      <button
        class="sync-button"
        on:click={handleSyncNow}
        disabled={syncing || !memorySync.syncEnabled || memorySync.offlineMode}
      >
        {syncing ? 'Syncing...' : 'Sync Now'}
      </button>
      {#if lastSyncStatus}
        <span class="sync-status">{lastSyncStatus}</span>
      {/if}
    </div>
  </SettingsSection>

  <SettingsSection title="Timing">
    <NumberInput
      label="Sync interval (seconds)"
      description="How often to sync memories with the server"
      value={memorySync.syncIntervalSecs}
      min={10}
      max={3600}
      step={10}
      on:change={(e) => handleNumber('syncIntervalSecs', e.detail)}
      disabled={!memorySync.syncEnabled}
    />

    <NumberInput
      label="Batch size"
      description="Number of memories to sync in each batch"
      value={memorySync.batchSize}
      min={10}
      max={500}
      step={10}
      on:change={(e) => handleNumber('batchSize', e.detail)}
      disabled={!memorySync.syncEnabled}
    />

    <NumberInput
      label="Retry attempts"
      description="Number of times to retry failed syncs"
      value={memorySync.retryAttempts}
      min={1}
      max={10}
      step={1}
      on:change={(e) => handleNumber('retryAttempts', e.detail)}
      disabled={!memorySync.syncEnabled}
    />
  </SettingsSection>
</div>

<style>
  .settings-page {
    max-width: 600px;
  }

  h2 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 24px;
    color: var(--text-primary);
  }

  .status-card {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 24px;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .status-label {
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status-value {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .status-value.healthy {
    color: var(--success-color);
  }

  .sync-now {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }

  .sync-button {
    padding: 8px 16px;
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .sync-button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .sync-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sync-status {
    font-size: 13px;
    color: var(--text-secondary);
  }
</style>
