# Plan: note names on the score + Finger Helper in Play-Along (0.2.3)

Skills: planning-and-task-breakdown, incremental-implementation, test-driven-development, code-review-and-quality.
Task list: `tasks/note-names-fingers/todo.md`.

## Requests
1. **Note names under the notes on the score** (letters or solfège, following the existing notation setting).
2. **Finger Helper usable in Play-Along**, so finger positions show while the piece plays.

## What exists today
- `src/modules/notation/noteNames.ts`: `formatNoteName(label, system)` (letters / solfège, keeps the octave), `NotationContext`.
- `src/components/ScoreViewport.tsx`: OSMD render, `tagOsmdSvgNotes` tags solo note `<g>` with `data-note-id="p<part>-m<bar>-n<k>"` (same ids as `timeline.soloNotes[].id`), `restoreAfterRender` re-tags/repaints after every OSMD render (resize, zoom, layout switch), `highlightCurrentNotes`.
- `src/components/play/FeedbackPanel.tsx`: the hand button and `FingeringHint` exist only when `practiceMode === 'wait-for-me'` (`canHint`); the hint is per target note (`requestedFor` keyed by note id) and clears when the note changes. `controllerState.activeNote` follows the scheduler in Play-Along.
- `src/pages/SettingsPage.tsx` has a "Finger hints" switch (`hintsEnabled`, persisted by `hintStats.ts`).

## Design decisions
- **Names are drawn into the OSMD SVG after each render**, as `<text class="score-note-name">` children of the note's own `<g>` (they inherit the note's transform and are removed with it on re-render). Position: just below the note's bounding box (`getBBox`, guarded for jsdom), centred on the notehead. Text has a white halo (`paint-order: stroke`) so it stays readable over staff lines. The current note's name is bold amber (CSS, same hook as `.score-note-current`).
- **Only solo-violin notes get names** (they come from `timeline.soloNotes`; tied continuations are not separate notes, so a tied note is named once). Accompaniment is hidden anyway.
- **Label text** = `formatNoteName(label, system)` without the octave digit (`Do#`, `Sib`, `F#`). Octave stays in the target-note ring. Chords stack names downward.
- **Setting "Note names on the score"**: default **on**, persisted in localStorage (`violin-coach:score-note-names`), switch in Settings next to Notation. Toggling re-labels without re-parsing the score.
- **Play-Along finger helper = a sticky "follow" mode.** The hand button is shown in both modes. In Wait-for-Me nothing changes (one-shot hint, auto-offer when stuck). In Play-Along the button toggles a mode that keeps `FingeringHint` on screen for the note being played (`activeNote`) with the bar's notes drawn faintly, updating as the piece advances. It stays on across notes and bars until switched off, and is remembered per session (not persisted). During the count-in it shows the first note. No auto-offer logic in Play-Along (nothing to be "stuck" on).

## Risks
| Risk | Mitigation |
|---|---|
| Labels collide in dense passages | 10 px text, no octave, tiny halo; names only for solo notes; verify on *Alicia* and a 16th-note passage in headless Chrome |
| Labels disappear after OSMD re-render | injected inside `restoreAfterRender` (same place as tags/colours), covered by a re-render test |
| Hint panel pushes the dock off small phones | existing `data-hint` shrink rule already used by Wait-for-Me; check at 390x780 and landscape |
| `getBBox` missing in jsdom | guard; tests inject a fake bbox |

## Out of scope
Next-note look-ahead on the fingerboard, names on the fingerboard, per-note colour of names by grade, persisting the Play-Along helper state.
