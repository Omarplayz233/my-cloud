<!-- src/lib/tabs/Stats.svelte -->
<script lang="ts">
  import { onMount } from "svelte";

  let { apiKey }: { apiKey: string } = $props();

  type FileRecord = {
    fileName: string;
    type: string;
    totalBytes: number;
    time: string;
    folderId?: string;
  };

  let files     = $state<FileRecord[]>([]);
  let folders   = $state<number>(0);
  let loading   = $state(true);
  let error     = $state<string | null>(null);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalBytes   = $derived(files.reduce((s, f) => s + (f.totalBytes ?? 0), 0));
  const totalFiles   = $derived(files.length);

  // Uploads by day (last 30 days)
  const uploadsByDay = $derived(() => {
    const map = new Map<string, { count: number; bytes: number }>();
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    for (const f of files) {
      const t = new Date(f.time).getTime();
      if (t < cutoff) continue;
      const day = f.time.slice(0, 10);
      const cur = map.get(day) ?? { count: 0, bytes: 0 };
      map.set(day, { count: cur.count + 1, bytes: cur.bytes + (f.totalBytes ?? 0) });
    }
    // Fill gaps
    const result: { day: string; count: number; bytes: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const day = d.toISOString().slice(0, 10);
      const v = map.get(day) ?? { count: 0, bytes: 0 };
      result.push({ day, ...v });
    }
    return result;
  });

  // File type breakdown
  const typeBreakdown = $derived(() => {
    const map = new Map<string, { count: number; bytes: number }>();
    for (const f of files) {
      const cat = typeCategory(f.type, f.fileName);
      const cur = map.get(cat) ?? { count: 0, bytes: 0 };
      map.set(cat, { count: cur.count + 1, bytes: cur.bytes + (f.totalBytes ?? 0) });
    }
    return [...map.entries()]
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([cat, v]) => ({ cat, ...v }));
  });

  // Biggest files
  const biggestFiles = $derived(
    [...files].sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0)).slice(0, 10)
  );

  // Most recent uploads
  const recentFiles = $derived(
    [...files].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10)
  );

  function typeCategory(type: string, fileName: string): string {
    if (type.startsWith("image/")) return "Images";
    if (type.startsWith("video/")) return "Videos";
    if (type.startsWith("audio/")) return "Audio";
    if (type === "application/pdf") return "PDFs";
    if (type.startsWith("text/") || type.includes("json") || type.includes("javascript") || type.includes("typescript")) return "Code / Text";
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (["zip","tar","gz","7z","rar"].includes(ext)) return "Archives";
    if (["ttf","otf","woff","woff2"].includes(ext)) return "Fonts";
    if (["kdbx","enpassdb"].includes(ext)) return "Vaults";
    return "Other";
  }

  function fmtBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function shortDay(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  onMount(async () => {
    try {
      const res = await fetch(`/api/telegram/ls?api_key=${encodeURIComponent(apiKey)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      files   = data.files ?? [];
      folders = (data.folders ?? []).length;
    } catch (e: any) {
      error = e?.message ?? "Failed to load stats";
    } finally {
      loading = false;
    }
  });

  // ── Chart helpers ──────────────────────────────────────────────────────────
  const chartDays = $derived(uploadsByDay());
  const maxCount  = $derived(Math.max(1, ...chartDays.map(d => d.count)));
  const maxBytes  = $derived(Math.max(1, ...chartDays.map(d => d.bytes)));
  const typeData  = $derived(typeBreakdown());
  const totalTypeBytes = $derived(typeData.reduce((s, t) => s + t.bytes, 0) || 1);

  const TYPE_COLORS: Record<string, string> = {
    "Images": "var(--accent)",
    "Videos": "#f472b6",
    "Audio": "#34d399",
    "PDFs": "#fb923c",
    "Code / Text": "#38bdf8",
    "Archives": "#fbbf24",
    "Fonts": "#a78bfa",
    "Vaults": "#f87171",
    "Other": "var(--text-3)",
  };
</script>

<div class="stats-root">
  <div class="stats-header">
    <h1 class="stats-title">Storage Stats</h1>
    {#if !loading && !error}
      <span class="stats-sub">Based on {totalFiles} files · {fmtBytes(totalBytes)} total</span>
    {/if}
  </div>

  {#if loading}
    <div class="center"><div class="spinner"></div></div>
  {:else if error}
    <div class="center err">{error}</div>
  {:else}

    <!-- Summary cards -->
    <div class="cards">
      <div class="card">
        <span class="card-val">{totalFiles}</span>
        <span class="card-label">Total files</span>
      </div>
      <div class="card">
        <span class="card-val">{folders}</span>
        <span class="card-label">Total folders</span>
      </div>
      <div class="card">
        <span class="card-val">{fmtBytes(totalBytes)}</span>
        <span class="card-label">Total size</span>
      </div>
      <div class="card">
        <span class="card-val">{chartDays.filter(d => d.count > 0).length}</span>
        <span class="card-label">Active days (30d)</span>
      </div>
      <div class="card">
        <span class="card-val">{fmtBytes(chartDays.reduce((s, d) => s + d.bytes, 0))}</span>
        <span class="card-label">Uploaded (30d)</span>
      </div>
    </div>

    <!-- Upload activity chart -->
    <section class="section">
      <h2 class="section-title">Upload activity — last 30 days</h2>
      <div class="bar-chart">
        {#each chartDays as day, i}
          <div class="bar-col">
            <div class="bar-wrap" title="{day.count} file{day.count !== 1 ? 's' : ''} · {fmtBytes(day.bytes)} on {fmtDate(day.day)}">
              <div class="bar" style="height:{(day.count / maxCount) * 100}%"></div>
            </div>
            {#if i === 0 || i === 14 || i === 29 || day.count === Math.max(...chartDays.map(d => d.count))}
              <span class="bar-label">{shortDay(day.day)}</span>
            {:else}
              <span class="bar-label"></span>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Type breakdown -->
    <section class="section">
      <h2 class="section-title">File types</h2>
      <div class="type-list">
        {#each typeData as t}
          <div class="type-row">
            <span class="type-dot" style="background:{TYPE_COLORS[t.cat] ?? 'var(--text-3)'}"></span>
            <span class="type-name">{t.cat}</span>
            <span class="type-count">{t.count} file{t.count !== 1 ? 's' : ''}</span>
            <div class="type-bar-wrap">
              <div class="type-bar" style="width:{(t.bytes / totalTypeBytes) * 100}%; background:{TYPE_COLORS[t.cat] ?? 'var(--text-3)'}"></div>
            </div>
            <span class="type-bytes">{fmtBytes(t.bytes)}</span>
          </div>
        {/each}
      </div>
    </section>

    <div class="two-col">
      <!-- Biggest files -->
      <section class="section">
        <h2 class="section-title">Biggest files</h2>
        <div class="file-list">
          {#each biggestFiles as f, i}
            <div class="file-row">
              <span class="file-rank">{i + 1}</span>
              <span class="file-name" title={f.fileName}>{f.fileName}</span>
              <span class="file-size">{fmtBytes(f.totalBytes)}</span>
            </div>
          {/each}
        </div>
      </section>

      <!-- Recent uploads -->
      <section class="section">
        <h2 class="section-title">Recent uploads</h2>
        <div class="file-list">
          {#each recentFiles as f}
            <div class="file-row">
              <span class="file-name" title={f.fileName}>{f.fileName}</span>
              <span class="file-size">{fmtDate(f.time)}</span>
            </div>
          {/each}
        </div>
      </section>
    </div>

  {/if}
</div>

<style>
  .stats-root {
    padding: 32px 28px;
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .stats-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stats-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-1);
    margin: 0;
  }
  .stats-sub {
    font-size: 12px;
    color: var(--text-3);
    font-family: "Geist Mono", monospace;
  }

  /* ── Cards ── */
  .cards {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
  }
  .card {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .card-val {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-1);
    font-family: "Geist Mono", monospace;
  }
  .card-label {
    font-size: 11px;
    color: var(--text-3);
  }

  /* ── Section ── */
  .section {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-2);
    margin: 0;
  }

  /* ── Bar chart ── */
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 120px;
  }
  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
  }
  .bar-wrap {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
    cursor: default;
  }
  .bar {
    width: 100%;
    background: var(--accent);
    border-radius: 2px 2px 0 0;
    min-height: 2px;
    transition: opacity 0.1s;
    opacity: 0.8;
  }
  .bar-wrap:hover .bar { opacity: 1; }
  .bar-label {
    font-size: 9px;
    color: var(--text-3);
    font-family: "Geist Mono", monospace;
    white-space: nowrap;
    height: 14px;
  }

  /* ── Type breakdown ── */
  .type-list { display: flex; flex-direction: column; gap: 8px; }
  .type-row {
    display: grid;
    grid-template-columns: 10px 100px 70px 1fr 70px;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }
  .type-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .type-name { color: var(--text-2); }
  .type-count { color: var(--text-3); font-family: "Geist Mono", monospace; font-size: 11px; }
  .type-bar-wrap { background: var(--bg-3); border-radius: 2px; height: 4px; overflow: hidden; }
  .type-bar { height: 100%; border-radius: 2px; transition: width 0.3s; }
  .type-bytes { color: var(--text-3); font-family: "Geist Mono", monospace; font-size: 11px; text-align: right; }

  /* ── Two col ── */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* ── File list ── */
  .file-list { display: flex; flex-direction: column; gap: 6px; }
  .file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .file-row:last-child { border-bottom: none; }
  .file-rank { color: var(--text-3); font-family: "Geist Mono", monospace; min-width: 16px; font-size: 11px; }
  .file-name { flex: 1; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-size { color: var(--text-3); font-family: "Geist Mono", monospace; font-size: 11px; flex-shrink: 0; }

  /* ── Misc ── */
  .center { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--text-3); }
  .err { color: var(--red); }
  .spinner {
    width: 24px; height: 24px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 700px) {
    .cards { grid-template-columns: 1fr 1fr; }
    .two-col { grid-template-columns: 1fr; }
    .type-row { grid-template-columns: 10px 80px 60px 1fr; }
    .type-bytes { display: none; }
  }
</style>
