export const WAKE_LOCK_STORAGE_KEY = 'violin:wake-lock:enabled';

export function isWakeLockSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'wakeLock' in navigator &&
    typeof (navigator as unknown as { wakeLock?: { request: unknown } }).wakeLock?.request === 'function'
  );
}

export function loadWakeLockEnabled(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(WAKE_LOCK_STORAGE_KEY);
    return raw !== 'off' && raw !== 'false';
  } catch {
    return true;
  }
}

export function saveWakeLockEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(WAKE_LOCK_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* private mode / storage unavailable */
  }
}

export interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
}

export interface WakeLockManagerOptions {
  /** Maximum idle time with no audio or touch activity before lock is released (default 5 minutes). */
  readonly idleTimeoutMs?: number;
  /** Frequency to evaluate idle time (default 10 seconds). */
  readonly checkIntervalMs?: number;
}

export interface WakeLockManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  reportActivity(): void;
  isActive(): boolean;
}

/**
 * Manages the Screen Wake Lock lifecycle with automatic visibility change re-acquisition
 * and idle battery protection.
 */
export function createWakeLockManager(options: WakeLockManagerOptions = {}): WakeLockManager {
  const idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60 * 1000;
  const checkIntervalMs = options.checkIntervalMs ?? 10 * 1000;

  let running = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let lastActivity = Date.now();
  let idleReleased = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const requestLock = async () => {
    if (!running || !isWakeLockSupported()) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    try {
      const nav = navigator as unknown as {
        wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };
      const newSentinel = await nav.wakeLock.request('screen');
      sentinel = newSentinel;
      idleReleased = false;

      newSentinel.addEventListener?.('release', () => {
        if (sentinel === newSentinel) {
          sentinel = null;
        }
      });
    } catch {
      // OS rejected (e.g. low-power mode) or permissions denied; fail silently
      sentinel = null;
    }
  };

  const releaseLock = async () => {
    if (sentinel) {
      try {
        await sentinel.release();
      } catch {
        /* ignore */
      }
      sentinel = null;
    }
  };

  const reportActivity = () => {
    lastActivity = Date.now();
    if (running && idleReleased) {
      void requestLock();
    }
  };

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible' && running && !idleReleased) {
      void requestLock();
    }
  };

  const handleUserInteraction = () => {
    reportActivity();
  };

  const checkIdle = () => {
    if (!running || idleReleased) return;
    if (Date.now() - lastActivity >= idleTimeoutMs) {
      idleReleased = true;
      void releaseLock();
    }
  };

  return {
    async start() {
      if (running) return;
      running = true;
      idleReleased = false;
      lastActivity = Date.now();

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
        window.addEventListener('keydown', handleUserInteraction, { passive: true });
      }

      intervalId = setInterval(checkIdle, checkIntervalMs);
      await requestLock();
    },

    async stop() {
      running = false;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', handleUserInteraction);
        window.removeEventListener('keydown', handleUserInteraction);
      }
      await releaseLock();
    },

    reportActivity,

    isActive() {
      return Boolean(sentinel && !sentinel.released);
    },
  };
}
