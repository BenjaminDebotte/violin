# Spec: shared score library

Status: **draft for review**. Nothing in this spec is built yet. It replaces the first, unreviewed
implementation (`v0.2.0`, commit `a3743ae`), which must not be deployed. The fixes land as `0.2.1`.

Inputs: a code review and a security review of `a3743ae` (both read-only), and the owner's answers
to the six decisions below.

## 1. Goal

A MusicXML score added on one device (the PC) can be played on another (the phone) without moving
the file by hand. Scores stay playable offline once they are on a device.

Non-goals: accounts or per-user libraries; editing scores; syncing progress or settings; real-time
sync; deleting a piece from every device at once; versioning or history inside the app; storing
anything but MusicXML.

## 2. Decisions (owner, 2026-11-04)

| # | Decision |
| --- | --- |
| D1 | Reading is open to every signed-in user (admins, operators, guests). **Writing and deleting: `group:admins` only.** |
| D2 | The library runs on **its own nginx port (8081)**, separate from the app (8080). The app port has no library at all. |
| D3 | A name that is already in the library is **never replaced**. The upload is refused (`409`) and the UI says "already in the library". To replace a piece, delete it first. |
| D4 | The library is **additive**. Deleting from the library does not remove copies on devices, and deleting on a device does not touch the library. |
| D5 | Limits: **5 MB per file**; a **quota of about 1 GB on the NAS share** (set on the Synology, not in the app). |
| D6 | `v0.2.0` stays published but is **never deployed**. Ship `0.2.1`. The cluster pins the chart to a tag so `main` cannot roll out an unreleased chart. |

## 3. Threat model

Who can reach what, from outside in:

1. LAN only (`internal-only` Traefik middleware, `192.168.1.0/24`). Nothing is exposed to the internet.
2. The app (`/`) is open to the LAN. It carries no data: scores live in each browser.
3. The library (`/library`) is behind the Authelia middleware, through its own Ingress. Any signed-in
   user may read; only `group:admins` may write (an Authelia rule on the method, see 8.3).
4. Anything else in the cluster must not reach the library port: a NetworkPolicy allows only Traefik.

Required failure mode: **closed**. If the Authelia middleware is missing or misnamed, or the library
Ingress is absent or does not match a path form, a request must reach the app (SPA or 404), never a
write endpoint. This holds by construction: the library port is not served by the app Ingress.

Attacker model: a malicious or curious LAN host; a signed-in guest; a compromised pod; a web page on
another site or another `*.bdbt.dev` app; a malicious score file (bad XML, zip bomb, script in a file
served from the app origin). Out of scope: a compromised admin, a compromised NAS or node.

## 4. Architecture

```
phone / PC ──https──> Traefik ──/──────────> Service :80  ──> nginx :8080  (app, static)
                         └──/library (Authelia, internal-only)
                                            Service :8081 ──> nginx :8081  (library, dav)
                                                                  │
                                                         /srv/library = PVC (SMB share, subPath violin-scores)
```

- One nginx process, two `server` blocks. `:8080` serves the app exactly as in `0.1.0` and has **no**
  `/library` location (a request to `/library/...` falls back to the SPA shell). `:8081` serves only the
  library.
- The Service exposes 8081 **only** when `library.enabled` is true.
- The probes keep using `/healthz` on 8080.

## 5. Library API (port 8081)

| Request | Result |
| --- | --- |
| `GET /library/files/` | JSON list (nginx autoindex): `[{name,type,mtime,size}]` |
| `GET /library/files/<name>` | the file; `Cache-Control: no-store` |
| `PUT /library/files/<name>` | `201` created; `409` if the name exists (no overwrite); `403` for a bad name or missing header; `413` over 5 MB |
| `DELETE /library/files/<name>` | `204`; `404` if absent |
| `GET /library`, `GET /library/` | `302` to `/` (relative, no host or port: `absolute_redirect off`). Where the login middleware sends the user back. |
| anything else | `403` / `404` / `405`, never a write |

