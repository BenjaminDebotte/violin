# Backlog

Things noticed while playing, not done yet. Newest first.

## 1. Stop the drone when the piece ends
- **Seen:** at the end of a piece, "Hear A4" shows as off but the drone keeps sounding.
- **Likely cause:** when the last note locks, `PracticeController.handlePitchSample` sets
  `_isRunning = false` without stopping the drone (`stop()` does stop it). The app's
  `mixer.droneActive` flag also stays `true`, so the button and the sound disagree.
- **Done when:** finishing a piece (Wait for me and Play along) silences the drone and the
  button returns to "Hear <note>". Same for Stop and for leaving the play screen.

## 2. Highlight the note you are on, not only the notes already played
- **Seen:** noteheads only turn colour after they are played, so it is hard to see where you
  are in the bar.
- **Context:** OSMD's own cursor is 1 px tall, and `tagOsmdSvgNotes` currently tags 0 noteheads
  in real Chrome, so notehead colouring is barely visible. The bar tapes and the target panel
  are the only reliable position cues today.
- **Done when:** the current target note has a clearly visible colour (distinct from the
  played green) that moves as the cursor moves, in both single-line and full-page views.

## Done recently
- Repeated same note now needs a fresh bow stroke (silence, loudness dip, or pitch change)
  before it counts again in Wait for me. Play along still grades by time window.
