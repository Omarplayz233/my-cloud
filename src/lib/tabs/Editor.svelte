<!-- src/lib/tabs/Editor.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let { apiKey, initialFile = null }: {
    apiKey: string;
    initialFile?: { metaFileId: string; fileName: string } | null;
  } = $props();

  let containerEl: HTMLDivElement;
  let instance: any = null;
  let loading   = $state(true);
  let saving    = $state(false);
  let saveOk    = $state(false);
  let saveError = $state<string | null>(null);
  let saveName  = $state("edited.png");
  let loadError = $state<string | null>(null);

  $effect(() => {
    if (initialFile?.fileName) {
      saveName = initialFile.fileName.replace(/(\.[^.]+)$/, "_edited$1");
    }
  });

  async function loadFromCDN() {
    if (!document.getElementById("tui-css")) {
      const link = document.createElement("link");
      link.id = "tui-css";
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/tui-image-editor@3.15.3/dist/tui-image-editor.min.css";
      document.head.appendChild(link);
    }
    if (!(window as any).tui?.ImageEditor) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/tui-image-editor@3.15.3/dist/tui-image-editor.min.js";
        s.onload = () => res();
        s.onerror = () => rej(new Error("Failed to load editor"));
        document.head.appendChild(s);
      });
    }

    const TUI = (window as any).tui.ImageEditor;
    instance = new TUI(containerEl, {
      includeUI: {
        theme: blackTheme,
        menu: ["crop","flip","rotate","draw","shape","icon","text","mask","filter"],
        initMenu: "filter",
        uiSize: { width: "100%", height: "100%" },
        menuBarPosition: "bottom",
      },
      cssMaxWidth: 2000,
      cssMaxHeight: 2000,
      usageStatistics: false,
    });

    if (initialFile) {
      await loadFileFromCloud(initialFile.metaFileId, initialFile.fileName);
    }

    loading = false;
  }

  async function loadFileFromCloud(metaFileId: string, fileName: string) {
    try {
      const res = await fetch(
        `/api/telegram/getRequestFile?api_key=${encodeURIComponent(apiKey)}&meta_file_id=${encodeURIComponent(metaFileId)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      await instance.loadImageFromURL(url, fileName.replace(/\.[^.]+$/, ""));
      URL.revokeObjectURL(url);
    } catch (e: any) {
      loadError = e?.message ?? "Failed to load image";
    }
  }

  async function saveToCloud() {
    if (!instance || saving) return;
    saving = true; saveError = null; saveOk = false;
    try {
      const dataUrl = instance.toDataURL({ format: "png" });
      const res     = await fetch(dataUrl);
      const blob    = await res.blob();
      const name    = saveName.endsWith(".png") ? saveName : saveName + ".png";
      const fd      = new FormData();
      fd.append("file", blob, name);
      const up = await fetch(`/api/telegram/uploadFile?api_key=${encodeURIComponent(apiKey)}`, {
        method: "POST", body: fd,
      });
      if (!up.ok) throw new Error(`Upload failed: ${up.status}`);
      saveOk = true;
      setTimeout(() => saveOk = false, 3000);
    } catch (e: any) {
      saveError = e?.message ?? "Save failed";
    } finally {
      saving = false;
    }
  }

  function downloadLocally() {
    if (!instance) return;
    const dataUrl = instance.toDataURL({ format: "png" });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = saveName.endsWith(".png") ? saveName : saveName + ".png";
    a.click();
  }

  onMount(() => { loadFromCDN(); });
  onDestroy(() => { if (instance) { try { instance.destroy(); } catch {} instance = null; } });

  const blackTheme: Record<string, string> = {
    "common.bi.image": "",
    "common.bisize.width": "0px",
    "common.bisize.height": "0px",
    "common.backgroundImage": "none",
    "common.backgroundColor": "#1a1a1a",
    "common.border": "0px",
    "header.backgroundImage": "none",
    "header.backgroundColor": "#101010",
    "header.border": "0px",
    "loadButton.backgroundColor": "#141414",
    "loadButton.border": "1px solid #2a2a2a",
    "loadButton.color": "#e2e2e2",
    "loadButton.fontFamily": "Geist, sans-serif",
    "loadButton.fontSize": "12px",
    "downloadButton.backgroundColor": "#6366f1",
    "downloadButton.border": "none",
    "downloadButton.color": "#fff",
    "downloadButton.fontFamily": "Geist, sans-serif",
    "downloadButton.fontSize": "12px",
    "menu.normalIcon.color": "#888",
    "menu.activeIcon.color": "#6366f1",
    "menu.disabledIcon.color": "#444",
    "menu.hoverIcon.color": "#e2e2e2",
    "menu.iconSize.width": "24px",
    "menu.iconSize.height": "24px",
    "submenu.backgroundColor": "#101010",
    "submenu.partition.color": "#1a1a1a",
    "submenu.normalIcon.color": "#888",
    "submenu.activeIcon.color": "#6366f1",
    "submenu.iconSize.width": "32px",
    "submenu.iconSize.height": "32px",
    "submenu.normalLabel.color": "#888",
    "submenu.normalLabel.fontWeight": "400",
    "submenu.activeLabel.color": "#e2e2e2",
    "submenu.activeLabel.fontWeight": "500",
    "checkbox.border": "1px solid #444",
    "checkbox.backgroundColor": "#141414",
    "range.pointer.color": "#6366f1",
    "range.bar.color": "#2a2a2a",
    "range.subbar.color": "#6366f1",
    "range.value.color": "#e2e2e2",
    "range.value.fontWeight": "400",
    "range.value.fontSize": "11px",
    "range.value.border": "1px solid #2a2a2a",
    "range.value.backgroundColor": "#141414",
    "range.title.color": "#888",
    "range.title.fontWeight": "500",
    "colorpicker.button.border": "1px solid #444",
    "colorpicker.title.color": "#e2e2e2",
  };
</script>

<div class="editor-root">
  <div class="editor-bar">
    <span class="editor-title">Image Editor</span>
    <div class="editor-actions">
      <input class="name-input" type="text" bind:value={saveName} placeholder="filename.png" />
      <button class="e-btn" onclick={downloadLocally}>↓ Download</button>
      <button class="e-btn primary" onclick={saveToCloud} disabled={saving}>
        ↑ {saving ? "Saving…" : "Save to Cloud"}
      </button>
    </div>
    {#if saveOk}<span class="ok">✓ Saved!</span>{/if}
    {#if saveError}<span class="err">{saveError}</span>{/if}
    {#if loadError}<span class="err">{loadError}</span>{/if}
  </div>

  {#if loading}
    <div class="center">
      <div class="spinner"></div>
      <span>Loading editor…</span>
    </div>
  {/if}

  <div bind:this={containerEl} class="tui-wrap" class:hidden={loading}></div>
</div>

<style>
  .editor-root { display:flex; flex-direction:column; height:100vh; background:var(--bg-1); overflow:hidden; }
  .editor-bar { display:flex; align-items:center; gap:10px; padding:8px 16px; background:var(--bg-2); border-bottom:1px solid var(--border); flex-shrink:0; flex-wrap:wrap; }
  .editor-title { font-size:13px; font-weight:500; color:var(--text-1); flex-shrink:0; }
  .editor-actions { display:flex; align-items:center; gap:6px; margin-left:auto; flex-wrap:wrap; }
  .name-input { background:var(--bg-1); border:1px solid var(--border); border-radius:6px; padding:5px 8px; color:var(--text-1); font-size:12px; font-family:"Geist",sans-serif; outline:none; width:180px; }
  .name-input:focus { border-color:var(--border-hover); }
  .e-btn { display:flex; align-items:center; gap:5px; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:500; font-family:"Geist",sans-serif; border:1px solid var(--border); background:none; color:var(--text-2); cursor:pointer; transition:.1s; }
  .e-btn:hover { background:var(--bg-3); color:var(--text-1); }
  .e-btn.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .e-btn.primary:hover { opacity:.9; }
  .e-btn:disabled { opacity:.4; cursor:not-allowed; }
  .ok  { font-size:11px; color:var(--green); }
  .err { font-size:11px; color:var(--red); }
  .tui-wrap { flex:1; overflow:hidden; }
  .tui-wrap.hidden { visibility:hidden; height:0; }
  .center { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; flex:1; color:var(--text-3); font-size:13px; }
  .spinner { width:24px; height:24px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin .7s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
</style>
