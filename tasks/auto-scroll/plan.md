# Implementation Plan: Reliable Score Auto-Scrolling & Cursor Sync

Skills applied: `debugging-and-error-recovery`, `planning-and-task-breakdown`, `test-driven-development`, `incremental-implementation`, `code-review-and-quality`.

## 1. Root-Cause Diagnosis (Reproduced in Headless Chrome)

Using headless Chrome against `Twinkle`, `Minuet & Tied Note Etude`, and the uploaded `clair-obscur-expedition-33-alicia.mxl`, we reproduced and localized five interacting bugs that broke auto-scrolling while playing:

1. **Conflicting `scrollIntoView` calls & vertical staff bounce in Single-line (`ribbon`) mode (`ScoreViewport.tsx:325, 466-476`):**
   - OSMD was initialized with `cursorsOptions: [{ ..., follow: true }]`, causing `osmd.cursor.next()` to fire `cursorElement.scrollIntoView()` on every step while `ScoreViewport` immediately fired a second `follow.scrollIntoView()` with different options.
   - In `ribbon` mode (`overflow-x-auto overflow-y-hidden`), calling `follow.scrollIntoView({ block: 'center', inline: 'center' })` on the individual `<g class="vf-stavenote">` scrolled `scrollTop` programmatically on every note (`0 -> 77 -> 55 -> 82 -> 55px`) because high and low notes (and up/down stems) have different vertical bounding boxes. This made the 5-line staff bounce up and down on every note.
2. **Note-level `block: 'nearest'` in Full-page (`page`) mode (`ScoreViewport.tsx:473`):**
   - Scrolling only the 40px `<g class="vf-stavenote">` with `block: 'nearest'` pinned the active note to the very bottom pixel of the viewport when moving to a new system (cutting off the lower staff lines) and caused mid-bar vertical micro-scrolls (`417 -> 422px`, `617 -> 622px`) whenever the next note in the same bar was lower on the staff.
3. **Nested scroll containers & no scroll on initial load / Stop (`PlayPage.tsx:188`, `ScoreViewport.tsx:443`, `practiceController.ts:402`):**
   - `PlayPage.tsx` wrapped `ScoreViewport` in a second `overflow-auto` container with `pt-12`.
   - `ScoreViewport` returned early when `targetStep === currentStep` (`0 === 0`), never centering the initial staff or resetting scroll position when stopping.
   - `PracticeController.stop()` did not reset `_cursorStepIndex`, `_currentMeasureNumber`, or `_activeNote` back to the start of the piece/loop.
4. **Cursor step desynchronization on tied notes & multi-part ensemble scores (`timelineExtractor.ts:285-322`):**
   - When `tieStop` notes were coalesced into `parentNote`, their beat onset was omitted from `uniqueStartBeats`. On any beat where a tied continuation note had no simultaneous accompaniment attack (e.g. Bar 5 Beat 2 of `Minuet & Tied Note Etude`), `cursorStepIndex` fell permanently behind `osmd.cursor` (playing Bar 6 highlighted and scrolled to Bar 5).
   - In multi-part ensemble scores like `clair-obscur-expedition-33-alicia.mxl` (where `P1` is a 2-staff Piano and `P4` is `Violin 1`), `timelineExtractor` hardcoded `pIdx === 0` as the solo part instead of detecting the Violin part.
5. **Suspended `AudioContext` stalling `Play-Along` (`audioEngine.ts`, `practiceController.ts`):**
   - `AudioPlaybackEngine` creates `AudioContext` on mount (before a user gesture) and never called `audioContext.resume()`, leaving `currentTime` at `0` in browsers that suspend pre-gesture `AudioContext`s, which stalled `Play-Along` on `Count-in, beat 1` and prevented cursor progression.

## 2. Architecture of the Fix

- **Single deterministic scroll controller in `ScoreViewport`:**
  - Set `follow: false` in `cursorsOptions` and `osmd.FollowCursor = false`.
  - Remove the outer `overflow-auto` in `PlayPage.tsx` so `ScoreViewport`'s container is the sole scroll viewport.
  - **Ribbon mode:** Scroll horizontally (`scrollLeft`) so the active note sits at ~35% from the left edge of the viewport (giving 65% lookahead for upcoming notes), and lock vertical scroll (`scrollTop`) to the vertical center of the staff system (never individual note `<g>`s).
  - **Page mode:** Compute the vertical bounds of the active note's **system** (via `osmd.cursor.cursorElement` or system staff bounds) and scroll `scrollTop` only when the active system is outside the comfortable central band of the viewport, centering the system row cleanly with zero mid-bar jitter.
- **Direct `activeNoteId` targeting + complete `uniqueStartBeats`:**
  - Record all note/rest onsets (including `tieStop` continuations) in `uniqueStartBeats` in `timelineExtractor.ts`.
  - Detect the Violin part in `<part-list>` when `P1` is not a violin (falling back to `P1` when no part is named violin), and filter out secondary staves (`<staff>2</staff>`) from the solo line.
  - Pass `activeNoteId={controllerState.activeNote?.id}` to `ScoreViewport` so note highlighting and scrolling always target the exact `[data-note-id="${activeNoteId}"]` SVG element even if OSMD's cursor iterator ever diverges.
- **Reset on `stop()` & `AudioContext.resume()`:**
  - Reset cursor/activeNote to the start of the piece (or `loopRange`) in `PracticeController.stop()`.
  - Resume `audioContext` if `suspended` when starting playback or drone.

## 3. Task Breakdown
Tracked in `tasks/auto-scroll/todo.md` (T1–T4).
