import type { RequestHandler } from './$types';
import { getPublicFileByPath, getPublicFolderByPath } from '$lib/telegramStorage';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELE_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const EXT_MIME: Record<string, string> = {
  gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', m4v: 'video/mp4',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
  aac: 'audio/aac', m4a: 'audio/mp4', opus: 'audio/opus',
  pdf: 'application/pdf',
  txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'text/javascript',
};

function mimeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? (EXT_MIME[ext] ?? null) : null;
}

function isPreviewable(type: string): boolean {
  if (type.startsWith('image/')) return true;
  if (type.startsWith('video/')) return true;
  if (type.startsWith('audio/')) return true;
  if (type === 'application/pdf') return true;
  if (type.startsWith('text/')) return true;
  return false;
}

const TEXT_EXTS = new Set([
  // Plain text & docs
  'txt','text','readme','license','notice','authors','changelog','changes',
  'contributing','copying','credits','faq','install','news','thanks','todo',
  'md','markdown','mdown','mkd','mkdn','mdx','rst','adoc','asciidoc','asc',
  'org','textile','wiki','creole','pod','rdoc','nfo','diz',

  // Web
  'html','htm','xhtml','html5','shtml','shtm',
  'css','scss','sass','less','styl','stylus','pcss','postcss',
  'js','mjs','cjs','jsx','es','es6',
  'ts','tsx','cts','mts',
  'svelte','vue','astro','njk','nunjucks','twig','jinja','jinja2',
  'hbs','handlebars','mustache','ejs','erb','haml','slim','pug','jade',
  'liquid','latte','blade',

  // Data & config
  'json','json5','jsonc','jsonl','ndjson',
  'yaml','yml','eyaml',
  'toml','tml',
  'xml','xsl','xslt','xsd','wsdl','dtd','plist','resx',
  'ini','cfg','conf','config','cnf','properties','prefs','env','env.example',
  'editorconfig','gitconfig','gitattributes','gitmodules','gitignore',
  'npmrc','nvmrc','yarnrc','babelrc','browserslistrc','jshintrc','jestrc',
  'prettierrc','eslintrc','stylelintrc','tslintrc','flowconfig','lintstagedrc',
  'huskyrc','lernajson','vscodejson',
  'csv','tsv','psv','ssv','dsv',
  'ldif','vcf','ics','vcard',
  'rss','atom','opml',

  // Systems & infra
  'dockerfile','containerfile',
  'tf','tfvars','hcl',
  'nomad','sentinel',
  'k8s','kustomization',
  'vagrantfile','procfile','heroku',
  'nginx','apache','htaccess','htpasswd',
  'makefile','mk','gnumakefile','bsdmakefile',
  'cmake','cmakecache','cmakeinstall',
  'rakefile','gemfile','guardfile','jarfile','podfile',
  'build','bazel','starlark','bzl','buck',
  'nix','flake',
  'meson',
  'gradle','gradlew',
  'ant','maven','pom',
  'sbt',
  'cabal',
  'stack',
  'mix',
  'rebar',

  // Shell & scripting
  'sh','bash','zsh','fish','ksh','csh','tcsh','ash','dash',
  'ps1','psm1','psd1','ps1xml',
  'bat','cmd','btm',
  'vbs','vba','vbe',
  'ahk','autohotkey',
  'awk','gawk','sed',
  'expect','tcl','tk',

  // Systems languages
  'c','h',
  'cpp','cc','cxx','c++','hh','hpp','hxx','h++',
  'cs','csx',
  'fs','fsi','fsx','fsscript',
  'rs','rlib',
  'go','mod','sum',
  'zig',
  'v','vv',
  'd','di',
  'nim','nims','nimble',
  'odin',
  'pony',
  'ada','adb','ads',
  'pas','pp','inc',
  'asm','s','S','nasm','masm','gas',
  'for','f','f77','f90','f95','f03','f08','f18','fortran',

  // JVM
  'java','jav',
  'kt','kts',
  'groovy','gvy','gy','gsh',
  'scala','sc',
  'clj','cljs','cljc','edn',
  'gradle',

  // Dynamic / scripting
  'py','pyw','pyx','pxd','pxi','py3','pyi',
  'rb','rbw','rake','gemspec','rbi',
  'php','php3','php4','php5','php7','php8','phtml','phps',
  'pl','pm','pod','t','psgi',
  'lua','luac',
  'r','rmd','rnw',
  'jl',
  'nb','wl','m','wolfram',
  'matlab','m',

  // ML / functional
  'hs','lhs',
  'ml','mli','mll','mly',
  'ocaml',
  'elm',
  'ex','exs','heex','leex',
  'erl','hrl',
  'purs',
  'agda','lagda',
  'idr','lidr',
  'coq','v',

  // Lisp family
  'lisp','lsp','cl','el','scm','ss','rkt','hy','clio','wisp',
  'clojure',

  // Mobile
  'swift',
  'dart',
  'm','mm',
  'java',

  // Query & data
  'sql','ddl','dml','psql','plsql','pgsql','mysql','sqlite',
  'graphql','gql','sdl',
  'sparql',
  'cypher',
  'flux',
  'promql',

  // Markup & templating
  'tex','latex','ltx','cls','sty','bib','bst',
  'rst','rest',
  'adoc','asciidoc',
  'man','troff','roff','groff','1','2','3','4','5','6','7','8',
  'typ',

  // DevOps & CI
  'jenkinsfile',
  'travis',
  'circleci',
  'github',
  'gitlab',
  'drone',
  'bitbucket',

  // Game dev
  'gdscript','gd',
  'hlsl','glsl','frag','vert','geom','tesc','tese','comp','glslv','glslf',
  'wgsl','msl',
  'shader','cginc','cg',
  'gml',
  'inform','i7',

  // Misc PLs
  'coffee','litcoffee',
  'ls','lsc',
  'cr',
  'hx','hxml',
  'io',
  'iol',
  'st','squeak',
  'factor',
  'forth','fth','4th',
  'rexx','rex',
  'cob','cobol','cbl',
  'abap',
  'apex',
  'sol',
  'move',
  'cairo',
  'pact',
  'clarity',

  // Logs & misc text
  'log','logs',
  'diff','patch',
  'lock',
  'srt','vtt','sub','ass','ssa',
  'reg',
  'inf',
  'desktop',
  'service','timer','socket','mount',
  'pub','pem','crt','key','asc',
]);

