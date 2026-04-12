<!-- src/lib/components/Login.svelte -->
<script lang="ts">
  import { IconCloud } from '@tabler/icons-svelte';

  let {
    onsuccess,
  }: {
    onsuccess: () => void;
  } = $props();

  let tokenInput = $state('');
  let tokenError = $state('');
  let tokenLoading = $state(false);

  async function submit() {
    tokenError = '';
    tokenLoading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: tokenInput.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { tokenError = d.error ?? 'Invalid token'; return; }
      onsuccess();
    } catch {
      tokenError = 'Something went wrong';
    } finally {
      tokenLoading = false;
    }
  }
</script>

<div class="centered">
  <div class="login-card">
    <div class="logo">
      <IconCloud size={40} stroke={1.5} />
      <h1>Omar's Cloud</h1>
      <p>Enter your API token to continue.</p>
    </div>
    <div class="token-form">
      <input
        class="token-input"
        type="password"
        placeholder="Paste your token..."
        bind:value={tokenInput}
        onkeydown={(e) => e.key === 'Enter' && submit()}
        disabled={tokenLoading}
      />
      <button
        class="token-btn"
        onclick={submit}
        disabled={tokenLoading || !tokenInput.trim()}
      >{tokenLoading ? '...' : 'Continue →'}</button>
    </div>
    {#if tokenError}<p class="token-error">{tokenError}</p>{/if}
  </div>
</div>

<style>
  .centered {
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 20px;
  }
  .login-card {
    display: flex; flex-direction: column; align-items: center;
    gap: 28px; padding: 44px 40px;
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 16px; width: 100%; max-width: 400px;
  }
  .logo {
    display: flex; flex-direction: column; align-items: center;
    gap: 8px; text-align: center; color: var(--text-1);
  }
  .logo h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.5px; }
  .logo p  { font-size: 13px; color: var(--text-3); }
  .token-form { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .token-input {
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 9px; padding: 11px 14px;
    color: var(--text-1); font-size: 14px;
    font-family: 'Geist Mono', monospace; outline: none;
    width: 100%; transition: border-color 0.15s;
  }
  .token-input:focus { border-color: var(--border-hover); }
  .token-input::placeholder { color: var(--text-3); }
  .token-btn {
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 9px; padding: 11px; color: var(--text-1);
    font-size: 14px; font-family: 'Geist', sans-serif;
    font-weight: 500; cursor: pointer; transition: background 0.15s;
  }
  .token-btn:hover:not(:disabled) { background: var(--border); }
  .token-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .token-error { font-size: 12px; color: var(--red); }
</style>
