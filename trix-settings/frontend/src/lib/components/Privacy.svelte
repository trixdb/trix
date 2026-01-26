<script lang="ts">
  import { settingsStore, updateSettings, clearCache } from '../api';
  import SettingsSection from './SettingsSection.svelte';
  import Toggle from './Toggle.svelte';

  $: privacy = $settingsStore.privacy;

  let clearingCache = false;
  let cacheStatus = '';

  function handleToggle(key: keyof typeof privacy, value: boolean) {
    updateSettings('privacy', { [key]: value });
  }

  async function handleClearCache() {
    clearingCache = true;
    cacheStatus = '';
    try {
      await clearCache();
      cacheStatus = 'Cache cleared successfully';
    } catch (e) {
      cacheStatus = e instanceof Error ? e.message : 'Failed to clear cache';
    } finally {
      clearingCache = false;
    }
  }
</script>

<div class="settings-page">
  <h2>Privacy Settings</h2>

  <SettingsSection title="API Credentials">
    <div class="credential-status">
      <div class="status-indicator" class:configured={privacy.apiKeyConfigured}>
        {privacy.apiKeyConfigured ? 'API key configured' : 'API key not configured'}
      </div>
      <p class="credential-note">
        API credentials are stored securely in your system keychain.
        Use the Trix CLI to configure: <code>trix auth login</code>
      </p>
    </div>
  </SettingsSection>

  <SettingsSection title="Privacy Mode">
    <Toggle
      label="Enable privacy mode"
      description="Hide memory content in the system tray recent memories list"
      checked={privacy.privacyModeEnabled}
      on:change={(e) => handleToggle('privacyModeEnabled', e.detail)}
    />

    <Toggle
      label="Clear cache on quit"
      description="Remove all cached data when Trix closes"
      checked={privacy.clearCacheOnQuit}
      on:change={(e) => handleToggle('clearCacheOnQuit', e.detail)}
    />
  </SettingsSection>

  <SettingsSection title="Telemetry">
    <Toggle
      label="Send anonymous usage data"
      description="Help improve Trix by sending anonymous usage statistics"
      checked={privacy.telemetryEnabled}
      on:change={(e) => handleToggle('telemetryEnabled', e.detail)}
    />

    <p class="telemetry-note">
      We only collect anonymous usage data (feature usage, performance metrics).
      No personal data or memory content is ever collected.
    </p>
  </SettingsSection>

  <SettingsSection title="Data Management">
    <div class="data-action">
      <div class="action-info">
        <h4>Clear local cache</h4>
        <p>Remove all locally cached memories. This does not affect your synced data.</p>
      </div>
      <button
        class="action-button danger"
        on:click={handleClearCache}
        disabled={clearingCache}
      >
        {clearingCache ? 'Clearing...' : 'Clear Cache'}
      </button>
    </div>
    {#if cacheStatus}
      <p class="action-status">{cacheStatus}</p>
    {/if}
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

  .credential-status {
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--warning-color);
    margin-bottom: 8px;
  }

  .status-indicator::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }

  .status-indicator.configured {
    color: var(--success-color);
  }

  .credential-note {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .credential-note code {
    background: var(--bg-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
  }

  .telemetry-note {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 12px;
    line-height: 1.5;
  }

  .data-action {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .action-info h4 {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .action-info p {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
  }

  .action-button {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s;
  }

  .action-button.danger {
    background: var(--error-color);
    color: white;
  }

  .action-button.danger:hover:not(:disabled) {
    background: #c82333;
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-status {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 12px;
  }
</style>
