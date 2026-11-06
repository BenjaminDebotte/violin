# Task List: Reliable Score Auto-Scrolling & Cursor Sync

Plan: `tasks/auto-scroll/plan.md`

- [x] **T1: Timeline extractor — preserve tied-note onsets in `cursorStepIndex` and select Violin part in ensemble scores** (S)
  - Acceptance:
    - [x] `uniqueStartBeats` includes onset beats of tied continuation notes (`tieStop`) so `cursorStepIndex` never lags behind OSMD's cursor after tied notes (verified on `MINUET_TIED_MUSICXML` Measure 5–8 and solo-violin tied scores).
    - [x] When a multi-part MusicXML score has a Violin part (`<part-name>`, `<instrument-name>`, or `<instrument-sound>` matching violin/violon/vln/fiddle) that is not `P1` (e.g. `Alicia` where `P1` is Piano and `P4` is `Violin 1`), `extractScoreTimeline` selects that Violin part as the solo part (`isSolo: true`), and ignores `<staff>2</staff>` / backup secondary voices in the solo part.
  - Verification: `npx vitest run tests/unit/score-engine.test.ts` + new unit tests.
  - Files: `src/modules/score-engine/timelineExtractor.ts`, `tests/unit/score-engine.test.ts`

- [x] **T2: PracticeController & AudioPlaybackEngine — reset cursor on `stop()` and resume suspended `AudioContext`** (S)
  - Acceptance:
    - [x] `PracticeController.stop()` resets `_activeNote`, `_cursorStepIndex`, `_currentMeasureNumber`, and `_holdProgress` back to the start of the piece (or `loopRange.startMeasure`).
    - [x] `AudioPlaybackEngine` resumes `this._audioContext` when `state === 'suspended'` on `resume()` / `startDrone()` / `PracticeController.start()`, so `Play-Along` never stalls at `currentTime === 0`.
  - Verification: `npx vitest run tests/unit/practice-coach.test.ts tests/unit/audio-playback.test.ts`.
  - Files: `src/modules/practice-coach/practiceController.ts`, `src/modules/audio-playback/audioEngine.ts`, `tests/unit/practice-coach.test.ts`

- [x] **T3: ScoreViewport & PlayPage — deterministic horizontal/vertical auto-scroll and `activeNoteId` sync** (M)
  - Acceptance:
    - [x] OSMD `cursorsOptions` sets `follow: false` (`osmd.FollowCursor = false`) so OSMD never triggers competing `scrollIntoView` calls.
    - [x] `PlayPage.tsx` removes the duplicate outer `overflow-auto` wrapper and excessive `pt-12` padding so `ScoreViewport`'s outer element (`data-testid="score-scroll-viewport"`) is the single scroll container.
    - [x] `ScoreViewport` accepts `activeNoteId?: string | null` (passed from `PlayPage` via `controllerState.activeNote?.id`), highlights `[data-note-id="${activeNoteId}"]` (falling back to `osmd.cursor.GNotesUnderCursor`), and syncs `osmd.cursor` to the step containing `activeNoteId`.
    - [x] In `ribbon` mode: horizontal scroll (`scrollTo`) places the active note at ~35% of viewport width (lookahead), while vertical scroll centers the staff once and never bounces up/down per note pitch.
    - [x] In `page` mode: vertical scroll (`scrollTo`) centers the active system/staff band and only scrolls vertically when the active system is outside the central comfort zone (zero mid-bar vertical jitter).
    - [x] Returning to `cursorStepIndex === 0` (on load or Stop) scrolls back to the start.
  - Verification: `npx vitest run tests/unit/score-viewport-render.test.tsx tests/unit/score-highlight.test.tsx` + new auto-scroll unit tests.
  - Files: `src/components/ScoreViewport.tsx`, `src/pages/PlayPage.tsx`, `tests/unit/score-viewport-render.test.tsx`, `tests/unit/score-highlight.test.tsx`

- [x] **T4: End-to-end verification in headless Chrome + release 0.2.2** (S)
  - Acceptance:
    - [x] Headless Chrome check on `Twinkle`, `Minuet`, and `Alicia` in both `ribbon` and `page` modes confirms smooth horizontal progression without vertical staff bounce in `ribbon` mode, system-level vertical scrolling without mid-bar jitter in `page` mode, and `Play-Along` advancing cleanly.
    - [x] Bump version in `package.json` and `chart/Chart.yaml` to `0.2.2`.
    - [x] All unit/integration tests, typecheck, build, and chart lint pass.
  - Verification: `npx vitest run`, `npm run typecheck`, `npm run build`, `helm lint chart`.
