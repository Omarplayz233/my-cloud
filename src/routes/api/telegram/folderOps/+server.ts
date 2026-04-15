// src/lib/server/folderOps.ts

export type FolderRecord = {
  _type: 'folder';
  folderId: string;
  name: string;
  createdAt: string;
  parentId?: string;
  favorite?: boolean;
  public?: boolean;
};

export type FolderRegistryItem =
  | FolderRecord
  | Record<string, unknown>;

export type FolderOpsClientOptions = {
  /**
   * A fetch implementation.
   * In SvelteKit server code, pass `event.fetch` when possible.
   */
  fetch: typeof fetch;

  /**
   * Your API key for the Telegram storage backend.
   * Sent as `x-api-key`.
   */
  apiKey: string;

  /**
   * Defaults to `/api/telegram/folderOps`.
   * Use an absolute URL if you are calling this outside a request context.
   */
  baseUrl?: string;
};

export class FolderOpsError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = 'FolderOpsError';
    this.status = status;
    this.details = details;
  }
}

type JsonResponse<T> = {
  [key: string]: unknown;
} & T;

type GetFoldersResponse = {
  folders: FolderRecord[];
};

type CreateFolderInput = {
  name?: string;
  parentId?: string;
};

type RenameFolderInput = {
  folderId: string;
  name?: string;
  parentId?: string | null;
};

type DeleteFolderInput = {
  folderId: string;
};

type MoveFileInput = {
  metaFileId: string;
  folderId?: string | null;
};

type TogglePublicInput = {
  folderId: string;
  recursive?: boolean;
};

type DuplicateFileInput = {
  metaFileId: string;
  newName?: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return '/api/telegram/folderOps';
  return trimmed.replace(/\/+$/, '');
}

function buildUrl(baseUrl: string, apiKey: string): string {
  const url = new URL(baseUrl, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  url.searchParams.set('api_key', apiKey);
  return url.toString();
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && typeof data.error === 'string' && data.error) ||
      (typeof data === 'string' && data) ||
      `Request failed with status ${res.status}`;

    throw new FolderOpsError(message, res.status, data);
  }

  return data as T;
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    'x-api-key': apiKey.trim(),
    'Content-Type': 'application/json'
  };
}

function createClient(options: FolderOpsClientOptions) {
  const fetchImpl = options.fetch;
  const apiKey = options.apiKey.trim();
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? '/api/telegram/folderOps');

  if (!apiKey) {
    throw new FolderOpsError('Missing API key', 401);
  }

  async function request<T>(
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
    useQueryKey = false
  ): Promise<T> {
    const url = useQueryKey ? buildUrl(baseUrl, apiKey) : baseUrl;

    const res = await fetchImpl(url, {
      method,
      headers: authHeaders(apiKey),
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined
    });

    return parseJsonResponse<T>(res);
  }

  return {
    async listFolders(): Promise<FolderRecord[]> {
      const data = await request<GetFoldersResponse>('GET');
      return Array.isArray(data.folders) ? data.folders : [];
    },

    async createFolder(input: CreateFolderInput = {}): Promise<FolderRecord> {
      const data = await request<JsonResponse<{ folder: FolderRecord }>>('POST', {
        action: 'create',
        name: input.name,
        parentId: input.parentId
      });
      if (!data.folder) throw new FolderOpsError('Folder creation failed');
      return data.folder;
    },

    async renameFolder(input: RenameFolderInput): Promise<boolean> {
      await request<JsonResponse<{ ok: true }>>('POST', {
        action: 'rename',
        folderId: input.folderId,
        name: input.name,
        parentId: input.parentId
      });
      return true;
    },

    async deleteFolder(input: DeleteFolderInput): Promise<boolean> {
      await request<JsonResponse<{ ok: true }>>('POST', {
        action: 'delete',
        folderId: input.folderId
      });
      return true;
    },

    async moveFile(input: MoveFileInput): Promise<boolean> {
      await request<JsonResponse<{ ok: true }>>('POST', {
        action: 'moveFile',
        metaFileId: input.metaFileId,
        folderId: input.folderId ?? null
      });
      return true;
    },

    async toggleFavorite(folderId: string): Promise<{ favorite: boolean }> {
      const data = await request<JsonResponse<{ ok: true; favorite: boolean }>>('POST', {
        action: 'toggleFavorite',
        folderId
      });
      return { favorite: Boolean(data.favorite) };
    },

    async duplicateFile(input: DuplicateFileInput): Promise<Record<string, unknown>> {
      const data = await request<JsonResponse<{ file: Record<string, unknown> }>>('POST', {
        action: 'duplicate',
        metaFileId: input.metaFileId,
        newName: input.newName
      });
      if (!data.file) throw new FolderOpsError('Duplicate failed');
      return data.file;
    },

    async togglePublic(input: TogglePublicInput): Promise<{ public: boolean }> {
      const data = await request<JsonResponse<{ ok: true; public: boolean }>>('POST', {
        action: 'togglePublic',
        folderId: input.folderId,
        recursive: Boolean(input.recursive)
      });
      return { public: Boolean(data.public) };
    }
  };
}

