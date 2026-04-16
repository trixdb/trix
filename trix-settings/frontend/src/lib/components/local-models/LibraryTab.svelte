<!--
  LibraryTab — full ADR-141 catalog with fit badges. Preserves the
  original LocalModels catalog view; each row retains its install /
  remove action with 🔴 and ⚪ confirm dialogs handled by the parent.

  Manual test: Library tab should list every CatalogRow, with fit
  badge + tier + tools marker. Click Install on a red row — parent
  must confirm before proceeding.
-->
<script lang="ts">
  import type { CatalogRow, InstalledModel } from '../../api';
  import { createEventDispatcher } from 'svelte';

  export let catalog: CatalogRow[] = [];
  export let installed: InstalledModel[] = [];
  export let loading = false;

  const dispatch = createEventDispatcher<{
    install: { ref: string; badge: string };
    remove: string;
  }>();

  const badgeIcon: Record<string, string> = {
    green: '🟢', yellow: '🟡', red: '🔴', unknown: '⚪',
  };

  const badgeLabel: Record<string, string> = {
    green: 'Fits', yellow: 'Tight', red: 'Too large', unknown: 'Unknown',
  };

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
</script>

<div class="tab-body">
  {#if loading && catalog.length === 0}
    <p class="muted">Loading catalog…</p>
  {:else if catalog.length === 0}
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
              <span class="tool-badge">tools: {row.entry.supports_tools}</span>
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
                on:click={() => dispatch('remove', row.entry.ref)}
              >Remove</button>
            {:else}
              <button
                class="action-button primary"
                on:click={() => dispatch('install', { ref: row.entry.ref, badge: row.fit.badge })}
              >Install</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .tab-body { display: flex; flex-direction: column; gap: 12px; }

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

  .row-main { flex: 1; min-width: 0; }

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

  .fit-label { font-weight: 500; }

  .tier-badge, .tool-badge {
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

  .fit-reason { font-style: italic; }

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

  .action-button.primary { background: var(--accent-color); color: white; }
  .action-button.danger { background: var(--error-color); color: white; }

  .muted { font-size: 13px; color: var(--text-secondary); }
</style>