Name rule, enforced by nginx (`$library_write_denied`), `\z` not `$` (a trailing newline must not pass):
the whole name is 1 to 100 characters, starts with a letter or digit, then letters, digits and
`. _ ( ) -`, and ends with `.musicxml`, `.mxl` or `.xml` (lower case). Everything else is refused.
Case-insensitive duplicates cannot exist because the share is SMB: `a.xml` and `A.xml` are one file.

Writes also need the header `X-Violin-Library: 1` (non-empty). A page on another origin cannot send it
without a CORS preflight, which the server never grants.

Served files carry `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options:
nosniff`, `Cache-Control: no-store`. Reason: an uploaded `.xml` containing XHTML or SVG would
otherwise run script on the app origin (reproduced in the security review).

Limits: `client_max_body_size 5m`; request bodies buffer in a disk-backed `/tmp` of 64 Mi (not memory).
A zero-byte upload is refused (`403`, via the client; a server rule if nginx allows it).

## 6. Naming and identity

- A **piece** is identified by its sanitised name without extension, lower case (`libraryKey`). The
  extension does not matter: `Minuet.mxl` and `Minuet.musicxml` are the same piece.
- `sanitizeLibraryName` keeps letters, digits and `. _ ( ) -`, turns the rest into `-`, strips
  diacritics, caps the whole name at 100. If nothing is left (for example a name in another script)
  the base becomes `score-<8 hex of a hash of the original name>`, so two such pieces do not collide.
- Two different files that sanitise to the same name are the same piece for the library: the second is
  refused with "already in the library". The player renames the file if they differ. This is no
  longer silent (D3).
- Twins that already exist (copied in by hand on the share) both show in the list; "On this device"
  is decided by the key, so the twin of a piece you already have shows as present.

## 7. Behaviour in the app

States of the "Shared library" section on the Songs page:

| State | When | Shows |
| --- | --- | --- |
| hidden | no library on this server (404, or an HTML page: dev server) | nothing |
| loading | first request in flight | nothing (the section reserves no space) |
| offline | `navigator.onLine` is false | one muted line "Library unavailable offline"; reloads on `online` |
| signin | login redirect (opaque redirect) or 401 | a **Sign in** button |
| error | other failures | a calm card with the reason and **Try again** |
| available | list received | the list, "Add", "Remove from library", the "also save new scores" switch |

Rules:

1. **Add** downloads the file, validates it as today, stores it in IndexedDB. It is idempotent per key.
2. **Auto-upload** (switch on by default, remembered): after a successful local import, the original
   file (bytes, `.mxl` stays `.mxl`) is sent in the background. Playing does not wait for it. The
   upload first reads a **fresh** list (never trusts a stale or loading state); if the key exists it
   does nothing and says so; otherwise it PUTs. A `409` is shown as "already in the library".
3. **Visibility of failures:** a device row whose piece is not in the library shows "Only on this
   device" plus a **Save to library** button (sends the stored XML as `.musicxml`). So a failed
   auto-upload is visible and repairable. The button has a busy state (no double sends).
4. **Remove from library** (confirm) deletes the server copy only. It uses a different icon from the
   device delete, and its label says "from the library".
5. Admin-only writes: if a non-admin gets `403` on PUT/DELETE, the message says writing is for admins.
   The UI does not know who is an admin; it reacts to the answer.
6. Stale-list safety: refresh results are applied in order (a request counter). After any upload or
   delete the list is read again.
7. Timeouts: list 10 s; download 15 s; upload 10 s plus 1 s per 100 KB. Aborts say "took too long" and
   leave nothing half-written (nginx discards an incomplete body).
8. Accessibility: the section is a live region; after Add or Remove focus moves to the section
   heading; the confirm names the piece; all targets are at least 44 px; the error card is announced.
