<script lang="ts">
  import { settingsStore, updateSettings, validateHotkey } from '../api';
  import SettingsSection from './SettingsSection.svelte';
  import HotkeyInput from './HotkeyInput.svelte';

  $: hotkeys = $settingsStore.hotkeys;

  async function handleHotkeyChange(key: keyof typeof hotkeys, value: string) {
    // Validate the hotkey before setting
    const validation = await validateHotkey(value);
    if (validation.valid) {
      updateSettings('hotkeys', { [key]: value });
    }
    return validation;
  }
</script>

<div class="settings-page">
  <h2>Keyboard Shortcuts</h2>

  <p class="page-description">
    Configure global keyboard shortcuts for quick access to Trix features.
    Press the key combination you want to use when the input is focused.
  </p>

  <SettingsSection title="Core Actions">
    <HotkeyInput
      label="Quick Capture"
      description="Instantly capture a new memory"
      value={hotkeys.quickCapture}
      on:change={(e) => handleHotkeyChange('quickCapture', e.detail)}
    />

    <HotkeyInput
      label="Search Memories"
      description="Open memory search"
      value={hotkeys.searchMemories}
      on:change={(e) => handleHotkeyChange('searchMemories', e.detail)}
    />

    <HotkeyInput
      label="Toggle Pause"
      description="Pause or resume memory capture"
      value={hotkeys.togglePause}
      on:change={(e) => handleHotkeyChange('togglePause', e.detail)}
    />
  </SettingsSection>

  <SettingsSection title="Quick Access">
    <HotkeyInput
      label="Open Tray Menu"
      description="Open the system tray menu"
      value={hotkeys.openTrayMenu}
      on:change={(e) => handleHotkeyChange('openTrayMenu', e.detail)}
    />

    <HotkeyInput
      label="Quick Panel"
      description="Open the floating quick panel (optional)"
      value={hotkeys.quickPanel}
      on:change={(e) => handleHotkeyChange('quickPanel', e.detail)}
      optional
    />

    <HotkeyInput
      label="AI Chat"
      description="Open AI chat quick access (optional)"
      value={hotkeys.aiChat}
      on:change={(e) => handleHotkeyChange('aiChat', e.detail)}
      optional
    />
  </SettingsSection>

  <div class="shortcuts-info">
    <h4>Platform-specific notes</h4>
    <ul>
      <li><strong>macOS:</strong> Use Cmd instead of Ctrl. Accessibility permission required.</li>
      <li><strong>Linux/Wayland:</strong> Global shortcuts may need compositor configuration.</li>
      <li><strong>Windows:</strong> Avoid Win+* shortcuts as they conflict with system actions.</li>
    </ul>
  </div>
</div>

<style>
  .settings-page {
    max-width: 600px;
  }

  h2 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--text-primary);
  }

  .page-description {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 24px;
    line-height: 1.5;
  }

  .shortcuts-info {
    margin-top: 32px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .shortcuts-info h4 {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--text-primary);
  }

  .shortcuts-info ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .shortcuts-info li {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 8px;
    line-height: 1.4;
  }

  .shortcuts-info li:last-child {
    margin-bottom: 0;
  }
</style>
