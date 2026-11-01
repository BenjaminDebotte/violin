# Implementation Plan: Violin Coach PWA

## Overview
We are building a client-side Progressive Web App (PWA) for solo violin practice across laptop, tablet, and phone. It ingests `.musicxml` and `.mxl` files from MuseScore PRO, renders them responsively via OpenSheetMusicDisplay (full-page on desktop/tablet, zoomed single-system horizontal ribbon on phone), synthesizes multi-track audio via `smplr` and Web Audio `GainNode`s, tracks live acoustic violin pitch via `pitchy` (McLeod Pitch Method), and guides practice through two interactive modes: **Wait-for-Me** (150ms hold-to-lock) and **Play-Along** (delay-forgiving grading with `[-100ms, +350ms]` window).

## Dependency Graph
```text
Shared Domain Contracts (src/types/music.ts)
    │
    ├── Module 1: score-engine (Validator + MusicXML Timeline Extractor + IndexedDB + OSMD Viewport)
    │       │
    │       └── Module 3: audio-playback (smplr + Lookahead Scheduler + 4-Ch GainNode Mixer + Drone)
    │               │
    ├── Module 2: pitch-detection (Unfiltered Mic + Mic Selector + Pitchy MPM + 3-Frame Median Filter)
    │               │
    └───────────────┴── Module 4: practice-coach (Wait-for-Me + Play-Along + Looping + App Shell)
```

## Architecture Decisions
- **Pure Browser PWA (React 19 + TypeScript + Vite):** Zero install friction across desktop and mobile. Uses `vite-plugin-pwa` and `idb-keyval` for local offline score storage.
- **OpenSheetMusicDisplay (OSMD) + Pure TS Timeline Extractor:** Uses `EngravingRules.RenderSingleHorizontalStaffline = true` for mobile music-stand legibility. Extracts a linear note/rest/tempo timeline that merges `NoteTie` chains so Wait-for-Me mode holds tied notes continuously. Colors noteheads in $O(1)$ time by mutating SVG DOM attributes (`fill`/`stroke`) rather than re-running `osmd.render()`.
- **`smplr` + Web Audio Lookahead Scheduler:** Replaces harsh oscillator synths with sampled Violin and Grand Piano instruments routed through 4 independent Web Audio `GainNode`s (Solo Violin, Accompaniment, Metronome, Reference Drone), with a clean Web Audio harmonic synth fallback when offline or in headless tests.
- **Decoupled `pitchy` (MPM) Loop with Hardware Timestamps:** Runs a 2048-sample McLeod Pitch Method detector on a 20ms `AnalyserNode` loop decoupled from React renders, reading `audioContext.sampleRate` dynamically and gating with `clarity >= 0.85`, an RMS silence floor, and a 3-frame median filter. Evaluates hold and timing windows using `audioContext.currentTime`.

## Task List (Tracked in `tasks/todo.md`)

### Phase 1: Foundation & Score Engine
- [x] **Task 1:** Project Scaffold, Domain Contracts & Built-in Demo Scores (`S`)
- [x] **Task 2:** Score Engine — File Validator, Timeline Extractor, IndexedDB Store & OSMD Viewport (`M`)

### Checkpoint 1: Foundation & Score Rendering
- [x] All unit tests pass (`npm test -- --run`), app builds cleanly (`npm run build`), and demo scores render in both Desktop Page and Mobile Horizontal Ribbon modes.

### Phase 2: Pitch Detection & Audio Playback Engines
- [x] **Task 3:** Violin Pitch Detection Engine & Live Tuner HUD (`M`)
- [x] **Task 4:** Multi-Track Audio Synthesis, Lookahead Scheduler & 4-Channel Mixer (`M`)

### Checkpoint 2: Audio & Pitch Engines
- [x] All pitch math, median filter, and scheduler tests pass; live mic tuner and independent Solo/Accompaniment/Metronome/Drone volume controls work cleanly.

### Phase 3: Interactive Practice Coach & End-to-End Integration
- [x] **Task 5:** Practice Coach State Machine — Wait-for-Me, Delay-Forgiving Play-Along & Measure Looping (`M`)
- [x] **Task 6:** Unified Practice Workspace, PWA Manifest & Integration Verification (`M`)

### Checkpoint 3: Complete
- [x] All unit and integration tests pass, production PWA bundle builds with zero TypeScript/lint errors, and all 5 Spec Success Criteria are verified.

### Phase 4: Hallmark UX Redesign — Direction 1 (Urtext Archive) & 4-Page Browsable Navigation
- [x] **Task 7:** Urtext Archive Design Tokens, Typography & 4-Page AppShell Masthead (`S`)
- [x] **Task 8:** Dedicated `LibraryPage`, 4-String `TunerPage`, and `SettingsPage` Views (`M`)
- [x] **Task 9:** Distraction-Free `PracticeStudioPage`, Popover Drawers & Multi-Page Integration Tests (`M`)

### Checkpoint 4: Urtext Archive 4-Page UX Complete
- [x] All unit and integration tests pass, zero TypeScript errors, and all 4 browsable pages match Direction 1 (Urtext Archive).

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Mobile Bluetooth earbuds switch to HFP and alter `sampleRate` or route mic to earbud | High | Request `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }`, expose an explicit `enumerateDevices()` Mic Selector to choose the built-in device mic, and read `audioContext.sampleRate` dynamically after stream acquisition. |
| Calling `osmd.render()` on note grading causes mobile frame drops | High | Mutate SVG notehead attributes (`fill`/`stroke`) directly in $O(1)$ time via `GraphicalNote.getSVGGElement()` and CSS selectors. |
| Violin G3/D4 weak fundamental causes single-frame octave jumps | Medium | Use McLeod Pitch Method (`pitchy`), gate at `clarity >= 0.85` + RMS floor, and pass frequencies through a 3-frame median filter before grading. |
| Tied notes across barlines cause Wait-for-Me to pause mid-bow | Medium | Coalesce tied note chains in the Timeline Extractor into a single sustained target note while advancing the visual cursor across tied heads. |

## Open Questions
- None — all architectural and product questions were resolved during the Interview, Idea-Refine, and Council phases.
