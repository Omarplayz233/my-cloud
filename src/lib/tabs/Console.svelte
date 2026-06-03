<!-- src/lib/tabs/Console.svelte -->
<script lang="ts">
  import { IconPlayerPlay, IconTerminal } from "@tabler/icons-svelte";

  let { apiKey }: { apiKey: string } = $props();

  let code = $state("process.env.TELEGRAM_BOT_TOKEN");
  let output = $state("");
  let running = $state(false);
  let error = $state<string | null>(null);

  async function runCode() {
    if (!code.trim() || running) return;
    running = true;
    output = "";
    error = null;

    try {
      const res = await fetch("/api/debug/exec", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        error = data.error;
      } else {
        output = data.result ?? "(undefined)";
      }
    } catch (e: any) {
      error = e?.message ?? "Request failed";
    } finally {
      running = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  }

  function clearOutput() {
    output = "";
    error = null;
  }
</script>

<div class="console-root">
  <div class="console-header">
    <div class="console-title">
      <IconTerminal size={16} stroke={1.5} />
      <span>Console</span>
    </div>
    <span class="console-hint">Ctrl+Enter to run</span>
  </div>

  <div class="console-editor">
    <textarea
      class="code-input"
      bind:value={code}
      onkeydown={handleKeydown}
      spellcheck="false"
      placeholder="Enter JavaScript expression..."
    ></textarea>
  </div>

  <div class="console-actions">
    <button class="run-btn" onclick={runCode} disabled={running || !code.trim()}>
      <IconPlayerPlay size={14} stroke={2} />
      {running ? "Running..." : "Run"}
    </button>
    <button class="clear-btn" onclick={clearOutput} disabled={running}>
      Clear
    </button>
  </div>

  <div class="console-output">
    <div class="output-label">Output</div>
    {#if error}
      <pre class="output-error">{error}</pre>
    {:else if output}
      <pre class="output-text">{output}</pre>
    {:else}
      <pre class="output-empty">No output yet.</pre>
    {/if}
  </div>
</div>

<style>
  .console-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px;
    gap: 12px;
  }

  .console-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .console-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
  }

  .console-hint {
    font-size: 11px;
    color: var(--text-3);
    font-family: "Geist Mono", monospace;
  }

  .console-editor {
    flex: 1;
    min-height: 120px;
  }

  .code-input {
    width: 100%;
    height: 100%;
    min-height: 120px;
    padding: 12px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-1);
    font-family: "Geist Mono", monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
    outline: none;
    transition: border-color 0.15s;
  }

  .code-input:focus {
    border-color: var(--accent);
  }

  .console-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .run-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 12.5px;
    font-weight: 600;
    font-family: "Geist", sans-serif;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .run-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .run-btn:not(:disabled):hover {
    opacity: 0.9;
  }

  .clear-btn {
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-2);
    font-size: 12.5px;
    font-weight: 500;
    font-family: "Geist", sans-serif;
    cursor: pointer;
    transition: all 0.15s;
  }

  .clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .clear-btn:not(:disabled):hover {
    background: var(--hover);
    color: var(--text-1);
  }

  .console-output {
    flex: 1;
    min-height: 100px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .output-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .console-output pre {
    flex: 1;
    margin: 0;
    padding: 12px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: "Geist Mono", monospace;
    font-size: 13px;
    line-height: 1.5;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .output-text {
    color: var(--green);
  }

  .output-error {
    color: var(--red);
    border-color: var(--red-border) !important;
    background: var(--red-bg) !important;
  }

  .output-empty {
    color: var(--text-3);
    font-style: italic;
  }
</style>
