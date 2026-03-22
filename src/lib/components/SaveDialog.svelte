<!-- src/lib/components/SaveDialog.svelte -->
<script lang="ts">
  import { IconX, IconFolder, IconFolderOpen, IconDownload, IconCloudUpload, IconChevronRight, IconHome, IconLoader2 } from '@tabler/icons-svelte';

  let {
    open = false,
    defaultName = 'export',
    apiKey = '',
    onconfirm,
    onsave,
    onclose,
  }: {
    open?: boolean;
    defaultName?: string;
    apiKey?: string;
    onconfirm: (filename: string) => void;
    onsave?: (filename: string, folderId: string | null) => Promise<void>;
    onclose: () => void;
  } = $props();

  type Folder = { folderId: string; name: string; parentId?: string };

  let filename   = $state(defaultName);
  let folders    = $state<Folder[]>([]);
  let currentId  = $state<string | null>(null);
  let loading    = $state(false);
  let saving     = $state(false);
  let saveStatus = $state<'idle'|'ok'|'err'>('idle');
  let errMsg     = $state('');

  $effect(() => { filename = defaultName; });

  $effect(() => {
    if (open) loadFolders();
    if (!open) { saveStatus = 'idle'; saving = false; errMsg = ''; currentId = null; }
  });

  async function loadFolders() {
    loading = true;
    try {
      const res = await fetch('/api/telegram/folderOps');
      const json = await res.json();
      folders = json.folders ?? [];
    } catch { folders = []; }
    loading = false;
  }

  let children = $derived(
    folders.filter(f => (f.parentId ?? null) === currentId)
  );

  let breadcrumb = $derived.by(() => {
    const trail: Folder[] = [];
    let id = currentId;
    while (id) {
      const f = folders.find(x => x.folderId === id);
      if (!f) break;
      trail.unshift(f);
      id = f.parentId ?? null;
    }
    return trail;
  });

  function enter(folderId: string) { currentId = folderId; }
  function goHome() { currentId = null; }
  function goTo(folderId: string | null) { currentId = folderId; }

  async function saveToCloud() {
    if (!onsave) return;
    saving = true; saveStatus = 'idle'; errMsg = '';
    try {
      const name = (filename || defaultName).replace(/\.png$/i, '') + '.png';
      await onsave(name, currentId);
      saveStatus = 'ok';
      setTimeout(() => { saveStatus = 'idle'; onclose(); }, 900);
    } catch (e: any) {
      saveStatus = 'err'; errMsg = e?.message ?? 'Upload failed';
    }
    saving = false;
  }

  function download() {
    const name = (filename || defaultName).replace(/\.png$/i, '') + '.png';
    onconfirm(name);
    onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    if (e.key === 'Enter' && onsave) saveToCloud();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay" onclick={onclose}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="dialog" onclick={e => e.stopPropagation()}>

      <!-- Header -->
      <div class="dialog-header">
        <span>Save image</span>
        <button class="close-btn" onclick={onclose}><IconX size={14}/></button>
      </div>

      <!-- Folder browser -->
      <div class="browser">
        <!-- Breadcrumb -->
        <div class="breadcrumb">
          <button class="crumb" onclick={goHome}><IconHome size={12}/> Cloud</button>
          {#each breadcrumb as crumb}
            <IconChevronRight size={11} class="crumb-sep"/>
            <button class="crumb" onclick={() => goTo(crumb.folderId)}>{crumb.name}</button>
          {/each}
        </div>

        <!-- Folder list -->
        <div class="folder-list">
          {#if loading}
            <div class="empty"><IconLoader2 size={14} class="spin"/> Loading...</div>
          {:else if children.length === 0}
            <div class="empty">No folders here</div>
          {:else}
            {#each children as folder}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="folder-row" ondblclick={() => enter(folder.folderId)}>
                <IconFolder size={15} class="folder-icon"/>
                <span>{folder.name}</span>
                <button class="open-btn" onclick={() => enter(folder.folderId)} title="Open">
                  <IconFolderOpen size={13}/>
                </button>
              </div>
            {/each}
          {/if}
        </div>

        <div class="dest-label">
          Saving to: <strong>{breadcrumb.length ? breadcrumb[breadcrumb.length-1].name : 'Root'}</strong>
        </div>
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <div class="fname-row" {onkeydown}>
          <input
            class="fname-input"
            bind:value={filename}
            placeholder={defaultName}
          />
          <span class="fname-ext">.png</span>
        </div>

        {#if saveStatus === 'err'}
          <div class="err-msg">{errMsg}</div>
        {/if}

        <div class="btn-row">
          <button class="btn download" onclick={download} disabled={saving}>
            <IconDownload size={13}/> Download
          </button>
          <button class="btn save" onclick={saveToCloud} disabled={saving || !onsave}>
            {#if saving}
              <IconLoader2 size={13} class="spin"/> Saving…
            {:else if saveStatus === 'ok'}
              ✓ Saved!
            {:else}
              <IconCloudUpload size={13}/> Save to Cloud
            {/if}
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.75); backdrop-filter: blur(5px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  }
  .dialog {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 14px; width: 400px; max-width: 92vw;
    overflow: hidden;
    animation: pop .18s cubic-bezier(.16,1,.3,1);
    display: flex; flex-direction: column;
  }
  @keyframes pop { from{transform:scale(.95);opacity:0} to{transform:scale(1);opacity:1} }

  .dialog-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 15px 18px 12px;
    font-size: 14px; font-weight: 600; color: var(--text-1);
    border-bottom: 1px solid var(--border);
  }
  .close-btn {
    background: none; border: none; color: var(--text-3);
    cursor: pointer; padding: 4px; border-radius: 6px;
    display: flex; transition: .13s;
  }
  .close-btn:hover { color: var(--text-1); background: var(--hover); }

  .browser { display: flex; flex-direction: column; }

  .breadcrumb {
    display: flex; align-items: center; gap: 3px; flex-wrap: wrap;
    padding: 9px 18px 7px;
    font-size: 12px; color: var(--text-3);
    border-bottom: 1px solid var(--border);
  }
  .crumb {
    background: none; border: none; color: var(--text-3);
    cursor: pointer; padding: 2px 5px; border-radius: 5px;
    font-size: 12px; font-family: 'Geist', sans-serif;
    display: flex; align-items: center; gap: 4px;
    transition: .13s;
  }
  .crumb:hover { color: var(--text-1); background: var(--hover); }

  .folder-list {
    height: 160px; overflow-y: auto;
    padding: 6px 10px;
  }
  .folder-list::-webkit-scrollbar { width: 4px; }
  .folder-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  .empty { color: var(--text-3); font-size: 12px; padding: 12px 8px; display: flex; align-items: center; gap: 6px; }

  .folder-row {
    display: flex; align-items: center; gap: 8px;
    width: 100%;
    color: var(--text-1); font-size: 13px; font-family: 'Geist', sans-serif;
    padding: 7px 8px; border-radius: 7px; cursor: pointer;
    transition: .13s; text-align: left;
  }
  .folder-row:hover { background: var(--hover); }
  .folder-row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open-btn {
    background: none; border: none; color: var(--text-3);
    cursor: pointer; padding: 3px; border-radius: 5px;
    display: flex; opacity: 0; transition: .13s;
  }
  .folder-row:hover .open-btn { opacity: 1; color: var(--text-2); }
  .open-btn:hover { color: var(--text-1) !important; }

  .dest-label {
    font-size: 11px; color: var(--text-3);
    padding: 6px 18px 10px;
    border-top: 1px solid var(--border);
  }
  .dest-label strong { color: var(--text-2); font-weight: 500; }

  .dialog-footer {
    padding: 12px 18px 16px;
    display: flex; flex-direction: column; gap: 10px;
    border-top: 1px solid var(--border);
  }
  .fname-row {
    display: flex; align-items: center;
    border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-1); overflow: hidden;
    transition: border-color .13s;
  }
  .fname-row:focus-within { border-color: var(--border-hover); }
  .fname-input {
    flex: 1; background: none; border: none;
    padding: 8px 12px; color: var(--text-1);
    font-size: 13px; font-family: 'Geist Mono', monospace; outline: none;
  }
  .fname-ext {
    padding: 8px 12px 8px 0;
    color: var(--text-3); font-size: 13px;
    font-family: 'Geist Mono', monospace; flex-shrink: 0;
  }

  .err-msg { font-size: 12px; color: #f87171; }

  .btn-row { display: flex; gap: 8px; }
  .btn {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 9px 14px; border-radius: 9px;
    font-size: 13px; font-weight: 500; font-family: 'Geist', sans-serif;
    cursor: pointer; transition: .13s; border: 1px solid transparent;
  }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn.download {
    background: rgba(99,102,241,.08);
    border-color: rgba(99,102,241,.25);
    color: var(--accent);
  }
  .btn.download:hover:not(:disabled) {
    background: rgba(99,102,241,.15);
    border-color: rgba(99,102,241,.4);
  }
  .btn.save {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .btn.save:hover:not(:disabled) { opacity: .88; }

  :global(.spin) { animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
