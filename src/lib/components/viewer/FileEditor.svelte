<!-- src/lib/components/viewer/FileEditor.svelte -->
<script lang="ts">
  import WasmLoader from './WasmLoader.svelte';
  import { WASM_REGISTRY } from '$lib/wasmCache';
  import { getImageMagickWorker } from '$lib/workerManager';
  import { IconAdjustments, IconFlipHorizontal, IconFlipVertical, IconRotate, IconDownload,
           IconDeviceFloppy, IconEye, IconCode, IconColumns } from '@tabler/icons-svelte';
  import { onDestroy } from 'svelte';

  type FileRecord = {
    fileName: string; type: string; totalBytes: number; metaFileId: string;
    public?: boolean;
  };

  let {
    file, url, apiKey = '',
    onsave,
  }: {
    file: FileRecord; url: string | null; apiKey?: string;
    onsave?: (content: string) => void;
  } = $props();

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function editorKind(f: FileRecord) {
    if (f.type.startsWith('image/')) return 'image';
    if (f.type === 'application/epub+zip') return 'epub';
    if (isTextLike(f.type) || isTextExtension(f.fileName)) return 'text';
    return null;
  }

  function isTextLike(type: string) {
    return type.startsWith('text/') || type === 'application/json' ||
           type === 'application/javascript' || type === 'application/typescript' ||
           type === 'application/xml' || type === 'application/yaml' ||
           type.includes('json') || type.includes('xml') || type.includes('text');
  }

  // Same exhaustive list as public text viewer
  const _TEXT_EXTS = new Set('txt,md,markdown,mdx,rst,adoc,org,js,mjs,cjs,jsx,ts,tsx,cts,svelte,vue,astro,njk,hbs,ejs,erb,haml,pug,css,scss,sass,less,styl,html,htm,xhtml,xml,xsl,xsd,svg,json,json5,jsonc,jsonl,yaml,yml,toml,ini,cfg,conf,env,csv,tsv,sh,bash,zsh,fish,ksh,ps1,bat,cmd,vbs,py,pyw,pyx,pyi,rb,rake,php,phtml,pl,pm,lua,r,jl,c,h,cpp,cc,cxx,hpp,hxx,cs,csx,fs,fsi,fsx,rs,go,mod,zig,v,d,nim,ada,adb,ads,pas,asm,s,for,f90,java,kt,kts,groovy,scala,clj,cljs,hs,ml,elm,ex,exs,erl,purs,lisp,cl,el,scm,rkt,swift,dart,m,mm,sql,ddl,dml,graphql,gql,sparql,tex,latex,diff,patch,dockerfile,makefile,mk,cmake,tf,hcl,hx,cr,jl,sol,gd,glsl,frag,vert,hlsl,coffee,ls,reg,log,srt,vtt,pem,lock,gitignore,editorconfig,npmrc,nvmrc,prettierrc,eslintrc,babelrc'.split(','));

  function isTextExtension(name: string) {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const fname = name.toLowerCase();
    // Special filenames
    if (['dockerfile','makefile','rakefile','gemfile','vagrantfile','jenkinsfile',
         'procfile','.bashrc','.zshrc','.profile','.env','.gitignore',
         '.editorconfig','.npmrc','.nvmrc'].includes(fname)) return true;
    return _TEXT_EXTS.has(ext);
  }

  function monacoLang(name: string, type: string) {
    const ext  = name.split('.').pop()?.toLowerCase() ?? '';
    const fname = name.toLowerCase();
    const fmap: Record<string,string> = {
      dockerfile:'dockerfile',containerfile:'dockerfile',
      makefile:'makefile',rakefile:'ruby',gemfile:'ruby',vagrantfile:'ruby',
      jenkinsfile:'groovy',procfile:'yaml',
      '.gitignore':'ignore','.gitconfig':'ini','.editorconfig':'ini','.env':'ini',
    };
    if (fmap[fname]) return fmap[fname];
    const map: Record<string,string> = {
      js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'javascript',
      ts:'typescript',tsx:'typescript',cts:'typescript',mts:'typescript',
      py:'python',pyw:'python',pyx:'python',pyi:'python',
      rs:'rust',
      go:'go',
      java:'java',
      c:'c',h:'c',
      cpp:'cpp',cc:'cpp',cxx:'cpp',hpp:'cpp',hxx:'cpp',
      cs:'csharp',csx:'csharp',
      fs:'fsharp',fsi:'fsharp',fsx:'fsharp',
      rb:'ruby',rake:'ruby',gemspec:'ruby',
      php:'php',phtml:'php',
      swift:'swift',
      kt:'kotlin',kts:'kotlin',
      dart:'dart',
      lua:'lua',
      r:'r',rmd:'r',
      jl:'julia',
      hs:'haskell',lhs:'haskell',
      ml:'ocaml',mli:'ocaml',
      elm:'elm',
      ex:'elixir',exs:'elixir',heex:'elixir',
      erl:'erlang',hrl:'erlang',
      clj:'clojure',cljs:'clojure',
      scm:'scheme',rkt:'scheme',
      lisp:'lisp',cl:'lisp',el:'lisp',
      scala:'scala',sc:'scala',
      groovy:'groovy',
      nim:'nim',
      zig:'zig',
      cr:'crystal',
      hx:'haxe',
      css:'css',scss:'scss',sass:'scss',less:'less',styl:'css',
      html:'html',htm:'html',xhtml:'html',svelte:'html',vue:'html',astro:'html',
      njk:'html',hbs:'handlebars',ejs:'javascript',erb:'ruby',pug:'pug',
      xml:'xml',xsl:'xml',xsd:'xml',svg:'xml',plist:'xml',
      json:'json',json5:'json',jsonc:'json',jsonl:'json',
      yaml:'yaml',yml:'yaml',
      toml:'toml',
      ini:'ini',cfg:'ini',conf:'ini',env:'ini',properties:'ini',
      sh:'shell',bash:'shell',zsh:'shell',ksh:'shell',fish:'shell',
      ps1:'powershell',psm1:'powershell',
      bat:'bat',cmd:'bat',
      sql:'sql',ddl:'sql',dml:'sql',psql:'sql',
      graphql:'graphql',gql:'graphql',
      md:'markdown',markdown:'markdown',mdx:'markdown',mdown:'markdown',
      tex:'latex',latex:'latex',
      tf:'hcl',tfvars:'hcl',hcl:'hcl',
      cmake:'cmake',makefile:'makefile',mk:'makefile',
      dockerfile:'dockerfile',
      diff:'diff',patch:'diff',
      glsl:'glsl',frag:'glsl',vert:'glsl',hlsl:'hlsl',
      sol:'sol',
      gd:'gdscript',
      m:'objective-c',mm:'objective-c',
      coffee:'coffeescript',
      pl:'perl',pm:'perl',
      asm:'asm',s:'asm',
    };
    if (map[ext]) return map[ext];
    if (type.includes('json')) return 'json';
    if (type.includes('xml')) return 'xml';
    if (type.includes('javascript')) return 'javascript';
    if (type.includes('typescript')) return 'typescript';
    if (type.includes('html')) return 'html';
    if (type.startsWith('text/x-python')) return 'python';
    return 'plaintext';
  }

  function isMarkdown(name: string) {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    return ext === 'md' || ext === 'markdown';
  }

  let kind = $derived(editorKind(file));
  let lang = $derived(monacoLang(file.fileName, file.type));
  let isMd  = $derived(isMarkdown(file.fileName));

  // ── Text editor state ────────────────────────────────────────────────────────
  let textContent  = $state<string | null>(null);
  let editorEl     = $state<HTMLDivElement | null>(null);
  let monacoEditor: any = null;
  let monacoLoaded = $state(false);
  let textLoading  = $state(false);
  let textError    = $state<string | null>(null);
  let saving       = $state(false);
  let dirty        = $state(false);
  type TextView = 'editor' | 'preview' | 'split';
  let textView     = $state<TextView>(isMd ? 'split' : 'editor');
  let mdHtml       = $state('');

  // ── Load text content ────────────────────────────────────────────────────────
  $effect(() => {
    if (kind === 'text' && url) loadText();
  });

  async function loadText() {
    textLoading = true; textError = null;
    try {
      const res = await fetch(url!);
      textContent = await res.text();
    } catch (e: any) {
      textError = e.message;
    } finally {
      textLoading = false;
    }
  }

  // ── Mount Monaco once content + DOM are ready ─────────────────────────────
  $effect(() => {
    if (kind !== 'text' || textContent === null || !editorEl || (textView === 'preview')) return;
    if (monacoLoaded && monacoEditor) return; // already mounted
    loadMonaco();
  });

  async function loadMonaco() {
    if (typeof window === 'undefined') return;

    // Lazy-load Monaco from CDN
    if (!(window as any).monacoReady) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min/vs/loader.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Monaco loader'));
        document.head.appendChild(script);
      });
      (window as any).require.config({
        paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min/vs' }
      });
      await new Promise<void>((resolve) => {
        (window as any).require(['vs/editor/editor.main'], () => {
          (window as any).monacoReady = true;
          resolve();
        });
      });
    }

    if (!editorEl) return;

    const monaco = (window as any).monaco;
    monacoEditor = monaco.editor.create(editorEl, {
      value: textContent ?? '',
      language: lang,
      theme: 'vs-dark',
      fontSize: 13,
      fontFamily: '"Geist Mono", "Fira Code", "Cascadia Code", monospace',
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: lang === 'markdown' || lang === 'plaintext' ? 'on' : 'off',
      renderLineHighlight: 'gutter',
      lineNumbers: lang === 'markdown' || lang === 'plaintext' ? 'off' : 'on',
      padding: { top: 16, bottom: 16 },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      bracketPairColorization: { enabled: true },
      automaticLayout: true,
    });

    monacoEditor.onDidChangeModelContent(() => {
      dirty = true;
      if (isMd && textView !== 'editor') renderMarkdown();
    });

    monacoLoaded = true;
  }

  // ── Markdown rendering ───────────────────────────────────────────────────────
  async function renderMarkdown() {
    const content = monacoEditor?.getValue() ?? textContent ?? '';
    if (!(window as any).marked) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/marked@12/marked.min.js';
      document.head.appendChild(script);
      await new Promise<void>(r => { script.onload = () => r(); });
      (window as any).marked.setOptions({ breaks: true, gfm: true });
    }
    mdHtml = (window as any).marked.parse(content);
  }

  $effect(() => {
    if (isMd && (textView === 'preview' || textView === 'split') && textContent !== null) {
      renderMarkdown();
    }
  });

  // ── Switch view mode ─────────────────────────────────────────────────────────
  function setView(v: TextView) {
    textView = v;
    if (v !== 'editor' && isMd) renderMarkdown();
    // Re-layout Monaco after DOM changes
    if (v !== 'preview') {
      setTimeout(() => monacoEditor?.layout(), 50);
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function save() {
    if (!apiKey || !dirty) return;
    const content = monacoEditor?.getValue() ?? textContent ?? '';
    saving = true;
    try {
      const blob  = new Blob([content], { type: file.type || 'text/plain' });
      const form  = new FormData();
      form.append('file', blob, file.fileName);
      // Upload as single chunk
      const upRes = await fetch('/api/telegram/uploadChunk', {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'X-Chunk-Index': '0',
          'X-File-Name': encodeURIComponent(file.fileName),
        },
        body: form,
      });
      const chunk = await upRes.json();
      if (chunk.error) throw new Error(chunk.error);

      const finalRes = await fetch('/api/telegram/finalizeUpload', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.fileName,
          type: file.type || 'text/plain',
          totalBytes: blob.size,
          chunks: [chunk],
          replaceMetaFileId: file.metaFileId,  // overwrite existing
        }),
      });
      const final = await finalRes.json();
      if (final.error) throw new Error(final.error);
      dirty = false;
      onsave?.(content);
    } catch (e: any) {
      textError = 'Save failed: ' + e.message;
    } finally {
      saving = false;
    }
  }

  // Ctrl+S to save
  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  }

  onDestroy(() => { monacoEditor?.dispose(); });

  // ── Image editor ─────────────────────────────────────────────────────────────
  let magickReady = $state(false);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let origData: Uint8Array | null = null;
  let processing = $state(false);
  let editError = $state<string | null>(null);
  let brightness = $state(100);
  let contrast   = $state(100);
  let saturation = $state(100);

  async function loadOriginal() {
    if (!url) return;
    const res = await fetch(url);
    origData = new Uint8Array(await res.arrayBuffer());
    renderToCanvas(origData);
  }

  async function renderToCanvas(data: Uint8Array) {
    if (!canvasEl) return;
    const blob = new Blob([data], { type: file.type });
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    await new Promise(r => img.onload = r);
    canvasEl.width = img.naturalWidth; canvasEl.height = img.naturalHeight;
    const ctx = canvasEl.getContext('2d')!;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(img.src);
  }

  async function applyMagick(op: string) {
    if (!origData || !magickReady) return;
    processing = true; editError = null;
    try {
      const worker = getImageMagickWorker();
      const opts: any = {};
      if (op === 'flip') opts.flip = true;
      if (op === 'flop') opts.flop = true;
      if (op === 'rotate-cw') opts.rotate = 90;
      if (op === 'rotate-ccw') opts.rotate = -90;
      if (op === 'grayscale') opts.grayscale = true;
      const result = await worker.send<Uint8Array>('convert',
        { inputData: origData, outputFormat: 'PNG', options: opts }, undefined, [origData.buffer]);
      origData = result;
      renderToCanvas(result);
    } catch (e: any) { editError = e.message; }
    processing = false;
  }

  $effect(() => { if (magickReady && url && kind === 'image') loadOriginal(); });
  $effect(() => { void brightness; void contrast; void saturation; if (origData) renderToCanvas(origData); });

  function downloadEdited() {
    if (!canvasEl) return;
    const a = document.createElement('a');
    a.href = canvasEl.toDataURL('image/png');
    a.download = file.fileName.replace(/\.[^.]+$/, '') + '-edited.png';
    a.click();
  }
