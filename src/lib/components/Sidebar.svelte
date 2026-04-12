<!-- src/lib/components/Sidebar.svelte -->
<script lang="ts">
  import {
    IconFiles, IconSparkles, IconDownload, IconPhoto,
    IconSun, IconMoon, IconDeviceDesktop,
    IconLogout, IconLock, IconLockOpen,
    IconFolder, IconFile, IconCloud, IconChevronUp, IconChevronDown,
    IconPencil,
    IconChartBar,
  } from '@tabler/icons-svelte';

  type Tab = 'files' | 'generators' | 'downloader' | 'draw' | 'stats' | 'editor' | 'vault';

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

  // Desktop expand/lock
  let expanded = $state(false);
  let locked   = $state(false);
  let isExpanded = $derived(expanded || locked);

  function toggleLock() {
    locked = !locked;
    expanded = locked;
  }

  // Mobile sheet
  let sheetOpen = $state(false);
  let touchStartY = $state(0);

  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY;
  }
  function onTouchEnd(e: TouchEvent) {
    const dy = touchStartY - e.changedTouches[0].clientY;
    if (dy > 40) sheetOpen = true;   // swipe up
    if (dy < -40) sheetOpen = false; // swipe down
  }

  $effect(() => {
    document.documentElement.style.setProperty('--sb-width', isExpanded ? '210px' : '52px');
  });

  const TABS: { id: Tab; icon: any; label: string }[] = [
    { id: 'files',      icon: IconFiles,          label: 'Files'      },
    { id: 'generators', icon: IconSparkles,        label: 'Generators' },
    { id: 'downloader', icon: IconDownload,        label: 'Downloader' },
    { id: 'draw',       icon: IconPencil,           label: 'Draw'       },
    { id: 'editor',     icon: IconPhoto,            label: 'Image Edit' },
    { id: 'stats',      icon: IconChartBar,          label: 'Stats'      },
    { id: 'vault',	icon: IconLock,			label: 'Vault'},
  ];
  // Mobile: primary tabs shown in bottom bar, secondary in sheet
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

<!-- ── Desktop sidebar ───────────────────────────────────────────────── -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<aside
  class="sidebar desktop-sidebar"
  class:expanded={isExpanded}
  onmouseenter={() => { if (!locked) expanded = true; }}
  onmouseleave={() => { if (!locked) expanded = false; }}
