<!-- src/lib/tabs/Generators.svelte -->
<script lang="ts">
  const GENERATORS = [
    {
      id: 'topographic-lines',
      title: 'Topographic Lines',
      desc: 'Generate contour-style topo maps with customizable terrain and color palettes.',
      icon: '🏔️',
      banner: 'topo',
      href: '/generators/topographic-lines',
    },
    {
      id: 'technical-difficulties',
      title: 'Technical Difficulties',
      desc: 'Glitch art generator with RGB channel split, scanlines, and block corruption.',
      icon: '📺',
      banner: 2,
      href: '/generators/technical-difficulties',
    },
  ];
</script>

<div class="gen-wrap">
  <h1 class="page-title">Generators</h1>
  <p class="page-sub">Client-side creative tools. Nothing is uploaded or processed on the server.</p>

  <div class="card-grid">
    {#each GENERATORS as g}
      <a href={g.href} class="card">
        <div class="card-banner banner-{g.banner}">
          <span class="card-icon">{g.icon}</span>
        </div>
        <div class="card-body">
          <span class="card-title">{g.title}</span>
          <span class="card-desc">{g.desc}</span>
        </div>
      </a>
    {/each}
  </div>

  <p class="empty-note">yvonne said nothing's here :3</p>
</div>

<style>
  .gen-wrap { padding: 32px 40px; }
  .page-title { font-size: 22px; font-weight: 700; color: var(--text-1); margin: 0 0 6px; letter-spacing: -.4px; }
  .page-sub { color: var(--text-3); font-size: 13px; margin: 0 0 28px; }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px; margin-bottom: 40px;
  }

  .card {
    border-radius: 14px; border: 1px solid var(--border);
    background: var(--bg-2); text-decoration: none;
    overflow: hidden; transition: border-color .15s, transform .15s, box-shadow .15s;
    display: flex; flex-direction: column;
  }
  .card:hover {
    border-color: var(--border-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,.3);
  }

  .card-banner {
    height: 110px;
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .banner-topo {
    background:
      repeating-linear-gradient(0deg, transparent, transparent 12px, rgba(99,102,241,.18) 12px, rgba(99,102,241,.18) 13px),
      repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(99,102,241,.08) 18px, rgba(99,102,241,.08) 19px),
      radial-gradient(ellipse at 30% 60%, rgba(99,102,241,.3) 0%, transparent 60%),
      radial-gradient(ellipse at 70% 40%, rgba(139,92,246,.2) 0%, transparent 50%),
      linear-gradient(135deg, #0d0d1a 0%, #111 100%);
  }
  .card-icon { font-size: 36px; line-height: 1; filter: drop-shadow(0 2px 8px rgba(0,0,0,.5)); }

  .card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
  .card-title { font-size: 14px; font-weight: 600; color: var(--text-1); letter-spacing: -.2px; }
  .card-desc { font-size: 12px; color: var(--text-3); line-height: 1.5; }

  .empty-note { color: var(--text-3); font-size: 12px; font-family: 'Geist Mono', monospace; margin: 0; }

  @media (max-width: 600px) {
    .gen-wrap { padding: 16px; }
    .card-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  }
</style>