</script>

<svelte:window onkeydown={handleKeydown}/>

{#if kind === null}
  <div class="fe-empty">
    <IconAdjustments size={48} stroke={1} color="rgba(255,255,255,.1)"/>
    <span>No editor available for this file type</span>
  </div>

{:else if kind === 'text'}
  <div class="te-root">
    <!-- Toolbar -->
    <div class="te-bar">
      <span class="te-filename">{file.fileName}</span>
      {#if dirty}<span class="te-dirty">●</span>{/if}

      {#if isMd}
        <div class="te-view-tabs">
          <button class="te-vt" class:active={textView==='editor'}   onclick={() => setView('editor')}>
            <IconCode size={13}/> Edit
          </button>
          <button class="te-vt" class:active={textView==='split'}    onclick={() => setView('split')}>
            <IconColumns size={13}/> Split
          </button>
          <button class="te-vt" class:active={textView==='preview'}  onclick={() => setView('preview')}>
            <IconEye size={13}/> Preview
          </button>
        </div>
      {/if}

      <span class="te-lang">{lang}</span>

      {#if apiKey}
        <button class="te-save" onclick={save} disabled={saving || !dirty}>
          {#if saving}
            <div class="te-spin"></div> Saving…
          {:else}
            <IconDeviceFloppy size={13}/> Save
          {/if}
        </button>
      {/if}
    </div>

    <!-- Content -->
    {#if textLoading}
      <div class="te-loading"><div class="te-spin-lg"></div><span>Loading…</span></div>
    {:else if textError}
      <div class="te-err">{textError}</div>
    {:else}
      <div class="te-content" class:split={textView === 'split'}>
        <!-- Monaco editor pane -->
        {#if textView !== 'preview'}
          <div class="te-editor-pane" bind:this={editorEl}></div>
        {/if}

        <!-- Markdown preview pane -->
        {#if isMd && textView !== 'editor'}
          <div class="te-preview-pane md-body">
            {@html mdHtml}
          </div>
        {/if}
      </div>
    {/if}
  </div>

{:else if kind === 'image'}
  {#if !magickReady}
    <WasmLoader entry={WASM_REGISTRY.imagemagick} onready={() => magickReady = true}/>
  {:else}
    <div class="fe-image-editor">
      <div class="fe-canvas-wrap">
        <canvas bind:this={canvasEl} class="fe-canvas" class:processing></canvas>
        {#if processing}<div class="fe-processing">Processing…</div>{/if}
        {#if editError}<p class="fe-err">{editError}</p>{/if}
      </div>
      <div class="fe-sidebar">
        <p class="fe-section">Adjustments</p>
        <label class="fe-slider-label">Brightness <span>{brightness}%</span>
          <input type="range" min="0" max="200" bind:value={brightness}/></label>
        <label class="fe-slider-label">Contrast <span>{contrast}%</span>
          <input type="range" min="0" max="200" bind:value={contrast}/></label>
        <label class="fe-slider-label">Saturation <span>{saturation}%</span>
          <input type="range" min="0" max="200" bind:value={saturation}/></label>
        <p class="fe-section">Transform</p>
        <div class="fe-ops">
          <button class="fe-op" onclick={() => applyMagick('rotate-ccw')}><IconRotate size={15} style="transform:scaleX(-1)"/></button>
          <button class="fe-op" onclick={() => applyMagick('rotate-cw')}><IconRotate size={15}/></button>
          <button class="fe-op" onclick={() => applyMagick('flop')}><IconFlipHorizontal size={15}/></button>
          <button class="fe-op" onclick={() => applyMagick('flip')}><IconFlipVertical size={15}/></button>
          <button class="fe-op" onclick={() => applyMagick('grayscale')}>B/W</button>
        </div>
        <button class="fe-download" onclick={downloadEdited}><IconDownload size={14}/> Save as PNG</button>
      </div>
    </div>
  {/if}

{:else if kind === 'epub'}
  <div class="fe-empty"><span>EPUB reader — coming soon</span></div>
{/if}

<style>
  /* ── Text Editor ── */
  .te-root {
    display: flex; flex-direction: column;
    width: 100%; height: 100%; min-height: 0; overflow: hidden;
  }
  .te-bar {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px; border-bottom: 1px solid rgba(255,255,255,.07);
    background: rgba(0,0,0,.3); flex-shrink: 0; flex-wrap: wrap;
  }
  .te-filename {
    font-size: 12.5px; font-weight: 600; color: rgba(255,255,255,.75);
    font-family: 'Geist Mono', monospace;
  }
  .te-dirty { color: #f59e0b; font-size: 18px; line-height: 1; margin-left: -6px; }
  .te-lang {
    font-size: 10.5px; color: rgba(255,255,255,.25); font-family: 'Geist Mono', monospace;
    text-transform: uppercase; letter-spacing: .05em; margin-left: auto;
  }
  .te-view-tabs { display: flex; gap: 2px; }
  .te-vt {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 500;
    border: 1px solid rgba(255,255,255,.1); background: transparent;
    color: rgba(255,255,255,.45); cursor: pointer; transition: .13s;
  }
  .te-vt:hover { color: rgba(255,255,255,.8); }
  .te-vt.active { background: rgba(255,255,255,.1); color: #fff; border-color: rgba(255,255,255,.2); }
  .te-save {
    display: flex; align-items: center; gap: 5px;
    padding: 5px 12px; border-radius: 7px; font-size: 12px; font-weight: 500;
    border: none; background: var(--accent, #6366f1); color: #fff;
    cursor: pointer; transition: opacity .15s; font-family: 'Geist', sans-serif;
  }
  .te-save:disabled { opacity: .4; cursor: default; }
  .te-save:not(:disabled):hover { opacity: .85; }
  .te-spin {
    width: 10px; height: 10px; border: 1.5px solid rgba(255,255,255,.3);
    border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite;
  }
  .te-spin-lg {
    width: 24px; height: 24px; border: 2px solid rgba(255,255,255,.1);
    border-top-color: rgba(255,255,255,.6); border-radius: 50%; animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .te-loading {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 10px; color: rgba(255,255,255,.3); font-size: 13px;
  }
  .te-err {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: #f87171; font-size: 13px; padding: 20px;
  }
  .te-content {
    flex: 1; display: flex; min-height: 0; overflow: hidden;
  }
  .te-content.split { gap: 0; }
  .te-editor-pane {
    flex: 1; min-height: 0; min-width: 0;
  }
  .te-content.split .te-editor-pane {
    flex: 1; border-right: 1px solid rgba(255,255,255,.07);
  }
  .te-preview-pane {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 20px 28px; background: #1e1e1e;
  }
  .te-content:not(.split) .te-preview-pane { flex: 1; }

  /* Markdown body styles */
  .md-body { color: rgba(255,255,255,.85); font-size: 14px; line-height: 1.7; }
  :global(.md-body h1),:global(.md-body h2),:global(.md-body h3) {
    color: #fff; margin: 1.2em 0 .5em; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,.08);
    padding-bottom: .3em;
  }
  :global(.md-body code) {
    background: rgba(255,255,255,.08); padding: 1px 6px; border-radius: 4px;
    font-family: 'Geist Mono', monospace; font-size: .9em;
  }
  :global(.md-body pre) {
    background: rgba(0,0,0,.4); border-radius: 8px; padding: 14px 18px; overflow-x: auto;
  }
  :global(.md-body pre code) { background: none; padding: 0; }
  :global(.md-body a) { color: #818cf8; }
  :global(.md-body blockquote) {
    border-left: 3px solid rgba(255,255,255,.2); margin: 0; padding-left: 16px;
    color: rgba(255,255,255,.5);
  }
  :global(.md-body table) { width: 100%; border-collapse: collapse; }
  :global(.md-body td), :global(.md-body th) {
    border: 1px solid rgba(255,255,255,.1); padding: 6px 12px;
  }
  :global(.md-body th) { background: rgba(255,255,255,.05); }
  :global(.md-body img) { max-width: 100%; border-radius: 8px; }
  :global(.md-body hr) { border: none; border-top: 1px solid rgba(255,255,255,.1); }

  /* ── Image editor (unchanged) ── */
  .fe-empty {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    color: rgba(255,255,255,.25); font-size: 13px;
    width: 100%; height: 100%; justify-content: center;
  }
  .fe-image-editor { display: flex; width: 100%; height: 100%; max-height: 80vh; overflow: hidden; }
  .fe-canvas-wrap {
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 20px; position: relative; overflow: hidden; background: rgba(0,0,0,.3);
  }
  .fe-canvas { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; transition: opacity .2s; }
  .fe-canvas.processing { opacity: .5; }
  .fe-processing { position: absolute; color: rgba(255,255,255,.6); font-size: 13px; }
  .fe-err { color: #f87171; font-size: 12px; position: absolute; bottom: 12px; }
  .fe-sidebar {
    width: 220px; flex-shrink: 0; padding: 20px 16px;
    display: flex; flex-direction: column; gap: 12px;
    border-left: 1px solid rgba(255,255,255,.06); overflow-y: auto;
  }
  .fe-section { color: rgba(255,255,255,.35); font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; font-weight: 600; margin: 0; }
  .fe-slider-label { display: flex; flex-direction: column; gap: 5px; color: rgba(255,255,255,.6); font-size: 12px; }
  .fe-slider-label span { color: rgba(255,255,255,.35); font-family: 'Geist Mono', monospace; font-size: 11px; }
  .fe-slider-label input[type=range] { width: 100%; accent-color: var(--accent, #6366f1); }
  .fe-ops { display: flex; flex-wrap: wrap; gap: 6px; }
  .fe-op {
    padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,.1);
    background: transparent; color: rgba(255,255,255,.6); font-size: 11px; font-weight: 600;
    cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .13s;
  }
  .fe-op:hover { background: rgba(255,255,255,.08); color: #fff; }
  .fe-download {
    margin-top: auto; padding: 9px 16px; border-radius: 999px; border: none;
    background: var(--accent, #6366f1); color: #fff; font-size: 12.5px; font-weight: 500;
    font-family: 'Geist', sans-serif; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 6px; transition: opacity .15s;
  }
  .fe-download:hover { opacity: .85; }
</style>
