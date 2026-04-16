<!--
  LocalModels — ADR-141 Local Models pane. Three catalog tabs
  (Recommended / Library / Custom) + top-level hardware & Ollama
  capability cards, a remote-inference kill switch, a privacy
  (opt-in telemetry) toggle, and a Diagnostics tab for bundle export.

  Manual test: load with daemon online → Recommended tab is default
  and shows the featured model. Switch to Library → full catalog
  with fit badges. Switch to Custom → type a ref + Inspect. Toggle
  "Allow remote inference" off → confirm the toggle persists across
  reloads. Toggle "Share anonymous usage data" → confirm persists.
  Open Diagnostics → Export. With daemon offline, all sections show
  a soft-fail banner without crashing.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import SettingsSection from './SettingsSection.svelte';
  import Toggle from './Toggle.svelte';
  import RecommendedTab from './local-models/RecommendedTab.svelte';
  import LibraryTab from './local-models/LibraryTab.svelte';
  import CustomTab from './local-models/CustomTab.svelte';
  import DiagnosticBundle from './DiagnosticBundle.svelte';
  import type {
    NodeCapabilities,
    CatalogRow,
    InstalledModel,
  } from '../api';

  type Tab = 'recommended' | 'library' | 'custom' | 'diagnostics';

  const tabOrder: Tab[] = ['recommended', 'library', 'custom', 'diagnostics'];
  let activeTab: Tab = 'recommended';
  let capabilities: NodeCapabilities | null = null;
  let catalog: CatalogRow[] = [];
  let installed: InstalledModel[] = [];
  let loading = true;
  let errorState: string | null = null;

  let killSwitchEnabled = true;
  let killSwitchBusy = false;
  let killSwitchNote: string | null = null;

  let telemetryEnabled = false;
  let telemetryBusy = false;

  let ollamaInstalling = false;
  let ollamaInstallMsg: string | null = null;

  onMount(() => {
    void refresh();
    void loadKillSwitch();
    void loadTelemetry();
  });

  function mb(n: number): string {
    if (!n) return '—';
    if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
    return `${n} MB`;
  }

  async function refresh(): Promise<void> {
    loading = true;
    errorState = null;
    try {
      if (!window.go) throw new Error('Wails runtime not available');
      const api = window.go.main.App;
      const [caps, cat, list] = await Promise.all([
        api.LocalLLMCapabilities(),
        api.LocalLLMCatalog(),
        api.LocalLLMList().catch(() => [] as InstalledModel[]),
      ]);
      capabilities = caps;
      catalog = cat ?? [];
      installed = list ?? [];
    } catch (e) {
      errorState = e instanceof Error ? e.message : 'Unable to reach trix-daemon';
    } finally {
      loading = false;
    }
  }

  async function loadKillSwitch(): Promise<void> {
    try {
      if (!window.go) return;
      const s = await window.go.main.App.LocalLLMGetKillSwitch();
      killSwitchEnabled = s?.enabled ?? true;
    } catch {
      // leave default ON; daemon may not be up yet
    }
  }

  async function handleKillSwitchChange(next: boolean): Promise<void> {
    killSwitchBusy = true;
    killSwitchNote = null;
    const prev = killSwitchEnabled;
    killSwitchEnabled = next;
    try {
      if (!window.go) throw new Error('Wails runtime not available');
      await window.go.main.App.LocalLLMSetKillSwitch(next);
      killSwitchNote = next
        ? 'Remote inference allowed.'
        : 'Remote inference blocked. The daemon will refuse cloud-initiated chats.';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('not implemented')) {
        killSwitchNote = 'Kill-switch not yet supported by daemon — setting saved locally.';
      } else {
        killSwitchEnabled = prev;
        killSwitchNote = `Failed: ${msg}`;
      }
    } finally {
      killSwitchBusy = false;
    }
  }

  async function loadTelemetry(): Promise<void> {
    try {
      if (!window.go) return;
      const s = await window.go.main.App.GetTelemetryEnabled();
      telemetryEnabled = s?.enabled ?? false;
    } catch {
      telemetryEnabled = false;
    }
  }

  async function handleTelemetryChange(next: boolean): Promise<void> {
    telemetryBusy = true;
    const prev = telemetryEnabled;
    telemetryEnabled = next;
    try {
      if (!window.go) throw new Error('Wails runtime not available');
      await window.go.main.App.SetTelemetryEnabled(next);
    } catch (e) {
      telemetryEnabled = prev;
      errorState = e instanceof Error ? e.message : 'Failed to save telemetry preference';
    } finally {
      telemetryBusy = false;
    }
  }

  async function handleInstallOllama(): Promise<void> {
    const msg =
      'Install Ollama on this machine?\n\n' +
      'Trix will download the official Ollama installer over HTTPS ' +
      '(~150 MB) and verify its SHA256 before running it.\n\n' +
      'The installer runs as your user — no sudo required.';
    if (!window.confirm(msg)) return;
    ollamaInstalling = true;
    ollamaInstallMsg = 'Downloading and verifying Ollama installer…';
    errorState = null;
    try {
      if (!window.go) throw new Error('Wails runtime not available');
      const result = await window.go.main.App.OllamaInstall();
      ollamaInstallMsg = `Installed Ollama ${result.version} at ${result.binary_path}.`;
      await refresh();
    } catch (e) {
      ollamaInstallMsg = null;
      errorState = e instanceof Error ? e.message : 'Ollama install failed';
    } finally {
      ollamaInstalling = false;
    }
  }

  async function handleRemove(ref: string): Promise<void> {
    const ok = window.confirm(
      `Remove model "${ref}"? This will delete the local copy and free its disk space.`,
    );
    if (!ok) return;
    try {
      if (!window.go) throw new Error('Wails runtime not available');
      await window.go.main.App.LocalLLMRemove(ref);
      await refresh();
    } catch (e) {
      errorState = e instanceof Error ? e.message : 'Remove failed';
    }
  }

  async function handleInstall(ref: string, badge = 'unknown'): Promise<void> {
    // 🔴 / ⚪ badges require an extra confirmation per ADR-141.
    if (badge === 'red' || badge === 'unknown') {
      const ok = window.confirm(
        `Model "${ref}" is marked "${badge === 'red' ? 'Too large' : 'Unknown fit'}"\n\n` +
          `Installing anyway may fail or run very slowly on this hardware. Continue?`,
      );
      if (!ok) return;
    }
    try {
      if (!window.go) throw new Error('Wails runtime not available');
      // Streaming install is wired in parallel; until then the daemon
      // returns NotImplemented for ad-hoc refs, which we surface.
      await (window.go.main.App as unknown as {
        LocalLLMInstall?: (ref: string) => Promise<unknown>;
      }).LocalLLMInstall?.(ref);
      await refresh();
    } catch (e) {
      errorState = e instanceof Error ? e.message : 'Install failed';
    }
  }

  $: ollamaBackend = capabilities?.backends?.ollama ?? null;
  $: ollamaAvailable = ollamaBackend?.available === true;
