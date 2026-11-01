# Task Breakdown: Violin Coach PWA

## Task 1: Project Scaffold, Domain Contracts & Built-in Demo Scores

**Description:** Initialize the Vite 6 + React 19 + TypeScript 5 + Tailwind CSS v4 + Vitest project in `C:/Users/benji/Documents/Projects/violin-coach`, define strict shared TypeScript interfaces (`ScoreTimeline`, `PlayableNote`, `PitchSample`, `NoteGrade`, `PracticeSettings`), and add two built-in MusicXML demo pieces (*Twinkle Twinkle Little Star* with Solo Violin + Piano Accompaniment, and *Bach Minuet / Tied-Note Etude*).

**Acceptance criteria:**
- [x] `package.json`, `tsconfig.json`, and `vite.config.ts` are configured with strict TypeScript (`strict: true`, no `any`) and Vitest (`jsdom` environment).
- [x] `src/types/music.ts` defines all core domain contracts shared across the 4 modules.
- [x] Two valid `.musicxml` demo pieces exist under `public/samples/` with Part 1 (Solo Violin), Part 2 (Accompaniment), tempo markings, and tied notes.

**Verification:**
- [x] Tests pass: `npm test -- --run`
- [x] Build succeeds: `npm run build`
- [x] Typecheck passes: `npm run typecheck`

**Dependencies:** None

**Files likely touched:**
- `package.json`
- `vite.config.ts`
- `src/types/music.ts`
- `public/samples/twinkle.musicxml`
- `tests/unit/types.test.ts`

**Estimated scope:** Small (3–5 files)

---

## Task 2: Score Engine (`score-engine`) — Validator, Timeline Extractor, IndexedDB Store & OSMD Viewport

**Description:** Build the `score-engine` module: validate uploaded files (accept `.musicxml`/`.mxl`; reject `.mscz`/`.pdf` with clear MuseScore export instructions), extract a deterministic playable timeline from MusicXML (coalescing `NoteTie` chains, separating Part 1 Solo Violin from Part 2+ Accompaniment, and mapping measure/cursor indices), persist scores in `IndexedDB` via `idb-keyval`, and render via OpenSheetMusicDisplay with Desktop Page view, Mobile Horizontal Ribbon mode (`RenderSingleHorizontalStaffline = true`), and $O(1)$ SVG DOM notehead coloring.

**Acceptance criteria:**
- [x] Uploading `.mscz` or `.pdf` returns a structured validation error explaining how to export `.mxl`/`.musicxml` in MuseScore; valid `.musicxml` and compressed `.mxl` files unpack and parse cleanly.
- [x] Timeline Extractor merges tied notes across beats/barlines into a single sustained target note, separates Part 1 (Solo) from Parts 2+ (Accompaniment), and calculates beat/millisecond durations from score tempo.
- [x] `ScoreViewport` renders OSMD in both Page View and Single-System Horizontal Ribbon mode and exposes $O(1)$ SVG notehead coloring (`green`, `yellow`, `red`, `reset`) without re-running `osmd.render()`.

