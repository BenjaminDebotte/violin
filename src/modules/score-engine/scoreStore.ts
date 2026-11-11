import { get, set, del, entries } from 'idb-keyval';
import { TWINKLE_MUSICXML, MINUET_TIED_MUSICXML } from './demoScores';

export interface StoredScore {
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly format: 'musicxml' | 'mxl';
  readonly isBuiltIn: boolean;
  readonly xmlContent: string;
  readonly uploadedAt?: number;
  readonly folderId?: string | null;
}

export interface ScoreFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string | null;
  readonly createdAt: number;
}

export const BUILT_IN_SCORES: readonly StoredScore[] = Object.freeze([
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    fileName: 'twinkle.musicxml',
    format: 'musicxml',
    isBuiltIn: true,
    xmlContent: TWINKLE_MUSICXML,
  },
  {
    id: 'minuet-tied',
    title: 'Minuet & Tied Note Etude',
    fileName: 'minuet-tied.musicxml',
    format: 'musicxml',
    isBuiltIn: true,
    xmlContent: MINUET_TIED_MUSICXML,
  },
]);

// In-memory fallback for test environments or browsers where IndexedDB is disabled
const inMemoryStore = new Map<string, StoredScore>();
const inMemoryFolderStore = new Map<string, ScoreFolder>();

function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

const SCORE_PREFIX = 'score:';
const FOLDER_PREFIX = 'folder:';

/**
 * Lists all available scores: built-in demo scores plus persisted user scores.
 * Persisted overrides for built-in scores (e.g. customized title or folderId) are merged.
 */
export async function listStoredScores(): Promise<StoredScore[]> {
  const userScores: StoredScore[] = [];

  if (!isIndexedDbAvailable()) {
    userScores.push(...inMemoryStore.values());
  } else {
    try {
      const allEntries = await entries<string, StoredScore>();
      for (const [key, value] of allEntries) {
        if (typeof key === 'string' && key.startsWith(SCORE_PREFIX) && value) {
          userScores.push(value);
        }
      }
    } catch {
      userScores.push(...inMemoryStore.values());
    }
  }

  const builtIns = BUILT_IN_SCORES.map((builtIn) => {
    const override = userScores.find((s) => s.id === builtIn.id);
    return override ? { ...builtIn, ...override, isBuiltIn: true } : builtIn;
  });
  const nonBuiltInUserScores = userScores.filter(
    (s) => !BUILT_IN_SCORES.some((b) => b.id === s.id)
  );

  return [...builtIns, ...nonBuiltInUserScores];
}

/**
 * Retrieves a score by its unique ID (or fileName for built-ins).
 */
export async function getStoredScore(id: string): Promise<StoredScore | undefined> {
  const normalizedId = id.trim();

  // Check user scores / stored overrides first
  let userScore: StoredScore | undefined;
  if (!isIndexedDbAvailable()) {
    userScore = inMemoryStore.get(normalizedId);
  } else {
    try {
      userScore = (await get<StoredScore>(`${SCORE_PREFIX}${normalizedId}`)) ?? inMemoryStore.get(normalizedId);
    } catch {
      userScore = inMemoryStore.get(normalizedId);
    }
  }

  // Built-in scores
  const builtIn = BUILT_IN_SCORES.find(
    (s) =>
      s.id === normalizedId ||
      s.fileName === normalizedId ||
      s.id === normalizedId.replace(/\.musicxml$/i, ''),
  );

  if (builtIn) {
    return userScore ? { ...builtIn, ...userScore, isBuiltIn: true } : builtIn;
  }

  return userScore;
}

/**
 * Persists a user-uploaded score into IndexedDB (or in-memory store in test/fallback mode).
 */
export async function saveStoredScore(score: StoredScore): Promise<void> {
  inMemoryStore.set(score.id, score);

  if (isIndexedDbAvailable()) {
    try {
      await set(`${SCORE_PREFIX}${score.id}`, score);
    } catch {
      // In-memory store already updated as fallback
    }
  }
}

/**
 * Deletes a user score by its ID. Built-in scores cannot be deleted.
 */
export async function deleteStoredScore(id: string): Promise<void> {
  const normalizedId = id.trim();
  inMemoryStore.delete(normalizedId);

  if (isIndexedDbAvailable()) {
    try {
      await del(`${SCORE_PREFIX}${normalizedId}`);
    } catch {
      // In-memory store already cleared
    }
  }
}

/**
 * Renames a score (either built-in or user-uploaded) by ID.
 */
