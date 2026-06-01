<script lang="ts">
  let { value = $bindable("#000000") }: { value: string } = $props();

  let hsl = $state({ h: 0, s: 100, l: 50 });
  let draggingWheel = $state(false);
  let draggingHue = $state(false);
  let draggingAlpha = $state(false);
  let wheelEl: HTMLDivElement;
  let hueEl: HTMLDivElement;
  let hexInput = $state(value);

  // Sync from hex → HSL
  function hexToHsl(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) { hsl = { h: 0, s: 0, l: Math.round(l * 100) }; return; }
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    hsl = { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToHex(h: number, s: number, l: number): string {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function updateFromHsl() {
    value = hslToHex(hsl.h, hsl.s, hsl.l);
    hexInput = value;
  }

  // ── Wheel interaction ───────────────────────────────────────
  function wheelPointerDown(e: PointerEvent) {
    draggingWheel = true;
    wheelEl.setPointerCapture(e.pointerId);
    wheelPick(e);
  }
  function wheelPointerMove(e: PointerEvent) { if (draggingWheel) wheelPick(e); }
  function wheelPointerUp() { draggingWheel = false; }

  function wheelPick(e: PointerEvent) {
    const rect = wheelEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const dx = e.clientX - rect.left - cx;
    const dy = e.clientY - rect.top - cy;
    const radius = Math.min(cx, cy) - 4;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, radius);
    const angle = Math.atan2(dy, dx);
    hsl.h = ((angle * 180 / Math.PI) + 360) % 360;
    hsl.s = Math.round((clampedDist / radius) * 100);
    if (hsl.l === 0) hsl.l = 50;
    updateFromHsl();
  }

  // ── Hue bar interaction ─────────────────────────────────────
  function huePointerDown(e: PointerEvent) {
    draggingHue = true;
    hueEl.setPointerCapture(e.pointerId);
    huePick(e);
  }
  function huePointerMove(e: PointerEvent) { if (draggingHue) huePick(e); }
  function huePointerUp() { draggingHue = false; }

  function huePick(e: PointerEvent) {
    const rect = hueEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    hsl.h = Math.round(x * 360);
    if (hsl.l === 0) hsl.l = 50;
    updateFromHsl();
  }

  // ── Hex input ───────────────────────────────────────────────
  function onHexChange() {
    if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
      value = hexInput;
      hexToHsl(hexInput);
    }
  }

  // ── Quick swatches ──────────────────────────────────────────
  const SWATCHES = [
    "#000000","#333333","#666666","#999999","#cccccc","#ffffff",
    "#ff0000","#ff4400","#ff8800","#ffcc00","#ffff00","#ccff00",
    "#00ff00","#00cc44","#00cccc","#0088ff","#0044ff","#0000ff",
    "#4400ff","#8800ff","#cc00ff","#ff00cc","#ff0088","#ff0044",
    "#ff6666","#ff9966","#ffcc66","#ffff66","#ccff99","#66ffcc",
    "#66ccff","#6699ff","#9966ff","#cc66ff","#ff66cc","#ff6699",
  ];

  // ── Recent colors ───────────────────────────────────────────
  let recentColors = $state<string[]>([]);

  function addToRecent(c: string) {
    recentColors = [c, ...recentColors.filter(r => r !== c)].slice(0, 16);
  }

  $effect(() => { hexToHsl(value); hexInput = value; });

  const hueGradient = `linear-gradient(to right,
    hsl(0,${hsl.s}%,${hsl.l}%), hsl(60,${hsl.s}%,${hsl.l}%),
    hsl(120,${hsl.s}%,${hsl.l}%), hsl(180,${hsl.s}%,${hsl.l}%),
    hsl(240,${hsl.s}%,${hsl.l}%), hsl(300,${hsl.s}%,${hsl.l}%),
    hsl(360,${hsl.s}%,${hsl.l}%))`;

  const satGradient = (() => {
    const s1 = hslToHex(hsl.h, 0, hsl.l);
    const s2 = hslToHex(hsl.h, 100, hsl.l);
    return `linear-gradient(to right, ${s1}, ${s2})`;
  })();

  const lightGradient = (() => {
    const l0 = hslToHex(hsl.h, hsl.s, 0);
    const l50 = hslToHex(hsl.h, hsl.s, 50);
    const l100 = hslToHex(hsl.h, hsl.s, 100);
    return `linear-gradient(to right, ${l0}, ${l50}, ${l100})`;
  })();
</script>

