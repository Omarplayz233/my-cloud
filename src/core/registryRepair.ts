export type Registry = Record<string, any>;

const ROOT = 'root';

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

function timeScore(value: any, field: 'createdAt' | 'time'): number {
  const raw = value?.[field];
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function isFolder(value: any): boolean {
  return !!value && typeof value === 'object' && value._type === 'folder' && typeof value.folderId === 'string';
}

export function folderSignature(name: unknown, parentId?: string | null): string {
  return `${normalizeText(name)}|${parentId ?? ROOT}`;
}

export function findFolderBySignature(
  registry: Registry,
  name: string,
  parentId?: string | null
): { key: string; value: any } | null {
  const sig = folderSignature(name, parentId ?? null);

  for (const [key, value] of Object.entries(registry)) {
    if (!isFolder(value)) continue;
    if (folderSignature(value.name, value.parentId ?? null) === sig) {
      return { key, value };
    }
  }

  return null;
}

function fileSignature(value: any): string {
  const identity = value?.metaFileId || value?.telegramFileId || '';
  return [
    normalizeText(value?.fileName),
    value?.folderId ?? ROOT,
    identity,
    normalizeText(value?.type),
    String(Number(value?.totalBytes ?? 0))
  ].join('|');
}

function cloneRegistry<T extends Registry>(input: T): T {
  return JSON.parse(JSON.stringify(input ?? {}));
}

export function repairRegistry(input: Registry): Registry {
  let registry = cloneRegistry(input);

  for (let pass = 0; pass < 8; pass++) {
    const groups = new Map<string, Array<{ key: string; value: any }>>();

    for (const [key, value] of Object.entries(registry)) {
      if (!isFolder(value)) continue;
      const sig = folderSignature(value.name, value.parentId ?? null);
      const arr = groups.get(sig) ?? [];
      arr.push({ key, value });
      groups.set(sig, arr);
    }

    const redirects = new Map<string, string>();

    for (const entries of groups.values()) {
      if (entries.length < 2) continue;

      const sorted = [...entries].sort((a, b) => {
        const ta = timeScore(a.value, 'createdAt');
        const tb = timeScore(b.value, 'createdAt');
        if (tb !== ta) return tb - ta;
        return b.key.localeCompare(a.key);
      });

      const winner = sorted[0].key;
      for (const loser of sorted.slice(1)) {
        redirects.set(loser.key, winner);
      }
    }

    if (redirects.size === 0) break;

    const next: Registry = {};

    for (const [key, value] of Object.entries(registry)) {
      if (isFolder(value)) {
        if (redirects.has(key)) continue;

        const parentId = value.parentId ? (redirects.get(value.parentId) ?? value.parentId) : undefined;
        next[key] = {
          ...value,
          ...(parentId ? { parentId } : {})
        };
        continue;
      }

      const clone = { ...value };
      const folderId = clone.folderId ? (redirects.get(clone.folderId) ?? clone.folderId) : undefined;

      if (folderId && !registry[folderId]) {
        delete clone.folderId;
      } else if (folderId) {
        clone.folderId = folderId;
      } else {
        delete clone.folderId;
      }

      next[key] = clone;
    }

    registry = next;
  }

  const deduped: Registry = {};
  const fileGroups = new Map<string, Array<{ key: string; value: any }>>();

  for (const [key, value] of Object.entries(registry)) {
    if (isFolder(value)) {
      deduped[key] = value;
      continue;
    }

    const sig = fileSignature(value);
    const arr = fileGroups.get(sig) ?? [];
    arr.push({ key, value });
    fileGroups.set(sig, arr);
  }

  for (const entries of fileGroups.values()) {
    if (entries.length === 1) {
      deduped[entries[0].key] = entries[0].value;
      continue;
    }

    const sorted = [...entries].sort((a, b) => {
      const ta = timeScore(a.value, 'time');
      const tb = timeScore(b.value, 'time');
      if (tb !== ta) return tb - ta;
      return b.key.localeCompare(a.key);
    });

    deduped[sorted[0].key] = sorted[0].value;
  }

  for (const value of Object.values(deduped)) {
    if (isFolder(value)) continue;
    if (value.folderId && !deduped[value.folderId]) {
      delete value.folderId;
    }
  }

  return deduped;
}
