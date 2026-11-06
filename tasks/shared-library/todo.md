# Task list: shared score library (0.2.1)

Plan: `tasks/shared-library/plan.md`. Spec: `docs/specs/shared-library.md`.
Commands: tests `npx vitest run`; types `npm run typecheck`; build `npm run build`; chart `helm lint chart`.
Every task leaves the suite green and is committed on its own (small, conventional commit message).

## Phase 1: Server side (fail closed)

- [x] **T1: nginx split, no-clobber, hardened names, scripted smoke test** (M)
  - Description: move the library out of the app server into a `server { listen 8081; }`; keep `:8080` identical to 0.1.0
    plus the app headers; apply the spec section 5 rules.
  - Acceptance:
    - [x] `:8080` has no `/library` location; `/library/files/` and any method on it return the SPA shell or 404 (A2)
    - [x] `:8081`: PUT valid name 201, same name again 409 with the file unchanged, DELETE 204, GET returns bytes with `Content-Security-Policy: default-src 'none'; sandbox`, `nosniff`, `no-store` (A3, A6)
    - [x] name rule uses `\z`, total length 1-100, lower-case extensions only; `a.xml%0a`, `..%2f`, dotfiles, sub-paths, bad extensions, over-long names, missing or empty header, POST/MKCOL/MOVE/COPY/PROPFIND are refused (A4)
    - [x] `client_max_body_size 5m` returns 413 above it; ten parallel 5 MB PUTs give no 500 (A5); `/library` and `/library/` answer a relative `302 /` (`absolute_redirect off`)
    - [x] `EXPOSE 8081` in the Dockerfile; `scripts/smoke-library.sh` checks all of the above against a running container and exits non-zero on any failure; CI runs it with the production flags (`--read-only`, `/tmp` tmpfs 64m, library tmpfs)
  - Verification: `docker build` + `scripts/smoke-library.sh`; `npx vitest run`; app smoke from `ci.yml` still passes.
  - Dependencies: none
  - Files: `nginx/default.conf` (and optionally `nginx/library.conf`), `Dockerfile`, `scripts/smoke-library.sh`, `.github/workflows/ci.yml`
  - Scope: M

- [x] **T2: Chart fails closed and exposes 8081 only when enabled** (M)
  - Description: `library.enabled` (default false); library volume, Service port 8081 and library Ingress only when enabled;
    `fail` when enabled without `existingClaim`, `ingress.enabled` or `library.ingress.enabled`; `strategy: Recreate` with a claim;
    `/tmp` a 64 Mi disk emptyDir; library Ingress backend port 8081; remove the emptyDir library fallback.
  - Acceptance:
    - [x] defaults render no library volume, no port 8081, no library Ingress (A1)
    - [x] `library.enabled=true` without a claim, or without either Ingress, fails to render (A1)
    - [x] enabled with claim + both Ingresses renders the volume (with `subPath`), Service port 8081, a library Ingress to 8081, `Recreate`
    - [x] `scripts/test-chart.sh` asserts the three cases; CI runs it
  - Verification: `scripts/test-chart.sh`; `helm lint chart`.
  - Dependencies: T1 (port name / number)
  - Files: `chart/values.yaml`, `chart/templates/deployment.yaml`, `chart/templates/service.yaml`, `chart/templates/ingress-library.yaml`, `scripts/test-chart.sh`, `.github/workflows/ci.yml`
  - Scope: M

### Checkpoint A: server side
- [x] Docker smoke (app + library) and chart tests green; `npx vitest run` and build still pass
- [x] Review with human before the client work (optional: only if the nginx approach changed)

## Phase 2: Client core

- [x] **T3: Library client: names, statuses, timeouts** (S)
  - Description: sanitiser hash fallback (`score-<8 hex>`), whole name <= 100, list filtered with the server rule,
    `409` becomes a `LibraryError('exists')`, upload timeout scaled by size, 5 MB constant.
  - Acceptance:
    - [x] a non-Latin-only name gets a deterministic `score-xxxxxxxx` base; two different such names differ
    - [x] the server pattern is parsed out of `nginx/default.conf` in the test and every sanitiser output matches it (incl. hostile and 300-char inputs)
    - [x] `409` maps to kind `exists`, `413`/`403`/`401`/`404`/network as before; the list ignores names the server would refuse
    - [x] upload timeout = 10 s + 1 s per 100 KB (unit-tested through an injectable clock or a captured signal)
  - Verification: `npx vitest run tests/unit/library-client.test.ts`; typecheck.
  - Dependencies: T1 (the rule it mirrors)
  - Files: `src/modules/library/libraryClient.ts`, `tests/unit/library-client.test.ts`
  - Scope: S

- [x] **T4: `useLibrary`: fresh list, ordered refresh, offline** (M)
  - Description: `upload()` reads a fresh list first and returns `'uploaded' | 'exists'`; refresh results applied in order
    (request counter); `offline` state when `navigator.onLine` is false, reloaded on the `online` event; no write while `loading`.
  - Acceptance:
    - [x] with a stale state that lacks a file the server has, `upload()` does not overwrite (returns `exists`, or the `409` is mapped to it)
    - [x] an older list response arriving last does not replace a newer one
    - [x] offline shows state `offline` (no network call); coming online refreshes
    - [x] `upload()` while `loading` waits for the list instead of assuming "absent"
  - Verification: new `tests/unit/use-library.test.tsx` (fake fetch, fake timers, `online` event); typecheck.
  - Dependencies: T3
  - Files: `src/hooks/useLibrary.ts`, `tests/unit/use-library.test.tsx`
  - Scope: S-M

