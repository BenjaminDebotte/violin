import { useEffect, useState } from 'react';
import type { MicSessionManager } from '../modules/pitch-detection/micSessionManager';
import type { PitchSample } from '../types/music';

/**
 * Samples the mic manager's latest filtered pitch at a display-friendly rate (~11 Hz).
 * The detection loop itself stays at 20 ms and untouched; this only decides how often
 * React repaints the big feedback panel, so glanceable text does not flicker.
 */
export function useLivePitch(
  micManager: MicSessionManager,
  enabled: boolean,
  intervalMs = 90,
): PitchSample | null {
  const [sample, setSample] = useState<PitchSample | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSample(null);
      return;
    }
    const id = setInterval(() => {
      const next = micManager.isRunning ? micManager.lastFilteredSample : null;
      setSample((prev) => {
        if (prev === next) return prev;
        if (prev && next && Math.abs(prev.frequencyHz - next.frequencyHz) < 0.05) return prev;
        return next;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [micManager, enabled, intervalMs]);

  return sample;
}

/** True when this browser cannot capture audio at all (e.g. insecure origin, test DOM). */
export function isMicUnsupported(): boolean {
  return (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  );
}
