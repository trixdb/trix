/**
 * API bindings for Wails Go backend.
 * This file provides TypeScript interfaces and Svelte stores for
 * communicating with the trix-daemon via the Wails bridge.
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';

// Types matching Go structs in config.go

export interface GeneralSettings {
  launchAtStartup: boolean;
  language: string;
  checkForUpdates: boolean;
  updateChannel: 'stable' | 'beta';
}

export interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  soundFile?: string;
  doNotDisturbStart?: string;
  doNotDisturbEnd?: string;
  showSyncComplete: boolean;
  showErrors: boolean;
}

export interface HotkeySettings {
  quickCapture: string;
  searchMemories: string;
  openTrayMenu: string;
  togglePause: string;
  quickPanel: string;
  aiChat: string;
}

export interface MemorySyncSettings {
  syncEnabled: boolean;
  syncIntervalSecs: number;
  batchSize: number;
  retryAttempts: number;
  offlineMode: boolean;
}

export interface PrivacySettings {
  apiKeyConfigured: boolean;
  telemetryEnabled: boolean;
  clearCacheOnQuit: boolean;
  privacyModeEnabled: boolean;
}

export interface HTTPSettings {
  enabled: boolean;
  address: string;
  enablePprof: boolean;
}

export interface IPCSettings {
  enabled: boolean;
  socketPath: string;
}

export interface WatcherSettings {
  enabled: boolean;
  directories: string[];
  patterns: string[];
  ignorePatterns: string[];
  maxFileSizeMB: number;
  checkIgnoreFiles: boolean;
}

export interface LogSettings {
  level: 'debug' | 'info' | 'warn' | 'error';
  file: string;
  json: boolean;
}

export interface DebugSettings {
  enabled: boolean;
  verboseLogging: boolean;
  profileMemory: boolean;
}

export interface AdvancedSettings {
  http: HTTPSettings;
  ipc: IPCSettings;
  watcher: WatcherSettings;
  log: LogSettings;
  debug: DebugSettings;
}

export interface SettingsConfig {
  general: GeneralSettings;
  notifications: NotificationSettings;
  hotkeys: HotkeySettings;
  memorySync: MemorySyncSettings;
  privacy: PrivacySettings;
  advanced: AdvancedSettings;
}

export interface ConnectionStatusInfo {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  error?: string;
  socketPath: string;
}

export interface DaemonStatus {
  version: string;
  uptime: number;
  state: string;
  apiStatus: string;
  cacheEntries: number;
  lastSync?: string;
  healthy: boolean;
}

export interface HotkeyValidation {
  valid: boolean;
  message: string;
  conflict?: string;
}

// Local LLM types (mirrors trix-daemon NodeCapabilities / CatalogRow)

export interface GPUInfo {
  vendor: string;
  model?: string;
  vram_mb: number;
  unified_memory: boolean;
}

export interface HostCapabilities {
  os: string;
  arch: string;
  cpu_cores: number;
  ram_mb: number;
  gpu: GPUInfo;
}

export interface FeaturedSummary {
  ref: string;
  tier: string;
  reason: string;
}

export interface InferenceBackend {
  name: string;
  available: boolean;
  installable: boolean;
  version?: string;
  source?: string;
}

export interface NodeCapabilities {
  schema_version: number;
  probed_at: string;
  host: HostCapabilities;
  available_for_models_mb: number;
  backends: Record<string, InferenceBackend>;
  recommended_model?: FeaturedSummary | null;
}

export interface CatalogEntry {
  ref: string;
  family: string;
  params_b: number;
  quant: string;
  size_bytes: number;
  num_ctx_max: number;
  supports_tools: 'full' | 'partial' | 'none';
  tier: 'fast' | 'balanced' | 'best';
  description: string;
  license: string;
}

export interface Fit {
  badge: 'green' | 'yellow' | 'red' | 'unknown';
  reason: string;
  required_mb: number;
  available_mb: number;
  headroom_mb: number;
}

export interface CatalogRow {
  entry: CatalogEntry;
  fit: Fit;
}

export interface InstalledModel {
  ref: string;
  digest: string;
  size_text: string;
  modified: string;
}

// ADR-141 Guardrail #9 — Ollama auto-install result shape returned by
// the daemon after a consent-gated Install() call succeeds.
export interface OllamaInstallResult {
  binary_path: string;
  version: string;
  source: string;
  sha256: string;
  url: string;
}

// ADR-141 kill-switch state for "allow remote inference".
export interface KillSwitchState {
  enabled: boolean;
  source?: string;
}

// ADR-141 opt-in telemetry flag.
export interface TelemetryState {
  enabled: boolean;
}

// ADR-141 diagnostics.export result from the backend after the user
// picks a save destination (or cancels).
export interface DiagnosticsBundle {
  savedPath?: string;
  sizeBytes: number;
  generatedAt: string;
  cancelled?: boolean;
}

// Default settings for when daemon is not connected
const defaultSettings: SettingsConfig = {
  general: {
    launchAtStartup: true,
    language: 'en',
    checkForUpdates: true,
    updateChannel: 'stable',
  },
  notifications: {
    enabled: true,
    soundEnabled: false,
    showSyncComplete: false,
    showErrors: true,
  },
  hotkeys: {
    quickCapture: 'Ctrl+Alt+M',
    searchMemories: 'Ctrl+Alt+S',
    openTrayMenu: 'Ctrl+Alt+T',
    togglePause: 'Ctrl+Alt+P',
    quickPanel: '',
    aiChat: '',
  },
  memorySync: {
    syncEnabled: true,
    syncIntervalSecs: 30,
    batchSize: 100,
    retryAttempts: 3,
    offlineMode: false,
  },
  privacy: {
    apiKeyConfigured: false,
    telemetryEnabled: false,
    clearCacheOnQuit: false,
    privacyModeEnabled: false,
  },
  advanced: {
    http: { enabled: true, address: '127.0.0.1:9090', enablePprof: false },
    ipc: { enabled: true, socketPath: '' },
    watcher: {
      enabled: false,
      directories: [],
      patterns: ['*.md', '*.txt'],
      ignorePatterns: [],
      maxFileSizeMB: 50,
      checkIgnoreFiles: false,
    },
    log: { level: 'info', file: '', json: true },
    debug: { enabled: false, verboseLogging: false, profileMemory: false },
  },
};

// Svelte stores
export const settingsStore: Writable<SettingsConfig> = writable(defaultSettings);
export const connectionStatus: Writable<ConnectionStatusInfo> = writable({
  status: 'disconnected',
  socketPath: '',
});
export const daemonStatus: Writable<DaemonStatus | null> = writable(null);
export const isSaving: Writable<boolean> = writable(false);
export const hasChanges: Writable<boolean> = writable(false);

// Derived store for connection state
export const isConnected: Readable<boolean> = derived(
  connectionStatus,
  ($status) => $status.status === 'connected'
);

// Wails runtime bindings - these will be available at runtime
declare global {
  interface Window {
    go?: {
      main: {
        App: {
          GetConfig(): Promise<SettingsConfig>;
          SaveConfig(cfg: SettingsConfig): Promise<void>;
          GetConnectionStatus(): Promise<ConnectionStatusInfo>;
          Reconnect(): Promise<ConnectionStatusInfo>;
          GetDaemonStatus(): Promise<DaemonStatus>;
          ClearCache(): Promise<void>;
          TriggerSync(): Promise<void>;
          ReloadConfig(): Promise<void>;
          ValidateHotkey(hotkey: string): Promise<HotkeyValidation>;
          LocalLLMCapabilities(): Promise<NodeCapabilities>;
          LocalLLMCatalog(): Promise<CatalogRow[]>;
          LocalLLMList(): Promise<InstalledModel[]>;
          LocalLLMRemove(ref: string): Promise<void>;
          OllamaInstall(): Promise<OllamaInstallResult>;
          LocalLLMGetKillSwitch(): Promise<KillSwitchState>;
          LocalLLMSetKillSwitch(enabled: boolean): Promise<void>;
          LocalLLMInspectRef(ref: string): Promise<unknown>;
          GetTelemetryEnabled(): Promise<TelemetryState>;
          SetTelemetryEnabled(enabled: boolean): Promise<void>;
          DiagnosticsExport(): Promise<DiagnosticsBundle>;
        };
      };
    };
  }
}

// API wrapper functions

/**
 * Load configuration from daemon.
 */