</script>

<div class="settings-page">
  <div class="page-header">
    <h2>Local Models</h2>
    <button class="refresh-btn" on:click={refresh} disabled={loading}>
      {loading ? 'Refreshing…' : 'Refresh'}
    </button>
  </div>

  {#if errorState}
    <div class="banner error" role="alert">
      <strong>Daemon not connected.</strong>
      <span>{errorState}</span>
    </div>
  {/if}

  <SettingsSection title="Remote Inference">
    <div class="kill-switch-row">
      <div class="kill-icon" aria-hidden="true">⚠️</div>
      <div class="kill-body">
        <Toggle
          label="Allow remote inference"
          description="Disable this to block all inference requests from the cloud API. Turn on before sharing your machine."
          checked={killSwitchEnabled}
          disabled={killSwitchBusy}
          on:change={(e) => handleKillSwitchChange(e.detail)}
        />
        {#if killSwitchNote}
          <p class="kill-note">{killSwitchNote}</p>
        {/if}
      </div>
    </div>
  </SettingsSection>

  {#if capabilities}
    <SettingsSection title="Hardware">
      <div class="caps-grid">
        <div class="cap-cell"><span class="cap-label">OS / Arch</span><span class="cap-value">{capabilities.host.os} · {capabilities.host.arch}</span></div>
        <div class="cap-cell"><span class="cap-label">CPU cores</span><span class="cap-value">{capabilities.host.cpu_cores}</span></div>
        <div class="cap-cell"><span class="cap-label">RAM</span><span class="cap-value">{mb(capabilities.host.ram_mb)}</span></div>
        <div class="cap-cell">
          <span class="cap-label">GPU</span>
          <span class="cap-value">
            {capabilities.host.gpu.vendor}
            {#if capabilities.host.gpu.model}· {capabilities.host.gpu.model}{/if}
          </span>
        </div>
        <div class="cap-cell"><span class="cap-label">VRAM</span><span class="cap-value">{mb(capabilities.host.gpu.vram_mb)}</span></div>
        <div class="cap-cell"><span class="cap-label">Budget for models</span><span class="cap-value accent">{mb(capabilities.available_for_models_mb)}</span></div>
      </div>
    </SettingsSection>
  {/if}

  {#if capabilities}
    <SettingsSection title="Ollama runtime">
      <div class="ollama-card">
        {#if ollamaAvailable}
          <p class="ok-msg">
            ✅ Ollama {ollamaBackend?.version ?? ''} detected —
            source: <code>{ollamaBackend?.source ?? 'unknown'}</code>.
          </p>
        {:else}
          <p class="warn-msg">Ollama is not installed on this machine. Local models require it to run.</p>
          <button class="action-button primary" on:click={handleInstallOllama} disabled={ollamaInstalling}>
            {ollamaInstalling ? 'Installing…' : 'Install Ollama'}
          </button>
        {/if}
        {#if ollamaInstallMsg}
          <p class="status-msg">{ollamaInstallMsg}</p>
        {/if}
      </div>
    </SettingsSection>
  {/if}

  <SettingsSection title="Models">
    <div class="tab-bar" role="tablist">
      {#each tabOrder as t}
        <button
          class="tab"
          class:active={activeTab === t}
          role="tab"
          aria-selected={activeTab === t}
          on:click={() => (activeTab = t)}
        >
          {t === 'recommended' ? 'Recommended'
            : t === 'library' ? 'Library'
            : t === 'custom' ? 'Custom'
            : 'Diagnostics'}
        </button>
      {/each}
    </div>

    <div class="tab-panel">
      {#if activeTab === 'recommended'}
        <RecommendedTab
          catalog={catalog}
          installed={installed}
          featured={capabilities?.recommended_model ?? null}
          on:install={(e) => handleInstall(e.detail, 'green')}
          on:remove={(e) => handleRemove(e.detail)}
        />
      {:else if activeTab === 'library'}
        <LibraryTab
          catalog={catalog}
          installed={installed}
          loading={loading}
          on:install={(e) => handleInstall(e.detail.ref, e.detail.badge)}
          on:remove={(e) => handleRemove(e.detail)}
        />
      {:else if activeTab === 'custom'}
        <CustomTab on:install={(e) => handleInstall(e.detail, 'unknown')} />
      {:else}
        <DiagnosticBundle />
      {/if}
    </div>
  </SettingsSection>

  <SettingsSection title="Privacy">
    <Toggle
      label="Share anonymous usage data"
      description="Emit opt-in telemetry: install success/failure, model popularity, crash rates, time-to-first-chat. Default off."
      checked={telemetryEnabled}
      disabled={telemetryBusy}
      on:change={(e) => handleTelemetryChange(e.detail)}
    />
  </SettingsSection>
</div>

<style>
  .settings-page { max-width: 760px; }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  h2 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .refresh-btn {
    padding: 6px 14px;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .banner {
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }

  .banner.error {
    background: var(--bg-secondary);
    border: 1px solid var(--error-color);
    color: var(--error-color);
  }

  .kill-switch-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
    border-left: 3px solid var(--warning-color, #d4a017);
  }

  .kill-icon { font-size: 22px; line-height: 1; flex-shrink: 0; }

  .kill-body { flex: 1; min-width: 0; }

  .kill-note {
    font-size: 12px;
    margin: 8px 0 0 0;
    color: var(--text-secondary);
  }

  .caps-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .cap-cell { display: flex; flex-direction: column; gap: 2px; }

  .cap-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
  }

  .cap-value {
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 500;
  }

  .cap-value.accent { color: var(--accent-color); }

  .tab-bar {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 14px;
  }

  .tab {
    padding: 8px 14px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-transform: capitalize;
  }

  .tab:hover { color: var(--text-primary); }

  .tab.active {
    color: var(--accent-color);
    border-bottom-color: var(--accent-color);
  }

  .tab-panel { min-height: 120px; }

  .ollama-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ok-msg { margin: 0; color: var(--success-color, #22a36a); }
  .warn-msg { margin: 0; color: var(--text-primary); }
  .status-msg { margin: 0; font-size: 13px; color: var(--text-secondary); }

  .action-button {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    align-self: flex-start;
  }

  .action-button.primary { background: var(--accent-color); color: white; }
  .action-button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
