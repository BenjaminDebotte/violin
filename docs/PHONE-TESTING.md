# Trying the app on a phone

Browsers only expose the **microphone** on secure pages: `https://…` or `http://localhost`.
Opening the dev server through a LAN address (`http://192.168.x.x:5173`) is *not* secure, so the
mic is silently unavailable. The play screen now says so ("Mic blocked: this page isn't https").

Pick one:

1. **Self-signed https (easiest).** Run `npm run dev:phone`, open the `https://192.168.x.x:5173`
   address Vite prints, and accept the certificate warning once. The mic prompt then appears.
2. **USB + localhost (Android).** `adb reverse tcp:5173 tcp:5173`, then open
   `http://localhost:5173` on the phone. `localhost` counts as secure, no certificate needed.
3. **Deploy over https** (any static host) and open that URL.

## What the Play screen shows

The pill at the top-left of the score tells you what the app hears:

| Pill | Meaning |
| --- | --- |
| `Mic idle` | Not started yet. The mic opens when you tap Start. |
| `Listening` + moving bars | The mic is live. Bars follow the sound; they turn green when sound is heard. |
| `Hearing nothing` (amber) | Live, but silent for 5 s: muted mic, wrong input, or too far away. |
| `Audio paused, tap` (amber) | The browser suspended audio (iOS does this after the app was hidden). Tap to resume. |
| `Mic off` + red banner | The mic could not start. The banner says why; **Try again** retries after you allow it. |
