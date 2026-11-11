# Screen Wake Lock (Keep Awake During Practice & Tuning)

## Problem Statement
**How might we** keep the violinist’s mobile screen continuously illuminated during practice and tuning sessions without requiring touch input, while preventing unintended battery drain if the device is left unattended on a music stand?

---

## Recommended Direction: Zero-Friction Smart Wake Lock

### 1. Active Contexts
- **Play Screen:** Wake lock is requested when entering the play screen or starting practice.
- **Tuner Screen:** Wake lock is requested while on the tuner screen, enabling hands-free peg and fine-tuner adjustments.
- **Songs & Settings Screens:** Normal OS screen timeout applies to conserve power.

### 2. Standard Screen Wake Lock API
- Uses native `navigator.wakeLock.request('screen')`.
- Listens to `document.addEventListener('visibilitychange')`: automatically re-acquires the wake lock when the player switches back to the app (`visibilityState === 'visible'`).
- Fails completely gracefully if unsupported or blocked by OS low-power mode (`try / catch` around requests with no impact on practice audio or UI).

### 3. 5-Minute Inactivity Battery Failsafe
- Any detected sound/pitch from the microphone or user touch event updates an `activityTimestamp`.
- A lightweight interval checks elapsed idle time.
- If no sound is detected and no touch occurs for **5 minutes**, the wake lock is released, allowing the phone to enter its standard display sleep.
- As soon as a note is played or the screen is tapped, the wake lock is immediately re-acquired.

### 4. User Preference
- Added to `SettingsPage`: *"Keep screen awake: Keep display on during practice and tuning"* (toggle, **Enabled by default**).
- Persisted in localStorage alongside existing settings (`wakeLockEnabled`).

---

## Key Assumptions to Validate
- **OS Battery Saver Behavior:** When battery saver is active, `wakeLock.request()` throws `NotAllowedError`. The app must silently handle this without user-facing errors.
- **Throttled Activity Tracking:** Activity timestamps are recorded without triggering React component re-renders (using `useRef` or low-frequency throttles).
- **Tab Switching:** When the tab is hidden and restored, the wake lock is cleanly re-acquired without duplicate lock leaks.

---

## MVP Scope
- [ ] Create `src/hooks/useWakeLock.ts` implementing the Screen Wake Lock API with `visibilitychange` recovery, throttled activity resets, and 5-minute idle timeout.
- [ ] Add `wakeLockEnabled` setting to Settings storage, defaults, and `SettingsPage.tsx`.
- [ ] Integrate `useWakeLock` into `PlayPage.tsx` and `TunerPage.tsx` (reporting audio/pitch activity and touch activity).
- [ ] Comprehensive unit tests verifying lock acquisition, release, visibility change, and timeout handling.

---

## Not Doing
- **Fullscreen API forcing:** Not forcing browser fullscreen mode (which triggers intrusive OS permission prompts and behaves inconsistently across iOS Safari).
- **Video hack fallbacks:** Not using hidden loop `<video>` fallbacks; all target mobile browsers (Chrome Android, Safari iOS 16.4+) support native Screen Wake Lock.
- **Always-on background locks:** Not keeping the screen awake on the Songs menu or outside practice/tuning.