export async function loadConfig(): Promise<void> {
  if (!window.go) {
    console.warn('Wails runtime not available, using defaults');
    return;
  }

  try {
    const status = await window.go.main.App.GetConnectionStatus();
    connectionStatus.set(status);

    if (status.status === 'connected') {
      const config = await window.go.main.App.GetConfig();
      settingsStore.set(config);
      hasChanges.set(false);
    }
  } catch (e) {
    console.error('Failed to load config:', e);
    throw e;
  }
}

/**
 * Save configuration to daemon.
 */
export async function saveConfig(): Promise<void> {
  if (!window.go) {
    throw new Error('Wails runtime not available');
  }

  isSaving.set(true);
  try {
    let currentSettings: SettingsConfig | undefined;
    settingsStore.subscribe((s) => (currentSettings = s))();
    if (currentSettings) {
      await window.go.main.App.SaveConfig(currentSettings);
      hasChanges.set(false);
    }
  } finally {
    isSaving.set(false);
  }
}

/**
 * Reconnect to daemon.
 */
export async function reconnect(): Promise<void> {
  if (!window.go) return;

  const status = await window.go.main.App.Reconnect();
  connectionStatus.set(status);

  if (status.status === 'connected') {
    await loadConfig();
  }
}

/**
 * Get daemon status.
 */
export async function getDaemonStatus(): Promise<void> {
  if (!window.go) return;

  try {
    const status = await window.go.main.App.GetDaemonStatus();
    daemonStatus.set(status);
  } catch (e) {
    console.error('Failed to get daemon status:', e);
    daemonStatus.set(null);
  }
}

/**
 * Clear daemon cache.
 */
export async function clearCache(): Promise<void> {
  if (!window.go) {
    throw new Error('Wails runtime not available');
  }
  await window.go.main.App.ClearCache();
}

/**
 * Trigger immediate sync.
 */
export async function triggerSync(): Promise<void> {
  if (!window.go) {
    throw new Error('Wails runtime not available');
  }
  await window.go.main.App.TriggerSync();
}

/**
 * Validate a hotkey combination.
 */
export async function validateHotkey(hotkey: string): Promise<HotkeyValidation> {
  if (!window.go) {
    return { valid: true, message: 'Validation unavailable' };
  }
  return window.go.main.App.ValidateHotkey(hotkey);
}

/**
 * Update a specific settings section.
 */
export function updateSettings<K extends keyof SettingsConfig>(
  section: K,
  updates: Partial<SettingsConfig[K]>
): void {
  settingsStore.update((current) => ({
    ...current,
    [section]: { ...current[section], ...updates },
  }));
  hasChanges.set(true);
}
