<script lang="ts">
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>{$page.status} — Omar's Cloud</title>
</svelte:head>

<div class="root">
  <div class="card">
    <div class="glitch-wrap">
      <span class="status" aria-hidden="true">{$page.status}</span>
      <span class="status status-ghost" aria-hidden="true">{$page.status}</span>
      <span class="status status-ghost2" aria-hidden="true">{$page.status}</span>
    </div>

    <div class="divider"></div>

    <p class="message">
      {#if $page.status === 404}
        This file, folder, or page doesn't exist — or it's not public.
      {:else if $page.status === 403}
        You don't have permission to access this.
      {:else if $page.status === 500}
        Something went wrong on our end.
      {:else}
        {$page.error?.message ?? 'Something went wrong.'}
      {/if}
    </p>

    <div class="actions">
      <a href="/" class="btn-primary">Go home</a>
      <button class="btn-ghost" onclick={() => history.back()}>Go back</button>
    </div>

    <!-- Decorative grid -->
    <div class="grid-bg" aria-hidden="true">
      {#each Array(80) as _}
        <div class="grid-cell"></div>
      {/each}
    </div>
  </div>
</div>

<style>
  :global(:root) {
    --bg-1: #080808; --bg-2: #0e0e0e; --bg-3: #141414;
    --text-1: #e2e2e2; --text-2: #666; --text-3: #333;
    --border: #1a1a1a; --accent: #6366f1;
  }
  :global(*) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    background: var(--bg-1); color: var(--text-1);
    font-family: 'Geist', system-ui, sans-serif;
    min-height: 100vh;
  }

  .root {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }

  .card {
    position: relative; overflow: hidden;
    width: min(480px, 100%);
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 52px 44px 44px;
    text-align: center;
    box-shadow: 0 0 0 1px rgba(255,255,255,.03) inset, 0 40px 80px rgba(0,0,0,.6);
  }

  /* Glitchy status number */
  .glitch-wrap {
    position: relative; display: inline-block;
    margin-bottom: 24px;
  }
  .status {
    display: block;
    font-size: clamp(72px, 18vw, 110px);
    font-weight: 800;
    letter-spacing: -.04em;
    line-height: 1;
    color: var(--text-1);
    font-variant-numeric: tabular-nums;
  }
  .status-ghost {
    position: absolute; inset: 0;
    color: var(--accent);
    opacity: .18;
    animation: glitch1 3.5s infinite;
    clip-path: polygon(0 30%, 100% 30%, 100% 50%, 0 50%);
  }
  .status-ghost2 {
    position: absolute; inset: 0;
    color: #f87171;
    opacity: .12;
    animation: glitch2 3.5s infinite;
    clip-path: polygon(0 60%, 100% 60%, 100% 75%, 0 75%);
  }

  @keyframes glitch1 {
    0%, 90%, 100% { transform: translate(0); }
    92%           { transform: translate(-3px, 1px); }
    94%           { transform: translate(3px, -1px); }
    96%           { transform: translate(-2px, 0); }
    98%           { transform: translate(2px, 1px); }
  }
  @keyframes glitch2 {
    0%, 88%, 100% { transform: translate(0); }
    90%           { transform: translate(3px, -1px); }
    93%           { transform: translate(-3px, 1px); }
    97%           { transform: translate(1px, -1px); }
  }

  .divider {
    width: 40px; height: 2px;
    background: linear-gradient(90deg, var(--accent), transparent);
    border-radius: 2px;
    margin: 0 auto 20px;
  }

  .message {
    font-size: 14px; color: var(--text-2); line-height: 1.6;
    margin-bottom: 32px; max-width: 300px; margin-left: auto; margin-right: auto;
  }

  .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 20px; border-radius: 9px;
    background: var(--accent); color: #fff;
    font-size: 13px; font-weight: 500; font-family: inherit;
    text-decoration: none; border: none; cursor: pointer;
    transition: opacity .14s, transform .14s;
  }
  .btn-primary:hover { opacity: .88; transform: translateY(-1px); }

  .btn-ghost {
    display: inline-flex; align-items: center;
    padding: 9px 20px; border-radius: 9px;
    background: transparent; color: var(--text-2);
    border: 1px solid var(--border); font-size: 13px;
    font-family: inherit; cursor: pointer;
    transition: .14s;
  }
  .btn-ghost:hover { border-color: #333; color: var(--text-1); background: var(--bg-3); }

  /* Decorative grid background */
  .grid-bg {
    position: absolute; inset: 0; z-index: 0;
    display: grid; grid-template-columns: repeat(10, 1fr);
    pointer-events: none;
  }
  .grid-cell {
    border-right: 1px solid rgba(255,255,255,.025);
    border-bottom: 1px solid rgba(255,255,255,.025);
  }
  .card > *:not(.grid-bg) { position: relative; z-index: 1; }

  @media (max-width: 480px) {
    .card { padding: 40px 24px 32px; border-radius: 16px; }
  }
</style>