**Verification:**
- [x] Tests pass: `npm test -- --run tests/unit/score-engine.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Load demo MusicXML in `ScoreViewport`, toggle Mobile Ribbon mode, and verify tied notes and part separation in unit tests.

**Dependencies:** Task 1

**Files likely touched:**
- `src/modules/score-engine/fileValidator.ts`
- `src/modules/score-engine/timelineExtractor.ts`
- `src/modules/score-engine/scoreStore.ts`
- `src/components/ScoreViewport.tsx`
- `tests/unit/score-engine.test.ts`

**Estimated scope:** Medium (5 files)

---

## Checkpoint 1: After Tasks 1–2 (Foundation & Score Engine)
- [x] All unit tests pass (`npm test -- --run`)
- [x] Application builds without errors (`npm run build`)
- [x] MusicXML timeline extraction (including tied notes and multi-part separation) is verified by automated tests
- [x] Review progress against `SPEC.md`

---

## Task 3: Violin Pitch Detection Engine (`pitch-detection`) & Live Tuner HUD

**Description:** Build the `pitch-detection` module: pure frequency-to-MIDI/cents math with configurable A4 reference (438–445 Hz), clarity (`>= 0.85`) and RMS silence gating, and a 3-frame median filter to eliminate violin G3/D4 missing-fundamental octave jumps. Connect a decoupled 20ms Web Audio `AnalyserNode` loop running `pitchy` (`PitchDetector.forFloat32Array(2048)`) that requests unfiltered mic access (`echoCancellation: false, noiseSuppression: false, autoGainControl: false`), dynamically reads `audioContext.sampleRate`, supports post-permission `enumerateDevices()` microphone selection, and drives a glanceable `TunerHUD` component.

**Acceptance criteria:**
- [x] `frequencyToCentsDelta` and `detectClosestMidiNote` accurately compute cents deviation for any reference A4 (438–445 Hz).
- [x] The 3-frame median filter + clarity (`>= 0.85`) + RMS gate rejects bow-attack noise spikes and single-frame octave jumps in deterministic unit tests.
- [x] `MicSessionManager` requests `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }`, reads `audioContext.sampleRate` dynamically, lists available audio input devices via `enumerateDevices()`, and streams `PitchSample` events stamped with `audioContext.currentTime`.

**Verification:**
- [x] Tests pass: `npm test -- --run tests/unit/pitch-detection.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Verify `TunerHUD` displays live note name, cent needle/bar, and microphone selector.

**Dependencies:** Task 1

**Files likely touched:**
- `src/modules/pitch-detection/pitchMath.ts`
- `src/modules/pitch-detection/pitchFilter.ts`
- `src/modules/pitch-detection/micSessionManager.ts`
- `src/components/TunerHUD.tsx`
- `tests/unit/pitch-detection.test.ts`

**Estimated scope:** Medium (5 files)

---

## Task 4: Multi-Track Audio Synthesis, Lookahead Scheduler & 4-Channel Mixer (`audio-playback`)

**Description:** Build the `audio-playback` module: a Web Audio lookahead beat scheduler and SoundFont player (`smplr` Violin + Grand Piano with automatic Web Audio harmonic synth fallback when offline or in test environments), routed through 4 independent Web Audio `GainNode`s (**Solo Violin**, **Accompaniment**, **Metronome**, **Reference Drone**), with real-time Tempo % scaling (25%–150%) and 1–2 bar count-in generation.

**Acceptance criteria:**
- [x] Independent volume controls (`0.0` to `1.0` + mute) update the 4 Web Audio `GainNode`s (`solo`, `accompaniment`, `metronome`, `drone`) in real time.
- [x] Scaling tempo (25%–150%) dynamically adjusts beat scheduling intervals without pitch-shifting artifacts.
- [x] The Reference Drone generator plays and stops a sustained, warm reference pitch for any target MIDI note and A4 tuning reference (438–445 Hz).

