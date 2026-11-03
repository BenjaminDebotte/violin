# Backlog

Things noticed while playing, not done yet. Newest first.

_Nothing open right now._

## Done recently
- **Drone stops when the piece ends** (Wait for me and Play along), and the drone button now
  always follows what the controller is really doing (also after Stop).
- **Current note is highlighted** (amber with a glow) and kept in view as you play. This also
  fixed the played-note colours, which never showed in a real browser: OSMD rebuilds the SVG on
  every render (resize, rotation) and dropped the note tags. They are now restored, with the
  played colours, after each re-render.
- Repeated same note needs a fresh bow stroke (silence, loudness dip, or pitch change) before it
  counts again in Wait for me. Play along still grades by time window.
