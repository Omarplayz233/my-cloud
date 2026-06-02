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
    lastAccessed?: string;
    accessCount?: number;
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
    const result: { day: string; count: number; bytes: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const day = d.toISOString().slice(0, 10);
      const v = map.get(day) ?? { count: 0, bytes: 0 };
      result.push({ day, ...v });
    }
    return result;
  });

  // Upload heatmap (last 90 days, GitHub-style)
  const heatmapData = $derived(() => {
    const map = new Map<string, number>();
    const now = Date.now();
    const cutoff = now - 90 * 24 * 60 * 60 * 1000;
    for (const f of files) {
      const t = new Date(f.time).getTime();
      if (t < cutoff) continue;
      const day = f.time.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    // Build 13 weeks x 7 days grid
    const weeks: { day: string; count: number; col: number; row: number }[][] = [];
    const startDate = new Date(now - 89 * 24 * 60 * 60 * 1000);
    // Align to Sunday
    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);

    let currentWeek: { day: string; count: number; col: number; row: number }[] = [];
    for (let i = 0; i < 91; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dayStr = d.toISOString().slice(0, 10);
      const col = Math.floor(i / 7);
      const row = d.getDay();
      currentWeek.push({ day: dayStr, count: map.get(dayStr) ?? 0, col, row });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);
    return weeks;
  });

  const maxHeatmap = $derived(Math.max(1, ...heatmapData().flat().map(d => d.count)));

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

  // Most accessed files
  const mostAccessed = $derived(
    [...files].filter(f => (f.accessCount ?? 0) > 0).sort((a, b) => (b.accessCount ?? 0) - (a.accessCount ?? 0)).slice(0, 10)
  );

  // Storage growth (cumulative over time, sampled by day)
  const storageGrowth = $derived(() => {
    const sorted = [...files].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const points: { day: string; bytes: number }[] = [];
    let cumulative = 0;
    const byDay = new Map<string, number>();
    for (const f of sorted) {
      const day = f.time.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + (f.totalBytes ?? 0));
    }
    for (const [day, bytes] of byDay) {
      cumulative += bytes;
      points.push({ day, bytes: cumulative });
    }
    // Fill gaps
    if (points.length > 0) {
      const start = new Date(points[0].day);
      const end = new Date();
      const filled: { day: string; bytes: number }[] = [];
      let lastVal = 0;
      let pIdx = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayStr = d.toISOString().slice(0, 10);
        while (pIdx < points.length && points[pIdx].day <= dayStr) {
          lastVal = points[pIdx].bytes;
          pIdx++;
        }
        filled.push({ day: dayStr, bytes: lastVal });
      }
      return filled;
    }
    return points;
  });

  // Daily summary (today)
  const todaySummary = $derived(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayFiles = files.filter(f => f.time.startsWith(today));
    return {
      count: todayFiles.length,
      bytes: todayFiles.reduce((s, f) => s + (f.totalBytes ?? 0), 0),
    };
  });

  // Weekly summary (last 7 days)
  const weeklySummary = $derived(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const weekFiles = files.filter(f => new Date(f.time).getTime() >= weekAgo);
    return {
      count: weekFiles.length,
      bytes: weekFiles.reduce((s, f) => s + (f.totalBytes ?? 0), 0),
    };
  });

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

  function heatmapColor(count: number): string {
    if (count === 0) return "var(--bg-3)";
    const ratio = count / maxHeatmap;
    if (ratio < 0.25) return "#1a3a2a";
    if (ratio < 0.5) return "#22663a";
    if (ratio < 0.75) return "#2ea44f";
    return "#39d353";
  }

  // ── SVG Donut chart ───────────────────────────────────────────────────
  const donutData = $derived(() => {
    const data = typeBreakdown();
    const total = data.reduce((s, d) => s + d.bytes, 0) || 1;
    let cumPercent = 0;
    return data.map(d => {
      const percent = d.bytes / total;
      const startAngle = cumPercent * Math.PI * 2 - Math.PI / 2;
      cumPercent += percent;
      const endAngle = cumPercent * Math.PI * 2 - Math.PI / 2;
      return { ...d, percent, startAngle, endAngle };
    });
  });

  function donutPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const sweep = endAngle - startAngle;
    if (sweep >= Math.PI * 2 - 0.001) {
      // Full circle - draw two half arcs
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(startAngle + Math.PI);
      const y2 = cy + r * Math.sin(startAngle + Math.PI);
      return `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2} A ${r} ${r} 0 1 1 ${x1} ${y1}`;
    }
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = sweep > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  // ── SVG Line chart ────────────────────────────────────────────────────
  const growthPoints = $derived(() => {
    const data = storageGrowth();
    if (data.length === 0) return "";
    const maxBytes = Math.max(1, ...data.map(d => d.bytes));
    const W = 400;
    const H = 140;
    const padX = 30;
    const padRight = 5;
    const padTop = 10;
    const padBot = 28;
    const points = data.map((d, i) => {
      const x = padX + (i / Math.max(1, data.length - 1)) * (W - padX - padRight);
      const y = H - padBot - (d.bytes / maxBytes) * (H - padTop - padBot);
      return `${x},${y}`;
    });
    return points.join(" ");
  });

  const growthAreaPath = $derived(() => {
    const data = storageGrowth();
    if (data.length === 0) return "";
    const maxBytes = Math.max(1, ...data.map(d => d.bytes));
    const W = 400;
    const H = 140;
    const padX = 30;
    const padRight = 5;
    const padTop = 10;
    const padBot = 28;
    let path = `M ${padX},${H - padBot}`;
    for (let i = 0; i < data.length; i++) {
      const x = padX + (i / Math.max(1, data.length - 1)) * (W - padX - padRight);
      const y = H - padBot - (data[i].bytes / maxBytes) * (H - padTop - padBot);
      path += ` L ${x},${y}`;
    }
    path += ` L ${padX + ((data.length - 1) / Math.max(1, data.length - 1)) * (W - padX - padRight)},${H - padBot} Z`;
    return path;
  });

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
        <span class="card-val">{todaySummary().count}</span>
        <span class="card-label">Uploaded today</span>
      </div>
      <div class="card">
        <span class="card-val">{fmtBytes(todaySummary().bytes)}</span>
        <span class="card-label">Today's bytes</span>
      </div>
      <div class="card">
        <span class="card-val">{weeklySummary().count}</span>
        <span class="card-label">This week</span>
      </div>
      <div class="card">
        <span class="card-val">{fmtBytes(weeklySummary().bytes)}</span>
        <span class="card-label">Week's bytes</span>
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

    <!-- Upload heatmap (GitHub-style) -->
    <section class="section">
      <h2 class="section-title">Upload heatmap — last 90 days</h2>
      <div class="heatmap-wrap">
        <div class="heatmap-grid">
          <span class="heatmap-day-label" style="grid-column:1;grid-row:2">Mon</span>
          <span class="heatmap-day-label" style="grid-column:1;grid-row:4">Wed</span>
          <span class="heatmap-day-label" style="grid-column:1;grid-row:6">Fri</span>
          {#each heatmapData() as week}
            {#each week as day}
              <div class="heatmap-cell" style="background:{heatmapColor(day.count)};grid-column:{day.col + 2};grid-row:{day.row + 1};" title="{day.count} uploads on {day.day}"></div>
            {/each}
          {/each}
        </div>
        <div class="heatmap-legend">
          <span class="heatmap-legend-label">Less</span>
          <div class="heatmap-cell" style="background:var(--bg-3)"></div>
          <div class="heatmap-cell" style="background:#1a3a2a"></div>
          <div class="heatmap-cell" style="background:#22663a"></div>
          <div class="heatmap-cell" style="background:#2ea44f"></div>
          <div class="heatmap-cell" style="background:#39d353"></div>
          <span class="heatmap-legend-label">More</span>
        </div>
      </div>
    </section>

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

    <div class="two-col">
      <!-- Storage growth line chart -->
      <section class="section">
        <h2 class="section-title">Storage growth</h2>
        {#if storageGrowth().length > 1}
          {@const growthData = storageGrowth()}
          {@const maxGrowthBytes = Math.max(1, ...growthData.map(d => d.bytes))}
          <svg viewBox="0 0 400 140" class="growth-chart">
            <defs>
              <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
              </linearGradient>
            </defs>
            <!-- Y axis labels -->
            <text x="2" y="12" fill="var(--text-3)" font-size="7" font-family="Geist Mono, monospace">{fmtBytes(maxGrowthBytes)}</text>
            <text x="2" y="60" fill="var(--text-3)" font-size="7" font-family="Geist Mono, monospace">{fmtBytes(maxGrowthBytes / 2)}</text>
            <text x="2" y="110" fill="var(--text-3)" font-size="7" font-family="Geist Mono, monospace">0</text>
            <!-- Grid lines -->
            <line x1="30" y1="10" x2="395" y2="10" stroke="var(--border)" stroke-width="0.5" opacity="0.5"/>
            <line x1="30" y1="58" x2="395" y2="58" stroke="var(--border)" stroke-width="0.5" opacity="0.5"/>
            <line x1="30" y1="106" x2="395" y2="106" stroke="var(--border)" stroke-width="0.5" opacity="0.5"/>
            <!-- X axis month labels -->
            {#each growthData as d, i}
              {#if i === 0 || d.day.slice(8,10) === '01' || i === growthData.length - 1}
                <text x={30 + (i / Math.max(1, growthData.length - 1)) * 365} y="132" fill="var(--text-3)" font-size="7" font-family="Geist Mono, monospace" text-anchor="middle">{d.day.slice(5,7)}/{d.day.slice(8,10)}</text>
              {/if}
            {/each}
            <path d={growthAreaPath()} fill="url(#growthGrad)"/>
            <polyline points={growthPoints()} fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        {:else}
          <div class="chart-empty">Not enough data yet</div>
        {/if}
      </section>

      <!-- Donut chart for file types -->
      <section class="section">
        <h2 class="section-title">File type distribution</h2>
        <div class="donut-wrap">
          <svg viewBox="0 0 120 120" class="donut-chart">
            {#each donutData() as seg, i}
              <path d={donutPath(60, 60, 42, seg.startAngle, seg.endAngle)} fill="none" stroke={TYPE_COLORS[seg.cat] ?? 'var(--text-3)'} stroke-width="20" stroke-linecap="round"/>
            {/each}
            <circle cx="60" cy="60" r="30" fill="var(--bg-2)"/>
            <text x="60" y="57" text-anchor="middle" fill="var(--text-1)" font-size="14" font-weight="700" font-family="Geist Mono, monospace">{totalFiles}</text>
            <text x="60" y="71" text-anchor="middle" fill="var(--text-3)" font-size="7">files</text>
          </svg>
          <div class="donut-legend">
            {#each donutData() as seg}
              <div class="donut-legend-item">
                <span class="donut-legend-dot" style="background:{TYPE_COLORS[seg.cat] ?? 'var(--text-3)'}"></span>
                <span class="donut-legend-name">{seg.cat}</span>
                <span class="donut-legend-pct">{Math.round(seg.percent * 100)}%</span>
              </div>
            {/each}
          </div>
        </div>
      </section>
    </div>

    <!-- Type breakdown bars -->
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

    {#if mostAccessed.length > 0}
      <section class="section">
        <h2 class="section-title">Most accessed files</h2>
        <div class="file-list">
          {#each mostAccessed as f, i}
            <div class="file-row">
              <span class="file-rank">{i + 1}</span>
              <span class="file-name" title={f.fileName}>{f.fileName}</span>
              <span class="file-size">{f.accessCount ?? 0} views</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

  {/if}
</div>

<style>
  .stats-root {
    padding: 32px 28px;
    max-width: 1000px;
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
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
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

  /* ── Heatmap ── */
  .heatmap-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .heatmap-grid {
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    grid-template-rows: repeat(7, 1fr);
    gap: 3px;
  }
  .heatmap-cell {
    aspect-ratio: 1;
    border-radius: 2px;
    min-width: 12px;
    min-height: 12px;
  }
  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
  }
  .heatmap-legend-label {
    font-size: 9px;
    color: var(--text-3);
    margin: 0 2px;
  }
  .heatmap-day-label {
    font-size: 9px;
    color: var(--text-3);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 4px;
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

  /* ── Two col ── */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* ── Donut ── */
  .donut-wrap { display: flex; align-items: center; gap: 16px; }
  .donut-chart { width: 120px; height: 120px; flex-shrink: 0; }
  .donut-legend { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .donut-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; }
  .donut-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .donut-legend-name { flex: 1; color: var(--text-2); }
  .donut-legend-pct { color: var(--text-3); font-family: "Geist Mono", monospace; font-size: 10px; }

  /* ── Growth chart ── */
  .growth-chart { width: 100%; height: 120px; }
  .chart-empty { text-align: center; color: var(--text-3); font-size: 11px; padding: 20px; }

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
    .stats-root {
      padding: 16px 12px 80px;
      gap: 16px;
    }
    .stats-title { font-size: 17px; }
    .cards {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .card { padding: 12px; }
    .card-val { font-size: 18px; }
    .two-col { grid-template-columns: 1fr; }
    .section { padding: 14px; }
    .type-row {
      grid-template-columns: 10px 1fr auto auto;
      gap: 8px;
    }
    .type-bar-wrap { display: none; }
    .type-bytes { display: block; }
    .bar-chart { height: 80px; gap: 2px; }
    .bar-label { font-size: 8px; }
    .file-row { font-size: 11px; }
    .file-rank { min-width: 14px; }
    .donut-wrap { flex-direction: column; align-items: center; }
    .heatmap-grid { grid-template-columns: repeat(13, 1fr); }
    .heatmap-day-label { display: none; }
  }
</style>
