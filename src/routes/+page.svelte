<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import Login from '$lib/components/Login.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Files from '$lib/tabs/Files.svelte';
  import Generators from '$lib/tabs/Generators.svelte';
  import Downloader from '$lib/tabs/Downloader.svelte';
  import Draw       from '$lib/tabs/Draw.svelte';
  import Editor     from '$lib/tabs/Editor.svelte';
  import Stats      from '$lib/tabs/Stats.svelte';
  import Vault	    from '$lib/tabs/Vault.svelte';

  let { data } = $props();
  let user = $derived(data.user);
  let apiKey = $derived(data.apiKey);
  let encryptedApiKey = $derived(data.encryptedApiKey);

  // Tab state
  type Tab = 'files' | 'generators' | 'downloader' | 'draw' | 'stats' | 'editor' | 'vault';
  let activeTab = $state<Tab>('files');
  let editorFile = $state<{ metaFileId: string; fileName: string } | null>(null);
  let filesRefreshNonce = $state(0);

  function bumpRefreshNonce() {
    filesRefreshNonce += 1;
  }

  // Stats passed up from Files tab
  let fileCount    = $state(0);
  let folderCount  = $state(0);
  let storageBytes = $state(0);

  // Theme
  let theme = $state<'system' | 'light' | 'dark'>('system');

  const THEME_VARS: Record<string, Record<string, string>> = {
    dark: {
      '--bg-1':'#080808','--bg-2':'#101010','--bg-3':'#141414',
      '--text-1':'#e2e2e2','--text-2':'#888','--text-3':'#444',
      '--border':'#1a1a1a','--border-hover':'#333',
      '--accent':'#6366f1','--hover':'rgba(255,255,255,.04)',
      '--green':'#4ade80','--green-border':'#2a3d2e',
      '--red':'#f87171','--red-border':'#3d1515','--red-bg':'#1f0a0a'
    },
    light: {
      '--bg-1':'#fafafa','--bg-2':'#ffffff','--bg-3':'#f0f0f0',
      '--text-1':'#1a1a1a','--text-2':'#555','--text-3':'#999',
      '--border':'#e0e0e0','--border-hover':'#bbb',
      '--accent':'#4f46e5','--hover':'rgba(0,0,0,.04)',
      '--green':'#16a34a','--green-border':'#bbf7d0',
      '--red':'#dc2626','--red-border':'#fca5a5','--red-bg':'#fef2f2'
    }
  };

  function applyTheme() {
    if (typeof document === 'undefined') return;
    const isDark = theme === 'dark' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
    const vars = isDark ? THEME_VARS.dark : THEME_VARS.light;
    const el = document.documentElement;
    el.setAttribute('data-theme', isDark ? 'dark' : 'light');
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  }

  function cycleTheme() {
    theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    localStorage.setItem('theme', theme);
    applyTheme();
  }

  onMount(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') theme = saved as any;
    applyTheme();

    const onVisible = () => {
      if (document.visibilityState === 'visible') bumpRefreshNonce();
    };
    const onFocus = () => bumpRefreshNonce();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    const refreshTimer = window.setInterval(() => {
      if (activeTab === 'files') bumpRefreshNonce();
    }, 30_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(refreshTimer);
    };
  });

  $effect(() => { const _ = theme; applyTheme(); });

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  function onLoginSuccess() {
    window.location.reload();
  }
</script>

<svelte:head>
  <title>Omar's Cloud</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
</svelte:head>

{#if !user}
  <Login onsuccess={onLoginSuccess} />

{:else}
  <div class="app">
    <Sidebar
      {user}
      {theme}
      {fileCount}
      {folderCount}
      {storageBytes}
      {activeTab}
      oncycleTheme={cycleTheme}
      onlogout={logout}
      ontabchange={(t) => activeTab = t}
    />

    <main class="main">
      {#if activeTab === 'files'}
        <Files
          {user}
          {apiKey}
          {encryptedApiKey}
          {theme}
          refreshNonce={filesRefreshNonce}
          onfileCountChange={(n) => fileCount = n}
          onfolderCountChange={(n) => folderCount = n}
          onstorageChange={(b) => storageBytes = b}
          oneditimage={(f) => { editorFile = f; activeTab = 'editor'; }}
        />
      {:else if activeTab === 'generators'}
        <Generators />
      {:else if activeTab === 'downloader'}
        <Downloader />
      {:else if activeTab === 'draw'}
        <Draw {apiKey} />
      {:else if activeTab === 'stats'}
        <Stats {apiKey} />
      {:else if activeTab === 'editor'}
        <Editor {apiKey} initialFile={editorFile} />
      {:else if activeTab === 'vault'}
      	<Vault />
      {/if}
    </main>
  </div>
{/if}

<style>
  .app { display: flex; flex-direction: row; min-height: 100vh; }
  .main {
    flex: 1;
    margin-left: var(--sb-width, 52px);
    min-width: 0;
    transition: margin-left 0.22s cubic-bezier(.16,1,.3,1);
  }

  @media (max-width: 600px) {
    .main { margin-left: 0 !important; padding-bottom: 64px; }
  }
</style>
