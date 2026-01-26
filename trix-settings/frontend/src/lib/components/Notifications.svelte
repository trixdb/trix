<script lang="ts">
  import { settingsStore, updateSettings } from '../api';
  import SettingsSection from './SettingsSection.svelte';
  import Toggle from './Toggle.svelte';
  import TextInput from './TextInput.svelte';

  $: notifications = $settingsStore.notifications;

  function handleToggle(key: keyof typeof notifications, value: boolean) {
    updateSettings('notifications', { [key]: value });
  }

  function handleInput(key: keyof typeof notifications, value: string) {
    updateSettings('notifications', { [key]: value });
  }
</script>

<div class="settings-page">
  <h2>Notification Settings</h2>

  <SettingsSection title="Desktop Notifications">
    <Toggle
      label="Enable notifications"
      description="Show desktop notifications for important events"
      checked={notifications.enabled}
      on:change={(e) => handleToggle('enabled', e.detail)}
    />

    <Toggle
      label="Show sync completion"
      description="Notify when memory synchronization completes"
      checked={notifications.showSyncComplete}
      on:change={(e) => handleToggle('showSyncComplete', e.detail)}
      disabled={!notifications.enabled}
    />

    <Toggle
      label="Show errors"
      description="Notify about sync errors and connection issues"
      checked={notifications.showErrors}
      on:change={(e) => handleToggle('showErrors', e.detail)}
      disabled={!notifications.enabled}
    />
  </SettingsSection>

  <SettingsSection title="Sound">
    <Toggle
      label="Enable notification sounds"
      description="Play a sound when notifications appear"
      checked={notifications.soundEnabled}
      on:change={(e) => handleToggle('soundEnabled', e.detail)}
      disabled={!notifications.enabled}
    />

    {#if notifications.soundEnabled}
      <TextInput
        label="Custom sound file"
        description="Path to a custom WAV file (leave empty for default)"
        placeholder="/path/to/sound.wav"
        value={notifications.soundFile || ''}
        on:change={(e) => handleInput('soundFile', e.detail)}
      />
    {/if}
  </SettingsSection>

  <SettingsSection title="Do Not Disturb">
    <p class="section-description">
      Set quiet hours when notifications will be silenced.
    </p>

    <div class="time-range">
      <TextInput
        label="Start time"
        placeholder="22:00"
        value={notifications.doNotDisturbStart || ''}
        on:change={(e) => handleInput('doNotDisturbStart', e.detail)}
        disabled={!notifications.enabled}
      />

      <span class="time-separator">to</span>

      <TextInput
        label="End time"
        placeholder="08:00"
        value={notifications.doNotDisturbEnd || ''}
        on:change={(e) => handleInput('doNotDisturbEnd', e.detail)}
        disabled={!notifications.enabled}
      />
    </div>
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

  .section-description {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 16px;
  }

  .time-range {
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }

  .time-separator {
    font-size: 14px;
    color: var(--text-secondary);
    padding-bottom: 12px;
  }
</style>
