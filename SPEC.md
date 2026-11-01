# Spec: Violin Coach PWA

## Capability Map

| Module ID | Responsibility | Depends On |
|---|---|---|
| `score-engine` | Parse `.musicxml`/`.mxl` (reject `.mscz`/`.pdf` with export instructions), store scores in `IndexedDB`, extract linear playable note timeline (merging `NoteTie` chains and resolving tempo changes in 1:1 alignment with OSMD cursor steps), and render via OSMD (Page View + Mobile Horizontal Ribbon) with $O(1)$ SVG DOM notehead coloring. | — |
| `pitch-detection` | Unfiltered microphone capture (`echoCancellation: false, noiseSuppression: false, autoGainControl: false`), post-permission `enumerateDevices()` Mic Selector, dynamic `audioContext.sampleRate` read, McLeod Pitch Method (`pitchy`, 2048-sample window) decoupled from React renders, clarity (`>= 0.85`) + RMS silence gating, 3-frame median filter, and configurable A4 reference (438–445 Hz). | — |
| `audio-playback` | Sampled instrument playback (`smplr` SoundFont Violin + Piano) and Web Audio lookahead beat scheduler with 4 native Web Audio `GainNode`s (Solo Violin, Accompaniment, Metronome, Reference Drone), Tempo % scaling (25%–150%), and count-in bars. | `score-engine` |
| `practice-coach` | Interactive state machine uniting score, playback, and pitch using hardware `audioContext.currentTime` deltas: **Wait-for-Me Mode** (150ms hold-to-lock + reference drone helper), **Play-Along Mode** (delay-forgiving `[-100ms, +350ms]` window + green/yellow/red note grading + accuracy summary), and Measure Looping. | `score-engine`, `audio-playback`, `pitch-detection` |

**Build Order:** `score-engine` & `pitch-detection` → `audio-playback` → `practice-coach`

---

## 1. Objective
Build a client-side Progressive Web App (PWA) for solo violin practice across laptop, tablet, and phone. The user imports `.musicxml` or `.mxl` scores exported from MuseScore PRO, listens via Bluetooth earbuds, and practices in two interactive modes ("Wait-for-Me" and "Play-Along") with real-time intonation and delay-forgiving rhythm feedback.

### User Stories
- **US1 (Score Import & Local Library):** As a violinist, I can upload `.musicxml` or `.mxl` files (persisted in `IndexedDB`) or pick a built-in demo piece. If I drop a `.mscz` or `.pdf` file, the app displays a clear guide on how to export `.mxl` from MuseScore.
- **US2 (Responsive Music Stand View):** On desktop/tablet, I see a multi-system page layout. On a phone (or when toggled), I see a magnified single-system horizontal scrolling ribbon (`EngravingRules.RenderSingleHorizontalStaffline = true`) readable from 70–90cm away.
- **US3 (Independent Audio Mixer):** I can independently control the volume of the Solo Violin (Part 1), Accompaniment (Parts 2+), and Metronome click, adjust playback tempo from 25% to 150%, and play a sustained Reference Drone for the active note.
- **US4 (Wait-for-Me Mode):** The cursor waits on the current note until my violin pitch stays within the target cent tolerance (e.g., ±15¢) for 150ms continuously (`audioContext.currentTime` delta). Tied notes across barlines are coalesced so I hold them continuously without re-pausing.
- **US5 (Delay-Forgiving Play-Along Mode):** After a configurable count-in (1 or 2 bars), the app plays at steady tempo, absorbs wireless Bluetooth audio delay (`[-100ms, +350ms]` grace window around each note), colors noteheads directly in the SVG DOM (`green` within $1\times$ tolerance, `yellow` within $2\times$ tolerance, `red` if missed/out-of-tune), and displays an accuracy summary at the end.
- **US6 (Measure Looping & Audio Calibration):** I can loop any start–end measure range, select my microphone input device (`enumerateDevices()`), adjust A4 tuning (438–445 Hz, default 440 Hz), and switch intonation strictness (Easy ±25¢, Medium ±15¢, Strict ±8¢, or custom).

## 2. Tech Stack
- **Framework:** React 19 + TypeScript 5 + Vite 6 (`vite-plugin-pwa`)
- **Score Rendering:** `opensheetmusicdisplay` (OSMD)
- **Audio Synthesis:** `smplr` (WebAudio SoundFont Violin + SplendidGrandPiano) + native Web Audio API `GainNode`s & lookahead beat scheduler
- **Pitch Detection:** `pitchy` (McLeod Pitch Method, 2048-sample window) + Web Audio `AnalyserNode` (20ms loop decoupled from React renders)
- **Local Persistence:** `idb-keyval` (IndexedDB wrapper for scores and user settings)
- **Styling:** Tailwind CSS v4 + `lucide-react` icons
- **Testing:** Vitest + React Testing Library + `@testing-library/jest-dom`

## 3. Commands
- **Install:** `npm install`
- **Dev Server:** `npm run dev`
- **Build:** `npm run build`
- **Unit & Integration Tests:** `npm test -- --run`
- **Typecheck & Lint:** `npm run typecheck && npm run lint`

