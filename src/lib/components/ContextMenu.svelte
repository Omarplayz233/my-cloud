<script lang="ts">
    import { onMount, type Component } from "svelte";
    import { fly } from "svelte/transition";

    type MenuItem = {
        label: string;
        icon?: Component;
        action: () => void;
        danger?: boolean;
        disabled?: boolean;
        separator?: boolean;
    };

    let {
        x,
        y,
        items,
        onclose,
    }: {
        x: number;
        y: number;
        items: MenuItem[];
        onclose: () => void;
    } = $props();

    let menuEl: HTMLDivElement;

    onMount(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuEl && !menuEl.contains(e.target as Node)) {
                onclose();
            }
        };
        // Use a small timeout to avoid closing immediately from the right-click that opened it
        setTimeout(() => {
            window.addEventListener("click", handleClick);
        }, 10);
        return () => window.removeEventListener("click", handleClick);
    });

    // Ensure menu stays within viewport
    let adjustedX = $state(0);
    let adjustedY = $state(0);

    $effect(() => {
        // Reset to props when they change
        adjustedX = x;
        adjustedY = y;
        
        if (menuEl) {
            const rect = menuEl.getBoundingClientRect();
            if (x + rect.width > window.innerWidth) adjustedX = window.innerWidth - rect.width - 5;
            if (y + rect.height > window.innerHeight) adjustedY = window.innerHeight - rect.height - 5;
        }
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    bind:this={menuEl}
    class="context-menu"
    style="left: {adjustedX}px; top: {adjustedY}px;"
    transition:fly={{ y: 5, duration: 150 }}
>
    {#each items as item}
        {#if item.separator}
            <div class="separator"></div>
        {:else}
            <button
                class="menu-item"
                class:danger={item.danger}
                class:disabled={item.disabled}
                onclick={(e) => {
                    e.stopPropagation();
                    if (!item.disabled) {
                        item.action();
                        onclose();
                    }
                }}
            >
                <span class="icon">
                    {#if item.icon}
                        <item.icon size={16} stroke={1.5} />
                    {/if}
                </span>
                <span class="label">{item.label}</span>
            </button>
        {/if}
    {/each}
</div>

<style>
    .context-menu {
        position: fixed;
        z-index: 1000;
        background: var(--bg-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 6px;
        min-width: 180px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        display: flex;
        flex-direction: column;
        gap: 2px;
        backdrop-filter: blur(10px);
    }

    .menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: none;
        border: none;
        border-radius: 6px;
        color: var(--text-2);
        font-size: 13px;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s, color 0.1s;
    }

    .menu-item:hover {
        background: var(--bg-3);
        color: var(--text-1);
    }

    .menu-item.danger {
        color: var(--text-3);
    }
    .menu-item.danger:hover {
        background: var(--red-bg);
        color: var(--red);
    }

    .menu-item.disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        opacity: 0.8;
    }

    .label {
        flex: 1;
    }

    .separator {
        height: 1px;
        background: var(--border);
        margin: 4px 6px;
    }
</style>