function isTextFile(fileName: string, type: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTS.has(ext) || type.startsWith('text/') ||
         type === 'application/json' || type === 'application/javascript' ||
         type === 'application/typescript' || type === 'application/xml' ||
         type.includes('json') || type.includes('+xml');
}

function hlLang(fileName: string): string {
  const name = fileName.toLowerCase();
  const ext  = name.split('.').pop() ?? '';
  // Special filenames first
  const nameMap: Record<string,string> = {
    dockerfile:'dockerfile',containerfile:'dockerfile',
    makefile:'makefile',gnumakefile:'makefile',bsdmakefile:'makefile',
    rakefile:'ruby',gemfile:'ruby',guardfile:'ruby',podfile:'ruby',
    vagrantfile:'ruby',
    jenkinsfile:'groovy',
    '.bashrc':'bash','.zshrc':'bash','.profile':'bash',
    '.gitignore':'diff','.gitconfig':'ini','.gitattributes':'ini',
    '.editorconfig':'ini','.env':'ini','.npmrc':'ini',
    'procfile':'yaml','heroku':'yaml',
  };
  if (nameMap[name]) return nameMap[name];

  const map: Record<string,string> = {
    // JS family
    js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'javascript',
    es:'javascript',es6:'javascript',
    ts:'typescript',tsx:'typescript',cts:'typescript',mts:'typescript',
    coffee:'coffeescript',litcoffee:'coffeescript',
    ls:'livescript',
    // Web
    html:'html',htm:'html',xhtml:'html',shtml:'html',
    svelte:'html',vue:'html',astro:'html',njk:'html',twig:'twig',
    hbs:'handlebars',mustache:'handlebars',
    ejs:'javascript',erb:'ruby',haml:'haml',pug:'pug',jade:'pug',
    css:'css',scss:'scss',sass:'scss',less:'less',styl:'stylus',
    // Systems
    c:'c',h:'c',
    cpp:'cpp',cc:'cpp',cxx:'cpp',hh:'cpp',hpp:'cpp',hxx:'cpp',
    cs:'csharp',csx:'csharp',
    fs:'fsharp',fsi:'fsharp',fsx:'fsharp',
    rs:'rust',
    go:'go',
    zig:'zig',
    v:'vlang',
    d:'d',di:'d',
    nim:'nim',
    ada:'ada',adb:'ada',ads:'ada',
    pas:'delphi',pp:'delphi',
    asm:'x86asm',s:'armasm',
    for:'fortran',f:'fortran',f77:'fortran',f90:'fortran',f95:'fortran',
    // JVM
    java:'java',
    kt:'kotlin',kts:'kotlin',
    groovy:'groovy',gvy:'groovy',
    scala:'scala',sc:'scala',
    clj:'clojure',cljs:'clojure',cljc:'clojure',
    // Scripting
    py:'python',pyw:'python',pyx:'python',pyi:'python',
    rb:'ruby',rake:'ruby',gemspec:'ruby',
    php:'php',phtml:'php',
    pl:'perl',pm:'perl',
    lua:'lua',
    r:'r',rmd:'r',
    jl:'julia',
    // Shell
    sh:'bash',bash:'bash',zsh:'bash',ksh:'bash',csh:'bash',ash:'bash',
    fish:'fish',
    ps1:'powershell',psm1:'powershell',psd1:'powershell',
    bat:'dos',cmd:'dos',
    // ML / functional
    hs:'haskell',lhs:'haskell',
    ml:'ocaml',mli:'ocaml',
    elm:'elm',
    ex:'elixir',exs:'elixir',heex:'elixir',
    erl:'erlang',hrl:'erlang',
    purs:'purescript',
    // Lisp
    lisp:'lisp',lsp:'lisp',cl:'lisp',el:'lisp',
    scm:'scheme',ss:'scheme',rkt:'scheme',
    // Mobile
    swift:'swift',
    dart:'dart',
    m:'objectivec',mm:'objectivec',
    kt:'kotlin',
    // Data & config
    json:'json',json5:'json',jsonc:'json',jsonl:'json',
    yaml:'yaml',yml:'yaml',
    toml:'toml',
    xml:'xml',xsl:'xml',xslt:'xml',xsd:'xml',plist:'xml',
    ini:'ini',cfg:'ini',conf:'ini',properties:'ini',env:'ini',
    csv:'plaintext',tsv:'plaintext',
    // Query
    sql:'sql',ddl:'sql',dml:'sql',psql:'sql',plsql:'sql',
    graphql:'graphql',gql:'graphql',
    // Markup
    md:'markdown',markdown:'markdown',mdown:'markdown',mkd:'markdown',
    mdx:'markdown',
    rst:'plaintext',
    tex:'latex',latex:'latex',
    // Shaders
    glsl:'glsl',frag:'glsl',vert:'glsl',hlsl:'hlsl',wgsl:'wgsl',
    // Misc
    diff:'diff',patch:'diff',
    makefile:'makefile',mk:'makefile',
    cmake:'cmake',
    dockerfile:'dockerfile',
    tf:'hcl',tfvars:'hcl',hcl:'hcl',
    sol:'javascript',
    gd:'gdscript',
    swift:'swift',
    kt:'kotlin',
    cr:'crystal',
    hx:'haxe',
    reg:'ini',
    log:'plaintext',
    srt:'plaintext',vtt:'plaintext',
    pem:'plaintext',crt:'plaintext',pub:'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

function renderTextPage(fileName: string, content: string, fileType: string): string {
  const lang = hlLang(fileName);
  const ismd = ['md','markdown'].includes(fileName.split('.').pop()?.toLowerCase() ?? '');
  const escaped = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const size = new Blob([content]).size;
  const sizeStr = size < 1024 ? size+' B' : size < 1048576 ? (size/1024).toFixed(1)+' KB' : (size/1048576).toFixed(1)+' MB';
  const lines = content.split('\n').length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fileName}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
${ismd ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.6.1/github-markdown-dark.min.css">' : ''}
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
${ismd ? '<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>' : ''}
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #161b22; border-bottom: 1px solid #30363d; flex-wrap: wrap; }
  .bar-name { font-weight: 600; font-size: 14px; color: #e6edf3; font-family: 'SFMono-Regular', Consolas, monospace; }
  .bar-meta { font-size: 12px; color: #8b949e; }
  .bar-actions { margin-left: auto; display: flex; gap: 8px; }
  .btn { padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer; text-decoration: none; transition: border-color .15s; }
  .btn:hover { border-color: #8b949e; }
  .btn.raw { font-family: monospace; letter-spacing: .02em; }
  ${ismd
    ? ".md-wrap { max-width: 860px; margin: 0 auto; padding: 32px 24px; } .markdown-body { background: transparent !important; }"
    : ".code-wrap { position: relative; } pre { margin: 0 !important; border-radius: 0 !important; } pre code.hljs { padding: 20px 24px !important; font-size: 13px !important; line-height: 1.6 !important; font-family: \"SFMono-Regular\", Consolas, \"Liberation Mono\", Menlo, monospace !important; } .line-numbers { float: left; padding: 20px 12px 20px 20px; color: #484f58; user-select: none; font-size: 13px; line-height: 1.6; font-family: monospace; border-right: 1px solid #30363d; min-width: 48px; text-align: right; background: #0d1117; }"
  }
</style>
</head>
<body>
<div class="bar">
  <span class="bar-name">${fileName}</span>
  <span class="bar-meta">${lang} · ${lines} lines · ${sizeStr}</span>
  <div class="bar-actions">
    ${ismd ? '<button class="btn" id="toggle-btn" onclick="toggleView()">Code</button>' : ''}
    <a class="btn" href="?download=true" download="${fileName}">Download</a>
  </div>
</div>
${ismd ? `
<div id="md-view" class="md-wrap">
  <div class="markdown-body" id="md-content"></div>
</div>
<div id="code-view" style="display:none" class="code-wrap">
  <div class="line-numbers" id="line-nums"></div>
  <pre><code class="language-${lang}" id="code-block">${escaped}</code></pre>
</div>
<script>
  const raw = ${JSON.stringify(content)};
  document.getElementById('md-content').innerHTML = marked.parse(raw);
  hljs.highlightElement(document.getElementById('code-block'));
  document.getElementById('line-nums').textContent = raw.split('\n').map((_,i)=>i+1).join('\n');
  let showMd = true;
  function toggleView() {
    showMd = !showMd;
    document.getElementById('md-view').style.display = showMd ? '' : 'none';
    document.getElementById('code-view').style.display = showMd ? 'none' : '';
    document.getElementById('toggle-btn').textContent = showMd ? 'Code' : 'Preview';
  }
</script>
` : `
<div class="code-wrap">
  <div class="line-numbers" id="line-nums"></div>
  <pre><code class="language-${lang}" id="code-block">${escaped}</code></pre>
</div>
<script>
  hljs.highlightElement(document.getElementById('code-block'));
  const lines = ${lines};
  document.getElementById('line-nums').textContent = Array.from({length:lines},(_,i)=>i+1).join('\n');
</script>
`}
</body>
</html>`;
}

async function fetchMetaJson(metaFileId: string): Promise<any | null> {
  try {
    const r1 = await fetch(`${TELE_API}/getFile?file_id=${encodeURIComponent(metaFileId)}`);
    const j1 = await r1.json() as any;
    if (!j1?.ok) return null;
    const r2 = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${j1.result.file_path}`);
    return await r2.json();
  } catch { return null; }
}

async function getTgUrl(fileId: string): Promise<string | null> {
  try {
    const r = await fetch(`${TELE_API}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const j = await r.json() as any;
    if (!j?.ok) return null;
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${j.result.file_path}`;
  } catch { return null; }
}

function parseRange(header: string, total: number): { start: number; end: number } | null {
  const m = header.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;
  if (!m[1] && !m[2]) return null;
  const start = m[1] ? parseInt(m[1], 10) : Math.max(0, total - parseInt(m[2], 10));
  const end   = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0) return null;
  return { start, end };
}

async function pumpToWriter(
  body: ReadableStream<Uint8Array> | null,
  writer: WritableStreamDefaultWriter<Uint8Array>
) {
  if (!body) throw new Error('Upstream body is null');
  const reader = body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) await writer.write(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export const GET: RequestHandler = async ({ params, request, url }) => {
  const { filename } = params;
  const forceDownload = url.searchParams.get('download') === 'true';
  const rawView = url.searchParams.get('raw') === '1';

  try {
    // Folder redirect
    const folder = await getPublicFolderByPath(filename);
    if (folder) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/public/folder/${filename}` }
      });
    }

    const file = await getPublicFileByPath(filename);
    if (!file)
      return new Response('Not found', { status: 404 });

    const meta = await fetchMetaJson(file.metaFileId);
    if (!meta)
      return new Response('Could not fetch metadata', { status: 500 });

    const fileType = file.type && file.type !== "application/octet-stream" ? file.type : (mimeFromName(file.fileName) || meta.type || "application/octet-stream");
    const inline = isPreviewable(fileType) && !forceDownload;
    const disposition = `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`;

    // ── Text file viewer ──────────────────────────────────────────────────
    // Serve a styled HTML page for text/code files (unless download is forced)
    if (!forceDownload && isTextFile(file.fileName, fileType)) {
      // Fetch full content (text files are typically small)
      let textContent = '';
      try {
        if (meta.chunked && Array.isArray(meta.chunks)) {
          const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
          const bufs: Buffer[] = [];
          for (const chunk of sorted) {
            const tgUrl = await getTgUrl(chunk.file_id);
            if (!tgUrl) throw new Error('chunk url fail');
            const r = await fetch(tgUrl);
            bufs.push(Buffer.from(await r.arrayBuffer()));
          }
          textContent = Buffer.concat(bufs).toString('utf-8');
        } else {
          const tgUrl = await getTgUrl(meta.telegramFileId || file.telegramFileId);
          if (!tgUrl) throw new Error('url fail');
          const r = await fetch(tgUrl);
          textContent = await r.text();
        }
      } catch {
        // Fall through to normal streaming if text fetch fails
        textContent = '';
      }

      if (textContent !== '') {
        if (rawView) {
          return new Response(textContent, {
            status: 200,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
              'Cache-Control': 'public, max-age=60',
            },
          });
        }
        return new Response(renderTextPage(file.fileName, textContent, fileType), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=60',
          },
        });
      }
    }

    // ── Chunked file ──────────────────────────────────────────────────────
    if (meta.chunked && Array.isArray(meta.chunks)) {
      const sorted = [...meta.chunks].sort((a: any, b: any) => a.index - b.index);
      const total = file.totalBytes;
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        const range = parseRange(rangeHeader, total);
        if (!range) return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${total}` } });

        // Find which chunks cover the range and stream them
        let pos = 0;
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        (async () => {
          for (const chunk of sorted) {
            const chunkStart = pos;
            const chunkEnd = pos + chunk.size - 1;
            pos += chunk.size;

            if (chunkEnd < range.start || chunkStart > range.end) continue;

            const tgUrl = await getTgUrl(chunk.file_id);
            if (!tgUrl) { await writer.close(); return; }

            const overlapStart = Math.max(range.start, chunkStart) - chunkStart;
            const overlapEnd   = Math.min(range.end, chunkEnd) - chunkStart;

            const tgRes = await fetch(tgUrl, {
              headers: { Range: `bytes=${overlapStart}-${overlapEnd}` }
            });
            await pumpToWriter(tgRes.body, writer);
          }
          await writer.close();
        })();

        return new Response(readable, {
          status: 206,
          headers: {
            'Content-Type': fileType,
            'Content-Disposition': disposition,
            'Content-Range': `bytes ${range.start}-${range.end}/${total}`,
            'Content-Length': String(range.end - range.start + 1),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=3600',
          }
        });
      }

      // No range — stream all chunks sequentially
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      (async () => {
        for (const chunk of sorted) {
          const tgUrl = await getTgUrl(chunk.file_id);
          if (!tgUrl) { await writer.close(); return; }
          const tgRes = await fetch(tgUrl);
          await pumpToWriter(tgRes.body, writer);
        }
        await writer.close();
      })();

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': fileType,
          'Content-Disposition': disposition,
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
        }
      });
    }

    // ── Single file ───────────────────────────────────────────────────────
    const tgUrl = await getTgUrl(meta.telegramFileId || file.telegramFileId);
    if (!tgUrl) return new Response('Could not get file URL', { status: 500 });

    const total = file.totalBytes;
    const rangeHeader = request.headers.get('range');

    if (rangeHeader && total) {
      const range = parseRange(rangeHeader, total);
      if (!range) return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${total}` } });

      const tgRes = await fetch(tgUrl, {
        headers: { Range: `bytes=${range.start}-${range.end}` }
      });

      const resHeaders = new Headers();
      resHeaders.set('Content-Type', fileType);
      resHeaders.set('Content-Disposition', disposition);
      resHeaders.set('Accept-Ranges', 'bytes');
      resHeaders.set('Cache-Control', 'public, max-age=3600');
      resHeaders.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
      resHeaders.set('Content-Length', String(range.end - range.start + 1));

      return new Response(tgRes.body, { status: 206, headers: resHeaders });
    }

    const tgRes = await fetch(tgUrl);

    const resHeaders = new Headers();
    resHeaders.set('Content-Type', fileType);
    resHeaders.set('Content-Disposition', disposition);
    resHeaders.set('Accept-Ranges', 'bytes');
    resHeaders.set('Cache-Control', 'public, max-age=3600');
    // Use file.totalBytes as authoritative Content-Length — Telegram CDN often omits it,
    // which breaks video seeking (browser can't compute seek offsets without knowing total size).
    if (total) resHeaders.set('Content-Length', String(total));
    else {
      const length = tgRes.headers.get('content-length');
      if (length) resHeaders.set('Content-Length', length);
    }

    return new Response(tgRes.body, { status: 200, headers: resHeaders });

  } catch (err: any) {
    console.error('public file error:', err?.message || err);
    return new Response('Internal error', { status: 500 });
  }
};
