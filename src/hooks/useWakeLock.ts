import { useEffect, useRef } from 'react';
import {
  createWakeLockManager,
  type WakeLockManager,
  type WakeLockManagerOptions,
} from '../modules/wake-lock/wakeLockManager';

export interface UseWakeLockOptions extends WakeLockManagerOptions {
  readonly enabled: boolean;
}

/**
 * React hook to keep the mobile display awake while a component/page is active.
 * Releases the wake lock when unmounted or when enabled is false.
 */
export function useWakeLock({ enabled, idleTimeoutMs, checkIntervalMs }: UseWakeLockOptions): WakeLockManager {
  const managerRef = useRef<WakeLockManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = createWakeLockManager({ idleTimeoutMs, checkIntervalMs });
  }

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;

    if (enabled) {
      void manager.start();
      return () => {
        void manager.stop();
      };
    } else {
      void manager.stop();
    }
  }, [enabled]);

  return managerRef.current;
}
