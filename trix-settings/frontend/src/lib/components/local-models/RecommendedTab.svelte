<!--
  RecommendedTab — ADR-141 Local Models "Recommended" view.
  Shows fit=green catalog rows sorted by tier (best → balanced → fast),
  highlighting the daemon-side `PickFeatured` pick at the top.

  Manual test: open Local Models, ensure Recommended tab is default,
  verify the top card matches capabilities.recommended_model, and that
  tier badges sort best-first. Remote daemon-disconnected: tab should
  render empty state without crashing.
-->
<script lang="ts">
  import type {
    CatalogRow,
    FeaturedSummary,
    InstalledModel,
  } from '../../api';
  import { createEventDispatcher } from 'svelte';

  export let catalog: CatalogRow[] = [];
  export let installed: InstalledModel[] = [];
  export let featured: FeaturedSummary | null = null;

  const dispatch = createEventDispatcher<{
    install: string;
    remove: string;
  }>();

  const tierRank: Record<string, number> = {
    best: 0,
    balanced: 1,
    fast: 2,
  };

  $: greenRows = [...catalog]
    .filter((r) => r.fit.badge === 'green')
    .sort((a, b) => {
      const ta = tierRank[a.entry.tier] ?? 99;
      const tb = tierRank[b.entry.tier] ?? 99;
      if (ta !== tb) return ta - tb;
      return a.entry.ref.localeCompare(b.entry.ref);
    });

  function isInstalled(ref: string): boolean {
    const want = ref.toLowerCase().trim();
    return installed.some((m) => m.ref.toLowerCase().trim() === want);
  }
</script>

<div class="tab-body">
  {#if featured}
    <div class="featured-card">
      <div class="rec-head">
        <span class="rec-ref">{featured.ref}</span>
        <span class="tier-badge tier-{featured.tier}">{featured.tier}</span>
        <span class="best-pick">Best pick for this machine</span>
      </div>
      <p class="rec-reason">{featured.reason}</p>
      <div class="rec-actions">
        {#if isInstalled(featured.ref)}
          <span class="installed-pill">Installed</span>
          <button
            class="action-button danger"
            on:click={() => dispatch('remove', featured?.ref ?? '')}
          >Remove</button>
        {:else}
          <button
            class="action-button primary"
            on:click={() => dispatch('install', featured?.ref ?? '')}
          >Install</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if greenRows.length === 0}
    <p class="muted">
      No recommended models for this hardware yet. Check the Library tab
      for the full catalog.
    </p>
  {:else}
    <ul class="rec-list">
      {#each greenRows as row (row.entry.ref)}
        <li class="rec-row">
          <div class="rec-row-main">
            <div class="rec-row-top">
              <span class="row-ref">{row.entry.ref}</span>
              <span class="tier-badge tier-{row.entry.tier}">{row.entry.tier}</span>
              <span class="tool-badge">tools: {row.entry.supports_tools}</span>
            </div>
            <p class="row-desc">{row.entry.description}</p>
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
                on:click={() => dispatch('install', row.entry.ref)}
              >Install</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .tab-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .featured-card {
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
    flex-wrap: wrap;
  }

  .rec-ref,
  .row-ref {
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .best-pick {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--accent-color);
    font-weight: 600;
  }

  .rec-reason {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0 0 12px 0;
    line-height: 1.5;
  }

  .rec-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .rec-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .rec-row {
    display: flex;
    gap: 16px;
    padding: 14px;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-color);
  }

  .rec-row-main { flex: 1; min-width: 0; }

  .rec-row-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
  }

  .row-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
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

  .muted {
    font-size: 13px;
    color: var(--text-secondary);
  }
</style>
