<script lang="ts">
  import { onMount } from 'svelte';
  import SettingsSection from './SettingsSection.svelte';
  import type {
    NodeCapabilities,
    CatalogRow,
    InstalledModel,
  } from '../api';

  let capabilities: NodeCapabilities | null = null;
  let catalog: CatalogRow[] = [];
  let installed: InstalledModel[] = [];
  let loading = true;
  let errorState: string | null = null;

  const badgeIcon: Record<string, string> = {
    green: '🟢',
    yellow: '🟡',
    red: '🔴',
    unknown: '⚪',
  };

  const badgeLabel: Record<string, string> = {
    green: 'Fits',
    yellow: 'Tight',
    red: 'Too large',
    unknown: 'Unknown',
  };

  onMount(() => {
    void refresh();
  });

  async function refresh(): Promise<void> {
    loading = true;
    errorState = null;
    try {
      if (!window.go) {
        throw new Error('Wails runtime not available');
      }
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
      errorState =
        e instanceof Error
          ? e.message
          : 'Unable to reach trix-daemon';
    } finally {
      loading = false;
    }
  }

  function mb(n: number): string {
    if (!n) return '—';
    if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
    return `${n} MB`;
  }

  function bytesToText(n: number): string {
    if (!n) return '—';
    const gb = n / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  }

  function isInstalled(ref: string): boolean {
    const want = ref.toLowerCase().trim();
    return installed.some((m) => m.ref.toLowerCase().trim() === want);
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
      errorState =
        e instanceof Error ? e.message : 'Remove failed';
    }
  }

  // ADR-141 Guardrail #9: consent-gated Ollama auto-install. The
  // dialog here establishes consent; the daemon enforces HTTPS +
  // pinned SHA256 internally before executing anything.
  let ollamaInstalling = false;
  let ollamaInstallMsg: string | null = null;

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

  {#if capabilities}
    <SettingsSection title="Hardware">
      <div class="caps-grid">
        <div class="cap-cell">
          <span class="cap-label">OS / Arch</span>
          <span class="cap-value">{capabilities.host.os} · {capabilities.host.arch}</span>
        </div>
        <div class="cap-cell">
          <span class="cap-label">CPU cores</span>
          <span class="cap-value">{capabilities.host.cpu_cores}</span>
        </div>
        <div class="cap-cell">
          <span class="cap-label">RAM</span>
          <span class="cap-value">{mb(capabilities.host.ram_mb)}</span>
        </div>
        <div class="cap-cell">
          <span class="cap-label">GPU</span>
          <span class="cap-value">
            {capabilities.host.gpu.vendor}
            {#if capabilities.host.gpu.model}· {capabilities.host.gpu.model}{/if}
          </span>
        </div>
        <div class="cap-cell">
          <span class="cap-label">VRAM</span>
          <span class="cap-value">{mb(capabilities.host.gpu.vram_mb)}</span>
        </div>
        <div class="cap-cell">
          <span class="cap-label">Budget for models</span>
          <span class="cap-value accent">{mb(capabilities.available_for_models_mb)}</span>
        </div>
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
          <p class="warn-msg">
            Ollama is not installed on this machine. Local models require
            it to run.
          </p>
          <button
            class="action-button primary"
            on:click={handleInstallOllama}
            disabled={ollamaInstalling}
          >
            {ollamaInstalling ? 'Installing…' : 'Install Ollama'}
          </button>
        {/if}
        {#if ollamaInstallMsg}
          <p class="status-msg">{ollamaInstallMsg}</p>
        {/if}
      </div>
    </SettingsSection>
  {/if}

  {#if capabilities?.recommended_model}
    <SettingsSection title="Recommended">
      <div class="recommended-card">
        <div class="rec-head">
          <span class="rec-ref">{capabilities.recommended_model.ref}</span>
          <span class="tier-badge tier-{capabilities.recommended_model.tier}">
            {capabilities.recommended_model.tier}
          </span>
        </div>
        <p class="rec-reason">{capabilities.recommended_model.reason}</p>
        <button
          class="action-button primary"
          disabled
          title="Coming soon"
        >
          Install (coming soon)
        </button>
      </div>
    </SettingsSection>
  {/if}

  <SettingsSection title="Catalog">
    {#if loading && catalog.length === 0}
      <p class="muted">Loading catalog…</p>
    {:else if catalog.length === 0 && !errorState}
      <p class="muted">No catalog entries available.</p>
    {:else}
      <ul class="catalog-list">
        {#each catalog as row (row.entry.ref)}
          <li class="catalog-row">
            <div class="row-main">
              <div class="row-top">
                <span class="fit-badge" title={row.fit.reason}>
                  {badgeIcon[row.fit.badge] ?? '⚪'}
                  <span class="fit-label">{badgeLabel[row.fit.badge] ?? 'Unknown'}</span>
                </span>
                <span class="row-ref">{row.entry.ref}</span>
                <span class="tier-badge tier-{row.entry.tier}">{row.entry.tier}</span>
                <span class="tool-badge tool-{row.entry.supports_tools}">
                  tools: {row.entry.supports_tools}
                </span>
              </div>
              <p class="row-desc">{row.entry.description}</p>
              <div class="row-meta">
                <span>size: {bytesToText(row.entry.size_bytes)}</span>
                <span>ctx: {row.entry.num_ctx_max.toLocaleString()}</span>
                <span class="fit-reason">{row.fit.reason}</span>
              </div>
            </div>
            <div class="row-actions">
              {#if isInstalled(row.entry.ref)}
                <span class="installed-pill">Installed</span>
                <button
                  class="action-button danger"
                  on:click={() => handleRemove(row.entry.ref)}
                >
                  Remove
                </button>
              {:else}
                <button
                  class="action-button primary"
                  disabled
                  title="Coming soon"
                >
                  Install
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </SettingsSection>
</div>

<style>
  .settings-page {
    max-width: 760px;
  }

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

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

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

  .caps-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .cap-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

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

  .cap-value.accent {
    color: var(--accent-color);
  }

  .recommended-card {
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
    border-left: 3px solid var(--accent-color);
  }

  .rec-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }

  .rec-ref {
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .rec-reason {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0 0 12px 0;
    line-height: 1.5;
  }

  .catalog-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .catalog-row {
    display: flex;
    gap: 16px;
    padding: 14px;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-color);
  }

  .row-main {
    flex: 1;
    min-width: 0;
  }

  .row-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
  }

  .row-ref {
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .fit-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .fit-label {
    font-weight: 500;
  }

  .tier-badge,
  .tool-badge {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
  }

  .tier-best {
    color: var(--accent-color);
    border-color: var(--accent-color);
  }

  .row-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0 0 6px 0;
    line-height: 1.5;
  }

  .row-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .fit-reason {
    font-style: italic;
  }

  .row-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }

  .installed-pill {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--success-color);
    font-weight: 600;
  }

  .action-button {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .action-button.primary {
    background: var(--accent-color);
    color: white;
  }

  .action-button.danger {
    background: var(--error-color);
    color: white;
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .muted {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .ollama-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ok-msg {
    margin: 0;
    color: var(--success-color, #22a36a);
  }

  .warn-msg {
    margin: 0;
    color: var(--text-primary);
  }

  .status-msg {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
  }
</style>
