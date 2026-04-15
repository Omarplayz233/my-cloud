<script lang="ts">
  import {
    IconFolder,
    IconFile,
    IconPhoto,
    IconVideo,
    IconMusic,
    IconFileZip,
    IconFileText,
    IconDownload,
    IconEye,
    IconChevronRight,
    IconCloud,
  } from "@tabler/icons-svelte";

  let { data } = $props();

  type FileRecord = {
    fileName: string;
    type: string;
    totalBytes: number;
    time: string;
    metaFileId: string;
    folderId?: string;
    public?: boolean;
  };

  type FolderRecord = {
    _type: 'folder';
    folderId: string;
    name: string;
    createdAt: string;
    parentId?: string;
    public?: boolean;
  };

  let files: FileRecord[] = $state(data.files ?? []);
  let subfolders: FolderRecord[] = $state(data.subfolders ?? []);
  let folder: FolderRecord = $state(data.folder);
  let folderPath: string = $state(data.folderPath ?? '');

  const pathParts = $derived.by(() => folderPath.split('/').filter(Boolean));

  const crumbs = $derived.by(() => {
    return pathParts.map((name, i) => ({
      name,
      path: pathParts.slice(0, i + 1).join('/'),
    }));
  });

  function joinPath(...parts: Array<string | undefined | null>): string {
    return parts
      .flatMap((part) => (part ? part.split('/').filter(Boolean) : []))
      .map(encodeURIComponent)
      .join('/');
  }

  function fileIconComponent(type: string) {
    if (type.startsWith('image/')) return IconPhoto;
    if (type.startsWith('video/')) return IconVideo;
    if (type.startsWith('audio/')) return IconMusic;
    if (type.includes('zip') || type.includes('tar') || type.includes('gz') || type.includes('rar')) return IconFileZip;
    if (type.startsWith('text/') || type.includes('pdf') || type.includes('document')) return IconFileText;
    return IconFile;
  }

  function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
  }

  function formatDate(s: string): string {
    return new Date(s).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function isTextLikeFile(file: FileRecord): boolean {
    const ext = file.fileName.split('.').pop()?.toLowerCase() ?? '';
    return file.type.startsWith('text/') || file.type.includes('json') ||
      ['txt','md','markdown','js','ts','jsx','tsx','py','rs','go','java','c','cpp',
       'css','scss','html','xml','json','yaml','yml','sh','lua','rb','php',
       'svelte','vue','toml','sql','log','env','ini','cfg','conf','csv'].includes(ext);
  }

  function isPreviewable(file: FileRecord): boolean {
    return file.type.startsWith('image/') ||
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/') ||
      file.type === 'application/pdf' ||
      isTextLikeFile(file);
  }

  function fileUrl(f: FileRecord, download = false): string {
    const path = joinPath(folderPath, f.fileName);
    return `/public/${path}${download ? '?download=true' : ''}`;
  }

  function rawUrl(f: FileRecord): string {
    const path = joinPath(folderPath, f.fileName);
    return `/public/raw/${path}`;
  }

  let previewFile = $state<FileRecord | null>(null);
</script>

<svelte:head>
  <title>{folder.name} — Public Folder</title>
</svelte:head>

<div class="root">
  <header>
    <div class="header-left">
      <IconCloud size={20} />
      <span class="header-title">Omar's Cloud</span>
    </div>
    <div class="header-right">
      <span class="header-badge">Public</span>
    </div>
  </header>

  <main class="main">
    <nav class="breadcrumb">
      {#each crumbs as crumb, i}
        {#if i > 0}<span class="bc-sep">›</span>{/if}
        {#if i < crumbs.length - 1}
          <a class="bc-item" href={`/public/folder/${crumb.path}`}>{crumb.name}</a>
        {:else}
          <span class="bc-item bc-active">{crumb.name}</span>
        {/if}
      {/each}
    </nav>

    <div class="folder-header">
      <IconFolder size={28} class="folder-icon-big" />
      <div>
        <h1 class="folder-title">{folder.name}</h1>
        <p class="folder-meta">
          {files.length} file{files.length !== 1 ? 's' : ''}
          {subfolders.length > 0 ? ` · ${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''}` : ''}
        </p>
      </div>
    </div>

    {#if subfolders.length > 0}
      <div class="section-label">Folders</div>
      <div class="subfolder-grid">
        {#each subfolders as sub (sub.folderId)}
          <a class="subfolder-card" href={`/public/folder/${joinPath(folderPath, sub.name)}`}>
            <IconFolder size={24} class="sub-icon" />
            <span class="sub-name">{sub.name}</span>
            <IconChevronRight size={14} class="sub-arrow" />
          </a>
        {/each}
      </div>
    {/if}

    {#if files.length > 0}
      {#if subfolders.length > 0}
        <div class="section-label">Files</div>
      {/if}
      <div class="file-list">
        <div class="file-row file-row-header">
          <span class="fh-icon"></span>
          <span class="fh-name">Name</span>
          <span class="fh-size">Size</span>
          <span class="fh-date">Date</span>
          <span class="fh-actions">Actions</span>
        </div>

        {#each files as file (file.metaFileId)}
          {@const FileIcon = fileIconComponent(file.type)}
          <div class="file-row">
            <span class="ficon"><FileIcon size={18} stroke={1.5} /></span>
            <span class="fname">
              {#if isPreviewable(file)}
                <button class="fname-btn" onclick={() => previewFile = file}>{file.fileName}</button>
              {:else}
                <a class="fname-btn" href={fileUrl(file, true)} download={file.fileName}>{file.fileName}</a>
              {/if}
            </span>
            <span class="fsize">{formatBytes(file.totalBytes)}</span>
            <span class="fdate">{formatDate(file.time)}</span>
            <div class="factions">
              {#if isPreviewable(file)}
                <button class="act-btn" title="Preview" onclick={() => previewFile = file}>
                  <IconEye size={14} />
                </button>
              {/if}
              {#if isTextLikeFile(file)}
                <a class="act-btn" title="Raw" href={rawUrl(file)} target="_blank" rel="noopener noreferrer">RAW</a>
              {/if}
              <a class="act-btn" title="Download" href={fileUrl(file, true)} download={file.fileName}>
                <IconDownload size={14} />
              </a>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if files.length === 0 && subfolders.length === 0}
      <div class="empty">This folder is empty.</div>
    {/if}
  </main>
</div>

{#if previewFile}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="preview-backdrop" onclick={() => previewFile = null}>
    <div class="preview-box" onclick={(e) => e.stopPropagation()}>
      <button class="preview-close" onclick={() => previewFile = null}>✕</button>

      {#if previewFile.type.startsWith('image/')}
        <img src={fileUrl(previewFile)} alt={previewFile.fileName} class="preview-img" />
      {:else if previewFile.type.startsWith('video/')}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={fileUrl(previewFile)} controls class="preview-video"></video>
      {:else if previewFile.type.startsWith('audio/')}
        <!-- svelte-ignore a11y_media_has_caption -->
        <audio src={fileUrl(previewFile)} controls class="preview-audio"></audio>
      {:else if previewFile.type === 'application/pdf'}
        <iframe src={fileUrl(previewFile)} title={previewFile.fileName} class="preview-pdf"></iframe>
      {:else if isTextLikeFile(previewFile)}
        <iframe src={rawUrl(previewFile)} title={previewFile.fileName} class="preview-raw"></iframe>
      {/if}

      <div class="preview-info">
        <span class="preview-name">{previewFile.fileName}</span>
        <a class="act-btn" href={fileUrl(previewFile, true)} download={previewFile.fileName}>
          <IconDownload size={14} /> Download
        </a>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(:root) {
    --bg-1: #080808;
    --bg-2: #101010;
    --bg-3: #141414;
    --text-1: #e2e2e2;
    --text-2: #888;
    --text-3: #444;
    --border: #1a1a1a;
    --border-hover: #2a2a2a;
    --accent: #6366f1;
    --hover: rgba(255,255,255,.04);
    --red: #f87171;
    --red-bg: #1f0a0a;
  }
  :global(*) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    background: var(--bg-1);
    color: var(--text-1);
    font-family: 'Geist', system-ui, sans-serif;
    min-height: 100vh;
  }

  .root { min-height: 100vh; display: flex; flex-direction: column; }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg-1);
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--text-1);
  }
  .header-title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-badge {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--text-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 3px 8px;
  }

  .main {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 24px 80px;
    width: 100%;
    flex: 1;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 28px;
    flex-wrap: wrap;
  }
  .bc-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12.5px;
    color: var(--text-3);
    text-decoration: none;
    padding: 3px 6px;
    border-radius: 6px;
    transition: .14s;
  }
  .bc-item:hover { background: var(--hover); color: var(--text-1); }
  .bc-active { color: var(--text-2) !important; cursor: default; }
  .bc-active:hover { background: transparent !important; }
  .bc-sep { color: var(--text-3); opacity: .4; font-size: 12px; user-select: none; }

  .folder-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
  :global(.folder-icon-big) { color: #fbbf24; flex-shrink: 0; }
  .folder-title { font-size: 22px; font-weight: 600; color: var(--text-1); line-height: 1.2; }
  .folder-meta { font-size: 12.5px; color: var(--text-3); margin-top: 3px; }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--text-3);
    margin-bottom: 8px;
    margin-top: 4px;
  }

  .subfolder-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
    margin-bottom: 28px;
  }
  .subfolder-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    text-decoration: none;
    color: var(--text-1);
    transition: .14s;
    cursor: pointer;
  }
  .subfolder-card:hover { border-color: var(--border-hover); background: var(--bg-3); }
  :global(.sub-icon) { color: #fbbf24; flex-shrink: 0; }
  .sub-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.sub-arrow) { color: var(--text-3); flex-shrink: 0; }

  .file-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .file-row {
    display: grid;
    grid-template-columns: 32px 1fr 80px 100px 80px;
    align-items: center;
    padding: 0 12px;
    min-height: 44px;
    border-bottom: 1px solid var(--border);
    transition: background .12s;
  }
  .file-row:last-child { border-bottom: none; }
  .file-row:not(.file-row-header):hover { background: var(--hover); }
  .file-row-header { background: var(--bg-2); min-height: 36px; }
  .fh-icon,.fh-name,.fh-size,.fh-date,.fh-actions {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--text-3);
  }
  .ficon { display: flex; align-items: center; color: var(--text-3); }
  .fname { overflow: hidden; }
  .fname-btn {
    background: none;
    border: none;
    color: var(--text-1);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    padding: 0;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    text-decoration: none;
    display: block;
  }
  .fname-btn:hover { color: var(--accent); }
  .fsize,.fdate { font-size: 12px; color: var(--text-3); }
  .factions { display: flex; align-items: center; gap: 4px; }

  .act-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    padding: 5px;
    border-radius: 6px;
    transition: .12s;
    font-size: 12px;
    font-family: inherit;
    text-decoration: none;
  }
  .act-btn:hover { background: var(--hover); color: var(--text-1); }

  .empty {
    text-align: center;
    padding: 60px 0;
    color: var(--text-3);
    font-size: 14px;
  }

  .preview-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0,0,0,.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .preview-box {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 32px 80px rgba(0,0,0,.7);
  }
  .preview-close {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 2;
    background: rgba(0,0,0,.6);
    border: none;
    color: var(--text-2);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: .14s;
  }
  .preview-close:hover { background: var(--red-bg); color: var(--red); }
  .preview-img { max-width: 80vw; max-height: 75vh; object-fit: contain; display: block; }
  .preview-video { max-width: 80vw; max-height: 70vh; display: block; }
  .preview-audio { width: 340px; padding: 20px; display: block; }
  .preview-pdf { width: 80vw; height: 75vh; border: none; }
  .preview-raw {
    width: min(980px, 86vw);
    height: min(78vh, 880px);
    border: none;
    background: #fff;
    display: block;
  }
  .preview-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-top: 1px solid var(--border);
    background: var(--bg-2);
  }
  .preview-name {
    font-size: 13px;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 60%;
  }

  @media (max-width: 600px) {
    .main { padding: 20px 14px 60px; }
    .file-row { grid-template-columns: 28px 1fr 70px 60px; }
    .fh-date,.fdate { display: none; }
    .subfolder-grid { grid-template-columns: 1fr 1fr; }
  }
</style>
