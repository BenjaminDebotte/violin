# Tasks: note names on the score + Finger Helper in Play-Along

Plan: `tasks/note-names-fingers/plan.md`. Commands: `npx vitest run`, `npm run typecheck`, `npm run build`.

- [x] **T1: "Note names on the score" setting and label map** (S)
  - Add `scoreNoteName(label, system)` (formatted name without octave) to `noteNames.ts`; `loadScoreNoteNames/saveScoreNoteNames` (key `violin-coach:score-note-names`, default true).
  - App state + Settings switch (next to Notation); App builds `noteLabels: Record<noteId, string>` from `timeline.soloNotes` (rests skipped) with the current notation system; passes `noteLabels` (undefined when off) through `PlayPage` to `ScoreViewport`.
  - Acceptance: unit tests for `scoreNoteName` (letters/solfège, sharps/flats, no octave, odd input); setting persists and toggles in Settings; labels prop is absent when off.
  - Files: `src/modules/notation/noteNames.ts`, `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/PlayPage.tsx`, tests.
- [x] **T2: Draw the names under the notes in `ScoreViewport`** (M)
  - New prop `noteLabels?: Readonly<Record<string, string>>`. After tagging (inside `restoreAfterRender`, and when `noteLabels` changes) remove old `.score-note-name` elements and add a `<text class="score-note-name">` to each tagged note `<g>` that has a label, centred under the notehead, just below the note's `getBBox()`, white halo, ~10 px. Bold amber for `.score-note-current` (CSS in `index.css`).
  - Must not change grading colours, highlight, tagging, scrolling. Labels must survive resize/zoom/layout re-render and be absent when `noteLabels` is undefined.
  - Acceptance: tests with the fake OSMD (inject `getBBox`): labels created for labelled ids only, text matches, removed when prop cleared, re-created after `render()`, no duplicates after repeated syncs; existing tests green. Headless Chrome 390x780 on *Minuet* (ribbon + page) and *Alicia*: names visible under every violin note, readable, none under rests, current note's name amber; screenshot paths reported.
  - Files: `src/components/ScoreViewport.tsx`, `src/index.css`, `tests/unit/score-viewport-render.test.tsx`.
- [x] **T3: Finger Helper in Play-Along (sticky follow mode)** (M)
  - `FeedbackPanel`: `canHint` also true in Play-Along (target present). In Play-Along the hand button toggles a sticky `followFingers` state that keeps `FingeringHint` visible for `controllerState.activeNote` (with `barMidis`), updating as `activeNote` changes; not cleared by note change; cleared when the mode switches to Wait-for-Me (which keeps its current behaviour exactly). Count-in shows the first note. Button label/aria-pressed stay "Show finger placement".
  - Wait-for-Me behaviour unchanged (existing tests stay green).
  - Acceptance: tests (FeedbackPanel/PlayPage level): hand button exists in Play-Along; toggling shows the diagram for the active note; changing `activeNote` keeps it visible with the new note's placements; toggling off hides it; Wait-for-Me one-shot behaviour unchanged. Headless Chrome: Play-Along on *Minuet*, helper on, screenshot shows the diagram updating while the piece advances (two screenshots at different times).
  - Files: `src/components/play/FeedbackPanel.tsx`, `src/pages/PlayPage.tsx` (only if needed), tests.
- [ ] **T4: Verify, docs, version 0.2.3** (XS)
  - Full `npx vitest run`, `npm run typecheck`, `npm run build`, `helm lint chart`, `./scripts/check-sw.sh`, `./scripts/test-chart.sh`. Bump `package.json` and `chart/Chart.yaml` to 0.2.3. Mark tasks done. No tag, no push.

Checkpoint after T2 (names visible) and after T3 (helper works) before T4.
