/**
 * Local-only counters to answer one question: does seeing the finger placement make a
 * stuck note get found faster? Nothing leaves the device. One episode is recorded for each
 * note that took at least `MIN_EPISODE_SEC` to lock (the notes a hint could have helped).
 */
export interface HintEpisode {
  /** Wall-clock ms, for ordering only. */
  readonly at: number;
  /** Whether hints were switched on while this note was being searched for. */
  readonly hintsEnabled: boolean;
  /** Which trigger showed a hint for this note, if any. */
  readonly reason: 'stuck' | 'wrong-note' | null;
  /** Seconds from the note becoming the target to its lock. */
  readonly lockSec: number;
  /** Seconds from the hint appearing to the lock, when a hint was shown. */
  readonly afterHintSec: number | null;
}

export interface HintStatsSummary {
  readonly withHints: { readonly n: number; readonly medianLockSec: number | null; readonly medianAfterHintSec: number | null };
  readonly withoutHints: { readonly n: number; readonly medianLockSec: number | null };
}

export const MIN_EPISODE_SEC = 2;
export const HINT_EPISODES_KEY = 'violin-coach:hint-episodes';
export const HINTS_ENABLED_KEY = 'violin-coach:hints-enabled';
const MAX_EPISODES = 300;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarize(episodes: readonly HintEpisode[]): HintStatsSummary {
  // Compare like with like: a hint can fire on a note that locked in under 2 s (a wrong note),
  // while notes searched for without hints only count from 2 s on. So both groups use the
  // same cut; the time after a hint is shown is read from every episode that had one.
  const slow = episodes.filter((e) => e.lockSec >= MIN_EPISODE_SEC);
  const on = slow.filter((e) => e.hintsEnabled);
  const off = slow.filter((e) => !e.hintsEnabled);
  const after = episodes.flatMap((e) => (e.hintsEnabled && e.afterHintSec !== null ? [e.afterHintSec] : []));
  return {
    withHints: { n: on.length, medianLockSec: median(on.map((e) => e.lockSec)), medianAfterHintSec: median(after) },
    withoutHints: { n: off.length, medianLockSec: median(off.map((e) => e.lockSec)) },
  };
}

function isEpisode(v: unknown): v is HintEpisode {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.at === 'number' &&
    typeof e.hintsEnabled === 'boolean' &&
    (e.reason === null || e.reason === 'stuck' || e.reason === 'wrong-note') &&
    typeof e.lockSec === 'number' &&
    (e.afterHintSec === null || typeof e.afterHintSec === 'number')
  );
}

export function loadEpisodes(): HintEpisode[] {
  try {
    const raw = globalThis.localStorage?.getItem(HINT_EPISODES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEpisode) : [];
  } catch {
    return [];
  }
}

export function recordEpisode(episode: HintEpisode): void {
  if (episode.lockSec < MIN_EPISODE_SEC && episode.reason === null) return;
  try {
    const next = [...loadEpisodes(), episode].slice(-MAX_EPISODES);
    globalThis.localStorage?.setItem(HINT_EPISODES_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: counters are best-effort */
  }
}

export function clearEpisodes(): void {
  try {
    globalThis.localStorage?.removeItem(HINT_EPISODES_KEY);
  } catch {
    /* ignore */
  }
}

export function loadHintsEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(HINTS_ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveHintsEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(HINTS_ENABLED_KEY, enabled ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