<div class="cp">
  <!-- Color wheel -->
  <div class="cp-wheel-wrap">
    <div class="cp-wheel" bind:this={wheelEl}
      onpointerdown={wheelPointerDown}
      onpointermove={wheelPointerMove}
      onpointerup={wheelPointerUp}
    >
      <!-- Saturation/Lightness disc -->
      <div class="cp-wheel-bg" style="background: conic-gradient(
        hsl(0,100%,50%), hsl(30,100%,50%), hsl(60,100%,50%),
        hsl(90,100%,50%), hsl(120,100%,50%), hsl(150,100%,50%),
        hsl(180,100%,50%), hsl(210,100%,50%), hsl(240,100%,50%),
        hsl(270,100%,50%), hsl(300,100%,50%), hsl(330,100%,50%),
        hsl(360,100%,50%)
      )"></div>
      <!-- Selection dot -->
      {#if true}
        {@const r = (hsl.s / 100) * 50}
        {@const angle = hsl.h * Math.PI / 180}
        {@const dotX = 50 + r * Math.cos(angle)}
        {@const dotY = 50 + r * Math.sin(angle)}
        <div class="cp-wheel-dot" style="left:{dotX}%;top:{dotY}%"></div>
      {/if}
    </div>
  </div>

  <!-- Hue bar -->
  <div class="cp-hue-bar" bind:this={hueEl}
    onpointerdown={huePointerDown}
    onpointermove={huePointerMove}
    onpointerup={huePointerUp}
  >
    <div class="cp-hue-indicator" style="left:{(hsl.h / 360) * 100}%"></div>
  </div>

  <!-- Saturation slider -->
  <div class="cp-slider-row">
    <span class="cp-slider-label">S</span>
    <input type="range" min="0" max="100" bind:value={hsl.s} oninput={updateFromHsl} class="cp-slider" style="background:{satGradient}"/>
    <span class="cp-slider-val">{hsl.s}%</span>
  </div>

  <!-- Lightness slider -->
  <div class="cp-slider-row">
    <span class="cp-slider-label">L</span>
    <input type="range" min="0" max="100" bind:value={hsl.l} oninput={updateFromHsl} class="cp-slider" style="background:{lightGradient}"/>
    <span class="cp-slider-val">{hsl.l}%</span>
  </div>

  <!-- Hex input -->
  <div class="cp-hex-row">
    <div class="cp-preview" style="background:{value}"></div>
    <input type="text" bind:value={hexInput} onblur={onHexChange} onkeydown={(e) => e.key === 'Enter' && onHexChange()} class="cp-hex" maxlength="7" placeholder="#000000"/>
  </div>

  <!-- Swatches -->
  <div class="cp-swatches">
    {#each SWATCHES as c}
      <button class="cp-swatch" class:active={value.toLowerCase() === c.toLowerCase()} style="background:{c}" onclick={() => { value = c; hexInput = c; addToRecent(c); }}></button>
    {/each}
  </div>

  <!-- Recent -->
  {#if recentColors.length > 0}
    <div class="cp-section-label">Recent</div>
    <div class="cp-swatches">
      {#each recentColors as c}
        <button class="cp-swatch" style="background:{c}" onclick={() => { value = c; hexInput = c; }}></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cp { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }

  /* Color wheel */
  .cp-wheel-wrap { display: flex; justify-content: center; }
  .cp-wheel {
    width: 160px; height: 160px; border-radius: 50%;
    position: relative; cursor: crosshair;
    border: 2px solid #444;
  }
  .cp-wheel-bg {
    width: 100%; height: 100%; border-radius: 50%;
    background: radial-gradient(circle, white, transparent 70%);
  }
  .cp-wheel-dot {
    position: absolute; width: 10px; height: 10px;
    border-radius: 50%; border: 2px solid #fff;
    box-shadow: 0 0 3px rgba(0,0,0,.6);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  /* Hue bar */
  .cp-hue-bar {
    height: 12px; border-radius: 6px; position: relative; cursor: pointer;
    background: linear-gradient(to right,
      hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%),
      hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%),
      hsl(360,100%,50%));
    border: 1px solid #444;
  }
  .cp-hue-indicator {
    position: absolute; top: -2px; width: 4px; height: 16px;
    background: #fff; border: 1px solid #000; border-radius: 2px;
    transform: translateX(-50%);
    pointer-events: none;
  }

  /* Sliders */
  .cp-slider-row { display: flex; align-items: center; gap: 6px; }
  .cp-slider-label { font-size: 10px; color: #666; width: 12px; text-align: center; font-weight: 700; }
  .cp-slider {
    flex: 1; height: 10px; border-radius: 5px; appearance: none;
    border: 1px solid #444; cursor: pointer;
  }
  .cp-slider::-webkit-slider-thumb {
    appearance: none; width: 12px; height: 12px; border-radius: 50%;
    background: #fff; border: 1px solid #000; cursor: pointer;
    box-shadow: 0 0 2px rgba(0,0,0,.4);
  }
  .cp-slider-val { font-size: 9px; color: #555; font-family: 'Geist Mono', monospace; min-width: 28px; text-align: right; }

  /* Hex */
  .cp-hex-row { display: flex; align-items: center; gap: 6px; }
  .cp-preview { width: 24px; height: 24px; border-radius: 4px; border: 1px solid #555; flex-shrink: 0; }
  .cp-hex {
    flex: 1; background: #2a2a2e; border: 1px solid #444; border-radius: 4px;
    padding: 3px 6px; color: #aaa; font-size: 11px;
    font-family: 'Geist Mono', monospace; outline: none;
  }
  .cp-hex:focus { border-color: #6366f1; }

  /* Swatches */
  .cp-section-label { font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; margin-top: 2px; }
  .cp-swatches { display: flex; flex-wrap: wrap; gap: 2px; }
  .cp-swatch {
    width: 16px; height: 16px; border-radius: 2px; border: 1px solid #444;
    cursor: pointer; transition: .1s;
  }
  .cp-swatch:hover { border-color: #aaa; transform: scale(1.2); z-index: 1; }
  .cp-swatch.active { border-color: #fff; box-shadow: 0 0 0 2px #6366f1; transform: scale(1.15); z-index: 1; }
</style>
