# Backlog

Things noticed while playing, not done yet. Newest first.

## Needs your judgement
- **Repeated-note gate tuning** (gap 20 ms = two silent frames, dip ratio 0.6, 1.5x rise for a
  new attack): a smaller gap means two repeated notes are never missed, at the price that a
  2-frame dropout inside one long note also counts as a new stroke. A legato same-pitch bow
  change with no dip and no gap still leaves you on "again: lift the bow". Try it on the violin.
- **Hint stats:** keep the on/off comparison in Settings (bias is fixed) or drop it. Default: keep.
- **Colours:** amber highlight on white (about 2.7:1) and the red mic banner: design call.
- _Decided:_ the finger table stays as is. The tuner is the source of truth for sharp keys.

## Known, not done
- Main-thread stalls longer than 40 ms can swallow a real gap in the repeated-note gate.
- The glow on the current note uses CSS `filter: drop-shadow` on SVG, which WebKit may ignore
  (the amber fill still shows).
- `npm run dev:phone` uses `DEV_HTTPS=1 vite`, not portable to Windows.
- `main.tsx` unregisters service workers, so offline mode is configured but not active.
- Play along grades by time window, so a held note can still cover two repeated notes there.

## Done recently
- Code review fixes: played colours survive view toggles and different scores start clean;
  OSMD auto-resize is switched off on unmount; a double Start or Try again opens the mic once,
  and Try again works after Stop; a failed mic start no longer leaves the mic open; the
  repeated-note gate no longer releases on a fading note or a single off-pitch frame; hint
  stats compare like with like; banner contrast, reduced-motion scroll, hint flash and the
  Settings switch label.
- Drone stops when the piece ends and the drone button follows the controller.
- Current note is highlighted and kept in view; played colours now also show in a real browser.
- Repeated same note needs a fresh bow stroke before it counts again in Wait for me.