>
  <div class="sb-top">
    <div class="sb-logo">
      <IconCloud size={18} stroke={1.5}/>
      {#if isExpanded}<span class="sb-logo-text">Omar's Cloud</span>{/if}
    </div>
    {#if isExpanded}
      <button class="sb-lock" onclick={toggleLock} title={locked ? 'Unlock' : 'Lock open'}>
        {#if locked}<IconLock size={13}/>{:else}<IconLockOpen size={13}/>{/if}
      </button>
    {/if}
  </div>

  <nav class="sb-nav">
    {#each TABS as tab}
      {@const active = activeTab === tab.id}
      <button class="sb-tab" class:sb-tab-active={active}
        onclick={() => ontabchange(tab.id)}
        title={!isExpanded ? tab.label : undefined}
      >
        <span class="sb-tab-icon"><tab.icon size={17} stroke={1.6}/></span>
        {#if isExpanded}<span class="sb-tab-label">{tab.label}</span>{/if}
        {#if active && isExpanded}<span class="sb-tab-pip"></span>{/if}
      </button>
    {/each}
  </nav>

  <div class="sb-spacer"></div>

  {#if user}
    <div class="sb-stats">
      <div class="sb-stat" title="Storage used">
        <span class="sb-stat-icon">💾</span>
        {#if isExpanded}<span class="sb-stat-val">{fmtBytes(storageBytes)}</span>{/if}
      </div>
      <div class="sb-stat" title="{folderCount} folders">
        <IconFolder size={13} stroke={1.5}/>
        {#if isExpanded}<span class="sb-stat-val">{folderCount} folder{folderCount !== 1 ? 's' : ''}</span>{/if}
      </div>
      <div class="sb-stat" title="{fileCount} files">
        <IconFile size={13} stroke={1.5}/>
        {#if isExpanded}<span class="sb-stat-val">{fileCount} file{fileCount !== 1 ? 's' : ''}</span>{/if}
      </div>
    </div>
    <div class="sb-divider"></div>
    <div class="sb-user">
      <div class="sb-avatar">{user.username[0].toUpperCase()}</div>
      {#if isExpanded}<span class="sb-username">{user.username}</span>{/if}
    </div>
    <div class="sb-actions">
      <button class="sb-action" onclick={oncycleTheme} title="Toggle theme">
        {#if theme === 'system'}<IconDeviceDesktop size={15}/>
        {:else if theme === 'light'}<IconSun size={15}/>
        {:else}<IconMoon size={15}/>{/if}
        {#if isExpanded}<span>{theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}</span>{/if}
      </button>
      <button class="sb-action sb-action-danger" onclick={onlogout} title="Sign out">
        <IconLogout size={15}/>
        {#if isExpanded}<span>Sign out</span>{/if}
      </button>
    </div>
  {/if}
</aside>

<!-- ── Mobile bottom bar + sheet ────────────────────────────────────── -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="mobile-bar"
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
>
  <!-- Sheet (swipe up) -->
  <div class="mob-sheet" class:open={sheetOpen}>
    <button class="sheet-handle" onclick={() => sheetOpen = !sheetOpen}></button>

    {#if user}
      <div class="sheet-user">
        <div class="sb-avatar">{user.username[0].toUpperCase()}</div>
        <div class="sheet-user-info">
          <span class="sheet-username">{user.username}</span>
          <span class="sheet-storage">💾 {fmtBytes(storageBytes)} · {fileCount} files · {folderCount} folders</span>
        </div>
      </div>
      <div class="sheet-divider"></div>
      <!-- Secondary tabs -->
      <div class="sheet-tabs">
        {#each SECONDARY_TABS as tab}
          {@const active = activeTab === tab.id}
          <button class="sheet-tab" class:sheet-tab-active={active}
            onclick={() => { ontabchange(tab.id); sheetOpen = false; }}>
            <tab.icon size={18} stroke={1.5}/>
            <span>{tab.label}</span>
          </button>
        {/each}
      </div>
      <div class="sheet-divider"></div>
      <div class="sheet-actions">
        <button class="sheet-btn" onclick={oncycleTheme}>
          {#if theme === 'system'}<IconDeviceDesktop size={16}/>
          {:else if theme === 'light'}<IconSun size={16}/>
          {:else}<IconMoon size={16}/>{/if}
          <span>{theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}</span>
        </button>
        <button class="sheet-btn sheet-btn-danger" onclick={onlogout}>
          <IconLogout size={16}/><span>Sign out</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Always-visible tab bar — primary tabs only -->
  <nav class="mob-nav">
    {#each primaryTabs as tab}
      {@const active = activeTab === tab.id}
      <button
        class="mob-tab"
        class:mob-tab-active={active}
        onclick={() => { ontabchange(tab.id); sheetOpen = false; }}
      >
        <div class="mob-tab-icon">
          <tab.icon size={21} stroke={active ? 2.2 : 1.5}/>
          {#if active}<div class="mob-tab-dot"></div>{/if}
        </div>
        <span>{tab.label}</span>
      </button>
    {/each}
    <!-- More button -->
    <button class="mob-tab" class:mob-tab-active={sheetOpen && !primaryTabs.some(t => t.id === activeTab)} onclick={() => sheetOpen = !sheetOpen}>
      <div class="mob-tab-icon">
        {#if sheetOpen}<IconChevronDown size={21} stroke={1.5}/>{:else}<IconChevronUp size={21} stroke={1.5}/>{/if}
      </div>
      <span>More</span>
    </button>
  </nav>
</div>

<style>
  /* ── Desktop ────────────────────────────────────────────────────────── */
  .desktop-sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; z-index: 100;
    width: 52px;
    background: var(--bg-2);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    transition: width 0.22s cubic-bezier(.16,1,.3,1);
    overflow: hidden;
  }
  .desktop-sidebar.expanded { width: 210px; }

  .sb-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 10px; min-height: 52px; flex-shrink: 0; gap: 6px;
  }
  .sb-logo {
    display: flex; align-items: center; gap: 9px;
    color: var(--text-1); overflow: hidden; flex: 1;
    /* center icon when collapsed */
    justify-content: flex-start;
  }
  /* when not expanded, center the icon in the 52px column */
  .desktop-sidebar:not(.expanded) .sb-logo {
    justify-content: center;
  }
  .sb-logo-text {
    font-size: 13px; font-weight: 600; white-space: nowrap;
    letter-spacing: -.2px;
  }
  .sb-lock {
    flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px;
    background: transparent; border: none; cursor: pointer;
    color: var(--text-3); display: flex; align-items: center; justify-content: center;
    transition: .13s;
  }
  .sb-lock:hover { background: var(--hover); color: var(--text-1); }

  .sb-nav {
    display: flex; flex-direction: column; gap: 2px;
    padding: 4px 6px; flex-shrink: 0;
  }
  .sb-tab {
    display: flex; align-items: center; gap: 10px;
    padding: 8px; border-radius: 9px;
    color: var(--text-2); font-size: 13px; font-weight: 500;
    font-family: 'Geist', sans-serif;
    background: none; border: none; cursor: pointer;
    width: 100%; text-align: left;
    transition: .13s; white-space: nowrap; overflow: hidden;
  }
  .sb-tab:hover { background: var(--hover); color: var(--text-1); }
  .sb-tab-active { background: var(--hover); color: var(--text-1); }
  /* center icon when collapsed */
  .desktop-sidebar:not(.expanded) .sb-tab { justify-content: center; padding: 8px 0; }
  .sb-tab-icon { flex-shrink: 0; display: flex; }
  .sb-tab-label { overflow: hidden; text-overflow: ellipsis; }
  .sb-tab-pip { margin-left: auto; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }

  .sb-spacer { flex: 1; }

  .sb-stats {
    display: flex; flex-direction: column; gap: 1px;
    padding: 4px 6px; flex-shrink: 0;
  }
  .sb-stat {
    display: flex; align-items: center; gap: 9px;
    padding: 5px 8px; border-radius: 7px;
    color: var(--text-3); font-size: 11.5px;
    white-space: nowrap; overflow: hidden;
  }
  .desktop-sidebar:not(.expanded) .sb-stat { justify-content: center; }
  .sb-stat-icon { font-size: 12px; flex-shrink: 0; line-height: 1; }
  .sb-stat-val { overflow: hidden; text-overflow: ellipsis; font-family: 'Geist Mono', monospace; }

  .sb-divider { margin: 6px 10px; border-top: 1px solid var(--border); flex-shrink: 0; }

  .sb-user {
    display: flex; align-items: center; gap: 9px;
    padding: 4px 10px; flex-shrink: 0; overflow: hidden;
  }
  .desktop-sidebar:not(.expanded) .sb-user { justify-content: center; }
  .sb-avatar {
    width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0;
    background: var(--accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
  }
  .sb-username { font-size: 12.5px; font-weight: 500; color: var(--text-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .sb-actions {
    display: flex; flex-direction: column; gap: 1px;
    padding: 2px 6px 10px; flex-shrink: 0;
  }
  .sb-action {
    display: flex; align-items: center; gap: 9px;
    padding: 7px 8px; border-radius: 8px; border: none;
    background: transparent; color: var(--text-2);
    font-size: 12.5px; font-weight: 500; font-family: 'Geist', sans-serif;
    cursor: pointer; transition: .13s; text-align: left;
    white-space: nowrap; overflow: hidden;
  }
  .desktop-sidebar:not(.expanded) .sb-action { justify-content: center; }
  .sb-action:hover { background: var(--hover); color: var(--text-1); }
  .sb-action-danger:hover { background: rgba(220,38,38,.12); color: #f87171; }

  /* ── Mobile ─────────────────────────────────────────────────────────── */
  .mobile-bar { display: none; }

  @media (max-width: 600px) {
    .desktop-sidebar { display: none; }
    .mobile-bar {
      display: flex; flex-direction: column;
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
    }

    /* Sheet */
    .mob-sheet {
      background: var(--bg-2);
      border-top: 1px solid var(--border);
      border-radius: 20px 20px 0 0;
      padding: 0 16px 12px;
      max-height: 0; overflow: hidden;
      transition: max-height 0.32s cubic-bezier(.16,1,.3,1), padding 0.32s;
    }
    .mob-sheet.open {
      max-height: 420px;
      padding: 0 16px 16px;
    }
    .sheet-handle {
      display: flex; align-items: center; justify-content: center;
      width: 100%; padding: 12px 0 8px; background: none; border: none;
      color: var(--text-3); cursor: pointer;
    }
    .sheet-handle::before {
      content: '';
      width: 36px; height: 4px;
      background: var(--border-hover);
      border-radius: 2px;
    }
    .sheet-user {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 0 10px;
    }
    .sheet-user-info { display: flex; flex-direction: column; gap: 2px; }
    .sheet-username { font-size: 14px; font-weight: 600; color: var(--text-1); }
    .sheet-storage { font-size: 11px; color: var(--text-3); font-family: 'Geist Mono', monospace; }
    .sheet-divider { border-top: 1px solid var(--border); margin: 8px 0; }
    /* Secondary tabs in sheet */
    .sheet-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      padding: 4px 0;
    }
    .sheet-tab {
      display: flex; flex-direction: column; align-items: center; gap: 5px;
      padding: 10px 8px; border-radius: 12px; border: 1px solid transparent;
      background: var(--hover); color: var(--text-2);
      font-size: 11px; font-weight: 500; font-family: 'Geist', sans-serif;
      cursor: pointer; transition: .13s;
    }
    .sheet-tab:active { transform: scale(0.96); }
    .sheet-tab-active { color: var(--accent); border-color: var(--accent); background: rgba(99,102,241,.08); }
    .sheet-actions { display: flex; flex-direction: column; gap: 4px; }
    .sheet-btn {
      display: flex; align-items: center; gap: 10px;
      padding: 11px 14px; border-radius: 12px; border: none;
      background: var(--hover); color: var(--text-1);
      font-size: 13px; font-weight: 500; font-family: 'Geist', sans-serif;
      cursor: pointer; transition: .13s; text-align: left;
    }
    .sheet-btn:active { transform: scale(0.98); }
    .sheet-btn-danger { color: #f87171; background: rgba(220,38,38,.08); }

    /* Tab bar */
    .mob-nav {
      display: flex; flex-direction: row;
      background: var(--bg-2); border-top: 1px solid var(--border);
      height: 62px;
      padding: 0 4px;
    }
    .mob-tab {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 2px;
      background: none; border: none; cursor: pointer;
      color: var(--text-3); font-size: 10px; font-weight: 500;
      font-family: 'Geist', sans-serif; transition: color .13s;
      padding: 6px 0; min-width: 0;
    }
    .mob-tab-icon {
      position: relative;
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 28px;
    }
    .mob-tab-dot {
      position: absolute;
      bottom: 0; left: 50%;
      transform: translateX(-50%);
      width: 4px; height: 4px;
      background: var(--accent);
      border-radius: 50%;
    }
    .mob-tab:active { transform: scale(0.92); }
    .mob-tab-active { color: var(--accent); }
  }
</style>