export async function renameStoredScore(id: string, newTitle: string): Promise<void> {
  const existing = await getStoredScore(id);
  if (!existing) {
    throw new Error(`Score not found: ${id}`);
  }
  const trimmedTitle = newTitle.trim();
  if (!trimmedTitle) {
    throw new Error('Score title cannot be empty');
  }
  const updated: StoredScore = {
    ...existing,
    title: trimmedTitle,
  };
  await saveStoredScore(updated);
}

/**
 * Moves a score (either built-in or user-uploaded) to a folder (or null for root).
 */
export async function moveStoredScore(id: string, targetFolderId: string | null): Promise<void> {
  const existing = await getStoredScore(id);
  if (!existing) {
    throw new Error(`Score not found: ${id}`);
  }
  const updated: StoredScore = {
    ...existing,
    folderId: targetFolderId ? targetFolderId.trim() : null,
  };
  await saveStoredScore(updated);
}

/**
 * Lists all score folders.
 */
export async function listScoreFolders(): Promise<ScoreFolder[]> {
  const folders: ScoreFolder[] = [];

  if (!isIndexedDbAvailable()) {
    folders.push(...inMemoryFolderStore.values());
  } else {
    try {
      const allEntries = await entries<string, ScoreFolder>();
      for (const [key, value] of allEntries) {
        if (typeof key === 'string' && key.startsWith(FOLDER_PREFIX) && value) {
          folders.push(value);
        }
      }
    } catch {
      folders.push(...inMemoryFolderStore.values());
    }
  }

  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Retrieves a score folder by ID.
 */
export async function getScoreFolder(id: string): Promise<ScoreFolder | undefined> {
  const normalizedId = id.trim();
  if (!isIndexedDbAvailable()) {
    return inMemoryFolderStore.get(normalizedId);
  }
  try {
    return (await get<ScoreFolder>(`${FOLDER_PREFIX}${normalizedId}`)) ?? inMemoryFolderStore.get(normalizedId);
  } catch {
    return inMemoryFolderStore.get(normalizedId);
  }
}

/**
 * Saves a score folder.
 */
export async function saveScoreFolder(folder: ScoreFolder): Promise<void> {
  const trimmedName = folder.name.trim();
  if (!trimmedName) {
    throw new Error('Folder name cannot be empty');
  }
  const normalized: ScoreFolder = {
    ...folder,
    id: folder.id.trim(),
    name: trimmedName,
    parentId: folder.parentId ? folder.parentId.trim() : null,
  };
  inMemoryFolderStore.set(normalized.id, normalized);

  if (isIndexedDbAvailable()) {
    try {
      await set(`${FOLDER_PREFIX}${normalized.id}`, normalized);
    } catch {
      // In-memory store already updated as fallback
    }
  }
}

/**
 * Renames a score folder by ID.
 */
export async function renameScoreFolder(id: string, newName: string): Promise<void> {
  const existing = await getScoreFolder(id);
  if (!existing) {
    throw new Error(`Folder not found: ${id}`);
  }
  await saveScoreFolder({
    ...existing,
    name: newName,
  });
}

/**
 * Deletes a folder and all its descendant subfolders and scores recursively.
 * Built-in scores inside deleted folders revert to Root (folderId: null).
 */
export async function deleteScoreFolder(id: string): Promise<void> {
  const rootFolderId = id.trim();
  const allFolders = await listScoreFolders();

  const toDeleteFolderIds = new Set<string>([rootFolderId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of allFolders) {
      if (folder.parentId && toDeleteFolderIds.has(folder.parentId) && !toDeleteFolderIds.has(folder.id)) {
        toDeleteFolderIds.add(folder.id);
        added = true;
      }
    }
  }

  // Handle scores in toDeleteFolderIds
  const allScores = await listStoredScores();
  for (const score of allScores) {
    if (score.folderId && toDeleteFolderIds.has(score.folderId)) {
      if (score.isBuiltIn) {
        await moveStoredScore(score.id, null);
      } else {
        await deleteStoredScore(score.id);
      }
    }
  }

  // Delete all identified folders
  for (const folderId of toDeleteFolderIds) {
    inMemoryFolderStore.delete(folderId);
    if (isIndexedDbAvailable()) {
      try {
        await del(`${FOLDER_PREFIX}${folderId}`);
      } catch {
        // In-memory store already cleared
      }
    }
  }
}

/**
 * Resets in-memory score storage. Helper for deterministic unit tests.
 */
export function resetInMemoryScoreStore(): void {
  inMemoryStore.clear();
  inMemoryFolderStore.clear();
}