**Verification:**
- [x] Tests pass: `npm test -- --run tests/unit/audio-playback.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Verify `MixerPanel` sliders independently adjust Solo, Accompaniment, and Metronome gain, and the Reference Drone button plays the target note.

**Dependencies:** Task 1, Task 2

**Files likely touched:**
- `src/modules/audio-playback/audioEngine.ts`
- `src/modules/audio-playback/beatScheduler.ts`
- `src/modules/audio-playback/index.ts`
- `src/components/MixerPanel.tsx`
- `tests/unit/audio-playback.test.ts`

**Estimated scope:** Medium (4 files)

---

## Checkpoint 2: After Tasks 3–4 (Audio & Pitch Engines)
- [x] All unit tests pass (`npm test -- --run`)
- [x] Application builds without errors (`npm run build`)
- [x] Both `pitch-detection` and `audio-playback` engines pass deterministic unit tests

---

## Task 5: Practice Coach State Machine (`practice-coach`) — Wait-for-Me, Play-Along & Looping

**Description:** Implement the `practice-coach` module uniting score timeline, audio scheduler, and pitch stream:
1. **Wait-for-Me Evaluator:** Holds the cursor on the active Solo Violin note until incoming `PitchSample`s remain within `±toleranceCents` continuously for `>= 150ms` (measured via `audioContext.currentTime` deltas), then locks the note green and advances to the next note.
2. **Play-Along Evaluator:** Evaluates incoming `PitchSample`s within a Bluetooth-delay-forgiving window (`[noteStart - 100ms, noteEnd + 350ms]`), grading each note as `green` ($\le 1\times$ tolerance), `yellow` ($\le 2\times$ tolerance), or `red` (missed/out of tune), and produces an end-of-session accuracy summary.
3. **Measure Loop Controller:** Constrains practice between any user-selected `startMeasure` and `endMeasure` with configurable count-in bars.

**Acceptance criteria:**
- [x] Wait-for-Me mode requires `>= 150ms` of continuous in-tune pitch (via `audioTimeSec` deltas) to advance; brief drops reset the stability accumulator; tied notes advance smoothly as a single target.
- [x] Play-Along mode forgives up to `+350ms` onset lag (simulating Bluetooth earbuds) and grades notes `green` ($\le 1\times$ tolerance), `yellow` ($\le 2\times$ tolerance), or `red` ($> 2\times$ tolerance or silent).
- [x] Measure looping wraps playback and cursor position cleanly back to `startMeasure` (with optional count-in) upon completing `endMeasure`.

**Verification:**
- [x] Tests pass: `npm test -- --run tests/unit/practice-coach.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Step through Wait-for-Me and Play-Along state transitions in tests.

**Dependencies:** Task 2, Task 3, Task 4

**Files likely touched:**
- `src/modules/practice-coach/waitForMeEvaluator.ts`
- `src/modules/practice-coach/playAlongEvaluator.ts`
- `src/modules/practice-coach/practiceController.ts`
- `tests/unit/practice-coach.test.ts`

**Estimated scope:** Medium (4 files)

---

## Task 6: Unified Practice Workspace, PWA Configuration & End-to-End Integration

**Description:** Assemble the complete Violin Coach workspace in `App.tsx` with responsive Music Stand navigation (mode selector: Wait-for-Me vs. Play-Along, Measure Loop picker, Reference Drone button, Library & File Upload modal with `.mscz` guidance, Calibration & Mic Settings drawer, and Session Accuracy Summary card), configure `vite-plugin-pwa` for offline installability, and write integration tests covering the full user workflow.

**Acceptance criteria:**
- [ ] Users can switch between built-in demo scores or upload `.musicxml`/`.mxl` files (saved in `IndexedDB`), and receive clear guidance if uploading `.mscz` or `.pdf`.
- [ ] Users can practice in both **Wait-for-Me** (with "Play Reference Drone" button and live hold progress bar) and **Play-Along** (with count-in, live green/yellow/red SVG note coloring, and end-of-piece accuracy summary).
- [ ] All 5 Success Criteria in `SPEC.md` pass automated unit + integration verification and production PWA build (`npm run build`).

**Verification:**
- [ ] Tests pass: `npm test -- --run`
- [ ] Build succeeds: `npm run build`
- [ ] Typecheck & lint pass: `npm run typecheck`

**Dependencies:** Task 2, Task 3, Task 4, Task 5

**Files likely touched:**
- `src/App.tsx`
- `src/components/TopBar.tsx`
- `src/components/LibraryModal.tsx`
- `src/components/CalibrationDrawer.tsx`
- `tests/integration/app.test.tsx`

**Estimated scope:** Medium (5 files)

---

## Checkpoint 3: Complete (After Task 6)
- [ ] All unit and integration tests pass (`npm test -- --run`)
- [ ] Production build succeeds with PWA manifest and service worker (`npm run build`)
- [ ] Zero TypeScript errors (`npm run typecheck`)
- [ ] All 5 `SPEC.md` Success Criteria verified
