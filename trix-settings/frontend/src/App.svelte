<script lang="ts">
  import { onMount } from 'svelte';
  import General from './lib/components/General.svelte';
  import Notifications from './lib/components/Notifications.svelte';
  import KeyboardShortcuts from './lib/components/KeyboardShortcuts.svelte';
  import MemorySync from './lib/components/MemorySync.svelte';
  import Privacy from './lib/components/Privacy.svelte';
  import Advanced from './lib/components/Advanced.svelte';
  import LocalModels from './lib/components/LocalModels.svelte';
  import StatusBar from './lib/components/StatusBar.svelte';
  import { settingsStore, loadConfig, connectionStatus } from './lib/api';

  type Category = 'general' | 'notifications' | 'shortcuts' | 'models' | 'sync' | 'privacy' | 'advanced';

  let activeCategory: Category = 'general';
  let loading = true;
  let error: string | null = null;

  const categories: { id: Category; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: 'cog' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: 'keyboard' },
    { id: 'models', label: 'Local Models', icon: 'brain' },
    { id: 'sync', label: 'Memory & Sync', icon: 'sync' },
    { id: 'privacy', label: 'Privacy', icon: 'shield' },
    { id: 'advanced', label: 'Advanced', icon: 'settings' },
  ];

  onMount(async () => {
    try {
      await loadConfig();
      loading = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load configuration';
      loading = false;
    }
  });

  function selectCategory(id: Category) {
    activeCategory = id;
  }
</script>

<main class="app">
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>Trix Settings</h1>
    </div>
    <nav class="nav">
      {#each categories as cat}
        <button
          class="nav-item"
          class:active={activeCategory === cat.id}
          on:click={() => selectCategory(cat.id)}
        >
          <span class="nav-icon">{cat.icon === 'cog' ? '⚙️' :
            cat.icon === 'bell' ? '🔔' :
            cat.icon === 'keyboard' ? '⌨️' :
            cat.icon === 'sync' ? '🔄' :
            cat.icon === 'brain' ? '🧠' :
            cat.icon === 'shield' ? '🛡️' : '⚡'}</span>
          <span class="nav-label">{cat.label}</span>
        </button>
      {/each}
    </nav>
  </aside>

  <section class="content">
    {#if loading}
      <div class="loading">
        <p>Loading settings...</p>
      </div>
    {:else if error}
      <div class="error">
        <p>Error: {error}</p>
        <button on:click={() => location.reload()}>Retry</button>
      </div>
    {:else}
      <div class="settings-panel">
        {#if activeCategory === 'general'}
          <General />
        {:else if activeCategory === 'notifications'}
          <Notifications />
        {:else if activeCategory === 'shortcuts'}
          <KeyboardShortcuts />
        {:else if activeCategory === 'models'}
          <LocalModels />
        {:else if activeCategory === 'sync'}
          <MemorySync />
        {:else if activeCategory === 'privacy'}
          <Privacy />
        {:else if activeCategory === 'advanced'}
          <Advanced />
        {/if}
      </div>
    {/if}
    <StatusBar />
  </section>
</main>

<style>
  .app {
    display: flex;
    height: 100vh;
    background: var(--bg-primary);
  }

  .sidebar {
    width: 240px;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    padding: 20px;
    border-bottom: 1px solid var(--border-color);
  }

  .sidebar-header h1 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .nav {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    color: var(--text-secondary);
    transition: background-color 0.15s, color 0.15s;
  }

  .nav-item:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: var(--accent-color);
    color: white;
  }

  .nav-icon {
    font-size: 16px;
  }

  .nav-label {
    font-size: 14px;
    font-weight: 500;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .settings-panel {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .loading, .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
  }

  .error {
    color: var(--error-color);
  }

  .error button {
    padding: 8px 16px;
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
</style>