/**
 * Create a reusable client bound to your fetch + API key.
 */
export function createFolderOpsClient(options: FolderOpsClientOptions) {
  return createClient(options);
}

/**
 * Convenience one-off helper for listing folders.
 */
export async function listFolders(options: FolderOpsClientOptions): Promise<FolderRecord[]> {
  return createClient(options).listFolders();
}

export async function createFolder(options: FolderOpsClientOptions, input: CreateFolderInput = {}) {
  return createClient(options).createFolder(input);
}

export async function renameFolder(options: FolderOpsClientOptions, input: RenameFolderInput) {
  return createClient(options).renameFolder(input);
}

export async function deleteFolder(options: FolderOpsClientOptions, input: DeleteFolderInput) {
  return createClient(options).deleteFolder(input);
}

export async function moveFile(options: FolderOpsClientOptions, input: MoveFileInput) {
  return createClient(options).moveFile(input);
}

export async function toggleFavorite(options: FolderOpsClientOptions, folderId: string) {
  return createClient(options).toggleFavorite(folderId);
}

export async function duplicateFile(options: FolderOpsClientOptions, input: DuplicateFileInput) {
  return createClient(options).duplicateFile(input);
}

export async function togglePublic(options: FolderOpsClientOptions, input: TogglePublicInput) {
  return createClient(options).togglePublic(input);
}

/**
 * Small helpers for UI code.
 */
export function getRootFolders(folders: FolderRecord[]): FolderRecord[] {
  return folders.filter((f) => !f.parentId);
}

export function getChildFolders(folders: FolderRecord[], parentId: string | null | undefined): FolderRecord[] {
  const pid = parentId ?? undefined;
  return folders.filter((f) => (f.parentId ?? undefined) === pid);
}

export function sortFolders(folders: FolderRecord[]): FolderRecord[] {
  return [...folders].sort((a, b) => {
    const af = a.favorite ? 1 : 0;
    const bf = b.favorite ? 1 : 0;
    if (af !== bf) return bf - af;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function buildFolderTree(folders: FolderRecord[]) {
  const map = new Map<string, FolderRecord & { children: ReturnType<typeof buildFolderTree> }>();

  for (const folder of folders) {
    map.set(folder.folderId, { ...folder, children: [] });
  }

  const roots: Array<FolderRecord & { children: ReturnType<typeof buildFolderTree> }> = [];

  for (const folder of map.values()) {
    if (folder.parentId && map.has(folder.parentId)) {
      map.get(folder.parentId)!.children.push(folder);
    } else {
      roots.push(folder);
    }
  }

  const sortNodes = (nodes: typeof roots) => {
    nodes.sort((a, b) => {
      const af = a.favorite ? 1 : 0;
      const bf = b.favorite ? 1 : 0;
      if (af !== bf) return bf - af;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    for (const node of nodes) sortNodes(node.children);
  };

  sortNodes(roots);
  return roots;
}
