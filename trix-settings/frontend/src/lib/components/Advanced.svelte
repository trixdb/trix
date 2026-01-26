<script lang="ts">
  import { settingsStore, updateSettings } from '../api';
  import SettingsSection from './SettingsSection.svelte';
  import Toggle from './Toggle.svelte';
  import TextInput from './TextInput.svelte';
  import NumberInput from './NumberInput.svelte';
  import Select from './Select.svelte';
  import TagInput from './TagInput.svelte';

  $: advanced = $settingsStore.advanced;

  const logLevels = [
    { value: 'debug', label: 'Debug' },
    { value: 'info', label: 'Info' },
    { value: 'warn', label: 'Warning' },
    { value: 'error', label: 'Error' },
  ];

  function updateHTTP<K extends keyof typeof advanced.http>(
    key: K,
    value: typeof advanced.http[K]
  ) {
    updateSettings('advanced', {
      ...advanced,
      http: { ...advanced.http, [key]: value },
    });
  }

  function updateIPC<K extends keyof typeof advanced.ipc>(
    key: K,
    value: typeof advanced.ipc[K]
  ) {
    updateSettings('advanced', {
      ...advanced,
      ipc: { ...advanced.ipc, [key]: value },
    });
  }

  function updateWatcher<K extends keyof typeof advanced.watcher>(
    key: K,
    value: typeof advanced.watcher[K]
  ) {
    updateSettings('advanced', {
      ...advanced,
      watcher: { ...advanced.watcher, [key]: value },
    });
  }

  function updateLog<K extends keyof typeof advanced.log>(
    key: K,
    value: typeof advanced.log[K]
  ) {
    updateSettings('advanced', {
      ...advanced,
      log: { ...advanced.log, [key]: value },
    });
  }

  function updateDebug<K extends keyof typeof advanced.debug>(
    key: K,
    value: typeof advanced.debug[K]
  ) {
    updateSettings('advanced', {
      ...advanced,
      debug: { ...advanced.debug, [key]: value },
    });
  }
</script>

<div class="settings-page">
  <h2>Advanced Settings</h2>

  <div class="warning-banner">
    These settings are for advanced users. Incorrect configuration may cause issues.
  </div>

  <SettingsSection title="HTTP Server">
    <Toggle
      label="Enable HTTP server"
      description="Run an HTTP server for health checks and metrics"
      checked={advanced.http.enabled}
      on:change={(e) => updateHTTP('enabled', e.detail)}
    />

    <TextInput
      label="Listen address"
      description="Address and port for the HTTP server"
      placeholder="127.0.0.1:9090"
      value={advanced.http.address}
      on:change={(e) => updateHTTP('address', e.detail)}
      disabled={!advanced.http.enabled}
    />

    <Toggle
      label="Enable pprof"
      description="Expose Go profiling endpoints (development only)"
      checked={advanced.http.enablePprof}
      on:change={(e) => updateHTTP('enablePprof', e.detail)}
      disabled={!advanced.http.enabled}
    />
  </SettingsSection>

  <SettingsSection title="IPC Server">
    <Toggle
      label="Enable IPC server"
      description="Allow local applications to communicate with the daemon"
      checked={advanced.ipc.enabled}
      on:change={(e) => updateIPC('enabled', e.detail)}
    />

    <TextInput
      label="Socket path"
      description="Path to the Unix socket (default: ~/.trix/daemon.sock)"
      placeholder="~/.trix/daemon.sock"
      value={advanced.ipc.socketPath}
      on:change={(e) => updateIPC('socketPath', e.detail)}
      disabled={!advanced.ipc.enabled}
    />
  </SettingsSection>

  <SettingsSection title="File Watcher">
    <Toggle
      label="Enable file watcher"
      description="Automatically capture memories from watched directories"
      checked={advanced.watcher.enabled}
      on:change={(e) => updateWatcher('enabled', e.detail)}
    />

    <TagInput
      label="Watch directories"
      description="Directories to monitor for file changes"
      tags={advanced.watcher.directories}
      on:change={(e) => updateWatcher('directories', e.detail)}
      disabled={!advanced.watcher.enabled}
      placeholder="Add directory path..."
    />

    <TagInput
      label="File patterns"
      description="Glob patterns for files to capture (e.g., *.md, *.txt)"
      tags={advanced.watcher.patterns}
      on:change={(e) => updateWatcher('patterns', e.detail)}
      disabled={!advanced.watcher.enabled}
      placeholder="Add pattern..."
    />

    <NumberInput
      label="Max file size (MB)"
      description="Maximum file size to process"
      value={advanced.watcher.maxFileSizeMB}
      min={1}
      max={500}
      step={1}
      on:change={(e) => updateWatcher('maxFileSizeMB', e.detail)}
      disabled={!advanced.watcher.enabled}
    />

    <Toggle
      label="Check .trixignore files"
      description="Respect .trixignore files in watched directories"
      checked={advanced.watcher.checkIgnoreFiles}
      on:change={(e) => updateWatcher('checkIgnoreFiles', e.detail)}
      disabled={!advanced.watcher.enabled}
    />
  </SettingsSection>

  <SettingsSection title="Logging">
    <Select
      label="Log level"
      description="Minimum severity level for log messages"
      options={logLevels}
      value={advanced.log.level}
      on:change={(e) => updateLog('level', e.detail)}
    />

    <TextInput
      label="Log file"
      description="Path to the log file"
      placeholder="~/.trix/logs/daemon.log"
      value={advanced.log.file}
      on:change={(e) => updateLog('file', e.detail)}
    />

    <Toggle
      label="JSON format"
      description="Output logs in JSON format (better for log aggregation)"
      checked={advanced.log.json}
      on:change={(e) => updateLog('json', e.detail)}
    />
  </SettingsSection>

  <SettingsSection title="Debug">
    <Toggle
      label="Enable debug mode"
      description="Enable additional debugging features"
      checked={advanced.debug.enabled}
      on:change={(e) => updateDebug('enabled', e.detail)}
    />

    <Toggle
      label="Verbose logging"
      description="Log additional diagnostic information"
      checked={advanced.debug.verboseLogging}
      on:change={(e) => updateDebug('verboseLogging', e.detail)}
      disabled={!advanced.debug.enabled}
    />

    <Toggle
      label="Memory profiling"
      description="Collect memory usage statistics"
      checked={advanced.debug.profileMemory}
      on:change={(e) => updateDebug('profileMemory', e.detail)}
      disabled={!advanced.debug.enabled}
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
    margin-bottom: 16px;
    color: var(--text-primary);
  }

  .warning-banner {
    padding: 12px 16px;
    background: rgba(255, 193, 7, 0.15);
    border: 1px solid var(--warning-color);
    border-radius: 8px;
    font-size: 13px;
    color: var(--warning-color);
    margin-bottom: 24px;
  }
</style>
