# Todo: Screen Wake Lock

## Task 1: Core WakeLockManager & Unit Tests
- [x] Create `src/modules/wake-lock/wakeLockManager.ts` with `loadWakeLockEnabled`, `saveWakeLockEnabled`, `isWakeLockSupported`, and `createWakeLockManager`.
- [x] Handle `visibilitychange` for automatic re-acquisition.
- [x] Implement 5-minute inactivity timeout failsafe with `reportActivity()`.
- [x] Add unit tests in `tests/unit/wake-lock.test.ts`.

## Task 2: React Hook, Settings & App Integration
- [x] Create `src/hooks/useWakeLock.ts`.
- [x] Update `src/pages/SettingsPage.tsx` with "Keep screen awake" switch.
- [x] Update `src/App.tsx` with `wakeLockEnabled` state and hook activation on Play/Tune pages.
- [x] Connect live pitch/sound activity to wake lock activity tracker.
- [x] Add UI / integration tests for Settings and Wake Lock lifecycle.
- [x] Verify full build and test suite (`npm run build && npm test -- --run`).
