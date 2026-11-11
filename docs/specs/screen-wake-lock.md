# Spec: Screen Wake Lock (Keep Display On During Practice & Tuning)

Status: **Draft for Review**  
Target version: `0.3.1`  
Inspired by: `docs/ideas/screen-wake-lock.md`

---

## 1. Objective

Violinists need their sheet music and tuner visible without the mobile display timing out or turning off, since both hands hold the instrument. This feature keeps the display active while viewing the **Play** or **Tune** screen using the standard `Screen Wake Lock API`, with an automatic **5-minute inactivity safety release** (to protect battery if left unattended) and a user toggle in **Settings**.

---

## 2. Commands

- **Build**: `npm run build`
- **Test**: `npm test -- --run`
- **Typecheck**: `npm run typecheck`

---

## 3. Project Structure & Impacted Files

- `src/modules/wake-lock/wakeLockManager.ts`:
  - `isWakeLockSupported(): boolean`
  - `loadWakeLockEnabled(): boolean` (defaults to `true`)
  - `saveWakeLockEnabled(enabled: boolean): void`
  - `createWakeLockManager(options)`:
    - Requests `navigator.wakeLock.request('screen')`.
    - Handles `visibilitychange` to re-acquire the lock when returning to the tab.
    - Tracks activity timestamps from user interaction (touches/clicks/keys) and audio/pitch events.
    - Enforces a 5-minute idle inactivity timeout to release the lock. Re-acquires immediately on new activity.
    - Gracefully handles rejection (`NotAllowedError` or missing API).
- `src/hooks/useWakeLock.ts`:
  - React hook integrating `WakeLockManager` with page lifecycle (`activePage === 'play' || activePage === 'tune'`).
- `src/pages/SettingsPage.tsx`:
  - Add `wakeLockEnabled?: boolean` and `onWakeLockEnabledChange?: (enabled: boolean) => void` to `SettingsPageProps`.
  - Add switch: *"Keep screen awake"* with hint *"Prevents your phone from turning off during practice and tuning"*.
- `src/App.tsx`:
  - Manage state `wakeLockEnabled` (persisted via `loadWakeLockEnabled` / `saveWakeLockEnabled`).
  - Wire `useWakeLock({ enabled: wakeLockEnabled && (activePage === 'play' || activePage === 'tune') })`.
  - Pass props to `SettingsPage`.
- `tests/unit/wake-lock.test.ts`:
  - Tests for wake lock acquisition, release, visibility changes, 5-minute idle release, re-acquisition on activity, and settings persistence.

---

## 4. Requirements & Non-Functional Constraints

1. **Active Contexts**:
   - Active only on `Play` and `Tune` pages.
   - Released immediately when navigating to `Songs` or `Settings`.
2. **Safety & Battery Failsafe**:
   - Resets idle timer when:
     - User taps/touches or clicks the screen.
     - Live pitch is detected (sound is present).
     - Audio engine is playing.
   - If 5 consecutive minutes elapse without sound or touch, releases the lock.
   - Resumes lock on the next sound or touch.
3. **Graceful Degradation**:
   - If `navigator.wakeLock` is not present (e.g. non-secure HTTP, older browser, or unit test environment), all operations no-op silently without throwing.
   - If `navigator.wakeLock.request('screen')` rejects (e.g. low-power mode), it catches the error silently.
4. **Visibility Handling**:
   - When the user locks the phone or switches apps (`document.visibilityState === 'hidden'`), the OS releases the lock.
   - When the user returns to the tab (`document.visibilityState === 'visible'`), the lock is automatically re-requested.
5. **Persistence**:
   - Stored in `localStorage` under `violin:wake-lock:enabled`.
   - Defaults to `true` (enabled).

---

## 5. Acceptance Criteria

1. [ ] Wake lock is requested when entering Play or Tune screen if enabled.
2. [ ] Wake lock is released when leaving Play or Tune screen.
3. [ ] If the tab is backgrounded and foregrounded, wake lock is cleanly re-acquired.
4. [ ] If 5 minutes pass with no audio activity and no user interaction, wake lock is released.
5. [ ] Any new pitch or touch event re-acquires the wake lock after idle timeout.
6. [ ] User can toggle "Keep screen awake" in Settings, which immediately applies and persists across page reloads.
7. [ ] Fails safely without errors if the API is unsupported or rejects.
8. [ ] All existing tests and builds continue to pass.
