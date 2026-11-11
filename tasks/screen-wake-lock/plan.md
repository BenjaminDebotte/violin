# Plan: Screen Wake Lock

**Spec:** `docs/specs/screen-wake-lock.md`

## Architecture & Task Breakdown

1. **Task 1: Core WakeLockManager & Persistence (`src/modules/wake-lock/wakeLockManager.ts`)**
   - Implement storage helpers: `loadWakeLockEnabled()`, `saveWakeLockEnabled()`.
   - Implement `createWakeLockManager({ onLockChange, idleTimeoutMs })`:
     - Calls `navigator.wakeLock.request('screen')`.
     - Handles release on demand.
     - Listens to `visibilitychange` to re-acquire on foreground.
     - Tracks user interaction events (`pointerdown`, `keydown`, etc.) and manual `reportActivity()` calls.
     - Re-evaluates 5-minute idle inactivity timeout.
     - Re-acquires on new activity if released due to timeout.
   - Comprehensive unit tests in `tests/unit/wake-lock.test.ts`.

2. **Task 2: React Hook (`src/hooks/useWakeLock.ts`) & Settings Integration**
   - Implement `useWakeLock({ enabled, onActivity })`.
   - Update `SettingsPage.tsx` with "Keep screen awake" switch.
   - Wire hook and settings state in `src/App.tsx`.
   - Add integration tests verifying toggle in Settings, page navigation triggers, and mock wake lock status.
