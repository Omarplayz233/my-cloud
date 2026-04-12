<!-- src/lib/components/Sidebar.svelte -->
<script lang="ts">
  import {
    IconFiles, IconSparkles, IconDownload, IconPhoto,
    IconSun, IconMoon, IconDeviceDesktop,
    IconLogout,
    IconLock,
    IconFolder, IconFile, IconCloud,
    IconChevronUp, IconChevronDown,
    IconPencil,
    IconChartBar,
  } from '@tabler/icons-svelte';

  type Tab =
    | 'files'
    | 'generators'
    | 'downloader'
    | 'draw'
    | 'stats'
    | 'editor'
    | 'vault';

  let {
    user,
    theme,
    fileCount = 0,
    folderCount = 0,
    storageBytes = 0,
    activeTab = 'files',
    oncycleTheme,
    onlogout,
    ontabchange,
  }: {
    user: { username: string } | null;
    theme: 'system' | 'light' | 'dark';
    fileCount?: number;
    folderCount?: number;
    storageBytes?: number;
    activeTab?: Tab;
    oncycleTheme: () => void;
    onlogout: () => void;
    ontabchange: (t: Tab) => void;
  } = $props();

  // Desktop state
  let expanded = $state(false);
  let locked = $state(false);
  let isExpanded = $derived(expanded || locked);

  function toggleLock() {
    locked = !locked;
    expanded = locked;
  }

  // Mobile sheet state
  let sheetOpen = $state(false);
  let touchStartY = $state(0);

  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    const dy = touchStartY - e.changedTouches[0].clientY;
    if (dy > 40) sheetOpen = true;
    if (dy < -40) sheetOpen = false;
  }

  // CSS variable sync
  $effect(() => {
    document.documentElement.style.setProperty(
      '--sb-width',
      isExpanded ? '210px' : '52px'
    );
  });

  // Tabs
  const TABS: { id: Tab; icon: any; label: string }[] = [
    { id: 'files', icon: IconFiles, label: 'Files' },
    { id: 'generators', icon: IconSparkles, label: 'Generators' },
    { id: 'downloader', icon: IconDownload, label: 'Downloader' },
    { id: 'draw', icon: IconPencil, label: 'Draw' },
    { id: 'editor', icon: IconPhoto, label: 'Image Edit' },
    { id: 'stats', icon: IconChartBar, label: 'Stats' },
    { id: 'vault', icon: IconLock, label: 'Vault' },
  ];

  const PRIMARY_TABS: Tab[] = ['files', 'draw', 'downloader', 'stats'];
  const SECONDARY_TABS = TABS.filter(t => !PRIMARY_TABS.includes(t.id));
  const primaryTabs = TABS.filter(t => PRIMARY_TABS.includes(t.id));

  function fmtBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
  }
</script>

<!-- ───────────────── DESKTOP SIDEBAR ───────────────── -->
<aside
  class="sidebar desktop-sidebar"
  class:expanded={isExpanded}
  onmouseenter={() => { if (!locked) expanded = true; }}
  onmouseleave={() => { if (!locked) expanded = false; }}
>
  <div class="sb-top">
    <div class="sb-logo">
      <IconCloud size={18} stroke={1.5}/>
      {#if isExpanded}
        <span class="sb-logo-text">Omar's Cloud</span>
      {/if}
    </div>

    {#if isExpanded}
      <button class="sb-lock" onclick={toggleLock}>
        {#if locked}
          <IconLock size={13}/>
        {:else}
          <IconLock size={13}/>
        {/if}
      </button>
    {/if}
  </div>

  <nav class="sb-nav">
    {#each TABS as tab}
      {@const active = activeTab === tab.id}
      <button
        class="sb-tab"
        class:sb-tab-active={active}
        onclick={() => ontabchange(tab.id)}
        title={!isExpanded ? tab.label : undefined}
      >
        <span class="sb-tab-icon">
          <tab.icon size={17} stroke={1.6}/>
        </span>

        {#if isExpanded}
          <span class="sb-tab-label">{tab.label}</span>
        {/if}

        {#if active && isExpanded}
          <span class="sb-tab-pip"></span>
        {/if}
      </button>
    {/each}
  </nav>

  <div class="sb-spacer"></div>

  {#if user}
    <div class="sb-stats">
      <div class="sb-stat">
        <span>💾</span>
        {#if isExpanded}<span>{fmtBytes(storageBytes)}</span>{/if}
      </div>

      <div class="sb-stat">
        <IconFolder size={13}/>
        {#if isExpanded}<span>{folderCount}</span>{/if}
      </div>

      <div class="sb-stat">
        <IconFile size={13}/>
        {#if isExpanded}<span>{fileCount}</span>{/if}
      </div>
    </div>

    <div class="sb-divider"></div>

    <div class="sb-user">
      <div class="sb-avatar">{user.username[0].toUpperCase()}</div>
      {#if isExpanded}
        <span class="sb-username">{user.username}</span>
      {/if}
    </div>

    <div class="sb-actions">
      <button class="sb-action" onclick={oncycleTheme}>
        <IconSun size={15}/>
        {#if isExpanded}<span>Theme</span>{/if}
      </button>

      <button class="sb-action sb-action-danger" onclick={onlogout}>
        <IconLogout size={15}/>
        {#if isExpanded}<span>Logout</span>{/if}
      </button>
    </div>
  {/if}
</aside>

<!-- ───────────────── MOBILE ───────────────── -->
<div
  class="mobile-bar"
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
>
  <div class="mob-sheet" class:open={sheetOpen}>
    <button class="sheet-handle" onclick={() => sheetOpen = !sheetOpen}></button>

    {#if user}
      <div class="sheet-user">
        <div class="sb-avatar">{user.username[0].toUpperCase()}</div>
        <div>
          <div>{user.username}</div>
          <div>{fmtBytes(storageBytes)}</div>
        </div>
      </div>

      <div class="sheet-divider"></div>

      <div class="sheet-tabs">
        {#each SECONDARY_TABS as tab}
          {@const active = activeTab === tab.id}
          <button
            class="sheet-tab"
            class:sheet-tab-active={active}
            onclick={() => { ontabchange(tab.id); sheetOpen = false; }}
          >
            <tab.icon size={18}/>
            <span>{tab.label}</span>
          </button>
        {/each}
      </div>

      <div class="sheet-divider"></div>

      <button class="sheet-btn" onclick={onlogout}>
        <IconLogout size={16}/> Logout
      </button>
    {/if}
  </div>

  <nav class="mob-nav">
    {#each primaryTabs as tab}
      {@const active = activeTab === tab.id}
      <button
        class="mob-tab"
        class:mob-tab-active={active}
        onclick={() => ontabchange(tab.id)}
      >
        <tab.icon size={20}/>
        <span>{tab.label}</span>
      </button>
    {/each}

    <button class="mob-tab" onclick={() => sheetOpen = !sheetOpen}>
      <IconChevronUp size={20}/>
      <span>More</span>
    </button>
  </nav>
</div>
