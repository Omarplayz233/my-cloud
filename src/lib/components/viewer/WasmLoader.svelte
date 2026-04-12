<!-- src/lib/components/viewer/WasmLoader.svelte -->
<!-- Handles the load/update flow for a single WASM entry before rendering its consumer -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    checkCache, downloadAndCache, evictCache, loadFromCache,
    type WasmEntry, type CacheState
  } from '$lib/wasmCache';

  let {
    entry,
    onready,     // called with blob URL map once ready
    children,
  }: {
    entry: WasmEntry;
    onready: (urls: Record<string, string>) => void;
    children?: any;
  } = $props();

  let state = $state<CacheState>({ status: 'uncached' });
  let progress = $state(0);
  let blobUrls: Record<string, string> | null = null;

  onMount(async () => {
    state = await checkCache(entry);
    if (state.status === 'cached') {
      await loadReady();
    }
  });

  async function loadReady() {
    try {
      blobUrls = await loadFromCache(entry);
      onready(blobUrls);
    } catch (e: any) {
      state = { status: 'error', message: e.message };
    }
  }

  async function startDownload() {
    if (state.status === 'update-available') {
      await evictCache(entry);
    }
    state = { status: 'downloading', progress: 0 };
    try {
      await downloadAndCache(entry, (pct) => {
        progress = pct;
        state = { status: 'downloading', progress: pct };
      });
      state = { status: 'cached', version: entry.version };
      await loadReady();
    } catch (e: any) {
      state = { status: 'error', message: e.message };
    }
  }

  function fmtSize(mb: number) {
    return mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb} MB`;
  }
</script>

{#if state.status === 'cached' && blobUrls}
  <!-- ready — consumer renders here -->
  {@render children?.()}

{:else}
  <div class="wl-wrap">
    <div class="wl-card">

      {#if state.status === 'uncached'}
        <div class="wl-icon">📦</div>
        <p class="wl-title">Load {entry.name}</p>
        <p class="wl-sub">
          Requires downloading <strong>~{fmtSize(entry.sizeMB)}</strong> — cached locally after first load.
        </p>
        <button class="wl-btn" onclick={startDownload}>
          Download once &amp; cache
        </button>

      {:else if state.status === 'update-available'}
        <div class="wl-icon">🔄</div>
        <p class="wl-title">{entry.name} update available</p>
        <p class="wl-sub">
          v{state.cachedVersion} → v{state.newVersion} · ~{fmtSize(entry.sizeMB)} download
        </p>
        <div class="wl-row">
          <button class="wl-btn wl-secondary" onclick={loadReady}>
            Keep v{state.cachedVersion}
          </button>
          <button class="wl-btn" onclick={startDownload}>
            Update now
          </button>
        </div>

      {:else if state.status === 'downloading'}
        <div class="wl-icon">⬇️</div>
        <p class="wl-title">Downloading {entry.name}…</p>
        <div class="wl-bar-wrap">
          <div class="wl-bar" style="width:{progress}%"></div>
        </div>
        <p class="wl-pct">{progress}%</p>

      {:else if state.status === 'error'}
        <div class="wl-icon">⚠️</div>
        <p class="wl-title">Failed to load {entry.name}</p>
        <p class="wl-sub wl-err">{state.message}</p>
        <button class="wl-btn" onclick={startDownload}>Retry</button>

      {/if}

    </div>
  </div>
{/if}

<style>
  .wl-wrap {
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 100%; min-height: 240px;
  }
  .wl-card {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    padding: 32px 36px; border-radius: 18px; text-align: center;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    max-width: 340px; width: 100%;
  }
  .wl-icon { font-size: 32px; line-height: 1; }
  .wl-title { color: rgba(255,255,255,.85); font-size: 15px; font-weight: 600; margin: 0; }
  .wl-sub { color: rgba(255,255,255,.4); font-size: 12.5px; line-height: 1.5; margin: 0; }
  .wl-sub strong { color: rgba(255,255,255,.65); }
  .wl-err { color: #f87171 !important; }
  .wl-row { display: flex; gap: 8px; }
  .wl-btn {
    padding: 8px 20px; border-radius: 999px; border: none; cursor: pointer;
    font-size: 13px; font-weight: 500; font-family: 'Geist', sans-serif;
    background: var(--accent, #6366f1); color: #fff;
    transition: opacity .15s;
  }
  .wl-btn:hover { opacity: .85; }
  .wl-secondary {
    background: rgba(255,255,255,.08); color: rgba(255,255,255,.6);
  }
  .wl-bar-wrap {
    width: 100%; height: 4px; border-radius: 99px;
    background: rgba(255,255,255,.08); overflow: hidden;
  }
  .wl-bar {
    height: 100%; border-radius: 99px;
    background: var(--accent, #6366f1);
    transition: width .2s ease;
  }
  .wl-pct { color: rgba(255,255,255,.3); font-size: 11px; font-family: 'Geist Mono', monospace; }
</style>
