<!-- src/lib/components/RenameModal.svelte -->
<script lang="ts">
    import { IconX, IconCheck } from "@tabler/icons-svelte";

    let {
        fileName,
        onconfirm,
        oncancel,
    }: {
        fileName: string;
        onconfirm: (newName: string) => void;
        oncancel: () => void;
    } = $props();

    let value = $state(fileName as string);
    let loading = $state(false);

    async function submit() {
        const trimmed = value.trim();
        if (!trimmed || trimmed === fileName) {
            oncancel();
            return;
        }
        loading = true;
        onconfirm(trimmed);
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    class="backdrop"
    onclick={oncancel}
    onkeydown={(e) => e.key === "Escape" && oncancel()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
>
    <div class="dialog" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
        <div class="dialog-header">
            <span>Rename file</span>
            <button class="close-btn" onclick={oncancel}
                ><IconX size={15} /></button
            >
        </div>
        <div class="dialog-body">
            <input
                class="name-input"
                type="text"
                bind:value
                onkeydown={(e) => e.key === "Enter" && submit()}
                disabled={loading}
            />
        </div>
        <div class="dialog-footer">
            <button class="cancel-btn" onclick={oncancel} disabled={loading}
                >Cancel</button
            >
            <button
                class="confirm-btn"
                onclick={submit}
                disabled={loading || !value.trim() || value.trim() === fileName}
            >
                <IconCheck size={14} /> Rename
            </button>
        </div>
    </div>
</div>

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 250;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
    }
    .dialog {
        background: var(--bg-2);
        border: 1px solid var(--border);
        border-radius: 12px;
        width: 100%;
        max-width: 400px;
        overflow: hidden;
    }
    .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid var(--border);
        font-size: 14px;
        font-weight: 500;
        color: var(--text-1);
    }
    .close-btn {
        background: none;
        border: none;
        color: var(--text-3);
        cursor: pointer;
        display: flex;
        padding: 4px;
        border-radius: 4px;
    }
    .close-btn:hover {
        color: var(--text-1);
    }
    .dialog-body {
        padding: 18px;
    }
    .name-input {
        width: 100%;
        background: var(--bg-1);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px 14px;
        color: var(--text-1);
        font-size: 14px;
        font-family: "Geist", sans-serif;
        outline: none;
        transition: border-color 0.15s;
    }
    .name-input:focus {
        border-color: var(--border-hover);
    }
    .dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 18px;
        border-top: 1px solid var(--border);
    }
    .cancel-btn {
        background: none;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 7px 14px;
        color: var(--text-3);
        font-size: 13px;
        cursor: pointer;
        font-family: "Geist", sans-serif;
    }
    .cancel-btn:hover {
        color: var(--text-1);
        border-color: var(--border-hover);
    }
    .confirm-btn {
        background: var(--accent);
        border: none;
        border-radius: 8px;
        padding: 7px 14px;
        color: #fff;
        font-size: 13px;
        cursor: pointer;
        font-family: "Geist", sans-serif;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: opacity 0.15s;
    }
    .confirm-btn:hover {
        opacity: 0.9;
    }
    .confirm-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
</style>
