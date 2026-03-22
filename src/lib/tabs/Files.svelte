<!-- src/lib/tabs/Files.svelte -->
<script lang="ts">
  import PreviewModal from "$lib/components/PreviewModal.svelte";
  import DetailsSidebar from "$lib/components/DetailsSidebar.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import { zipSync, strToU8 } from "fflate";
  import { onMount } from "svelte";
  import {
    IconUpload,
    IconLayoutGrid,
    IconLayoutList,
    IconSortAscending,
    IconSortDescending,
    IconFilter,
    IconGripVertical,
    IconTrash,
    IconWorld,
    IconLock,
    IconDownload,
    IconStar,
    IconStarFilled,
    IconLink,
    IconEdit,
    IconFile,
    IconPhoto,
    IconVideo,
    IconMusic,
    IconFileZip,
    IconFileText,
    IconChevronDown,
    IconSquare,
    IconSquareCheck,
    IconFolderUp,
    IconX,
    IconArrowUp,
    IconFolder,
    IconHome,
    IconChevronRight,
    IconCopy,
    IconScissors,
    IconClipboardCheck,
    IconInfoCircle,
    IconFolderPlus,
    IconFilePlus,
    IconExternalLink,
    IconSearch,
    IconShare,
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
    sortOrder?: number;
    folderId?: string;
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
    user,
    apiKey,
    encryptedApiKey,
    theme,
    onfileCountChange,
    onfolderCountChange,
    onstorageChange,
  }: {
    user: { username: string; discordId?: string; createdAt?: string };
    apiKey: string;
    encryptedApiKey: string;
    theme: 'system' | 'light' | 'dark';
    onfileCountChange: (n: number) => void;
    onfolderCountChange: (n: number) => void;
    onstorageChange: (b: number) => void;
  } = $props();

  async function copySharexCreds() {
    const url = `${window.location.origin}/api/sharex/creds?api_key=${encodeURIComponent(encryptedApiKey ?? '')}`;
    await navigator.clipboard.writeText(url);
    uploadError = 'ShareX creds URL copied!';
    setTimeout(() => { uploadError = null; }, 2500);
  }

  // Auth state
  let tokenInput = $state("");
  let tokenError = $state("");
  let tokenLoading = $state(false);

  // ── Sync state ──────────────────────────────────────────────────────────────
  let files     = $state<FileRecord[]>([]);
  let folders   = $state<FolderRecord[]>([]);  // declared here, not below
  // Track which metaFileIds we already have so diffs are O(n)
  let _fileIndex = new Map<string, FileRecord>();
  let _folderIndex = new Map<string, FolderRecord>();

  // Initial load = true (shows skeleton), background refresh = false (silent)
  let filesLoading  = $state(true);
  let syncing       = $state(false);  // subtle background indicator
  let lastSyncAt    = 0;
  let syncTimer: ReturnType<typeof setInterval> | null = null;

  // Upload queue — supports multiple concurrent uploads
  type UploadJob = { id: string; name: string; progress: number; done: boolean; error: string | null };
  let uploadJobs = $state<UploadJob[]>([]);
  let uploadError = $state<string | null>(null);  // legacy single-error kept for compat
  let uploading = $state(false);  // kept for toolbar button disabled state
  let uploadMsg = $state("");    // kept for compat
  let uploadProgress = $state(0); // kept for compat

  let searchQuery = $state("");
  let togglingPublic = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let renamingFileId = $state<string | null>(null);
  let renameFileValue = $state("");

  // Folder state
  let currentFolderId = $state<string | undefined>(undefined); // undefined = root
  let renamingFolderId = $state<string | null>(null);
  let renameFolderValue = $state("");
  let creatingFolder = $state(false);
  let newFolderName = $state("");
  let movingFileId = $state<string | null>(null);
  let contextMenu = $state<{ x: number, y: number, target: any } | null>(null);
  let contextActiveId = $state<string | null>(null);
  let clipboard = $state<{ ids: string[], action: 'copy' | 'move' } | null>(null);
  let showDeleteConfirm = $state(false);
  let folderToDeleteId = $state<string | null>(null);

  // Clear selection on folder change
  $effect(() => {
    // Access currentFolderId to track it
    let _ = currentFolderId;
    selectedIds = new Set();
  });

  // Preview
  let preview = $state<FileRecord | null>(null);

  // ── QR popover ────────────────────────────────────────────────────────────
  let qrAnchor  = $state<{ x: number; y: number } | null>(null);
  let qrUrl     = $state<string | null>(null);
  let qrDataUrl = $state<string | null>(null);
  let qrCopied  = $state(false);
  let qrHideTimer: ReturnType<typeof setTimeout> | null = null;
  const qrCache = new Map<string, string>();

  async function generateQr(url: string) {
    if (qrCache.has(url)) { qrDataUrl = qrCache.get(url)!; return; }
    qrDataUrl = null;
    const { default: QRCode } = await import("qrcode");
    const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2, color: { dark: "#ffffff", light: "#1a1a1a" } });
    qrCache.set(url, dataUrl);
    // Always set — race condition fix: don't check qrUrl
    qrDataUrl = dataUrl;
  }

  function onQrMouseEnter(e: MouseEvent, url: string) {
    e.stopPropagation();
    if (qrHideTimer) { clearTimeout(qrHideTimer); qrHideTimer = null; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    qrUrl    = url;
    qrAnchor = { x: rect.left + rect.width / 2, y: rect.top };
    qrCopied = false;
    generateQr(url);
  }

  function onQrMouseLeave() {
    // 400ms so user can move mouse into popover
    qrHideTimer = setTimeout(() => {
      qrAnchor  = null;
      qrUrl     = null;
      qrDataUrl = null;
      qrHideTimer = null;
    }, 400);
  }

  function onQrPopoverEnter() {
    if (qrHideTimer) { clearTimeout(qrHideTimer); qrHideTimer = null; }
  }

  async function onQrClick(e: MouseEvent, url: string) {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(url).catch(() => {});
    qrCopied = true;
    setTimeout(() => qrCopied = false, 2000);
  }
  let previewUrl = $state<string | null>(null);
  let previewLoading = $state(false);

  // UI state
  let dragActive = $state(false);
  let viewMode = $state<"list" | "grid">("list");
  let sortBy = $state<"name" | "size" | "date" | "type">("date");
  let sortDir = $state<"asc" | "desc">("desc");
  let filterType = $state<
    "all" | "image" | "video" | "audio" | "document" | "archive"
  >("all");
  let selectedIds = $state<Set<string>>(new Set());
  let sidebarFile = $state<FileRecord | FolderRecord | null>(null);
  let sidebarFileWithMeta = $derived.by(() => {
    if (!sidebarFile) return null;
    if ((sidebarFile as any)._type === 'folder') {
      const folder = sidebarFile as FolderRecord;
      return {
        ...folder,
        totalSize: getFolderSize(folder.folderId)
      };
    }
    return sidebarFile;
  });
  let dragOverIdx = $state<number | null>(null);
  let dragSrcIdx = $state<number | null>(null);

  const BASE = "";
  const CHUNK_SIZE = 18 * 1024 * 1024;

  // Sort & filter
  let processedFiles = $derived.by(() => {
    let arr = isSearching ? [...files] : files.filter(f => (f.folderId ?? undefined) === currentFolderId);
    // Filter by type
    if (filterType !== "all") {
      arr = arr.filter((f) => {
        if (filterType === "image") return f.type.startsWith("image/");
        if (filterType === "video") return f.type.startsWith("video/");
        if (filterType === "audio") return f.type.startsWith("audio/");
        if (filterType === "document")
          return (
            f.type.includes("text") ||
            f.type.includes("json") ||
            f.type === "application/pdf"
          );
        if (filterType === "archive")
          return (
            f.type.includes("zip") ||
            f.type.includes("tar") ||
            f.type.includes("rar")
          );
        return true;
      });
    }
    // Sort
    arr.sort((a, b) => {
      // Favorites always first
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      let cmp = 0;
      if (sortBy === "name") cmp = a.fileName.localeCompare(b.fileName);
      else if (sortBy === "size") cmp = a.totalBytes - b.totalBytes;
      else if (sortBy === "date")
        cmp = new Date(a.time).getTime() - new Date(b.time).getTime();
      else if (sortBy === "type") cmp = a.type.localeCompare(b.type);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  });

  let totalSize = $derived(files.reduce((s, f) => s + f.totalBytes, 0));

  $effect(() => { onfileCountChange(files.length); });
  $effect(() => { onfolderCountChange(folders.length); });
  $effect(() => { onstorageChange(totalSize); });
  let allSelected = $derived(
    (processedFiles.length > 0 || currentFolders.length > 0) &&
      processedFiles.every((f) => selectedIds.has(f.metaFileId)) &&
      currentFolders.every((f) => selectedIds.has(f.folderId))
  );

  // Auth
  async function submitToken() {
    tokenError = "";
    tokenLoading = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: tokenInput.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        tokenError = d.error ?? "Invalid token";
        return;
      }
      await invalidateAll();
    } catch {
      tokenError = "Something went wrong";
    } finally {
      tokenLoading = false;
    }
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  // ── Smart sync ───────────────────────────────────────────────────────────────
  // First call shows skeleton; subsequent calls diff and patch silently.
  async function loadFiles(q = "", { silent = false } = {}) {
    const isFirst = files.length === 0 && folders.length === 0;
    if (isFirst && !silent) filesLoading = true;
    else if (!isFirst) syncing = true;
    try {
      const res = await fetch(
        `${BASE}/api/telegram/ls?api_key=${apiKey}&_t=${Date.now()}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const d = await res.json();
      const newFiles:   FileRecord[]   = d.files   ?? [];
      const newFolders: FolderRecord[] = d.folders ?? [];

      // ── Diff files ─────────────────────────────────────────────────────────
      const newFileMap = new Map(newFiles.map(f => [f.metaFileId, f]));
      const oldFileMap = new Map(files.map(f => [f.metaFileId, f]));

      let changed = false;
      // Add / update
      for (const [id, nf] of newFileMap) {
        const of_ = oldFileMap.get(id);
        if (!of_ || JSON.stringify(of_) !== JSON.stringify(nf)) changed = true;
      }
      // Remove
      for (const id of oldFileMap.keys()) {
        if (!newFileMap.has(id)) changed = true;
      }
      if (changed) files = newFiles;

      // ── Diff folders ───────────────────────────────────────────────────────
      const newFolderMap = new Map(newFolders.map(f => [f.folderId, f]));
      const oldFolderMap = new Map(folders.map(f => [f.folderId, f]));
      let fchanged = false;
      for (const [id, nf] of newFolderMap) {
        const of_ = oldFolderMap.get(id);
        if (!of_ || JSON.stringify(of_) !== JSON.stringify(nf)) fchanged = true;
      }
      for (const id of oldFolderMap.keys()) {
        if (!newFolderMap.has(id)) fchanged = true;
      }
      if (fchanged) folders = newFolders;

      lastSyncAt = Date.now();
    } catch { /* silent fail on background refresh */ } finally {
      filesLoading = false;
      syncing = false;
    }
  }

  // Background poll — silent refresh every 30s to catch external changes
  function startBackgroundSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !uploading) {
        loadFiles(searchQuery, { silent: true });
      }
    }, 30_000);
  }

  // Optimistic helpers — update local state immediately, sync in background
  function optimisticUpdateFile(metaFileId: string, patch: Partial<FileRecord>) {
    files = files.map(f => f.metaFileId === metaFileId ? { ...f, ...patch } : f);
  }
  function optimisticUpdateFolder(folderId: string, patch: Partial<FolderRecord>) {
    folders = folders.map(f => f.folderId === folderId ? { ...f, ...patch } : f);
  }
  function optimisticRemoveFile(metaFileId: string) {
    files = files.filter(f => f.metaFileId !== metaFileId);
  }
  function optimisticRemoveFolder(folderId: string) {
    folders = folders.filter(f => f.folderId !== folderId);
    files = files.map(f => f.folderId === folderId ? { ...f, folderId: undefined } : f);
  }

  // ── Folder operations ─────────────────────────────────────────────────────
  async function createFolder() {
    const name = newFolderName.trim() || "New Folder";
    newFolderName = ""; creatingFolder = false;
    // Optimistic: show immediately with temp id
    const tempId = 'tmp:' + Date.now();
    const tempFolder: FolderRecord = {
      _type: 'folder', folderId: tempId, name,
      createdAt: new Date().toISOString(),
      ...(currentFolderId ? { parentId: currentFolderId } : {}),
    };
    folders = [...folders, tempFolder];
    try {
      const res = await fetch(`${BASE}/api/telegram/folderOps`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ action: "create", name, parentId: currentFolderId }),
      });
      const d = await res.json();
      if (d.folder) {
        // Replace temp with real
        folders = folders.map(f => f.folderId === tempId ? d.folder : f);
      } else {
        folders = folders.filter(f => f.folderId !== tempId);
      }
    } catch {
      folders = folders.filter(f => f.folderId !== tempId);
    }
  }

  async function renameFolder(folderId: string, name: string) {
    const old = folders.find(f => f.folderId === folderId)?.name ?? name;
    renamingFolderId = null;
    optimisticUpdateFolder(folderId, { name });
    try {
      await fetch(`${BASE}/api/telegram/folderOps`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ action: "rename", folderId, name }),
      });
      loadFiles(searchQuery, { silent: true });
    } catch {
      optimisticUpdateFolder(folderId, { name: old });
    }
  }

  async function deleteFolder(folderId: string) {
    optimisticRemoveFolder(folderId);
    try {
      await fetch(`${BASE}/api/telegram/folderOps`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ action: "delete", folderId }),
      });
      loadFiles(searchQuery, { silent: true });
    } catch { loadFiles(searchQuery); }
  }

  async function moveFileToFolder(metaFileId: string, folderId: string | undefined) {
    await fetch(`${BASE}/api/telegram/folderOps`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
      body: JSON.stringify({ action: "moveFile", metaFileId, folderId: folderId ?? null }),
    });
    await loadFiles(searchQuery);
    movingFileId = null;
  }

  async function duplicateFile(metaFileId: string, newName?: string) {
    const res = await fetch(`${BASE}/api/telegram/folderOps`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
      body: JSON.stringify({ action: "duplicate", metaFileId, newName }),
    });
    if (res.ok) await loadFiles(searchQuery);
  }

  async function createNewFile() {
    const blob = new Blob(["\n"], { type: "text/plain" });
    const fileObj = new File([blob], "new_file.txt", { type: "text/plain" });
    const success = await uploadFile(fileObj);
    if (success) {
      await loadFiles(searchQuery);
      // The new file should be the one named new_file.txt in the current folder
      const newFile = processedFiles.find(f => f.fileName === "new_file.txt" && (f.folderId ?? null) === (currentFolderId ?? null));
      if (newFile) {
        renamingFileId = newFile.metaFileId;
        renameFileValue = "new_file.txt";
      }
    }
  }

  // Breadcrumb path for current folder
  function getFolderPath(folderId: string | undefined): FolderRecord[] {
    if (!folderId) return [];
    const path: FolderRecord[] = [];
    let current: FolderRecord | undefined = folders.find(f => f.folderId === folderId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? folders.find(f => f.folderId === current!.parentId) : undefined;
    }
    return path;
  }

  // Files/folders visible in current view
  let currentFolders = $derived(
    searchQuery.trim()
      ? folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : folders.filter(f => (f.parentId ?? undefined) === currentFolderId)
  );

  // Reconstruct full path for public links
  function getFullFilePath(item: FileRecord | FolderRecord): string {
    const isFolder = '_type' in item && item._type === 'folder';
    const name = isFolder ? (item as FolderRecord).name : (item as FileRecord).fileName;
    const segments: string[] = [name];
    let parentId = isFolder ? (item as FolderRecord).parentId : (item as FileRecord).folderId;
    while (parentId) {
      const parent = folders.find(f => f.folderId === parentId);
      if (!parent) break;
      segments.unshift(parent.name);
      parentId = parent.parentId;
    }
    return segments.join('/');
  }

  // When searching, also show files from all folders
  let isSearching = $derived(searchQuery.trim().length > 0);
  let currentPath = $derived(getFolderPath(currentFolderId));

  // Upload utilities
  async function uploadFilesList(fileList: FileList | File[]) {
    const arr = Array.from(fileList as any);
    for (const file of arr) {
      const ok = await uploadFile(file as File);
      // If a single upload fails, stop the batch so errors are visible.
      if (!ok) break;
    }
  }

  async function uploadFile(file: File) {
    uploading = true;
    const jobId = crypto.randomUUID();
    const job: UploadJob = { id: jobId, name: file.name, progress: 0, done: false, error: null };
    uploadJobs = [...uploadJobs, job];

    function patchJob(patch: Partial<UploadJob>) {
      uploadJobs = uploadJobs.map(j => j.id === jobId ? { ...j, ...patch } : j);
    }

    try {
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      const chunks: any[] = new Array(totalChunks);
      let done = 0;

      async function uploadOneChunk(i: number) {
        const start = i * CHUNK_SIZE;
        const blob  = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
        const form  = new FormData();
        form.append("file", new Blob([blob], { type: file.type || "application/octet-stream" }), file.name);
        const res = await fetch(`${BASE}/api/telegram/uploadChunk`, {
          method: "POST",
          headers: { "X-Api-Key": apiKey, "X-Chunk-Index": String(i), "X-File-Name": encodeURIComponent(file.name) },
          body: form,
        });
        const d = await res.json();
        if (d.error) throw new Error(d.error);
        chunks[i] = d;
        done++;
        patchJob({ progress: Math.round((done / totalChunks) * 90) });
      }

      const CONCURRENCY = 3;
      const queue = Array.from({ length: totalChunks }, (_, i) => i);
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalChunks) }, async () => {
        while (queue.length) await uploadOneChunk(queue.shift()!);
      }));

      patchJob({ progress: 95 });
      const finalRes = await fetch(`${BASE}/api/telegram/finalizeUpload`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          type: file.type || "application/octet-stream",
          totalBytes: file.size,
          chunks,
          folderId: currentFolderId ?? null,
        }),
      });
      const final = await finalRes.json();
      if (final.error) throw new Error(final.error);
      patchJob({ progress: 100, done: true });
      // Silent refresh — don't blank the list
      loadFiles(searchQuery, { silent: true });
      setTimeout(() => { uploadJobs = uploadJobs.filter(j => j.id !== jobId); }, 3000);
      return true;
    } catch (e: any) {
      patchJob({ error: e.message, done: true });
      setTimeout(() => { uploadJobs = uploadJobs.filter(j => j.id !== jobId); }, 5000);
      return false;
    } finally {
      uploading = uploadJobs.some(j => !j.done);
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (!file) continue;
        // Give pasted images a sensible name since they come as unnamed blobs
        if (file.name === 'image.png' || !file.name) {
          const named = new File([file], `pasted_image_${Date.now()}.png`, { type: file.type });
          uploadFile(named);
        } else {
          uploadFile(file);
        }
      }
    }
  }

  async function uploadDirectory(fileList: FileList) {
    for (const file of Array.from(fileList)) {
      const relativePath = (file as any).webkitRelativePath || file.name;
      const renamedFile = new File([file], relativePath, { type: file.type });
      await uploadFile(renamedFile);
    }
  }

  async function togglePublic(file: FileRecord) {
    togglingPublic = file.metaFileId;
    const newPublic = !file.public;
    optimisticUpdateFile(file.metaFileId, { public: newPublic });
    try {
      await fetch(`${BASE}/api/telegram/filePublicity`, {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "X-Meta-File-Id": file.metaFileId,
          "X-Public": String(newPublic),
        },
      });
      loadFiles(searchQuery, { silent: true });
    } catch {
      optimisticUpdateFile(file.metaFileId, { public: file.public });
    } finally {
      togglingPublic = null;
    }
  }

  function triggerDelete(file: FileRecord) {
    folderToDeleteId = null;
    selectedIds = new Set([file.metaFileId]);
    showDeleteConfirm = true;
  }

  function triggerFolderDelete(id: string) {
    folderToDeleteId = id;
    selectedIds = new Set();
    showDeleteConfirm = true;
  }

  async function executeDelete() {
    if (folderToDeleteId) {
      const fid = folderToDeleteId;
      folderToDeleteId = null; showDeleteConfirm = false;
      optimisticRemoveFolder(fid);
      try {
        await fetch(`${BASE}/api/telegram/folderOps`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
          body: JSON.stringify({ action: "delete", folderId: fid }),
        });
        loadFiles(searchQuery, { silent: true });
      } catch { loadFiles(searchQuery); }
    } else {
      await confirmBulkDelete();
    }
  }

  function openContextMenu(e: MouseEvent, target: any) {
    e.preventDefault();
    e.stopPropagation(); // Prevent bubble
    
    // Set active ID for context menu highlighting (instead of auto-selecting)
    if (target) {
      contextActiveId = target._type === 'folder' ? target.folderId : target.metaFileId;
    } else {
      contextActiveId = null;
    }

    // Force close old context menu if any to allow "re-right-click"
    const { clientX, clientY } = e;
    contextMenu = null;
    setTimeout(() => {
      contextMenu = { x: clientX, y: clientY, target };
    }, 0);
  }

  function copyToInternalClipboard(item: any, action: 'copy' | 'move') {
    const id = item._type === 'folder' ? item.folderId : item.metaFileId;
    let ids: string[] = [];
    if (selectedIds.has(id)) {
      ids = [...selectedIds];
    } else {
      ids = [id];
      selectedIds = new Set([id]);
    }
    clipboard = { ids, action };
  }

  async function pasteFromInternalClipboard() {
    if (!clipboard) return;
    const folderIdsList = folders.map(f => f.folderId);
    const selectedFolderIds = clipboard.ids.filter(id => folderIdsList.includes(id));
    const selectedFileIds = clipboard.ids.filter(id => !folderIdsList.includes(id));

    const tasks = [];
    if (selectedFileIds.length > 0) {
      if (clipboard.action === 'move') {
        tasks.push(...selectedFileIds.map(id => moveFileToFolder(id, currentFolderId)));
      } else {
        tasks.push(...selectedFileIds.map(id => duplicateFile(id)));
      }
    }
    if (selectedFolderIds.length > 0 && clipboard.action === 'move') {
      tasks.push(...selectedFolderIds.map(id => 
        fetch(`${BASE}/api/telegram/folderOps`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
          body: JSON.stringify({ action: "rename", folderId: id, parentId: currentFolderId ?? null }),
        })
      ));
    }
    await Promise.all(tasks);
    await loadFiles(searchQuery);
    clipboard = null;
  }

  // Rename — optimistic
  async function renameFile(metaFileId: string, newName: string) {
    if (!newName.trim()) { renamingFileId = null; return; }
    const oldFile = files.find(f => f.metaFileId === metaFileId);
    const oldName = oldFile?.fileName ?? newName;
    renamingFileId = null;
    optimisticUpdateFile(metaFileId, { fileName: newName });
    try {
      await fetch(`${BASE}/api/telegram/renameFile`, {
        method: "PATCH",
        headers: {
          "X-Api-Key": apiKey ?? "",
          "X-Meta-File-Id": metaFileId,
          "X-New-Name": encodeURIComponent(newName),
        },
      });
      loadFiles(searchQuery, { silent: true });
    } catch {
      optimisticUpdateFile(metaFileId, { fileName: oldName });
      uploadError = "Rename failed";
    }
  }

  // Folder Actions
  async function toggleFolderFavorite(folder: FolderRecord) {
    optimisticUpdateFolder(folder.folderId, { favorite: !folder.favorite });
    try {
      await fetch(`${BASE}/api/telegram/folderOps`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggleFavorite", folderId: folder.folderId }),
      });
      loadFiles(searchQuery, { silent: true });
    } catch { optimisticUpdateFolder(folder.folderId, { favorite: folder.favorite }); }
  }

  async function toggleFolderPublic(folder: FolderRecord, recursive = false) {
    try {
      await fetch(`${BASE}/api/telegram/folderOps`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "togglePublic", 
          folderId: folder.folderId, 
          recursive 
        }),
      });
      await loadFiles(searchQuery);
    } catch (e) {
      console.error(e);
    }
  }

  function getFolderSize(folderId: string): number {
    let size = 0;
    const items = files.filter(f => f.folderId === folderId);
    for (const f of items) size += f.totalBytes;
    // Recursive size
    const subFolders = folders.filter(f => f.parentId === folderId);
    for (const sub of subFolders) size += getFolderSize(sub.folderId);
    return size;
  }

  // Tags
  async function updateTags(file: FileRecord, tags: string[]) {
    await fetch(`${BASE}/api/telegram/fileTags`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "X-Meta-File-Id": file.metaFileId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tags }),
    });
    await loadFiles(searchQuery);
  }

  // Favorite — optimistic
  async function toggleFavorite(file: FileRecord) {
    optimisticUpdateFile(file.metaFileId, { favorite: !file.favorite });
    try {
      await fetch(`${BASE}/api/telegram/toggleFavorite`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "X-Meta-File-Id": file.metaFileId },
      });
      loadFiles(searchQuery, { silent: true });
    } catch { optimisticUpdateFile(file.metaFileId, { favorite: file.favorite }); }
  }

  // Preview
  function isPreviewable(type: string) {
    if (type.startsWith('image/')) return true;
    if (type.startsWith('video/')) return true;
    if (type.startsWith('audio/')) return true;
    if (type === 'application/pdf') return true;
    // Text/code files — open in Monaco editor
    if (type.startsWith('text/')) return true;
    if (type === 'application/json') return true;
    if (type === 'application/javascript') return true;
    if (type === 'application/typescript') return true;
    if (type === 'application/xml') return true;
    if (type.includes('json') || type.includes('+xml') || type.includes('text')) return true;
    // Fonts
    if (type.startsWith('font/') || type === 'application/font-woff' ||
        type === 'application/x-font-ttf' || type === 'application/x-font-otf') return true;
    return false;
  }

  function isTextPreview(file: { fileName: string; type: string }): boolean {
    return isTextLikeFile(file as any) && !file.type.startsWith('image/') &&
           !file.type.startsWith('video/') && !file.type.startsWith('audio/') &&
           file.type !== 'application/pdf';
  }
  function isStreamable(type: string) {
    return type.startsWith("video/") || type.startsWith("audio/");
  }

  function isFontFile(file: FileRecord): boolean {
    const ext = file.fileName.split('.').pop()?.toLowerCase() ?? '';
    return ['ttf','otf','woff','woff2'].includes(ext);
  }

  async function openPreview(file: FileRecord) {
    // Also open text files by extension even if mime type is generic octet-stream
    if (!isPreviewable(file.type) && !isTextLikeFile(file) && !isFontFile(file)) {
      window.open(
        `${BASE}/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`,
        "_blank",
      );
      return;
    }
    preview = file;
    previewUrl = null;
    if (isStreamable(file.type)) {
      previewUrl = `${BASE}/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}`;
      previewLoading = false;
      return;
    }
    previewLoading = true;
    try {
      const res = await fetch(
        `${BASE}/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}`,
      );
      const blob = await res.blob();
      previewUrl = URL.createObjectURL(blob);
    } finally {
      previewLoading = false;
    }
  }
  function closePreview() {
    if (previewUrl && !isStreamable(preview?.type ?? ""))
      URL.revokeObjectURL(previewUrl!);
    preview = null;
    previewUrl = null;
  }

  // Selection
  function handleFileClick(e: MouseEvent, id: string, forceToggle = false) {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || forceToggle) {
      toggleSelect(id);
    } else {
      selectedIds = new Set([id]);
    }
  }

  function toggleSelect(id: string) {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    selectedIds = s;
  }
  function toggleSelectAll(e: MouseEvent) {
    if (e) e.stopPropagation();
    if (allSelected) {
      selectedIds = new Set();
    } else {
      const ids = [
        ...currentFolders.map(f => f.folderId),
        ...processedFiles.map(f => f.metaFileId)
      ];
      selectedIds = new Set(ids);
    }
  }

  // Bulk
  async function confirmBulkDelete() {
    const folderIdSet = new Set(folders.map(f => f.folderId));
    const fileIds   = [...selectedIds].filter(id => !folderIdSet.has(id));
    const folderIds = [...selectedIds].filter(id => folderIdSet.has(id));
    // Optimistic: remove from view immediately
    for (const id of fileIds)   optimisticRemoveFile(id);
    for (const id of folderIds) optimisticRemoveFolder(id);
    selectedIds = new Set();
    showDeleteConfirm = false;
    try {
      await Promise.all([
        ...fileIds.map(id => fetch(`${BASE}/api/telegram/deleteFile`, {
          method: "DELETE",
          headers: { "X-Api-Key": apiKey ?? "", "X-Meta-File-Id": id },
        })),
        ...folderIds.map(id => fetch(`${BASE}/api/telegram/folderOps`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey ?? "" },
          body: JSON.stringify({ action: "delete", folderId: id }),
        })),
      ]);
      loadFiles(searchQuery, { silent: true });
    } catch { loadFiles(searchQuery); }
  }
  async function bulkTogglePublic(makePublic: boolean) {
    await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`${BASE}/api/telegram/filePublicity`, {
          method: "POST",
          headers: {
            "X-Api-Key": apiKey,
            "X-Meta-File-Id": id,
            "X-Public": String(makePublic),
          },
        }),
      ),
    );
    selectedIds = new Set();
    await loadFiles(searchQuery);
  }
  async function bulkDownloadZip() {
    const entries: Record<string, Uint8Array> = {};
    const folderIdSet = new Set(folders.map(f => f.folderId));

    // Collect all selected file IDs, including files inside selected folders
    const allFileIds = new Set<string>();
    for (const id of selectedIds) {
      if (!folderIdSet.has(id)) {
        allFileIds.add(id);
      } else {
        // Add all files recursively inside this folder
        const addFolderFiles = (fid: string) => {
          files.filter(f => f.folderId === fid).forEach(f => allFileIds.add(f.metaFileId));
          folders.filter(f => f.parentId === fid).forEach(f => addFolderFiles(f.folderId));
        };
        addFolderFiles(id);
      }
    }

    for (const id of allFileIds) {
      const file = files.find((f) => f.metaFileId === id);
      if (!file) continue;
      const res = await fetch(
        `${BASE}/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${id}`,
      );
      const buf = await res.arrayBuffer();
      // Preserve folder path inside zip
      const folder = file.folderId ? folders.find(f => f.folderId === file.folderId) : null;
      const zipPath = folder ? `${folder.name}/${file.fileName}` : file.fileName;
      entries[zipPath] = new Uint8Array(buf);
    }
    const zipped = zipSync(entries);
    const blob = new Blob([zipped], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "files.zip";
    a.click();
    URL.revokeObjectURL(url);
    selectedIds = new Set();
  }

  // Drag & drop upload (with fix)
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }
  function handleDragLeave(e: DragEvent) {
    const rect = document.querySelector(".files-root")?.getBoundingClientRect();
    if (
      rect &&
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    )
      return;
    dragActive = false;
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    const fl = e.dataTransfer?.files;
    if (!fl || fl.length === 0) return;
    // Upload all dropped files, one after another
    uploadFilesList(fl);
  }

  // Drag reorder
  function reorderDragStart(idx: number) {
    dragSrcIdx = idx;
  }
  function reorderDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    dragOverIdx = idx;
  }
  function reorderDrop(idx: number) {
    if (dragSrcIdx !== null && dragSrcIdx !== idx) {
      const arr = [...processedFiles];
      const [moved] = arr.splice(dragSrcIdx, 1);
      arr.splice(idx, 0, moved);
      files = arr;
    }
    dragSrcIdx = null;
    dragOverIdx = null;
  }

  // Search — debounced, triggers silent sync only if query changed meaningfully
  let searchTimeout: any;
  let _lastQuery = '';
  function onSearch(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (searchQuery !== _lastQuery) {
        _lastQuery = searchQuery;
        loadFiles(searchQuery, { silent: files.length > 0 });
      }
    }, 280);
  }

  // Helpers
  function isTextLikeFile(file: FileRecord) {
    const ext = file.fileName.split('.').pop()?.toLowerCase() ?? '';
    return file.type.startsWith('text/') || file.type.includes('json') ||
           ['txt','md','markdown','js','ts','jsx','tsx','py','rs','go','java','c','cpp',
            'css','scss','html','xml','json','yaml','yml','sh','lua','rb','php',
            'svelte','vue','toml','sql'].includes(ext);
  }

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
  function fileIconComponent(type: string) {
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
    function navigateToFolder(folderId: string) {
      currentFolderId = folderId;
    }

    function downloadFolder(folderId: string) {
      window.open(`${BASE}/api/telegram/downloadFolder?api_key=${apiKey}&folder_id=${folderId}`, '_blank');
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closePreview();
        sidebarFile = null;
        creatingFolder = false;
        renamingFolderId = null;
        renamingFileId = null;
      }
    }

    // Action for auto-focus and selection
    function selectOnMount(node: HTMLInputElement) {
      setTimeout(() => {
        node.focus();
        node.select();
      }, 0);
    }

  $effect(() => {
    if (user && apiKey) {
      loadFiles();
      startBackgroundSync();
    }
    return () => { if (syncTimer) clearInterval(syncTimer); };
  });
</script>


<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:window onkeydown={handleKeydown} onpaste={handlePaste} onclick={() => { contextMenu = null; contextActiveId = null; selectedIds = new Set(); }} />

{#if contextMenu}
  {@const target = contextMenu?.target}
  {@const targetId = target ? (target._type === 'folder' ? target.folderId : target.metaFileId) : null}
  {@const isFile = target && !target._type}
  {@const isFolder = target && target._type === 'folder'}
  {@const isBackground = !target}

  <ContextMenu
    x={contextMenu?.x ?? 0}
    y={contextMenu?.y ?? 0}
    onclose={() => { contextMenu = null; contextActiveId = null; }}
    items={[
      ...(isFile ? [
        ...(selectedIds.size <= 1 ? [
          { label: 'Open', icon: IconExternalLink, action: () => target && openPreview(target) },
          { label: 'Rename', icon: IconEdit, action: () => { if (target) { renamingFileId = target.metaFileId; renameFileValue = target.fileName; } } },
          { label: 'Favorite', icon: target?.favorite ? IconStarFilled : IconStar, action: () => target && toggleFavorite(target) },
          { label: 'Public', icon: IconWorld, action: () => target && togglePublic(target) },
          { separator: true },
          { label: 'Copy', icon: IconCopy, action: () => target && copyToInternalClipboard(target, 'copy') },
          { label: 'Move', icon: IconScissors, action: () => target && copyToInternalClipboard(target, 'move') },
          { separator: true },
          ...(selectedIds.has(targetId!) ? [
            { label: 'Unselect', icon: IconSquare, action: () => { selectedIds.delete(targetId!); selectedIds = new Set(selectedIds); } },
          ] : [
            { label: 'Select', icon: IconSquareCheck, action: () => { selectedIds.add(targetId!); selectedIds = new Set(selectedIds); } },
          ]),
          { label: 'Properties', icon: IconInfoCircle, action: () => sidebarFile = target },
          { label: 'Delete', icon: IconTrash, action: () => { if (target) triggerDelete(target); }, danger: true },
        ] : [
          { label: `Delete ${selectedIds.size} items`, icon: IconTrash, action: () => showDeleteConfirm = true, danger: true },
        ]),
      ] : []),
      ...(isFolder ? [
        { label: 'Open', icon: IconExternalLink, action: () => target && navigateToFolder(target.folderId) },
        { label: 'Rename', icon: IconEdit, action: () => { if (target) { renamingFolderId = target.folderId; renameFolderValue = target.name; } } },
        { label: 'Favorite', icon: target?.favorite ? IconStarFilled : IconStar, action: () => target && toggleFolderFavorite(target) },
        { label: 'Public', icon: IconWorld, action: () => target && toggleFolderPublic(target, false) },
        { separator: true },
        { label: 'Download as ZIP', icon: IconDownload, action: () => target && downloadFolder(target.folderId) },
        { label: 'Properties', icon: IconInfoCircle, action: () => sidebarFile = target },
        { label: 'Delete', icon: IconTrash, action: () => { if (target) triggerFolderDelete(target.folderId); }, danger: true },
      ] : []),
      ...(isBackground ? [
        { label: 'Upload File', icon: IconUpload, action: () => document.getElementById('fi')?.click() },
        { label: 'New Folder', icon: IconFolderPlus, action: () => creatingFolder = true },
        clipboard ? { label: 'Paste', icon: IconClipboardCheck, action: () => pasteFromInternalClipboard(), disabled: !clipboard } : null,
        ...(selectedIds.size > 0 ? [
          { label: 'Clear Selection', icon: IconSquare, action: () => selectedIds = new Set() },
        ] : [])
      ].filter(Boolean) : []),
    ] as any}
  />
{/if}

<div class="files-root" role="presentation" ondragover={handleDragOver} ondragleave={handleDragLeave}>
      <div class="content" oncontextmenu={(e) => openContextMenu(e, null)}>
        <input
          type="file"
          id="fi"
          class="hidden-input"
          onchange={(e) => {
            const fl = (e.target as HTMLInputElement).files;
            if (fl && fl.length > 0) {
              uploadFilesList(fl);
              // reset input so selecting same files again still triggers change
              (e.target as HTMLInputElement).value = "";
            }
          }}
          disabled={uploading}
          multiple
        />
        <input
          type="file"
          id="fi-dir"
          class="hidden-input"
          onchange={(e) => {
            const fl = (e.target as HTMLInputElement).files;
            if (fl) uploadDirectory(fl);
          }}
          disabled={uploading}
          webkitdirectory
        />

        {#if dragActive}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="drop-overlay"
            role="presentation"
            ondragover={(e) => e.preventDefault()}
            ondragleave={() => (dragActive = false)}
            ondrop={handleDrop}
          >
            <div class="drop-message">
              <IconArrowUp size={40} /><span>Drop to upload</span>
            </div>
          </div>
        {/if}

        <!-- Upload panel — bottom right, one row per file -->
        {#if uploadJobs.length > 0}
          <div class="upload-panel">
            <div class="up-header">
              <span>Uploading {uploadJobs.filter(j=>!j.done).length || uploadJobs.length} file{uploadJobs.length > 1 ? 's' : ''}</span>
              {#if uploadJobs.every(j => j.done)}
                <button class="up-close" onclick={() => uploadJobs = []}>✕</button>
              {/if}
            </div>
            {#each uploadJobs as job (job.id)}
              <div class="up-row">
                <div class="up-name" title={job.name}>{job.name}</div>
                {#if job.error}
                  <span class="up-err">✕ {job.error}</span>
                {:else if job.done}
                  <span class="up-ok">✓</span>
                {:else}
                  <div class="up-bar">
                    <div class="up-fill" style="width:{job.progress}%"></div>
                  </div>
                  <span class="up-pct">{job.progress}%</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="toolbar" onclick={(e) => e.stopPropagation()} role="presentation">
          <div class="toolbar-left">
            <div class="search-wrap">
              {#if syncing}<div class="sync-dot"></div>{/if}
              <IconSearch size={15} /><input
                class="search"
                type="text"
                placeholder="Search files..."
                oninput={onSearch}
              />
            </div>
          </div>
          <div class="toolbar-right">
            <label for="fi" class="tb-btn" title="Upload file"
              >{#if uploading}<div class="spin-sm"></div>{:else}<IconUpload
                  size={15}
                /> Upload{/if}</label
            >
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <label for="fi-dir" class="tb-btn" title="Upload folder (Shift+Click to create empty folder)"
              onclick={(e) => { if (e.shiftKey) { e.preventDefault(); creatingFolder = true; newFolderName = ""; } }}>
              <IconFolderUp size={15} /> Folder
            </label>
            <button
              class="tb-btn"
              onclick={() => (viewMode = viewMode === "list" ? "grid" : "list")}
              title="Toggle view"
            >
              {#if viewMode === "list"}<IconLayoutGrid
                  size={15}
                />{:else}<IconLayoutList size={15} />{/if}
            </button>
            <div class="sort-wrap">
              <button
                class="tb-btn"
                onclick={() => (sortDir = sortDir === "asc" ? "desc" : "asc")}
              >
                {#if sortDir === "asc"}<IconSortAscending
                    size={15}
                  />{:else}<IconSortDescending size={15} />{/if}
              </button>
              <select class="sort-select" bind:value={sortBy}>
                <option value="date">Date</option><option value="name"
                  >Name</option
                ><option value="size">Size</option><option value="type"
                  >Type</option
                >
              </select>
            </div>
            <select class="filter-select" bind:value={filterType}>
              <option value="all">All types</option><option value="image"
                >Images</option
              ><option value="video">Videos</option>
              <option value="audio">Audio</option><option value="document"
                >Documents</option
              ><option value="archive">Archives</option>
            </select>
            <span class="count"
              >{processedFiles.length} file{processedFiles.length !== 1
                ? "s"
                : ""}</span
            >
          </div>
        </div>

        {#if selectedIds.size > 0}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="bulk-bar" onclick={(e) => e.stopPropagation()} role="presentation">
            <span class="bulk-count">{selectedIds.size} selected</span>
            <button class="bulk-btn danger" onclick={() => showDeleteConfirm = true}
              ><IconTrash size={14} /> Delete</button
            >
            <button class="bulk-btn" onclick={() => bulkTogglePublic(true)}
              ><IconWorld size={14} /> Public</button
            >
            <button class="bulk-btn" onclick={() => bulkTogglePublic(false)}
              ><IconLock size={14} /> Private</button
            >
            <button class="bulk-btn" onclick={bulkDownloadZip}
              ><IconDownload size={14} /> ZIP</button
            >
            <button class="bulk-btn" onclick={() => (selectedIds = new Set())}
              ><IconX size={14} /> Clear</button
            >
          </div>
        {/if}

        <!-- Breadcrumb navigation -->
        {#if currentPath.length > 0 || currentFolderId}
          <div class="breadcrumb">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="bc-item bc-root" onclick={() => currentFolderId = undefined}>
              <IconHome size={12} stroke={2.5} />
              Home
            </span>
            {#each currentPath as crumb}
              <span class="bc-sep">›</span>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="bc-item" class:bc-active={crumb.folderId === currentFolderId}
                onclick={() => currentFolderId = crumb.folderId}>
                {crumb.name}
              </span>
            {/each}
          </div>
        {/if}


        <!-- Unified File & Folder View -->
        {#if filesLoading}
          <div class="file-list skeleton-list">
            {#each {length: 8} as _, i}
              <div class="file-row skel-row" style="opacity:{1 - i*0.09}">
                <div class="skel skel-icon"></div>
                <div class="skel skel-name" style="width:{55 + (i % 4)*10}%"></div>
                <div class="skel skel-meta"></div>
                <div class="skel skel-meta"></div>
              </div>
            {/each}
          </div>
        {:else if processedFiles.length === 0 && currentFolders.length === 0 && !creatingFolder}
          <div class="empty">{currentFolderId ? 'Empty folder.' : 'No files yet. Upload something!'}</div>
        {:else if viewMode === "list"}
          <div class="file-list">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="file-row file-row-header" onclick={(e) => e.stopPropagation()} role="presentation">
              <button class="check-btn" onclick={toggleSelectAll}
                >{#if allSelected}<IconSquareCheck
                    size={16}
                  />{:else}<IconSquare size={16} />{/if}</button
              >
              <span class="fh-name">Name</span><span class="fh-size">Size</span
              ><span class="fh-date">Date</span><span class="fh-actions"
                >Actions</span
              >
            </div>

            <!-- Creating Folder Row -->
            {#if creatingFolder}
              <div class="file-row creating-folder-row">
                <button class="check-btn" disabled><IconSquare size={16} /></button>
                <span class="grip" style="opacity: 0.3"><IconGripVertical size={14} /></span>
                <span class="ficon">
                  <IconFolder size={18} stroke={1.5} color="#fbbf24" />
                </span>
                <div class="finfo">
                  <input class="folder-rename-input" type="text" bind:value={newFolderName}
                    use:selectOnMount
                    placeholder="New Folder"
                    onkeydown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') creatingFolder = false; }}
                  />
                </div>
                <span class="fsize">--</span>
                <span class="fdate">Just now</span>
                <div class="factions">
                  <span class="folder-hint">Press Enter</span>
                </div>
              </div>
            {/if}

            <!-- Folder Rows -->
            {#each currentFolders as folder (folder.folderId)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="file-row folder-row" 
                class:selected={selectedIds.has(folder.folderId)}
                class:context-active={contextActiveId === folder.folderId}
                oncontextmenu={(e) => openContextMenu(e, folder)}
                onclick={(e) => handleFileClick(e, folder.folderId)}
                ondblclick={() => currentFolderId = folder.folderId}
                ondragover={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over-folder'); }}
                ondragleave={(e) => e.currentTarget.classList.remove('drag-over-folder')}
                ondrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over-folder'); if (dragSrcIdx !== null) moveFileToFolder(processedFiles[dragSrcIdx]?.metaFileId, folder.folderId); }}>
                
                <button
                  class="check-btn"
                  class:visible-selected={selectedIds.has(folder.folderId)}
                  onclick={(e) => handleFileClick(e, folder.folderId, true)}
                >
                  {#if selectedIds.has(folder.folderId)}<IconSquareCheck
                      size={18}
                      stroke={2}
                      color="var(--accent)"
                    />{:else}<IconSquare size={18} stroke={1.5} />{/if}
                </button>
                <span class="grip" style="opacity: 0.3"><IconGripVertical size={14} /></span>
                <span class="ficon">
                  <IconFolder size={18} stroke={1.5} color="#fbbf24" />
                </span>
                <div class="finfo">
                  {#if renamingFolderId === folder.folderId}
                    <input class="folder-rename-input" type="text" bind:value={renameFolderValue}
                      use:selectOnMount
                      onkeydown={(e) => { if (e.key === 'Enter') renameFolder(folder.folderId, renameFolderValue); if (e.key === 'Escape') renamingFolderId = null; }}
                      onclick={(e) => e.stopPropagation()}
                    />
                  {:else}
                    <button class="fname" onclick={(e) => { e.stopPropagation(); currentFolderId = folder.folderId; }}>
                      {#if folder.favorite}<IconStarFilled size={11} style="color: #fbbf24" />{/if}
                      {folder.name}
                    </button>
                  {/if}
                  <div class="ftags">
                    <span class="ftag folder-tag">{files.filter(f => f.folderId === folder.folderId).length} items</span>
                    {#if folder.public}<span class="ftag public-tag"><IconWorld size={10} /> Public</span>{/if}
                  </div>
                </div>
                <span class="fsize">{formatBytes(getFolderSize(folder.folderId))}</span>
                <span class="fdate">{formatDate(folder.createdAt)}</span>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="factions" onclick={(e) => e.stopPropagation()} role="presentation">
                  <button class="act-btn" title="Open" onclick={(e) => { e.stopPropagation(); currentFolderId = folder.folderId; }}>
                    <IconChevronRight size={14} stroke={2.5} />
                  </button>
                  <button class="act-btn" class:active={folder.favorite} title="Favorite" onclick={(e) => { e.stopPropagation(); toggleFolderFavorite(folder); }}>
                    {#if folder.favorite}<IconStarFilled size={14} color="#fbbf24"/>{:else}<IconStar size={14} />{/if}
                  </button>
                  <button class="act-btn" class:active={folder.public} title="Public (Shift+Click for recursive)" onclick={(e) => toggleFolderPublic(folder, e.shiftKey)}>
                    {#if folder.public}<IconWorld size={14} color="#4ade80"/>{:else}<IconLock size={14} />{/if}
                  </button>
                  <a class="act-btn" title="Download as zip"
                    onclick={(e) => e.stopPropagation()}
                    href={`/api/telegram/downloadFolder?api_key=${apiKey}&folder_id=${folder.folderId}`}
                    download={folder.name + '.zip'}>
                    <IconDownload size={14}/>
                  </a>
                  <button class="act-btn" title="Rename" onclick={(e) => { e.stopPropagation(); renamingFolderId = folder.folderId; renameFolderValue = folder.name; }}>
                    <IconEdit size={14}/>
                  </button>
                  <button class="act-btn danger" title="Delete" onclick={(e) => { e.stopPropagation(); triggerFolderDelete(folder.folderId); }}>
                    <IconTrash size={14}/>
                  </button>
                </div>
              </div>
            {/each}
            {#each processedFiles as file, idx (file.metaFileId)}
              {@const FileIcon = fileIconComponent(file.type)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="file-row"
                oncontextmenu={(e) => openContextMenu(e, file)}
                onclick={(e) => handleFileClick(e, file.metaFileId)}
                class:selected={selectedIds.has(file.metaFileId)}
                class:context-active={contextActiveId === file.metaFileId}
                class:drag-over={dragOverIdx === idx}
                draggable="true"
                ondragstart={() => reorderDragStart(idx)}
                ondragover={(e) => reorderDragOver(e, idx)}
                ondrop={() => reorderDrop(idx)}
                ondragend={() => {
                  dragSrcIdx = null;
                  dragOverIdx = null;
                }}
              >
                <button
                  class="check-btn"
                  class:visible-selected={selectedIds.has(file.metaFileId)}
                  onclick={(e) => handleFileClick(e, file.metaFileId, true)}
                >
                  {#if selectedIds.has(file.metaFileId)}<IconSquareCheck
                      size={18}
                      stroke={2}
                      color="var(--accent)"
                    />{:else}<IconSquare size={18} stroke={1.5} />{/if}
                </button>
                <span class="grip"><IconGripVertical size={14} /></span>
                <span class="ficon">
                  <FileIcon size={18} stroke={1.5} />
                </span>
                <div class="finfo">
                  {#if renamingFileId === file.metaFileId}
                    <input class="folder-rename-input" type="text" bind:value={renameFileValue}
                      use:selectOnMount
                      onkeydown={(e) => { if (e.key === 'Enter') renameFile(file.metaFileId, renameFileValue); if (e.key === 'Escape') renamingFileId = null; }}
                      onclick={(e) => e.stopPropagation()}
                    />
                  {:else}
                    <button class="fname" onclick={(e) => { e.stopPropagation(); openPreview(file); }}>
                      {#if file.favorite}<IconStarFilled
                          size={12}
                          class="star-inline"
                        />{/if}
                      {file.fileName}
                    </button>
                  {/if}
                  {#if file.tags && file.tags.length > 0}
                    <div class="ftags">
                      {#each file.tags as tag}<span class="ftag">{tag}</span
                        >{/each}
                    </div>
                  {/if}
                </div>
                <span class="fsize">{formatBytes(file.totalBytes)}</span>
                <span class="fdate">{formatDate(file.time)}</span>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="factions" onclick={(e) => e.stopPropagation()} role="presentation">
                  <button
                    class="act-btn"
                    onclick={(e) => { e.stopPropagation(); toggleFavorite(file); }}
                    title={file.favorite ? "Unfavorite" : "Favorite"}
                  >
                    {#if file.favorite}<IconStarFilled
                        size={14}
                        color="#fbbf24"
                      />{:else}<IconStar size={14} />{/if}
                  </button>
                  <button
                    class="act-btn"
                    onclick={(e) => { e.stopPropagation(); renamingFileId = file.metaFileId; renameFileValue = file.fileName; }}
                    title="Rename"><IconEdit size={14} /></button
                  >
                  {#if file.public}
                    <button class="act-btn" title="Public Link — hover for QR, click to copy"
                      onmouseenter={(e) => onQrMouseEnter(e, `${location.origin}/public/${getFullFilePath(file)}`)}
                      onmouseleave={onQrMouseLeave}
                      onclick={(e) => onQrClick(e, `${location.origin}/public/${getFullFilePath(file)}`)}>
                      <IconLink size={14}/>
                    </button>
                    {#if isTextLikeFile(file)}
                      <a class="act-btn" title="Raw text" href={`/raw/${getFullFilePath(file)}`} target="_blank" onclick={(e) => e.stopPropagation()} style="font-size:10px;font-family:monospace;font-weight:700;padding:0 5px;">
                        RAW
                      </a>
                    {/if}
                  {/if}
                  <button
                    class="act-btn"
                    class:active={file.public}
                    onclick={(e) => { e.stopPropagation(); togglePublic(file); }}
                    disabled={togglingPublic === file.metaFileId}
                    title={file.public ? "Make private" : "Make public"}
                  >
                    {#if file.public}<IconWorld size={14} />{:else}<IconLock
                        size={14}
                      />{/if}
                  </button>
                  <a
                    class="act-btn"
                    href={`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`}
                    download={file.fileName}
                    onclick={(e) => e.stopPropagation()}
                    title="Download"><IconDownload size={14} /></a
                  >
                  {#if folders.length > 0}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="move-menu-wrap" onclick={(e) => e.stopPropagation()} role="presentation">
                      <button class="act-btn" title="Move to folder"
                        onclick={(e) => { e.stopPropagation(); movingFileId = movingFileId === file.metaFileId ? null : file.metaFileId; }}>
                        <IconFolder size={14} stroke={2} />
                      </button>
                      {#if movingFileId === file.metaFileId}
                        <div class="move-menu">
                          {#if file.folderId}
                            <button class="move-item" onclick={(e) => { e.stopPropagation(); moveFileToFolder(file.metaFileId, undefined); }}>
                              <IconHome size={12} stroke={2} />
                              Root
                            </button>
                          {/if}
                          {#each folders.filter(f => f.folderId !== file.folderId) as f}
                            <button class="move-item" onclick={(e) => { e.stopPropagation(); moveFileToFolder(file.metaFileId, f.folderId); }}>
                              <IconFolder size={12} stroke={1.5} color="#fbbf24" fill="currentColor" />
                              {f.name}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                  <button
                    class="act-btn danger"
                    onclick={(e) => { e.stopPropagation(); triggerDelete(file); }}
                    disabled={deleting === file.metaFileId}
                    title="Delete"><IconTrash size={14} /></button
                  >
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="file-grid">
            <!-- Creating Folder Card -->
            {#if creatingFolder}
              <div class="grid-card creating">
                <button class="grid-preview folder-preview">
                  <IconFolder size={56} stroke={1.2} color="#fbbf24" />
                </button>
                <div class="grid-info">
                  <input class="folder-rename-input" type="text" bind:value={newFolderName}
                    use:selectOnMount
                    placeholder="New Folder"
                    onkeydown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') creatingFolder = false; }}
                  />
                </div>
              </div>
            {/if}

            <!-- Folder Cards -->
            {#each currentFolders as folder (folder.folderId)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="grid-card folder-card"
                oncontextmenu={(e) => openContextMenu(e, folder)}
                onclick={(e) => handleFileClick(e, folder.folderId)}
                class:selected={selectedIds.has(folder.folderId)}
                class:context-active={contextActiveId === folder.folderId}
                ondblclick={() => currentFolderId = folder.folderId}
                ondragover={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over-folder'); }}
                ondragleave={(e) => e.currentTarget.classList.remove('drag-over-folder')}
                ondrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over-folder'); if (dragSrcIdx !== null) moveFileToFolder(processedFiles[dragSrcIdx]?.metaFileId, folder.folderId); }}>
                
                <button
                  class="grid-check"
                  class:visible={selectedIds.has(folder.folderId)}
                  onclick={(e) => handleFileClick(e, folder.folderId, true)}
                >
                  {#if selectedIds.has(folder.folderId)}<IconSquareCheck
                      size={16}
                    />{:else}<IconSquare size={16} />{/if}
                </button>

                <button class="grid-preview folder-preview" onclick={() => (currentFolderId = folder.folderId)}>
                  <IconFolder size={56} stroke={1.2} color="#fbbf24" />
                  <div class="folder-badge">{files.filter(f => f.folderId === folder.folderId).length} items</div>
                </button>
                <div class="grid-info">
                  <div class="grid-name">
                    {#if folder.favorite}<IconStarFilled size={11} style="color: #fbbf24" />{/if}
                    {#if renamingFolderId === folder.folderId}
                      <input class="folder-rename-input" type="text" bind:value={renameFolderValue}
                        use:selectOnMount
                        onkeydown={(e) => { if (e.key === 'Enter') renameFolder(folder.folderId, renameFolderValue); if (e.key === 'Escape') renamingFolderId = null; }}
                        onclick={(e) => e.stopPropagation()}
                      />
                    {:else}
                      <button class="fname-btn" onclick={(e) => { e.stopPropagation(); currentFolderId = folder.folderId; }}>
                        {folder.name}
                      </button>
                    {/if}
                  </div>
                  <span class="grid-meta">{formatBytes(getFolderSize(folder.folderId))}</span>
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="grid-actions" onclick={(e) => e.stopPropagation()} role="presentation">
                    <button class="act-btn sm" title="Open" onclick={(e) => { e.stopPropagation(); currentFolderId = folder.folderId; }}>
                        <IconChevronRight size={14} stroke={2.5} />
                    </button>
                    <button class="act-btn sm" class:active={folder.favorite} title="Favorite" onclick={(e) => { e.stopPropagation(); toggleFolderFavorite(folder); }}>
                        {#if folder.favorite}<IconStarFilled size={13} color="#fbbf24"/>{:else}<IconStar size={13} />{/if}
                    </button>
                    <button class="act-btn sm" class:active={folder.public} title="Public (Shift+Click for recursive)" onclick={(e) => toggleFolderPublic(folder, e.shiftKey)}>
                        {#if folder.public}<IconWorld size={13} color="#4ade80"/>{:else}<IconLock size={13} />{/if}
                    </button>
                    <button class="act-btn sm" title="Rename" onclick={(e) => { e.stopPropagation(); renamingFolderId = folder.folderId; renameFolderValue = folder.name; }}>
                        <IconEdit size={13}/>
                    </button>
                    <button class="act-btn sm" title="Delete" onclick={(e) => { e.stopPropagation(); triggerFolderDelete(folder.folderId); }}>
                        <IconTrash size={13}/>
                    </button>
                </div>
              </div>
            {/each}
            {#each processedFiles as file (file.metaFileId)}
              <div
                class="grid-card"
                oncontextmenu={(e) => openContextMenu(e, file)}
                onclick={(e) => handleFileClick(e, file.metaFileId)}
                class:selected={selectedIds.has(file.metaFileId)}
                class:context-active={contextActiveId === file.metaFileId}
              >
                <button
                  class="grid-check"
                  class:visible={selectedIds.has(file.metaFileId)}
                  onclick={(e) => handleFileClick(e, file.metaFileId, true)}
                >
                  {#if selectedIds.has(file.metaFileId)}<IconSquareCheck
                      size={16}
                    />{:else}<IconSquare size={16} />{/if}
                </button>
                <button class="grid-preview" onclick={() => openPreview(file)}>
                  {#if file.type.startsWith("image/")}
                    <img
                      loading="lazy"
                      src={`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}`}
                      alt={file.fileName}
                      class="grid-thumb"
                    />
                  {:else}
                    {@const FileIcon = fileIconComponent(file.type)}
                    <div class="grid-icon">
                      <FileIcon size={40} stroke={1.2} />
                    </div>
                  {/if}
                </button>
                <div class="grid-info">
                  <div class="grid-name">
                    {#if file.favorite}<IconStarFilled size={11} />{/if}
                    {#if renamingFileId === file.metaFileId}
                      <input class="folder-rename-input" type="text" bind:value={renameFileValue}
                        use:selectOnMount
                        onkeydown={(e) => { if (e.key === 'Enter') renameFile(file.metaFileId, renameFileValue); if (e.key === 'Escape') renamingFileId = null; }}
                        onclick={(e) => e.stopPropagation()}
                      />
                    {:else}
                      <button class="fname-btn" onclick={(e) => { e.stopPropagation(); openPreview(file); }}>
                        {file.fileName}
                      </button>
                    {/if}
                  </div>
                  <span class="grid-meta">{formatBytes(file.totalBytes)}</span>
                </div>
                <div class="grid-actions" onclick={(e) => e.stopPropagation()}>
                    <button
                     class="act-btn sm"
                     onclick={(e) => { e.stopPropagation(); renamingFileId = file.metaFileId; renameFileValue = file.fileName; }}
                     title="Rename"
                     ><IconEdit size={13} /></button
                   >
                  <a
                    class="act-btn sm"
                    href={`/api/telegram/getRequestFile?api_key=${apiKey}&meta_file_id=${file.metaFileId}&download=true`}
                    download={file.fileName}
                    onclick={(e) => e.stopPropagation()}
                    ><IconDownload size={13} /></a
                  >
                  <button
                    class="act-btn sm danger"
                    onclick={(e) => { e.stopPropagation(); triggerDelete(file); }}
                    title="Delete"
                    ><IconTrash size={13} /></button
                  >
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <footer class="storage-footer">
        <span>📁 {files.length} file{files.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span
          >💾 {totalSize.toLocaleString()} bytes (~{formatBytes(
            totalSize,
          )})</span
        >
      </footer>
    </div>

  {#if preview}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- QR Popover -->
      {#if qrAnchor && qrUrl}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="qr-popover"
          style="left:{qrAnchor.x}px; top:{qrAnchor.y}px;"
          onmouseenter={onQrPopoverEnter}
          onmouseleave={onQrMouseLeave}
          onclick={(e) => e.stopPropagation()}>
          {#if qrDataUrl}
            <img src={qrDataUrl} alt="QR code" class="qr-img" width="180" height="180" />
          {:else}
            <div class="qr-loading">Generating…</div>
          {/if}
          <div class="qr-url">{qrUrl}</div>
          <div class="qr-hint">{qrCopied ? "✓ Copied!" : "Click icon to copy"}</div>
          <a class="qr-open" href={qrUrl} target="_blank" rel="noopener">Open link ↗</a>
        </div>
      {/if}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal-wrap" onclick={(e) => e.stopPropagation()} role="presentation">
        <PreviewModal
          {preview}
          {previewUrl}
          {previewLoading}
          {apiKey}
          {togglingPublic}
          {deleting}
          onclose={closePreview}
          ontogglePublic={togglePublic}
          ondelete={triggerDelete}
        />
      </div>
  {/if}
  {#if sidebarFile}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="sidebar-wrap" onclick={(e) => e.stopPropagation()} role="presentation">
      <DetailsSidebar
        item={sidebarFileWithMeta}
        {apiKey}
        {folders}
        {getFullFilePath}
        onclose={() => (sidebarFile = null)}
        onrename={(item) => { 
          if (item._type === 'folder') {
            renamingFolderId = item.folderId; renameFolderValue = item.name;
          } else {
            renamingFileId = item.metaFileId; renameFileValue = item.fileName;
          }
          sidebarFile = null; 
        }}
        ontogglePublic={(item) => item._type === 'folder' ? toggleFolderPublic(item, false) : togglePublic(item)}
        ondelete={(item) => item._type === 'folder' ? triggerFolderDelete(item.folderId) : triggerDelete(item)}
        ontoggleFavorite={(item) => item._type === 'folder' ? toggleFolderFavorite(item) : toggleFavorite(item)}
        onupdateTags={updateTags}
      />
    </div>
  {/if}


  {#if showDeleteConfirm}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-overlay" onclick={(e) => { e.stopPropagation(); showDeleteConfirm = false; }} role="presentation">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal-content danger" onclick={(e) => e.stopPropagation()} role="document">
        <div class="modal-header">
          <IconTrash size={24} stroke={1.5} class="msg-icon danger" />
          <h3>Delete Permanently?</h3>
        </div>
        <p class="modal-msg">
          {#if folderToDeleteId}
            Are you sure you want to delete this folder and all its contents? This action cannot be undone.
          {:else if selectedIds.size === 1}
            Are you sure you want to delete this file? This action cannot be undone.
          {:else}
            Are you sure you want to delete {selectedIds.size} files? This action cannot be undone.
          {/if}
        </p>
        <div class="modal-actions">
          <button class="modal-btn secondary" onclick={() => { showDeleteConfirm = false; folderToDeleteId = null; }}>Cancel</button>
          <button class="modal-btn danger-primary" onclick={executeDelete}>
            {#if filesLoading}...{:else}Delete {folderToDeleteId ? 'Folder' : (selectedIds.size > 1 ? 'Items' : 'Item')}{/if}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if renamingFileId}
    <!-- No modal needed, handled inline -->
  {/if}

<style>

  /* Login */
  /* App */
  .files-root {
    width: 100%;
  }
  .content {
    padding: 20px 24px;
    max-width: 1100px;
    margin: 0 auto;
    width: 100%;
    flex: 1;
  }
  @media (max-width: 600px) {
    .content { padding: 12px 12px; }
  }
  .hidden-input {
    display: none;
  }

  /* Drop overlay */
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--border-hover);
  }
  .drop-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: var(--text-3);
    font-size: 16px;
  }

  /* ── Upload panel — bottom-right, stacked per file ── */
  .upload-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    width: 300px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.45);
    overflow: hidden;
    animation: up-in .18s ease;
  }
  @keyframes up-in {
    from { opacity:0; transform: translateY(10px); }
    to   { opacity:1; transform: translateY(0); }
  }
  .up-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
  }
  .up-close {
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    font-size: 13px;
    padding: 0 2px;
    line-height: 1;
  }
  .up-close:hover { color: var(--text-1); }
  .up-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .up-row:last-child { border-bottom: none; }
  .up-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-1);
  }
  .up-bar {
    width: 60px;
    height: 4px;
    background: var(--bg-3);
    border-radius: 99px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .up-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 99px;
    transition: width .2s ease;
  }
  .up-pct {
    font-size: 11px;
    color: var(--text-3);
    min-width: 30px;
    text-align: right;
  }
  .up-ok  { color: var(--green); font-size: 13px; }
  .up-err { color: var(--red); font-size: 11px; flex: 1; }

  /* ── Skeleton loading ── */
  .skeleton-list { pointer-events: none; }
  .skel-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--border);
    animation: skel-pulse 1.4s ease-in-out infinite;
  }
  @keyframes skel-pulse {
    0%,100% { opacity: 1; }
    50%      { opacity: .45; }
  }
  .skel {
    background: var(--bg-3);
    border-radius: 5px;
    flex-shrink: 0;
  }
  .skel-icon { width: 20px; height: 20px; border-radius: 4px; margin-left: 4px; }
  .skel-name { height: 12px; flex-shrink: 1; }
  .skel-meta { width: 56px; height: 11px; }

  /* ── Sync dot ── */
  .sync-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent);
    opacity: .7;
    animation: sync-blink .9s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes sync-blink {
    0%,100% { opacity: .7; }
    50%      { opacity: .15; }
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .toolbar-left {
    flex: 1;
    min-width: 200px;
  }
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0 12px;
    color: var(--text-3);
  }
  .search {
    flex: 1;
    background: none;
    border: none;
    padding: 8px 0;
    color: var(--text-1);
    font-size: 13px;
    font-family: "Geist", sans-serif;
    outline: none;
  }
  .search::placeholder {
    color: var(--text-3);
  }
  .tb-btn {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 12px;
    color: var(--text-2);
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    transition:
      border-color 0.15s,
      color 0.15s;
    white-space: nowrap;
    font-family: "Geist", sans-serif;
    text-decoration: none;
  }
  .tb-btn:hover {
    border-color: var(--border-hover);
    color: var(--text-1);
  }
  .sort-wrap {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .sort-select,
  .filter-select {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 8px;
    color: var(--text-2);
    font-size: 12px;
    font-family: "Geist", sans-serif;
    cursor: pointer;
    outline: none;
  }
  .count {
    font-size: 12px;
    color: var(--text-3);
    white-space: nowrap;
  }

  /* Bulk bar */
  .bulk-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 12px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    flex-wrap: wrap;
  }
  .bulk-count {
    font-size: 13px;
    color: var(--text-2);
    font-weight: 500;
  }
  .bulk-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 5px 10px;
    color: var(--text-2);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: "Geist", sans-serif;
    transition: all 0.15s;
  }
  .bulk-btn:hover {
    border-color: var(--border-hover);
    color: var(--text-1);
  }
  .bulk-btn.danger:hover {
    border-color: var(--red-border);
    color: var(--red);
  }

  /* Spinner */
  .spin-sm {
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--border);
    border-top-color: var(--text-2);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* File list */
  .file-list {
    display: flex;
    flex-direction: column;
  }
  .file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    transition: background 0.1s;
    font-size: 13px;
  }
  .file-row:hover {
    background: var(--bg-2);
  }
  .file-row.selected, .file-row.context-active {
    background: var(--bg-3);
  }
  .file-row.drag-over {
    border-top: 2px solid var(--accent);
  }
  .file-row-header {
    font-size: 11px;
    color: var(--text-3);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 2px;
  }
  .file-row-header:hover {
    background: transparent;
  }
  .check-btn {
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 2px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.1s;
  }
  .file-row:hover .check-btn,
  .file-row.selected .check-btn {
    opacity: 1;
    pointer-events: auto;
  }
  .check-btn:hover {
    color: var(--text-1);
  }
  .grip {
    color: var(--text-3);
    cursor: grab;
    flex-shrink: 0;
    display: flex;
    opacity: 0;
    transition: opacity 0.1s;
  }
  .file-row:hover .grip {
    opacity: 1;
  }
  .ficon {
    flex-shrink: 0;
    color: var(--text-3);
    display: flex;
  }
  .finfo {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .fname {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-1);
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: "Geist", sans-serif;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: color 0.1s;
  }
  .fname:hover {
    color: var(--accent);
  }
  .fname-btn {
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0;
    margin: 0;
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }
  .fname-btn:hover {
    color: var(--text-1);
    text-decoration: underline;
  }
  .ftags {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  .ftag {
    font-size: 10px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0 6px;
    color: var(--text-3);
  }
  .fsize {
    font-size: 12px;
    color: var(--text-3);
    font-family: "Geist Mono", monospace;
    width: 80px;
    text-align: right;
    flex-shrink: 0;
  }
  .fdate {
    font-size: 11px;
    color: var(--text-3);
    font-family: "Geist Mono", monospace;
    width: 160px;
    flex-shrink: 0;
  }
  .fh-name {
    flex: 1;
  }
  .fh-size {
    width: 80px;
    text-align: right;
  }
  .fh-date {
    width: 160px;
  }
  .fh-actions {
    width: 180px;
    text-align: right;
  }
  .factions {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }
  .folder-tag {
    background: rgba(251, 191, 36, 0.1) !important;
    color: #fbbf24 !important;
  }
  .folder-hint {
    font-size: 10px;
    color: var(--text-dim);
    margin-right: 8px;
  }
  .folder-preview {
    background: rgba(251, 191, 36, 0.05) !important;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .folder-badge {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: var(--primary);
    color: white;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 600;
  }
  .public-tag {
    background: rgba(74, 222, 128, 0.1) !important;
    color: #4ade80 !important;
  }
  :global(.drag-over-folder) {
    border-color: #fbbf24 !important;
    background: rgba(251, 191, 36, 0.05) !important;
  }

  .act-btn {
    background: none;
    border: 1px solid transparent;
    border-radius: 5px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-3);
    text-decoration: none;
    transition: all 0.15s;
  }
  .act-btn:hover {
    border-color: var(--border);
    background: var(--bg-3);
    color: var(--text-1);
  }
  .act-btn.active {
    color: var(--green);
  }
  .act-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .act-btn.danger:hover {
    color: var(--red);
    border-color: var(--red-border);
  }
  .act-btn.sm {
    width: 24px;
    height: 24px;
  }

  /* Grid view */
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
  .grid-card {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    position: relative;
    transition: border-color 0.15s;
  }
  .grid-card:hover {
    border-color: var(--border-hover);
  }
  .grid-card.selected, .grid-card.context-active {
    border-color: var(--accent);
  }
  .grid-check {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 2;
    background: var(--bg-2);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-3);
    display: flex;
    padding: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .grid-card:hover .grid-check,
  .grid-card.selected .grid-check {
    opacity: 1;
  }
  .grid-preview {
    width: 100%;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-1);
    border: none;
    cursor: pointer;
    overflow: hidden;
  }
  .grid-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .grid-icon {
    color: var(--text-3);
  }
  .grid-info {
    padding: 8px 10px 4px;
  }
  .grid-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-1);
    display: flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grid-meta {
    font-size: 11px;
    color: var(--text-3);
    font-family: "Geist Mono", monospace;
  }
  .grid-actions {
    display: flex;
    gap: 2px;
    padding: 4px 8px 8px;
  }

  .empty {
    text-align: center;
    color: var(--text-3);
    font-size: 13px;
    padding: 48px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  /* Storage footer */
  .storage-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 24px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-3);
    font-family: "Geist Mono", monospace;
    background: var(--bg-1);
  }

  /* Mobile */
  @media (max-width: 768px) {
    .content {
      padding: 12px 14px;
    }
    .toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }
    .toolbar-right {
      flex-wrap: wrap;
      justify-content: flex-start;
      gap: 6px;
    }
    .file-row-header { display: none; }
    .fsize, .fdate { display: none; }
    .fh-size, .fh-date, .fh-actions { display: none; }
    .grip { display: none; }
    .file-grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
  }
  @media (max-width: 600px) {
    /* on mobile the sidebar is a bottom bar, no left margin needed */
    .content { padding: 10px 12px; }
    .toolbar-right button span { display: none; } /* hide text labels in toolbar */
    .factions { gap: 2px; }
    .act-btn { width: 26px; height: 26px; }
  }

  /* ── Folders ───────────────────────────────────────────────────────── */
  .breadcrumb {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 4px 4px; margin-bottom: 4px;
    font-size: 12.5px; color: var(--text-3);
  }
  .bc-item {
    display: flex; align-items: center; gap: 4px;
    cursor: pointer; padding: 3px 7px; border-radius: 6px;
    transition: .14s; color: var(--text-3);
  }
  .bc-item:hover { background: var(--bg-3); color: var(--text-1); }
  .bc-root { font-weight: 500; }
  .bc-active { color: var(--text-1) !important; font-weight: 500; cursor: default; }
  .bc-active:hover { background: transparent; }
  .bc-sep { color: var(--text-3); opacity: .5; user-select: none; }

  .folder-rename-input { width: 100%; background: var(--bg-1); border: 1px solid var(--accent); border-radius: 4px; padding: 1px 6px; color: var(--text-1); font-size: 12px; outline: none; }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal-content {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px;
    width: 400px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    animation: modalPop 0.2s ease-out;
  }
  @keyframes modalPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .modal-header {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 1.2rem;
    color: var(--text-1);
    margin-bottom: 4px;
  }
  :global(.msg-icon.danger) {
    color: var(--red);
  }
  .modal-msg {
    color: var(--text-2);
    line-height: 1.6;
    font-size: 14px;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 12px;
  }
  .modal-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .modal-btn.secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-2);
  }
  .modal-btn.secondary:hover {
    background: var(--bg-3);
    color: var(--text-1);
  }
  .modal-btn.danger-primary {
    background: var(--red);
    border: none;
    color: white;
  }
  .modal-btn.danger-primary:hover {
    background: #ef4444;
    transform: translateY(-1px);
  }

  /* ── QR Popover ── */
  .qr-popover {
    position: fixed;
    z-index: 301;
    transform: translateX(-50%) translateY(calc(-100% - 10px));
    background: #1a1a1a;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
    min-width: 210px;
  }
  .qr-img {
    border-radius: 6px;
    display: block;
    image-rendering: pixelated;
  }
  .qr-loading {
    width: 180px;
    height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-3);
    font-size: 12px;
  }
  .qr-url {
    font-size: 10px;
    font-family: "Geist Mono", monospace;
    color: var(--text-3);
    word-break: break-all;
    text-align: center;
    max-width: 180px;
  }
  .qr-hint {
    font-size: 10px;
    color: var(--text-3);
  }
  .qr-open {
    font-size: 11px;
    color: var(--accent);
    text-decoration: none;
  }
  .qr-open:hover { text-decoration: underline; }
</style>
