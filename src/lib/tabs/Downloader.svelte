<!-- src/lib/tabs/Downloader.svelte -->
<script lang="ts">
  type Status = 'idle' | 'loading' | 'done' | 'error';

  let url         = $state('');
  let quality     = $state<'144'|'360'|'720'|'1080'|'max'>('1080');
  let audioOnly   = $state(false);

  let status      = $state<Status>('idle');
  let message     = $state('');
  let progress    = $state<{chunk:number; total:number} | null>(null);
  let totalBytes  = $state(0);
  let lastFile    = $state<any>(null);
  let errorMsg    = $state('');

  const QUALITIES = ['144','360','720','1080','max'] as const;

  async function start() {
    if (!url.trim()) return;
    status    = 'loading';
    message   = 'Starting…';
    progress  = null;
    errorMsg  = '';
    lastFile  = null;

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), quality, audioOnly }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'status') {
              message    = event.message;
              if (event.totalBytes) totalBytes = event.totalBytes;
            } else if (event.type === 'progress') {
              message  = event.message;
              progress = { chunk: event.chunk, total: event.totalChunks };
            } else if (event.type === 'done') {
              status   = 'done';
              lastFile = event.file;
              message  = event.message;
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (e: any) {
            if (e?.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }

      if (status !== 'done') status = 'error', errorMsg = 'Stream ended unexpectedly';
    } catch (e: any) {
      status   = 'error';
      errorMsg = e?.message ?? 'Unknown error';
      message  = '';
    }
  }

  function reset() {
    status = 'idle'; message = ''; progress = null;
    errorMsg = ''; lastFile = null; totalBytes = 0;
  }

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1024/1024).toFixed(1)} MB`;
  }

  let progressPct = $derived(
    progress ? Math.round((progress.chunk / progress.total) * 100) : 0
  );
</script>

<div class="dl-root">
  <div class="dl-header">
    <span class="dl-title">Downloader</span>
    <span class="dl-sub">YouTube, TikTok, Twitter, Instagram & more — saved directly to your cloud</span>
  </div>

  <div class="dl-card">
    <!-- URL input -->
    <div class="field">
      <label class="field-label" for="dl-url">URL</label>
      <div class="url-row">
        <input
          id="dl-url"
          class="url-input"
          type="url"
          placeholder="Paste video or audio URL…"
          bind:value={url}
          disabled={status === 'loading'}
          onkeydown={(e) => e.key === 'Enter' && start()}
        />
        {#if url}
          <button class="clear-btn" onclick={() => url = ''} disabled={status === 'loading'}>✕</button>
        {/if}
      </div>
    </div>

    <!-- Options row -->
    <div class="options-row">
      <!-- Quality -->
      <div class="opt-group" class:disabled={audioOnly}>
        <span class="opt-label">Quality</span>
        <div class="seg">
          {#each QUALITIES as q}
            <button
              class="seg-btn"
              class:active={quality === q}
              disabled={status === 'loading' || audioOnly}
              onclick={() => quality = q}
            >{q === 'max' ? 'Max' : `${q}p`}</button>
          {/each}
        </div>
      </div>

      <!-- Audio only toggle -->
      <label class="toggle-row">
        <input type="checkbox" bind:checked={audioOnly} disabled={status === 'loading'} />
        <span class="toggle-label">Audio only</span>
      </label>
    </div>

    <!-- Action -->
    {#if status === 'idle' || status === 'error'}
      <button class="dl-btn" onclick={start} disabled={!url.trim()}>
        ↓ Download to Cloud
      </button>
      {#if errorMsg}
        <div class="err-msg">⚠ {errorMsg}</div>
      {/if}
    {:else if status === 'loading'}
      <div class="progress-area">
        <div class="progress-msg">{message}</div>
        {#if progress}
          <div class="progress-bar-wrap">
            <div class="progress-bar" style="width:{progressPct}%"></div>
          </div>
          <div class="progress-label">{progress.chunk}/{progress.total} chunks · {progressPct}%</div>
        {:else}
          <div class="spinner-wrap">
            <span class="spinner"></span>
          </div>
        {/if}
        {#if totalBytes}
          <div class="size-label">{formatBytes(totalBytes)}</div>
        {/if}
      </div>
    {:else if status === 'done'}
      <div class="done-area">
        <div class="done-icon">✓</div>
        <div class="done-msg">{lastFile?.fileName ?? 'File'} saved to cloud</div>
        {#if lastFile?.totalBytes}
          <div class="done-size">{formatBytes(lastFile.totalBytes)}</div>
        {/if}
        <button class="again-btn" onclick={reset}>Download another</button>
      </div>
    {/if}
  </div>
</div>

<style>

  .dl-root {
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 600px;
    margin: 0 auto;
  }
  .dl-header { display: flex; flex-direction: column; gap: 4px; }
  .dl-title  { font-size: 18px; font-weight: 600; color: var(--text-1); }
  .dl-sub    { font-size: 12px; color: var(--text-3); }

  .dl-card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-size: 12px; color: var(--text-2); font-weight: 500; }

  .url-row { display: flex; gap: 6px; align-items: center; }
  .url-input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 14px;
    color: var(--text-1);
    outline: none;
    transition: border-color 0.15s;
  }
  .url-input:focus { border-color: var(--accent); }
  .url-input:disabled { opacity: 0.5; }
  .clear-btn {
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    font-size: 14px;
    padding: 4px 6px;
    border-radius: 4px;
  }
  .clear-btn:hover { color: var(--text-1); }

  .options-row {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .opt-group { display: flex; flex-direction: column; gap: 6px; }
  .opt-group.disabled { opacity: 0.4; pointer-events: none; }
  .opt-label { font-size: 12px; color: var(--text-2); font-weight: 500; }

  .seg { display: flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .seg-btn {
    background: none;
    border: none;
    border-right: 1px solid var(--border);
    padding: 5px 10px;
    font-size: 12px;
    color: var(--text-2);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .seg-btn:last-child { border-right: none; }
  .seg-btn:hover { background: var(--hover); color: var(--text-1); }
  .seg-btn.active { background: var(--accent); color: #fff; }
  .seg-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin-top: 16px;
  }
  .toggle-row input { accent-color: var(--accent); width: 14px; height: 14px; }
  .toggle-label { font-size: 13px; color: var(--text-2); }

  .dl-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .dl-btn:hover:not(:disabled) { opacity: 0.85; }
  .dl-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .err-msg { font-size: 13px; color: var(--danger, #e55); }

  .progress-area {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .progress-msg { font-size: 13px; color: var(--text-2); }
  .progress-bar-wrap {
    height: 6px;
    background: var(--surface-2, var(--hover));
    border-radius: 99px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: var(--accent);
    border-radius: 99px;
    transition: width 0.3s;
  }
  .progress-label { font-size: 12px; color: var(--text-3); }
  .size-label { font-size: 12px; color: var(--text-3); }
  .spinner-wrap { display: flex; justify-content: center; padding: 8px 0; }
  .spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .done-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 0;
  }
  .done-icon { font-size: 28px; color: var(--accent); }
  .done-msg  { font-size: 14px; font-weight: 600; color: var(--text-1); text-align: center; }
  .done-size { font-size: 12px; color: var(--text-3); }
  .again-btn {
    margin-top: 8px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 16px;
    font-size: 13px;
    color: var(--text-2);
    cursor: pointer;
  }
  .again-btn:hover { background: var(--hover); color: var(--text-1); }
</style>
