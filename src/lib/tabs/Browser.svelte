<!-- src/lib/tabs/Browser.svelte -->
<script lang="ts">
  type Status = "idle" | "connecting" | "connected" | "error" | "offline";

  let status = $state<Status>("idle");
  let errMsg = $state("");
  let browserName = $state("");
  let fullscreen = $state(false);
  let showKeys = $state(false);
  let vncIframeUrl = $state("");

  let containerEl: HTMLDivElement | undefined = $state();
  let iframeEl: HTMLIFrameElement | undefined = $state();

  const SOFT_KEYS = [
    { label: "Esc", key: "Escape" },
    { label: "Tab", key: "Tab" },
    { label: "⌫", key: "BackSpace" },
    { label: "Enter", key: "Return" },
    { label: "↑", key: "Up" },
    { label: "↓", key: "Down" },
    { label: "←", key: "Left" },
    { label: "→", key: "Right" },
    { label: "F5", key: "F5" },
    { label: "Ctrl+T", key: "ctrl+t" },
    { label: "Ctrl+L", key: "ctrl+l" },
    { label: "Ctrl+W", key: "ctrl+w" },
  ];

  // ── Health check ───────────────────────────────────────────────────────
  async function checkStatus() {
    status = "connecting";
    errMsg = "";
    try {
      const r = await fetch("/api/browser");
      const j = await r.json();
      if (j.alive) {
        browserName = j.browser ?? "browser";
        await connect();
      } else {
        status = "offline";
        errMsg = j.reason ?? "Colab session not running.";
      }
    } catch {
      status = "offline";
      errMsg = "Could not reach session.";
    }
  }

  // ── Connect ────────────────────────────────────────────────────────────
  async function connect() {
    status = "connecting";
    try {
      const r = await fetch("/api/browser/vnc", { method: "POST" });
      const j = await r.json();
      if (!j.vncUrl) throw new Error(j.error ?? "No VNC URL");
      vncIframeUrl = j.vncUrl;
      status = "connected";
    } catch (e: any) {
      status = "error";
      errMsg = e?.message ?? "Connection failed";
    }
  }

  function disconnect() {
    vncIframeUrl = "";
    status = "idle";
  }

  // Send a key into the iframe via postMessage (noVNC listens for these)
  function pressSoftKey(key: string) {
    iframeEl?.contentWindow?.postMessage({ type: "key", key }, "*");
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerEl?.requestFullscreen();
      fullscreen = true;
    } else {
      document.exitFullscreen();
      fullscreen = false;
    }
  }
</script>

<div class="br-root">
  <div class="br-header">
    <span class="br-title">Browser</span>
    <span class="br-sub">
      {#if status === "connected"}
        <span class="pill ok">● {browserName} · noVNC</span>
      {:else if status === "connecting"}
        <span class="pill wait">◌ connecting…</span>
      {:else if status === "offline" || status === "error"}
        <span class="pill err">✕ offline</span>
      {:else}
        <span class="pill idle">Remote browser</span>
      {/if}
    </span>
    <div class="br-actions">
      {#if status === "connected"}
        <button class="act" onclick={() => (showKeys = !showKeys)}
          >⌨ Keys</button
        >
        <button class="act" onclick={toggleFullscreen}>⛶ Fullscreen</button>
        <button class="act danger" onclick={disconnect}>✕ Disconnect</button>
      {:else if status !== "connecting"}
        <button class="act primary" onclick={checkStatus}>
          {status === "idle" ? "▶ Connect" : "↺ Retry"}
        </button>
      {/if}
    </div>
  </div>

  {#if showKeys && status === "connected"}
    <div class="softkeys">
      {#each SOFT_KEYS as sk}
        <button class="sk" onclick={() => pressSoftKey(sk.key)}
          >{sk.label}</button
        >
      {/each}
    </div>
  {/if}

  <div class="br-view" bind:this={containerEl}>
    {#if status === "idle"}
      <div class="center-state">
        <div class="state-icon">🖥</div>
        <div class="state-msg">Start a remote browser session</div>
        <div class="state-sub">
          Launch browser_session.py in Google Colab, then hit Connect.
        </div>
        <button class="act primary lg" onclick={checkStatus}>▶ Connect</button>
      </div>
    {:else if status === "connecting"}
      <div class="center-state">
        <span class="spinner"></span>
        <div class="state-msg">Connecting via noVNC…</div>
      </div>
    {:else if status === "offline" || status === "error"}
      <div class="center-state">
        <div class="state-icon err-icon">✕</div>
        <div class="state-msg">{errMsg}</div>
        <button class="act primary lg" onclick={checkStatus}>↺ Retry</button>
      </div>
    {:else if status === "connected"}
      <iframe
        bind:this={iframeEl}
        src={vncIframeUrl}
        class="vnc-frame"
        title="Remote Browser"
        allow="fullscreen"
      ></iframe>
    {/if}
  </div>
</div>

<style>
  .br-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-1);
  }
  .br-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-2);
    flex-shrink: 0;
  }
  .br-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
  }
  .br-sub {
    flex: 1;
  }
  .br-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pill {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 99px;
    border: 1px solid;
  }
  .pill.ok {
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
    background: rgba(74, 222, 128, 0.08);
  }
  .pill.wait {
    color: var(--text-3);
    border-color: var(--border);
  }
  .pill.err {
    color: #f87171;
    border-color: rgba(248, 113, 113, 0.3);
    background: rgba(248, 113, 113, 0.08);
  }
  .pill.idle {
    color: var(--text-3);
    border-color: var(--border);
  }

  .act {
    padding: 5px 12px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid var(--border);
    background: var(--bg-3);
    color: var(--text-1);
    cursor: pointer;
    transition: 0.12s;
  }
  .act:hover {
    border-color: var(--border-hover);
  }
  .act.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .act.primary:hover {
    opacity: 0.88;
  }
  .act.danger {
    color: #f87171;
    border-color: rgba(248, 113, 113, 0.35);
  }
  .act.danger:hover {
    background: rgba(248, 113, 113, 0.1);
  }
  .act.lg {
    padding: 9px 22px;
    font-size: 14px;
  }

  .softkeys {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px 12px;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .sk {
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 11px;
    font-family: monospace;
    border: 1px solid var(--border);
    background: var(--bg-3);
    color: var(--text-2);
    cursor: pointer;
    transition: 0.1s;
  }
  .sk:hover {
    color: var(--text-1);
    border-color: var(--border-hover);
  }
  .sk:active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  .br-view {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }
  .center-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px;
    text-align: center;
  }
  .state-icon {
    font-size: 48px;
  }
  .state-msg {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-1);
  }
  .state-sub {
    font-size: 13px;
    color: var(--text-3);
    max-width: 360px;
    line-height: 1.5;
  }
  .err-icon {
    color: #f87171;
    font-size: 36px;
  }

  .vnc-frame {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
    background: #000;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  :global(.br-view:fullscreen) {
    background: #000;
  }
</style>