9. Titles: the library list shows names made from the file name; after Add, the device shows the title
   from inside the file. Accepted, not hidden.

Client safety on files it fetches or imports: `.mxl` entries are refused above **20 MB uncompressed**
(zip bomb), checked before inflating; unpacked XML above 20 MB is refused.

## 8. Deployment contract

### 8.1 Chart (`chart/`)

- `library.enabled` (default **false**). When false: no library volume, no 8081 Service port, no
  library Ingress. Writes are impossible (read-only root).
- When true, the chart **fails to render** unless `library.persistence.existingClaim` is set (no silent
  emptyDir: that loses the library on restart), `ingress.enabled` is true and `library.ingress.enabled`
  is true. So it cannot be enabled open.
- `strategy: Recreate` when a claim is used (a ReadWriteMany SMB claim also works with rolling, but
  Recreate avoids two nginx writing at once).
- `/tmp` is a 64 Mi disk emptyDir. The library Ingress points to Service port 8081.
- Defaults must `helm template` cleanly and expose no write path.

### 8.2 Cluster (`home-infrastructure`, `apps/violin/`)

- A PV/PVC on the existing Synology SMB share `media`, `subPath: violin-scores`, mount options
  `uid=101,gid=101,file_mode=0664,dir_mode=0775,vers=3.0`, credentials from the existing secret.
  (`uid=101` so nginx owns the files and may set their times.)
- A NetworkPolicy for the `violin` namespace: ingress to 8080 and 8081 only from Traefik (`kube-system`).
- Library Ingress: middlewares `strip-auth-headers, internal-only, authelia, security-headers`.
- `GitRepository` pinned to `ref.tag: v0.2.1` and `image.tag: "0.2.1"` (chart and image move together).

### 8.3 Authelia rule (cluster)

Rules are evaluated in order; the first match wins. Before the wildcard rule add, for
`violin.bdbt.dev`, `resources: ["^/library/files/"]`, `methods: [PUT, DELETE]`:
1. `subject: group:admins`, policy `one_factor`;
2. the same domain, resources and methods, policy `deny` (everyone else).
GET stays covered by the existing `*.bdbt.dev` rule.

### 8.4 Synology (manual)

Quota of about 1 GB on the share or the `violin-scores` folder; snapshots or the Recycle Bin enabled
(an admin delete or a replace-by-delete is otherwise unrecoverable).

## 9. Service worker and sign-in

The built service worker answers every navigation with the app shell, which would swallow the
**Sign in** navigation to `/library/`. The workbox config must exclude `/library` from the navigation
fallback (`navigateFallbackDenylist`). Today `main.tsx` unregisters service workers on load, so this is
latent; it is fixed anyway so it cannot break when offline mode is switched on.

After login Authelia returns to `/library/`, nginx answers a relative `302 /`, and the user is back in
the app, which re-reads the list.

## 10. Acceptance criteria (each is tested or checked by hand, see 11)

