# Violin Coach: mobile-first UX

Scope is "upload a score and play it": no lessons, streaks or accounts.

## Screens

| Tab | Purpose |
|---|---|
| **Songs** (home) | Built-in pieces and your own `.musicxml` / `.mxl` imports. Tap a piece to play; "Add a score" imports one. |
| **Play** (full screen, opened from Songs) | Score plate, a glanceable pitch panel, one big Start / Pause button. |
| **Tune** | Open-string drones and a live tuner. |
| **Settings** | Note names (Do Ré Mi / A B C), A4 reference, how strict "in tune" is, microphone, tips. |

## Play screen

- Top: back button, title, bar count, loop chip, bar tapes showing progress.
- Score plate: single-line ribbon on phones, full page on wide screens.
- Pitch panel: target note in a hold ring, a verdict in words and arrows (In tune / Flat / Sharp, never colour alone), a cents meter. The whole panel floods with the verdict colour so it reads from 70 to 90 cm.
- Bottom (thumb zone): Wait for me / Play along switch, Stop, Start / Pause, options sheet (tempo, mixer, drone, strictness, count-in).
- Finger hints (Wait for me): a hand button beside "Hear <note>" and automatic triggers (stuck 2 s, wrong note) show string and finger for 1st and 3rd position in place of the cents meter. See `docs/ideas/violin-fingerboard-hints.md`.
- Result sheet at the end of a pass: accuracy (Play along) or notes found (Wait for me), bar tapes marking hard bars, one-tap "Loop bar N", Play again, Done.

## Layout rules

- Portrait first; 44 px minimum targets; safe-area insets honoured.
- Tab bar at the bottom on phones, left rail from 1024 px. The Play screen is full-bleed: the tab bar steps aside.
- Notation setting is applied wherever a note name appears (`useNoteName`).

## Known gaps

- OSMD's own playhead and notehead colouring are barely visible in real Chrome (the cursor image renders 1 px tall and `tagOsmdSvgNotes` tags no noteheads). The bar tapes and the target-note panel carry "where am I" meanwhile. Worth a dedicated fix in `ScoreViewport`.
- The ribbon also shows the piano staff.
- `main.tsx` unregisters service workers, so offline precaching is configured but not active.
- Looping hard bars repeats until Stop.

Screenshots: `docs/screenshots/`.
