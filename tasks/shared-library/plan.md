# Implementation Plan: shared score library (0.2.1)

Spec: `docs/specs/shared-library.md` (approved decisions D1-D6, acceptance criteria A1-A13).
Replaces the unreviewed `0.2.0` implementation (commit `a3743ae`); the work edits that code in place.
The earlier, finished plan in `tasks/plan.md` and `tasks/todo.md` is untouched (all its tasks are checked).
Tasks are tracked in `tasks/shared-library/todo.md`.

## Overview
Make the server-side library **fail closed by construction** (own nginx port, no library on the app
port, chart cannot enable it open), fix the security and sync problems found by the two reviews, and
make the client honest about every state. Scope of this plan: the **violin repo only**, up to a
release candidate. Tagging, pushing and everything in `home-infrastructure` come after review.

## Architecture decisions
- **One nginx, two servers.** `:8080` serves the app and has no `/library` location. `:8081` serves only
  `/library/...`. Why: a routing or middleware mistake can then only reach the SPA or a 404, never a write.
- **No-clobber on the server.** A `PUT` to an existing name returns `409` (an nginx `if` chain on
  `$request_filename`), because the client's list can be stale. Replacing means deleting first (D3).
- **Chart switch, not a default.** `library.enabled=false` by default. Enabling requires a claim, the app
  Ingress and the library Ingress, or rendering fails. No silent emptyDir. Why: the first build failed open.
- **Additive library.** No tombstones, no origin ids (D4). "Only on this device" makes a failed upload visible.
- **Identity by sanitised name without extension.** A hash fallback only for names that sanitise to nothing.
- **Client safety on input.** `.mxl` entries and unpacked XML above 20 MB are refused before inflating.
  This is a small additive change in `fileValidator.ts` (the score engine is otherwise untouched).
- **Verification is scripted where it can be**: `scripts/smoke-library.sh` (nginx, run in CI against the
  image with production flags) and `scripts/test-chart.sh` (helm template assertions).

## Dependency graph
```
T1 nginx split + smoke script ──> T2 chart (service port 8081, fail-closed) ──> T10 docs + version
T3 client names/status/timeouts ──> T4 useLibrary ──> T6 LibrarySection ──┐
T5 zip/XML budget (independent)                       T7 SongsPage ───────┤──> T8 test hygiene ──> T10
T9 service worker denylist (independent)  ────────────────────────────────┘
```

## Task list
See `tasks/shared-library/todo.md` for the checklist with acceptance criteria and verification per task.

Order (risk first): T1, T2, checkpoint A, T3, T4, T5, checkpoint B, T6, T7, T8, T9, T10, final checkpoint.

## Out of this plan (after review, with owner approval)
1. Release `0.2.1`: tag `v0.2.1`, push, CI publishes the image.
2. `home-infrastructure`: PV/PVC, NetworkPolicy, library Ingress, Authelia method rule, `GitRepository` pinned to
   `v0.2.1`, `image.tag: "0.2.1"`. Owner reviews before it lands on `main`.
3. Synology quota and snapshots (manual).
4. Cluster and phone verification: A10, A11 (phone), A12, A13, SMB write check.

## Risks and mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| nginx `if` chain for no-clobber misbehaves under `alias` | High | T1 first; smoke script proves 201 / 409 / unchanged content; fall back to a tiny `location` per method if needed |
| `fail()` in chart templates breaks the Flux render | Med | `scripts/test-chart.sh` covers defaults, enabled, enabled-without-claim; the cluster does not enable the library until the owner approves |
| Regex differences between nginx (PCRE) and JS | Med | Unit test parses the pattern out of the conf and runs it against the sanitiser output |
| 5 MB cap vs real scores | Low | Real scores are well under 1 MB; the limit is one constant in the client and one line in nginx |
| Safari / Firefox untested for CSP sandbox and sign-in | Med | Listed as not verified in the spec; checked by hand later |
| Traefik / Authelia / SMB unknowns | Med | Design is closed either way; verified on the cluster in the post-review phase |
| Touching `fileValidator.ts` (score engine) | Low | Additive size check only; existing tests must stay green |

## Open questions
- None blocking. Decided in the plan: an empty file is refused by the client (existing `EMPTY_FILE` rule); the
  server does not check emptiness (nginx cannot cheaply).
