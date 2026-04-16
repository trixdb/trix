<!--
  CustomTab — ADR-141 free-text ollama ref installer. Accepts any
  `user/model:tag` ref. The "Inspect" action calls the daemon's
  locallm.inspect-ref IPC for a dry-run (Modelfile, size, license,
  security verdict) BEFORE the user commits. If the daemon does not
  yet implement inspect-ref, we show a friendly "not yet available"
  banner and disable Install pending daemon rollout.

  Manual test: type `qwen2.5-coder:14b`, press Inspect, verify the
  verdict card renders or a NotImplemented notice appears. Press
  Install — parent confirms and invokes the install flow.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let initialRef = '';

  const dispatch = createEventDispatcher<{
    install: string;
  }>();

  let refInput = initialRef;
  let inspecting = false;
  let inspectErr: string | null = null;
  let inspectResult: unknown = null;
  let notImplemented = false;

  // Minimal ollama ref validator: lowercase, supports user/name:tag.
  const refPattern = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9._-]+)?(:[a-zA-Z0-9._-]+)?$/;

  $: canSubmit = refInput.trim().length > 0 && refPattern.test(refInput.trim());

  async function handleInspect(): Promise<void> {
    inspectErr = null;
    inspectResult = null;
    notImplemented = false;
    const ref = refInput.trim();
    if (!canSubmit) {
      inspectErr = 'Ref must look like `name`, `user/name`, or `user/name:tag`';
      return;
    }
    inspecting = true;
    try {
      if (!window.go) throw new Error('Wails runtime not available');
      inspectResult = await window.go.main.App.LocalLLMInspectRef(ref);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('not implemented')) {
        notImplemented = true;
      } else {
        inspectErr = msg;
      }
    } finally {
      inspecting = false;
    }
  }

  function handleInstall(): void {
    if (!canSubmit) return;
    dispatch('install', refInput.trim());
  }
</script>

<div class="tab-body">
  <p class="help">
    Install any model from the Ollama registry by ref. Use <code>name</code>,
    <code>user/name</code>, or <code>user/name:tag</code>. The Inspect button
    runs a dry-run safety check on the Modelfile before anything is downloaded.
  </p>

  <div class="form-row">
    <input
      class="ref-input"
      type="text"
      placeholder="e.g. qwen2.5-coder:14b"
      bind:value={refInput}
      autocomplete="off"
      spellcheck="false"
    />
    <button
      class="action-button secondary"
      on:click={handleInspect}
      disabled={!canSubmit || inspecting}
    >
      {inspecting ? 'Inspecting…' : 'Inspect'}
    </button>
    <button
      class="action-button primary"
      on:click={handleInstall}
      disabled={!canSubmit}
      title="Review inspection results before installing"
    >
      Install
    </button>
  </div>

  {#if notImplemented}
    <div class="notice warn">
      Inspect isn't available yet — the daemon hasn't rolled out
      <code>locallm.inspect-ref</code>. You can still click Install, but
      the Modelfile security review will be skipped.
    </div>
  {/if}

  {#if inspectErr}
    <div class="notice error">{inspectErr}</div>
  {/if}

  {#if inspectResult}
    <div class="verdict-card">
      <h4>Inspection result</h4>
      <pre>{JSON.stringify(inspectResult, null, 2)}</pre>
    </div>
  {/if}
</div>

<style>
  .tab-body { display: flex; flex-direction: column; gap: 14px; }

  .help {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
  }

  .help code {
    background: var(--bg-secondary);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
    font-size: 12px;
  }

  .form-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .ref-input {
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    font-family: monospace;
    font-size: 13px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .action-button {
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .action-button.primary { background: var(--accent-color); color: white; }
  .action-button.secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .action-button:disabled { opacity: 0.5; cursor: not-allowed; }

  .notice {
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
  }

  .notice.warn {
    background: var(--bg-secondary);
    border: 1px solid var(--warning-color, #d4a017);
    color: var(--text-primary);
  }

  .notice.error {
    background: var(--bg-secondary);
    border: 1px solid var(--error-color);
    color: var(--error-color);
  }

  .notice code {
    font-family: monospace;
    font-size: 12px;
    background: var(--bg-primary);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .verdict-card {
    padding: 12px 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .verdict-card h4 {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .verdict-card pre {
    margin: 0;
    font-family: monospace;
    font-size: 12px;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 240px;
    overflow-y: auto;
  }
</style>
