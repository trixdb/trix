<!--
  DiagnosticBundle — ADR-141 Diagnostics export panel.

  Collects a redacted support bundle via the daemon and prompts the
  user with a native Save dialog (Wails runtime.SaveFileDialog) to
  choose a destination zip path. Prompts are redacted server-side by
  the daemon; this component only moves bytes.

  Manual test: open Local Models → Diagnostics tab → click "Export
  diagnostics". A native save dialog should open, default filename
  "trix-diagnostics-<timestamp>.zip". Cancel → UI shows a cancelled
  notice; Save → UI shows the target path and byte size. If the
  daemon has not yet implemented diagnostics.export, the UI shows
  "Feature not yet available".
-->
<script lang="ts">
  let exporting = false;
  let resultMsg: string | null = null;
  let errMsg: string | null = null;
  let cancelled = false;
  let notImplemented = false;

  async function handleExport(): Promise<void> {
    exporting = true;
    resultMsg = null;
    errMsg = null;
    cancelled = false;
    notImplemented = false;
    try {
      if (!window.go) {
        throw new Error('Wails runtime not available');
      }
      const bundle = await window.go.main.App.DiagnosticsExport();
      if (bundle?.cancelled) {
        cancelled = true;
      } else if (bundle?.savedPath) {
        const sizeKb = Math.max(1, Math.round((bundle.sizeBytes || 0) / 1024));
        resultMsg = `Saved ${sizeKb} KB bundle to ${bundle.savedPath}`;
      } else {
        resultMsg = 'Bundle generated.';
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('not implemented')) {
        notImplemented = true;
      } else {
        errMsg = msg;
      }
    } finally {
      exporting = false;
    }
  }
</script>

<div class="diag">
  <div class="intro">
    <h4>Export diagnostics</h4>
    <p>
      Collects the last 1000 lines of daemon logs (prompt bodies redacted),
      the last 50 inference request hashes, host capability report, Ollama
      version, installed model list, and recent daemon error codes into a
      single zip you can attach to a support request.
    </p>
    <p class="privacy-note">
      Prompts and tool arguments are redacted server-side. Nothing leaves
      your machine until you choose a destination.
    </p>
  </div>

  <button
    class="action-button primary"
    on:click={handleExport}
    disabled={exporting}
  >
    {exporting ? 'Collecting…' : 'Export diagnostics'}
  </button>

  {#if notImplemented}
    <div class="notice warn">
      Diagnostics export isn't available yet — the daemon hasn't rolled out
      <code>diagnostics.export</code>. Try again after your next daemon
      update.
    </div>
  {/if}

  {#if cancelled}
    <div class="notice muted">Save cancelled — no file was written.</div>
  {/if}

  {#if resultMsg}
    <div class="notice ok">{resultMsg}</div>
  {/if}

  {#if errMsg}
    <div class="notice error">{errMsg}</div>
  {/if}
</div>

<style>
  .diag { display: flex; flex-direction: column; gap: 12px; }

  .intro h4 {
    margin: 0 0 6px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .intro p {
    margin: 0 0 6px 0;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .privacy-note { font-style: italic; }

  .action-button {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    align-self: flex-start;
  }

  .action-button.primary { background: var(--accent-color); color: white; }
  .action-button:disabled { opacity: 0.5; cursor: not-allowed; }

  .notice {
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
  }

  .notice.ok {
    background: var(--bg-secondary);
    border: 1px solid var(--success-color);
    color: var(--success-color);
  }

  .notice.error {
    background: var(--bg-secondary);
    border: 1px solid var(--error-color);
    color: var(--error-color);
  }

  .notice.warn {
    background: var(--bg-secondary);
    border: 1px solid var(--warning-color, #d4a017);
    color: var(--text-primary);
  }

  .notice.muted {
    background: var(--bg-secondary);
    color: var(--text-secondary);
  }

  .notice code {
    font-family: monospace;
    font-size: 12px;
    background: var(--bg-primary);
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>
