<script lang="ts">
  import { settingsStore, updateSettings } from '../api';
  import SettingsSection from './SettingsSection.svelte';
  import Toggle from './Toggle.svelte';
  import Select from './Select.svelte';

  $: general = $settingsStore.general;

  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'ja', label: 'Japanese' },
  ];

  const updateChannels = [
    { value: 'stable', label: 'Stable' },
    { value: 'beta', label: 'Beta' },
  ];

  function handleToggle(key: keyof typeof general, value: boolean) {
    updateSettings('general', { [key]: value });
  }

  function handleSelect(key: keyof typeof general, value: string) {
    updateSettings('general', { [key]: value });
  }
</script>

<div class="settings-page">
  <h2>General Settings</h2>

  <SettingsSection title="Startup">
    <Toggle
      label="Launch at startup"
      description="Start Trix when you log in to your computer"
      checked={general.launchAtStartup}
      on:change={(e) => handleToggle('launchAtStartup', e.detail)}
    />
  </SettingsSection>

  <SettingsSection title="Language">
    <Select
      label="Interface language"
      description="Language used for the application interface"
      options={languages}
      value={general.language}
      on:change={(e) => handleSelect('language', e.detail)}
    />
  </SettingsSection>

  <SettingsSection title="Updates">
    <Toggle
      label="Check for updates automatically"
      description="Periodically check for new versions of Trix"
      checked={general.checkForUpdates}
      on:change={(e) => handleToggle('checkForUpdates', e.detail)}
    />

    <Select
      label="Update channel"
      description="Choose between stable releases or beta versions"
      options={updateChannels}
      value={general.updateChannel}
      on:change={(e) => handleSelect('updateChannel', e.detail)}
      disabled={!general.checkForUpdates}
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
</style>
