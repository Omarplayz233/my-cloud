<!-- src/lib/components/DetailsSidebar.svelte -->
<script lang="ts">
    import {
        IconX,
        IconDownload,
        IconWorld,
        IconLock,
        IconTrash,
        IconEdit,
        IconStar,
        IconStarFilled,
        IconLink,
        IconTag,
        IconPlus,
        IconFile,
        IconPhoto,
        IconVideo,
        IconMusic,
        IconFileZip,
        IconFileText,
        IconFolder,
    } from "@tabler/icons-svelte";

    type FileRecord = {
        fileName: string;
        type: string;
        totalBytes: number;
        time: string;
        telegramFileId: string;
        telegramMessageId: number;
        metaFileId: string;
        metaMessageId: number;
        public?: boolean;
        tags?: string[];
        favorite?: boolean;
    };

    type FolderRecord = {
        _type: 'folder';
        folderId: string;
        name: string;
        createdAt: string;
        parentId?: string;
        favorite?: boolean;
        public?: boolean;
        totalSize?: number;
    };

    let {
        item,
        apiKey,
        onclose,
        onrename,
        ontogglePublic,
        ondelete,
        ontoggleFavorite,
        onupdateTags,
        folders,
        getFullFilePath,
    }: {
        item: FileRecord | FolderRecord;
        apiKey: string;
        onclose: () => void;
        onrename: (i: any) => void;
        ontogglePublic: (i: any) => void;
        ondelete: (i: any) => void;
        ontoggleFavorite: (i: any) => void;
        onupdateTags: (f: FileRecord, tags: string[]) => void;
        folders: any[];
        getFullFilePath: (i: any) => string;
    } = $props();

    const isFolder = $derived(item && (item as any)._type === 'folder');
    const file = $derived(!isFolder ? (item as FileRecord) : null);
    const folder = $derived(isFolder ? (item as FolderRecord) : null);

    let tagInput = $state("");

    function formatBytes(b: number) {
        if (b < 1024) return `${b} B`;
        if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
        if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
        return `${(b / 1024 ** 3).toFixed(2)} GB`;
    }
    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
    function fileTypeIcon(type: string) {
        if (type.startsWith("image/")) return IconPhoto;
        if (type.startsWith("video/")) return IconVideo;
        if (type.startsWith("audio/")) return IconMusic;
        if (type.includes("zip") || type.includes("tar")) return IconFileZip;
        if (
            type.includes("text") ||
            type.includes("json") ||
            type === "application/pdf"
        )
            return IconFileText;
        return IconFile;
    }

    function addTag() {
        const t = tagInput.trim().toLowerCase();
        if (!t) return;
        const current = file.tags ?? [];
        if (!current.includes(t)) {
            onupdateTags(file, [...current, t]);
        }
        tagInput = "";
    }
    function removeTag(tag: string) {
        onupdateTags(
            file,
            (file.tags ?? []).filter((t) => t !== tag),
        );
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="sidebar-backdrop" onclick={onclose}></div>
<aside class="sidebar">
    <div class="sb-header">
        <span class="sb-title">File Details</span>
        <button class="sb-close" onclick={onclose}><IconX size={16} /></button>
    </div>

    <div class="sb-content">
        {#if item}
            {@const ItemIcon = isFolder ? IconFolder : fileTypeIcon(file!.type)}
            <div class="sb-icon-wrap">
                <ItemIcon size={48} stroke={1.2} />
            </div>
        {/if}
        <h3 class="sb-filename">{isFolder ? folder!.name : file!.fileName}</h3>

        <div class="sb-meta">
            {#if isFolder}
                <div class="meta-row">
                    <span class="meta-label">Total Size</span><span class="meta-val"
                        >{formatBytes(folder!.totalSize || 0)}</span
                    >
                </div>
                <div class="meta-row">
                    <span class="meta-label">Folder ID</span><span class="meta-val mono"
                        >{folder!.folderId}</span
                    >
                </div>
            {:else if file}
                <div class="meta-row">
                    <span class="meta-label">Size</span><span class="meta-val"
                        >{formatBytes(file.totalBytes)}
                        <span class="meta-exact"
                            >({file.totalBytes.toLocaleString()} bytes)</span
                        ></span
                    >
                </div>
                <div class="meta-row">
                    <span class="meta-label">Type</span><span class="meta-val"
                        >{file.type}</span
                    >
                </div>
            {/if}
            <div class="meta-row">
                <span class="meta-label">{isFolder ? 'Created' : 'Uploaded'}</span><span class="meta-val"
                    >{formatDate(isFolder ? folder!.createdAt : file!.time)}</span
                >
            </div>
            <div class="meta-row">
                <span class="meta-label">Visibility</span><span class="meta-val"
                    >{item.public ? "🌐 Public" : "🔒 Private"}</span
                >
            </div>
            {#if item.public}
                <div class="meta-row">
                    <span class="meta-label">Public URL</span><a
                        class="meta-link"
                        href={`/public/${getFullFilePath(item)}`}
                        target="_blank">/public/{getFullFilePath(item)}</a
                    >
                </div>
            {/if}
            {#if !isFolder && file}
                <div class="meta-row">
                    <span class="meta-label">File ID</span><span
                        class="meta-val mono">{file.metaFileId}</span
                    >
                </div>
                <div class="meta-row">
                    <span class="meta-label">Telegram ID</span><span
                        class="meta-val mono">{file.telegramMessageId}</span
                    >
                </div>
            {/if}
        </div>

        {#if !isFolder && file}
            <div class="sb-section">
                <span class="sb-section-title"><IconTag size={14} /> Tags</span>
                <div class="tag-list">
                    {#each file.tags ?? [] as tag}
                        <span class="tag-chip"
                            >{tag}<button
                                class="tag-rm"
                                onclick={() => removeTag(tag)}>×</button
                            ></span
                        >
                    {/each}
                </div>
                <div class="tag-add">
                    <input
                        class="tag-input"
                        type="text"
                        placeholder="Add tag..."
                        bind:value={tagInput}
                        onkeydown={(e) => e.key === "Enter" && addTag()}
                    />
                    <button
                        class="tag-add-btn"
                        onclick={addTag}
                        disabled={!tagInput.trim()}><IconPlus size={13} /></button
                    >
                </div>
            </div>
        {/if}

        <div class="sb-actions">
            <button class="sb-btn" onclick={() => onrename(item)}
                ><IconEdit size={15} /> Rename</button
            >
            <button class="sb-btn" onclick={() => ontoggleFavorite(item)}>
                {#if item.favorite}<IconStarFilled size={15} />{:else}<IconStar
                        size={15}
                    />{/if}
                {item.favorite ? "Unfavorite" : "Favorite"}
            </button>
            <button class="sb-btn" onclick={() => ontogglePublic(item)}>
                {#if item.public}<IconWorld size={15} />{:else}<IconLock
                        size={15}
                    />{/if}
                {item.public ? "Make Private" : "Make Public"}
            </button>
            {#if !isFolder && file}
                <a
                    class="sb-btn"
                    href={`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`}
                    download={file.fileName}
                >
                    <IconDownload size={15} /> Download
                </a>
            {/if}
            {#if item.public}
                <a
                    class="sb-btn"
                    href={`/public/${getFullFilePath(item)}`}
                    target="_blank"><IconLink size={15} /> Public Link</a
                >
            {/if}
            <button
                class="sb-btn danger"
                onclick={() => {
                    ondelete(item);
                    onclose();
                }}><IconTrash size={15} /> Delete</button
            >
        </div>
    </div>
</aside>

<style>
    .sidebar-backdrop {
        position: fixed;
        inset: 0;
        z-index: 150;
        background: rgba(0, 0, 0, 0.5);
    }
    .sidebar {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 380px;
        max-width: 100vw;
        z-index: 151;
        background: var(--bg-2);
        border-left: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        animation: slideIn 0.2s ease;
    }
    @keyframes slideIn {
        from {
            transform: translateX(100%);
        }
        to {
            transform: translateX(0);
        }
    }
    .sb-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
    }
    .sb-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-1);
    }
    .sb-close {
        background: none;
        border: none;
        color: var(--text-3);
        cursor: pointer;
        display: flex;
        padding: 4px;
        border-radius: 4px;
    }
    .sb-close:hover {
        color: var(--text-1);
    }
    .sb-content {
        padding: 24px 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }
    .sb-icon-wrap {
        display: flex;
        justify-content: center;
        color: var(--text-3);
    }
    .sb-filename {
        font-size: 15px;
        font-weight: 500;
        color: var(--text-1);
        text-align: center;
        word-break: break-all;
    }
    .sb-meta {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .meta-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        font-size: 12px;
    }
    .meta-label {
        color: var(--text-3);
        flex-shrink: 0;
    }
    .meta-val {
        color: var(--text-2);
        text-align: right;
        word-break: break-all;
    }
    .meta-val.mono {
        font-family: "Geist Mono", monospace;
        font-size: 11px;
    }
    .meta-exact {
        color: var(--text-3);
        font-size: 10px;
    }
    .meta-link {
        color: var(--accent);
        font-size: 11px;
        text-decoration: none;
        font-family: "Geist Mono", monospace;
        word-break: break-all;
    }
    .meta-link:hover {
        text-decoration: underline;
    }
    .sb-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .sb-section-title {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-3);
        display: flex;
        align-items: center;
        gap: 5px;
    }
    .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        min-height: 24px;
    }
    .tag-chip {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        background: var(--bg-3);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 2px 8px;
        font-size: 11px;
        color: var(--text-2);
    }
    .tag-rm {
        background: none;
        border: none;
        color: var(--text-3);
        cursor: pointer;
        font-size: 13px;
        padding: 0 1px;
        line-height: 1;
    }
    .tag-rm:hover {
        color: var(--red);
    }
    .tag-add {
        display: flex;
        gap: 4px;
    }
    .tag-input {
        flex: 1;
        background: var(--bg-1);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 5px 8px;
        color: var(--text-1);
        font-size: 12px;
        font-family: "Geist", sans-serif;
        outline: none;
    }
    .tag-input:focus {
        border-color: var(--border-hover);
    }
    .tag-add-btn {
        background: var(--bg-3);
        border: 1px solid var(--border);
        border-radius: 6px;
        width: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-3);
        cursor: pointer;
    }
    .tag-add-btn:hover {
        color: var(--text-1);
        border-color: var(--border-hover);
    }
    .tag-add-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
    .sb-actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .sb-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        background: none;
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text-2);
        font-size: 13px;
        cursor: pointer;
        font-family: "Geist", sans-serif;
        text-decoration: none;
        transition:
            background 0.1s,
            border-color 0.1s;
    }
    .sb-btn:hover {
        background: var(--bg-3);
        border-color: var(--border-hover);
    }
    .sb-btn.danger {
        color: var(--text-3);
    }
    .sb-btn.danger:hover {
        color: var(--red);
        border-color: var(--red-border);
        background: var(--red-bg);
    }

    @media (max-width: 640px) {
        .sidebar {
            width: 100vw;
        }
    }
</style>