- [x] **T5: Input budget for `.mxl` and XML** (S)
  - Description: refuse a `.mxl` entry above 20 MB uncompressed before inflating, and unpacked XML above 20 MB.
  - Acceptance:
    - [x] a generated bomb (64 KB deflating to 64 MB) is rejected with a clear message and without inflating it (A7)
    - [x] a normal `.mxl` and the sample scores still import; existing score-engine tests unchanged and green
  - Verification: `npx vitest run tests/unit/score-engine.test.ts` plus the new test; typecheck.
  - Dependencies: none
  - Files: `src/modules/score-engine/fileValidator.ts`, `tests/unit/file-validator-budget.test.ts`
  - Scope: S

### Checkpoint B: client core
- [x] `npx vitest run`, typecheck, build green; no change to the engines other than the size check in T5

## Phase 3: UI

- [x] **T6: `LibrarySection` states and accessibility** (M)
  - Description: states of spec section 7 (hidden, loading, offline muted line, signin, error, available), live region, focus to the
    section heading after Add/Remove, distinct "remove from library" icon and label, messages for `exists` ("already in the library")
    and `403` ("writing is for admins").
  - Acceptance:
    - [x] each state renders what the spec table says; offline is not an error card
    - [x] after Add and after Remove, focus is on the section heading
    - [x] the remove control's accessible name says "from the library" and uses a different icon from the device delete
    - [x] a 403 on remove shows the admins-only message; a 409 shows "already in the library"
    - [x] touch targets are at least 44 px
  - Verification: `npx vitest run tests/unit/library-ui.test.tsx`; typecheck; screenshot at 390 px in the local container.
  - Dependencies: T4
  - Files: `src/components/songs/LibrarySection.tsx`, `tests/unit/library-ui.test.tsx`
  - Scope: M

- [ ] **T7: Songs page: "Only on this device", Save, auto-upload outcome** (M)
  - Description: device rows whose piece is not in the library show "Only on this device" and a Save button with a busy state;
    auto-upload uses `upload()`'s outcome and never blocks playing; `.mxl` originals are sent as bytes.
  - Acceptance:
    - [ ] badge and button appear only when the library is available and the key is absent; they disappear after a successful save (A9)
    - [ ] a double tap sends one request; errors show next to the row, not only at the top of the page
    - [ ] a second import of the same name does not overwrite and says "already in the library" (A8)
    - [ ] a `.mxl` binary imported on the device is uploaded byte-for-byte and can be added back (round trip)
  - Verification: `npx vitest run tests/unit/library-ui.test.tsx`; typecheck.
  - Dependencies: T4, T6
  - Files: `src/pages/SongsPage.tsx`, `tests/unit/library-ui.test.tsx`
  - Scope: M

- [ ] **T8: Test hygiene and coverage gaps** (S)
  - Description: reset state between tests; replace the vacuous "no library" test; add the missing cases.
  - Acceptance:
    - [ ] `afterEach` clears `localStorage`, restores mocks and unstubs globals in the library test files
    - [ ] the "no library" test waits for a settled state (for example a `data-state` attribute or the Songs content) before asserting nothing renders
    - [ ] added cases: 401 on PUT turns the section into signin; delete failure message; same key with different extensions (twins); key collision between two different files; upload failure message in the UI
  - Verification: `npx vitest run` (run the library files twice in a different order to prove no leakage).
  - Dependencies: T6, T7
  - Files: `tests/unit/library-ui.test.tsx`, `tests/unit/library-client.test.ts`
  - Scope: S

## Phase 4: Sign-in and release candidate

- [ ] **T9: Keep `/library` out of the service worker navigation fallback** (XS)
  - Acceptance:
    - [ ] `workbox.navigateFallbackDenylist` contains `/^\/library/`
    - [ ] after `npm run build`, `dist/sw.js` contains the denylist; checked by `scripts/check-sw.sh`, run in CI after the build
  - Verification: `npm run build && scripts/check-sw.sh`.
  - Dependencies: none
  - Files: `vite.config.ts`, `scripts/check-sw.sh`, `.github/workflows/ci.yml`
  - Scope: XS

- [ ] **T10: Docs and version 0.2.1 (no tag, no push)** (S)
  - Description: update `docs/DEPLOY.md` (8081, fail-closed chart, 5 MB, admins-only writes, cluster contract points to the spec);
    tick the spec acceptance list with test references; bump `package.json` and `chart/Chart.yaml` to 0.2.1.
  - Acceptance:
    - [ ] docs match the code (ports, limits, switch, no-overwrite rule)
    - [ ] versions agree (CI's tag check would pass for `v0.2.1`)
  - Verification: read-through; `helm lint chart`.
  - Dependencies: T1-T9
  - Files: `docs/DEPLOY.md`, `docs/specs/shared-library.md`, `package.json`, `chart/Chart.yaml`
  - Scope: S

### Checkpoint: complete (release candidate)
- [ ] `npx vitest run`, `npm run typecheck`, `npm run build`, `helm lint chart` green
- [ ] `scripts/smoke-library.sh` (against a container with production flags), `scripts/test-chart.sh`, `scripts/check-sw.sh` green
- [ ] A1-A9 covered by a test or script (A10-A13 are cluster checks, left for the post-review phase)
- [ ] No tag created, nothing pushed, `home-infrastructure` untouched
- [ ] Ready for the independent review
