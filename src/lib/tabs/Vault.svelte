<script lang="ts">
  import { onMount } from 'svelte';
  import {
    IconLock,
    IconLockOpen,
    IconUpload,
    IconRefresh,
    IconTrash,
    IconShield,
    IconDatabase,
    IconClock,
    IconKey,
    IconFile,
    IconFolder,
    IconCheck,
    IconAlertTriangle,
  } from '@tabler/icons-svelte';

  type VaultFile = {
    id: string;
    name: string;
    size: number;
    createdAt: number;
    chunks: number;
    encrypted: boolean;
  };

  const CHUNK_SIZE = 19.5 * 1024 * 1024;
  const AES_GCM_TAG_BYTES = 16;
  const AES_GCM_IV_BYTES = 12;
  const META_BYTES_PER_FILE = 96;

  let locked = $state(true);
  let unlocking = $state(false);
  let uploading = $state(false);
  let loading = $state(false);
  let password = $state('');
  let error = $state('');
  let uploadError = $state('');
  let files = $state<VaultFile[]>([]);
  let selectedName = $state('');

  const plainTotal = $derived(
    files.reduce((sum, file) => sum + file.size, 0)
  );

  const totalChunks = $derived(
    files.reduce((sum, file) => sum + Math.max(1, file.chunks || Math.ceil(file.size / CHUNK_SIZE)), 0)
  );

  const encryptedTotal = $derived(
    plainTotal +
      totalChunks * (AES_GCM_TAG_BYTES + AES_GCM_IV_BYTES) +
      files.length * META_BYTES_PER_FILE
  );

  const overheadBytes = $derived(Math.max(0, encryptedTotal - plainTotal));

  const avgChunkSize = $derived(
    totalChunks > 0 ? plainTotal / totalChunks : 0
  );

  const activeDays = $derived(
    new Set(files.map((f) => new Date(f.createdAt).toDateString())).size
  );

  function formatBytes(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
    return `${(size / 1024 ** 3).toFixed(2)} GB`;
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function loadVault() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/vault/list');
      if (!res.ok) {
        if (res.status === 401) {
          locked = true;
          files = [];
          return;
        }
        throw new Error('Failed to load vault');
      }

      const data = await res.json();
      files = (data.files ?? []).map((f: any) => ({
        id: f.id,
        name: f.name,
        size: Number(f.size ?? 0),
        createdAt: Number(f.createdAt ?? Date.now()),
        chunks: Number(f.chunks ?? Math.max(1, Math.ceil(Number(f.size ?? 0) / CHUNK_SIZE))),
        encrypted: true
      }));
    } catch (e) {
      error = 'Could not load vault';
    } finally {
      loading = false;
    }
  }

  async function unlock() {
    error = '';
    if (!password.trim()) {
      error = 'enter password';
      return;
    }

    unlocking = true;
    try {
      const res = await fetch('/api/vault/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() })
      });

      if (!res.ok) {
        error = 'access denied';
        return;
      }

      locked = false;
      password = '';
      await loadVault();
    } catch {
      error = 'access denied';
    } finally {
      unlocking = false;
    }
  }

  async function uploadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) return;

    uploading = true;
    uploadError = '';

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', selectedName.trim() || file.name);

      const res = await fetch('/api/vault/upload', {
        method: 'POST',
        body: form
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => 'Upload failed');
        throw new Error(msg || 'Upload failed');
      }

      await loadVault();
    } catch (e: any) {
      uploadError = e?.message ?? 'Upload failed';
    } finally {
      uploading = false;
      selectedName = '';
    }
  }

  async function removeFile(id: string) {
    await fetch('/api/vault/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    files = files.filter((f) => f.id !== id);
  }

  async function refresh() {
    await loadVault();
  }

  function lockVault() {
    locked = true;
    files = [];
    password = '';
    error = '';
  }

  onMount(() => {
    void loadVault();
  });
</script>

<div class="vault-shell">
  {#if locked}
    <section class="vault-card lock-card">
      <div class="vault-head">
        <div class="kicker">
          <IconLock size={12} stroke={2} />
          <span>vault</span>
        </div>
        <h1>Locked space</h1>
        <p>Unlock the vault to expose encrypted files and the storage measurements.</p>
      </div>

      <div class="unlock-form">
        <input
          class="vault-input"
          type="password"
          placeholder="passphrase"
          bind:value={password}
          onkeydown={(e) => e.key === 'Enter' && unlock()}
        />
        <button class="vault-btn primary" onclick={unlock} disabled={unlocking || !password.trim()}>
          {#if unlocking}<span class="spin"></span>{:else}<IconLockOpen size={14} stroke={2} />{/if}
          <span>{unlocking ? 'unlocking' : 'unlock'}</span>
        </button>
      </div>

      {#if error}
        <div class="status error">
          <IconAlertTriangle size={13} stroke={2} />
          <span>{error}</span>
        </div>
      {/if}
    </section>
  {:else}
    <div class="vault-grid">
      <section class="vault-card sidebar-card">
        <div class="vault-head compact">
          <div class="kicker">
            <IconShield size={12} stroke={2} />
            <span>encryption measurements</span>
          </div>
          <h1>Vault overview</h1>
          <p>{files.length} files · {activeDays} active days</p>
        </div>

        <div class="metric-list">
          <div class="metric">
            <div class="metric-label">Plain size</div>
            <div class="metric-value">{formatBytes(plainTotal)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Encrypted size</div>
            <div class="metric-value">{formatBytes(encryptedTotal)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Overhead</div>
            <div class="metric-value">{formatBytes(overheadBytes)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Chunk count</div>
            <div class="metric-value">{totalChunks}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Avg chunk</div>
            <div class="metric-value">{formatBytes(avgChunkSize)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">AES-GCM tag</div>
            <div class="metric-value">{AES_GCM_TAG_BYTES} B</div>
          </div>
        </div>

        <div class="vault-actions">
          <label class="vault-btn upload-btn">
            <IconUpload size={14} stroke={2} />
            <span>{uploading ? 'uploading' : 'upload'}</span>
            <input type="file" hidden onchange={uploadFile} />
          </label>
          <button class="vault-btn" onclick={refresh} disabled={loading}>
            <IconRefresh size={14} stroke={2} />
            <span>refresh</span>
          </button>
          <button class="vault-btn danger" onclick={lockVault}>
            <IconLock size={14} stroke={2} />
            <span>lock</span>
          </button>
        </div>

        {#if uploadError}
          <div class="status error">
            <IconAlertTriangle size={13} stroke={2} />
            <span>{uploadError}</span>
          </div>
        {/if}
      </section>

      <section class="vault-card main-card">
        <div class="table-head">
          <div>
            <div class="kicker">
              <IconDatabase size={12} stroke={2} />
              <span>encrypted files</span>
            </div>
            <h2>Vault contents</h2>
          </div>
          <div class="table-meta">
            <span>{files.length} items</span>
            <span>{formatBytes(plainTotal)} plain</span>
          </div>
        </div>

        <div class="table-shell">
          <div class="row row-head">
            <span>Name</span>
            <span>Size</span>
            <span>Chunks</span>
            <span>Updated</span>
            <span class="align-right">Action</span>
          </div>

          {#each files as file}
            <div class="row">
              <span class="name-cell">
                <span class="file-ico">
                  <IconFile size={14} stroke={2} />
                </span>
                <span class="name-text">{file.name}</span>
                {#if file.encrypted}
                  <span class="chip">encrypted</span>
                {/if}
              </span>
              <span class="muted">{formatBytes(file.size)}</span>
              <span class="muted">{file.chunks}</span>
              <span class="muted">
                <IconClock size={11} stroke={2} />
                {formatDate(file.createdAt)}
              </span>
              <span class="align-right">
                <button class="row-btn danger" onclick={() => removeFile(file.id)}>
                  <IconTrash size={13} stroke={2} />
                </button>
              </span>
            </div>
          {/each}

          {#if files.length === 0}
            <div class="empty">
              <IconFolder size={22} stroke={1.7} />
              <span>No files yet. Upload something to start filling the vault.</span>
            </div>
          {/if}
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .vault-shell {
    min-height: 100%;
    padding: 20px 24px 28px;
    color: var(--text-1);
    font-family: 'Geist', system-ui, sans-serif;
  }

  .vault-grid {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }

  .vault-card {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  }

  .lock-card,
  .sidebar-card,
  .main-card {
    padding: 16px;
  }

  .vault-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }

  .vault-head.compact {
    margin-bottom: 12px;
  }

  .vault-head h1,
  .vault-head h2 {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--text-1);
  }

  .vault-head p {
    font-size: 12.5px;
    color: var(--text-3);
    line-height: 1.5;
  }

  .kicker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--text-3);
  }

  .unlock-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .vault-input {
    appearance: none;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    color: var(--text-1);
    font-size: 13px;
    font-family: 'Geist Mono', monospace;
    outline: none;
    transition: border-color 0.14s ease, background 0.14s ease;
  }

  .vault-input:focus {
    border-color: var(--border-hover);
    background: var(--bg-2);
  }

  .vault-btn,
  .row-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg-1);
    color: var(--text-1);
    font-size: 13px;
    font-family: 'Geist', sans-serif;
    padding: 10px 12px;
    cursor: pointer;
    transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
    text-decoration: none;
  }

  .vault-btn:hover,
  .row-btn:hover {
    border-color: var(--border-hover);
    background: var(--bg-3);
  }

  .vault-btn.primary {
    background: var(--accent);
    border-color: transparent;
    color: white;
  }

  .vault-btn.primary:hover {
    filter: brightness(1.04);
  }

  .vault-btn.danger,
  .row-btn.danger {
    color: #f87171;
  }

  .vault-btn.danger:hover,
  .row-btn.danger:hover {
    border-color: rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.08);
  }

  .vault-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .vault-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }

  .upload-btn {
    position: relative;
    overflow: hidden;
  }

  .metric-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .metric {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 12px;
    min-width: 0;
  }

  .metric-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-3);
    margin-bottom: 6px;
  }

  .metric-value {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--text-1);
    font-family: 'Geist Mono', monospace;
    line-height: 1.2;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    font-size: 12px;
  }

  .status.error {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.16);
  }

  .table-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .table-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    font-size: 11px;
    color: var(--text-3);
    font-family: 'Geist Mono', monospace;
  }

  .table-shell {
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--bg-1);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) 92px 72px 130px 72px;
    gap: 10px;
    align-items: center;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row-head {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-3);
    background: var(--bg-2);
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .file-ico {
    display: inline-flex;
    color: var(--text-3);
    flex-shrink: 0;
  }

  .name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    font-weight: 500;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid rgba(74, 222, 128, 0.18);
    background: rgba(74, 222, 128, 0.08);
    color: #4ade80;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }

  .muted {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    color: var(--text-3);
    font-family: 'Geist Mono', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .align-right {
    justify-self: end;
    text-align: right;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 42px 18px;
    color: var(--text-3);
    text-align: center;
    font-size: 13px;
  }

  .spin {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: transparent;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 900px) {
    .vault-grid {
      grid-template-columns: 1fr;
    }

    .metric-list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 700px) {
    .vault-shell {
      padding: 14px 12px 18px;
    }

    .metric-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .row {
      grid-template-columns: minmax(0, 1fr) 74px 54px 92px 56px;
      gap: 8px;
      padding: 10px 12px;
    }

    .table-meta {
      align-items: flex-start;
    }

    .vault-actions {
      flex-direction: column;
    }
  }
</style>