## 4. Project Structure
```text
violin-coach/
├── public/
│   └── samples/              # Built-in demo MusicXML pieces (Twinkle, Bach Minuet)
├── src/
│   ├── modules/
│   │   ├── score-engine/     # MusicXML validator, OSMD wrapper, timeline extractor, SVG note colorer, IndexedDB library
│   │   ├── pitch-detection/  # Mic session manager, MPM detector, 3-frame median filter, cent math
│   │   ├── audio-playback/   # smplr SoundFont engine, lookahead beat scheduler, 4-channel GainNode mixer, drone
│   │   └── practice-coach/   # Wait-for-Me & Play-Along evaluators, measure loop controller, session summary
│   ├── components/           # UI components (TopBar, ScoreViewport, TunerHUD, MixerPanel, LibraryModal)
│   ├── types/                # Shared strict TypeScript contracts
│   └── App.tsx
├── tests/                    # Unit & integration tests mirroring src/modules/
├── tasks/                    # Implementation plan (plan.md) and task checklist (todo.md)
└── SPEC.md
```

## 5. Code Style
Strict TypeScript (`strict: true`, no `any`). Pure domain logic (cent calculations, median filtering, timeline extraction, hold-to-lock timers, and forgiving Play-Along grading) must be decoupled from React state and browser `AudioContext` instances so it can be unit-tested deterministically.

```ts
export interface PitchSample {
  readonly frequencyHz: number;
  readonly clarity: number; // 0.0 to 1.0
  readonly rms: number;
  readonly audioTimeSec: number; // from audioContext.currentTime
}

export function frequencyToCentsDelta(
  detectedHz: number,
  targetMidiNote: number,
  referenceA4Hz: number = 440,
): number {
  const targetHz = referenceA4Hz * Math.pow(2, (targetMidiNote - 69) / 12);
  return 1200 * Math.log2(detectedHz / targetHz);
}
```

## 6. Testing Strategy
- **Unit Tests (`tests/unit/`):**
  - `pitch-detection`: Frequency-to-MIDI/cents math with custom A4 (438–445 Hz), 3-frame median filter suppressing single-frame octave jumps, clarity (`>= 0.85`) and RMS gating.
  - `score-engine`: File validator (`.musicxml`/`.mxl` accepted; `.mscz`/`.pdf` rejected with helpful message), timeline extraction coalescing tied notes (`NoteTie`), tempo scaling, and solo (Part 1) vs. accompaniment (Part 2+) separation.
  - `practice-coach`: Wait-for-Me 150ms continuous hold-to-lock using `audioTimeSec` deltas; Play-Along forgiving window grading (`[-100ms, +350ms]`) into `green` ($\le 1\times$ tolerance), `yellow` ($\le 2\times$ tolerance), and `red`.
- **Integration Tests (`tests/integration/`):**
  - Rendering app shell, importing/selecting scores, toggling Mobile Ribbon vs. Desktop Page mode, switching practice modes, and adjusting mixer sliders.

## 7. Boundaries
- **Always do:**
  - Request microphone access with `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }`.
  - Read `audioContext.sampleRate` dynamically after stream acquisition.
  - Mutate SVG notehead attributes (`GraphicalNote.getSVGGElement()`) directly in $O(1)$ time for note coloring instead of calling `osmd.render()`.
  - Run `npm test -- --run` and `npm run build` before marking any task complete.
- **Ask first:**
  - Adding new runtime dependencies beyond the approved stack.
  - Changing core grading tolerances or file format support.
- **Never do:**
  - Add backend servers, cloud databases, or paid external APIs.
  - Use `any` types or suppress TypeScript/ESLint errors (`@ts-ignore`).

## 8. Success Criteria
1. **Format Handling:** Uploading a `.musicxml` or `.mxl` file renders the score and extracts its playable note timeline (merging ties) in `< 1s`. Uploading `.mscz` or `.pdf` displays an explicit instruction modal to export as `.mxl` from MuseScore.
2. **Phone & Desktop Layout:** Switching to Mobile Ribbon mode sets `EngravingRules.RenderSingleHorizontalStaffline = true` and scrolls horizontally with the active cursor.
3. **Wait-for-Me Accuracy:** Feeding a violin pitch within `±toleranceCents` (`clarity >= 0.85`) for `>= 150ms` (`audioContext.currentTime` delta) advances the cursor to the next note; brief noise spikes (`< 100ms`) or single-frame octave jumps (filtered by the 3-frame median filter) do not trigger false advances.
4. **Play-Along Forgiveness:** Notes played within `[-100ms, +350ms]` of the scheduled beat window are graded on intonation accuracy (`green` $\le 1\times$ tolerance, `yellow` $\le 2\times$ tolerance, `red` otherwise) and colored directly in the SVG DOM without re-rendering the score.
5. **Independent Mixer & Reference Drone:** Adjusting Solo, Accompaniment, or Metronome volume sliders updates Web Audio `GainNode` gains in real time; the Reference Drone button plays the current target note cleanly.
6. **4-Page Urtext Archive UX (Direction 1):** The application is organized into 4 browsable pages (`#/library`, `#/practice`, `#/tuner`, `#/settings`) styled in the **Urtext Archive** Hallmark direction (archival cotton-rag paper `oklch(96.2% 0.012 85)`, Henle Prussian Blue `oklch(46% 0.165 245)`, `Cardo` + `Hanken Grotesk` + `JetBrains Mono` tabular numerals), where `#/practice` dedicates 85–90% of the viewport to the sheet music with a compact Pitch/150ms-Hold pill and popover drawers for Mixer/Tempo and Looping.