- [x] **A1.** Default chart values render no library volume, port or Ingress; `library.enabled=true` without a claim or Ingresses fails. (`scripts/test-chart.sh`)
- [x] **A2.** On 8080, `/library/files/` and `/library/files/x.xml` (any method) return the SPA shell or 404 and never write. (`scripts/smoke-library.sh`)
- [x] **A3.** On 8081: PUT a valid name returns 201; the same name again returns 409 and the file is unchanged; DELETE returns 204; GET returns the bytes with the CSP and nosniff headers. (`scripts/smoke-library.sh`, `tests/unit/library-client.test.ts`)
- [x] **A4.** `a.xml%0a`, `..%2f`, dotfiles, sub-paths, other extensions, names over 100, a missing or empty header, POST/MKCOL/MOVE/COPY/PROPFIND are refused; nothing outside the folder is touched. (`scripts/smoke-library.sh`, `tests/unit/library-client.test.ts`)
- [x] **A5.** A body over 5 MB returns 413; ten parallel 5 MB uploads leave no 500 and no half-files. (`scripts/smoke-library.sh`)
- [x] **A6.** An uploaded XHTML file with a script does not run script when opened in Chrome (sandbox CSP). (`scripts/smoke-library.sh`)
- [x] **A7.** A zip bomb `.mxl` (65 KB inflating to 64 MB) is refused by the client without freezing the tab. (`tests/unit/file-validator-budget.test.ts`)
- [x] **A8.** Auto-upload of a new piece creates it once; a second device importing the same name gets "already in the library" and no overwrite. (`tests/unit/library-ui.test.tsx`, `tests/unit/use-library.test.tsx`)
- [x] **A9.** A device-only piece shows "Only on this device" and can be saved; after saving the badge goes away. (`tests/unit/library-ui.test.tsx`)
- [ ] **A10.** A non-admin's PUT/DELETE is denied by Authelia and the UI shows the admins-only message. *(Cluster check, post-review)*
- [x] **A11.** Offline shows the muted line, not an error card; going online reloads the list. (`tests/unit/use-library.test.tsx`, `tests/unit/library-ui.test.tsx`, phone check post-review)
- [ ] **A12.** With the service worker active, tapping **Sign in** reaches the Authelia login page and returns to the app (checked on the phone). *(Cluster / phone check, post-review; sw denylist verified by `scripts/check-sw.sh`)*
- [ ] **A13.** With the library Ingress or the middleware removed, the library is unreachable (404/SPA), not open. *(Cluster check, post-review)*

## 11. Test plan

- **Unit (vitest):** `sanitizeLibraryName` (including hash fallback and the server pattern parsed from the conf), `libraryKey`, client status mapping (200/401/3xx/403/404/409/413/network), upload no-clobber and `409` message, size-scaled timeout, out-of-order refresh, zip budget, offline state, `useLibrary` with a fake fetch.
- **UI (vitest + Testing Library):** each state in section 7; Add, Remove, auto-upload, switch off, "Only on this device" and Save, busy state, focus after Add/Remove, `.mxl` binary round trip, collision and twin cases. Test state is reset in `afterEach` (`localStorage.clear()`, `vi.restoreAllMocks()`, `vi.unstubAllGlobals()`).
- **nginx (script, run in CI and locally):** `scripts/smoke-library.sh` builds nothing itself: it runs against a started container with the production flags and checks A2 to A6 (including 11 MB, parallel PUTs, the `%0a` name, the XHTML payload headers).
- **Chart (CI):** `helm template` for A1 (defaults, enabled-without-claim fails, enabled renders the second port and Ingress).
- **Cluster (after deploy, by hand):** A10 to A13, SMB write check (a PUT then a DELETE of a test file through a port-forward to 8081), kubelet creates `violin-scores`.

## 12. Rollout

1. Owner approves this spec.
2. Implement in the violin repo against the criteria; independent review of the diff; owner review.
3. Release `0.2.1` (bump `package.json` and `chart/Chart.yaml`), CI publishes the image.
4. `home-infrastructure`: PV/PVC, NetworkPolicy, library Ingress, Authelia rule, tag pins. Owner review before it lands on `main`.
5. Synology quota and snapshots (manual).
6. Verify A10 to A13 on the cluster and the phone. Only then use it.

## 13. Not verified yet (to confirm on the real cluster)

- How Traefik treats an Ingress that references a missing middleware, and path forms such as
  `//library`, `/library%2ffiles/`, `/library/./files/` (the design holds either way, section 3).
- The HTTP status Authelia returns to `fetch()` for GET, PUT and DELETE when not signed in
  (302, 303 or 401); the client handles all three.
- That csi-driver-smb with those mount options lets nginx (uid 101) create files, set their times and
  delete them, and that kubelet creates the `subPath` folder with usable ownership.
- Behaviour in Safari and Firefox (the security checks ran in Chrome only).
