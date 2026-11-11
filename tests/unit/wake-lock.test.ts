import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isWakeLockSupported,
  loadWakeLockEnabled,
  saveWakeLockEnabled,
  createWakeLockManager,
} from '../../src/modules/wake-lock/wakeLockManager';

describe('WakeLockManager', () => {
  let mockSentinel: {
    released: boolean;
    release: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let requestMock: ReturnType<typeof vi.fn>;
  let originalWakeLock: unknown;
  let visibilityStateValue: DocumentVisibilityState = 'visible';

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();

    mockSentinel = {
      released: false,
      release: vi.fn(async () => {
        mockSentinel.released = true;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    requestMock = vi.fn(async () => mockSentinel);

    originalWakeLock = (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    visibilityStateValue = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      get: () => visibilityStateValue,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'wakeLock', {
      value: originalWakeLock,
      configurable: true,
      writable: true,
    });
  });

  describe('settings persistence', () => {
    it('defaults to true when not set in localStorage', () => {
      expect(loadWakeLockEnabled()).toBe(true);
    });

    it('persists enabled state across loads', () => {
      saveWakeLockEnabled(false);
      expect(loadWakeLockEnabled()).toBe(false);

      saveWakeLockEnabled(true);
      expect(loadWakeLockEnabled()).toBe(true);
    });
  });

  describe('isWakeLockSupported', () => {
    it('returns true when navigator.wakeLock is present', () => {
      expect(isWakeLockSupported()).toBe(true);
    });

    it('returns false when navigator.wakeLock is undefined', () => {
      Object.defineProperty(navigator, 'wakeLock', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      expect(isWakeLockSupported()).toBe(false);
    });
  });

  describe('createWakeLockManager', () => {
    it('requests wake lock on start and releases on stop', async () => {
      const manager = createWakeLockManager({ idleTimeoutMs: 5 * 60 * 1000 });
      await manager.start();

      expect(requestMock).toHaveBeenCalledWith('screen');
      expect(manager.isActive()).toBe(true);

      await manager.stop();
      expect(mockSentinel.release).toHaveBeenCalled();
      expect(manager.isActive()).toBe(false);
    });

    it('handles visibility change by re-acquiring lock when returning to visible', async () => {
      const manager = createWakeLockManager();
      await manager.start();

      expect(requestMock).toHaveBeenCalledTimes(1);

      // Simulate tab hidden
      visibilityStateValue = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));

      // Simulate tab visible again
      visibilityStateValue = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));

      expect(requestMock).toHaveBeenCalledTimes(2);

      await manager.stop();
    });

    it('releases lock after 5 minutes of inactivity and re-acquires on new activity', async () => {
      const manager = createWakeLockManager({ idleTimeoutMs: 5 * 60 * 1000 });
      await manager.start();
      expect(manager.isActive()).toBe(true);

      // Advance time by 4 minutes -> still active
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(mockSentinel.release).not.toHaveBeenCalled();

      // Advance past 5 minutes total -> releases lock to save battery
      vi.advanceTimersByTime(1.5 * 60 * 1000);
      expect(mockSentinel.release).toHaveBeenCalled();
      expect(manager.isActive()).toBe(false);

      // User plays a note or touches the screen
      requestMock.mockClear();
      mockSentinel.released = false;
      manager.reportActivity();

      // Lock is re-acquired
      expect(requestMock).toHaveBeenCalledWith('screen');

      await manager.stop();
    });

    it('catches and ignores rejection gracefully if OS denies wake lock', async () => {
      requestMock.mockRejectedValueOnce(new Error('NotAllowedError'));

      const manager = createWakeLockManager();
      // Should not throw
      await expect(manager.start()).resolves.not.toThrow();
      expect(manager.isActive()).toBe(false);
    });
  });
});
