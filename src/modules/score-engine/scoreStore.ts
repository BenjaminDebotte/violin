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

function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

const SCORE_PREFIX = 'score:';

/**
 * Lists all available scores: built-in demo scores plus persisted user scores.
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

  return [...BUILT_IN_SCORES, ...userScores];
}

/**
 * Retrieves a score by its unique ID (or fileName for built-ins).
 */
export async function getStoredScore(id: string): Promise<StoredScore | undefined> {
  const normalizedId = id.trim();

  // Check user scores first
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

  if (userScore) {
    return userScore;
  }

  // Fallback to built-in scores
  const builtIn = BUILT_IN_SCORES.find(
    (s) =>
      s.id === normalizedId ||
      s.fileName === normalizedId ||
      s.id === normalizedId.replace(/\.musicxml$/i, ''),
  );

  return builtIn;
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
 * Resets in-memory score storage. Helper for deterministic unit tests.
 */
export function resetInMemoryScoreStore(): void {
  inMemoryStore.clear();
}
