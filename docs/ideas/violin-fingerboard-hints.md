# Violin fingerboard hints

## Problem Statement
How might we show a violinist, for the note being asked of them, which string and finger it is in the positions they play, so that a note name (Do Ré Mi or A B C) turns into "that's the 3rd finger here"?

## What was built
- **Lookup, not auto-fingering** (`src/modules/fingerboard/fingering.ts`): a note's MIDI number minus each open string gives an offset, and a table for 1st and 3rd position turns it into a finger and its low/normal/high/stretched variant. Both positions are shown at once (1st solid, 3rd ring); no selector, no "not in this position" dead end.
- **Hint tracker** (`src/modules/practice-coach/hintTracker.ts`): pure, driven only by audio timestamps. Two triggers per target note in Wait-for-Me: stuck for 2 s, or a steady wrong note (>70 cents for 300 ms). Guards: ring-through of the previous note after a lock, octave/twelfth/double-octave detector errors, glides, short dropouts.
- **Display**: text first (string + finger, large), a small fingerboard under it, in place of the cents meter inside the pitch panel, so the target note and verdict stay visible. Closes on lock or tap. A hand button next to "Hear <note>" shows it on request (pause / between attempts).
- **Controls**: Settings has a hints on/off switch. Hints are off while the reference drone plays (the mic would hear the drone as the player).
- **Counters** (local only): each note that took 2 s or more to lock is recorded with hints on/off, so "do hints help me recover faster?" can be answered from Settings after a week.

## Finger table (semitones above the open string; normal finger first, variants in brackets)
| Position | open | f1 | f2 | f3 | f4 |
|---|---|---|---|---|---|
| 1st | 0 | 2 (low 1) | 4 (low 3) | 5 (high 6) | 7 (stretched 8) |
| 3rd | not listed, 1st shows it | 5 (low 4) | 7 (low 6) | 9 (low 8) | 10 (stretched 11) |

Checked against web teaching sources only (Violinspiration, Fiddle Warrior, violinwiki, Folkstrings, Sharmusic), not print methods. Needs a violinist's check, especially the low 1st/2nd/3rd finger in 3rd position and the stretched 4th.

## Key assumptions to validate
- [ ] 2 s is the right delay and the wrong-note trigger does not fire while playing correctly (try ~20 notes with hints on).
- [ ] The hint helps: compare median time-to-find with hints on vs off (Settings > Finger hints).
- [ ] The table matches your hand frame.

## Not doing (and why)
- Auto-fingering, reading `<fingering>`/`<string>` from MusicXML: a wrong choice teaches a bad habit.
- Play-along mode hints, live finger tracking from the mic, movable-do, a Tune-tab fingerboard map: different jobs, no link to the core assumption.
- Tap-only request while playing: the hands are busy; the triggers cover playing and the button covers pauses.

## Open questions
- Page-turner pedal as a hands-free request (key press)? Not built.
- La3 vs La4 convention: the card drops octave numbers so it does not matter there.
