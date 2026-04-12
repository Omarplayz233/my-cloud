<!-- src/lib/tabs/Converter.svelte -->
<script lang="ts">
  import FileConverter from '$lib/components/viewer/FileConverter.svelte';
  import { IconUpload, IconX } from '@tabler/icons-svelte';

  let pickedFile = $state<File | null>(null);
  let pickedUrl  = $state<string | null>(null);
  let dragging   = $state(false);

  function pickFile(f: File) {
    if (pickedUrl) URL.revokeObjectURL(pickedUrl);
    pickedFile = f;
    pickedUrl  = URL.createObjectURL(f);
  }

  function clearFile() {
    if (pickedUrl) URL.revokeObjectURL(pickedUrl);
    pickedFile = null;
    pickedUrl  = null;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); dragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) pickFile(f);
  }

  let fakeRecord = $derived(pickedFile ? {
    fileName: pickedFile.name,
    type: pickedFile.type || 'application/octet-stream',
    totalBytes: pickedFile.size,
    metaFileId: '',
  } : null);
</script>

<div class="cv-wrap">
  <h1 class="page-title">Convert</h1>
  <p class="page-sub">Pick any file from your device and convert it client-side — nothing is uploaded.</p>

  {#if !pickedFile}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dropzone"
      class:drag-over={dragging}
      ondragover={(e) => { e.preventDefault(); dragging = true; }}
      ondragleave={() => dragging = false}
      ondrop={onDrop}
      onclick={() => document.getElementById('conv-input')?.click()}
    >
      <input
        id="conv-input" type="file" class="hidden"
        onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) pickFile(f); }}
      />
      <IconUpload size={32} stroke={1.2} color="rgba(255,255,255,.2)"/>
      <p class="dz-main">Drop a file here or click to browse</p>
      <p class="dz-sub">Images · Video · Audio — converted in your browser</p>
    </div>

  {:else}
    <div class="converter-wrap">
      <div class="file-header">
        <span class="file-name">{pickedFile.name}</span>
        <button class="clear-btn" onclick={clearFile}><IconX size={14}/></button>
      </div>
      <div class="converter-body">
        <FileConverter file={fakeRecord!} url={pickedUrl}/>
      </div>
    </div>
  {/if}
</div>

<style>
  .cv-wrap { padding: 32px 40px; max-width: 680px; }
  .page-title { font-size: 22px; font-weight: 700; color: var(--text-1); margin: 0 0 6px; letter-spacing: -.4px; }
  .page-sub { color: var(--text-3); font-size: 13px; margin: 0 0 28px; line-height: 1.5; }

  .dropzone {
    border: 1.5px dashed var(--border-hover); border-radius: 16px;
    padding: 64px 32px; display: flex; flex-direction: column;
    align-items: center; gap: 12px; cursor: pointer; transition: .15s;
    background: var(--bg-2);
  }
  .dropzone:hover, .drag-over { border-color: var(--accent); background: rgba(99,102,241,.04); }
  .dz-main { color: var(--text-1); font-size: 14px; font-weight: 500; margin: 0; }
  .dz-sub  { color: var(--text-3); font-size: 12px; margin: 0; text-align: center; }
  .hidden  { display: none; }

  .converter-wrap { max-width: 560px; }
  .file-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-radius: 10px 10px 0 0;
    background: var(--bg-2); border: 1px solid var(--border); border-bottom: none;
  }
  .converter-body {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 0 0 10px 10px; padding: 20px;
  }
  .file-name { font-size: 13px; color: var(--text-1); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clear-btn {
    flex-shrink: 0; background: none; border: none; color: var(--text-3);
    cursor: pointer; display: flex; padding: 4px; border-radius: 6px; transition: .13s;
  }
  .clear-btn:hover { color: var(--text-1); background: var(--hover); }
</style>
