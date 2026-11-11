# Mobile Play Screen Reorganization (Direction B: Radial Arc Level)

## Problem Statement
**How might we** maximize vertical score space on mobile devices while making real-time intonation feedback glanceable and consolidating controls into a single slim row?

---

## Recommended Direction: Radial Arc Level

### 1. 300° Embedded Intonation Gauge
- **Replaces:** The separate bottom "low–high" cents bar and the old circular hold progress ring.
- **Geometry:** A 300° circular arc track wrapping the target note circle, open 60° at the bottom (6 o'clock).
- **Orientation:**
  - **12 o'clock (top center):** 0 cents (in tune).
  - **Left arc (counter-clockwise, up to 150°):** Flat / Low (down to -50¢ or lower).
  - **Right arc (clockwise, up to 150°):** Sharp / High (up to +50¢ or higher).
  - **Tolerance Window:** A calm highlight band centered at 12 o'clock corresponding to `±toleranceCents` (e.g. ±15¢ for Medium).
- **Behavior:**
  - Live pitch extends an arc bar outward from 12 o'clock towards the left (flat) or right (sharp) with an indicator bead at the tip.
  - When within tolerance, the top center lights up in tune (`var(--tune)`).
  - When silent / idle, the track and tolerance zone rest faintly.

### 2. Score Completion Percentage
- **Location:** Centered in the top score plate header, in the empty zone between `MicPill` (left) and the score layout toggle (right).
- **Display:** Pill badge showing percentage of score completed (e.g. `45%` or `Bar 4/8 · 50%`), giving instant progress context without taking any vertical layout space.

### 3. Compact Fingering Hint
- **Header:** Remove the "Where to put your finger" title row completely. Keep only the close (`✕`) button in the top right.
- **Position Lines:** Compact 1st and 3rd position rows from `20px` down to `14–15px`, with smaller position badges and inline alternates (`D string, 2 or E string, open`).
- **Diagram:** Slim down fingerboard diagram height from `78px` to `~48px` with tighter string spacing.

### 4. Single-Row Bottom Controls
- **Replaces:** The stacked 2-row footer (full-width segmented mode bar on top of 3 tall buttons).
- **Consolidation:** A single slim toolbar (~48px tall):
  - Left: Compact mode toggle (`[ Wait | Along ]` or `[ Wait for me | Play along ]` adapting to width).
  - Right: `[ ■ Stop ]`, `[ ▶ Start / ⏸ Pause / ▶ Resume ]`, `[ ⚙ Options / % ]`.
  - All buttons meet 44px minimum touch targets.

---

## Key Assumptions to Validate
- **300° Arc Math:** Dynamic SVG stroke-dasharray / arc paths correctly map -50¢ to +50¢ across the 300° sweep from top center.
- **Mobile Width Fit:** A single row with the mode toggle and 3 action buttons fits comfortably on narrow devices (e.g. 360px–390px wide) without horizontal overflow.
- **Score Header Space:** The completion percentage pill fits between the Mic pill and the single/page layout buttons across mobile screens.

---

## MVP Scope
- [x] Embed 300° intonation gauge around target note in `FeedbackPanel.tsx`.
- [x] Remove the bottom cents bar (`.panel-meter`).
- [x] Remove the circular hold progress ring.
- [x] Add completion percentage pill in `PlayPage.tsx` score header.
- [x] Remove headline and compact 1st/3rd lines + diagram in `FingeringHint.tsx`.
- [x] Refactor `PlayPage.tsx` footer to a single compact row.
- [x] Update CSS and existing tests to match the new component structure.

## Not Doing (and Why)
- **Not redesigning other screens:** TunerPage, SongsPage, SettingsPage remain untouched.
- **Not altering audio pitch detection or practice engine logic:** Intonation evaluation and state machines stay identical.
- **Not adding new practice modes or settings sheets:** Only layout reorganization and component presentation.
