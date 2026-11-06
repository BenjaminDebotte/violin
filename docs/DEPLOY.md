# Deploying Violin Coach

The app is a static site. It ships as a small container (nginx, non-root, read-only filesystem)
and a Helm chart, both in this repository. The home cluster
([home-infrastructure](https://github.com/BenjaminDebotte/home-infrastructure), `apps/violin/`)
runs it with Flux.

| Piece | Where |
| --- | --- |
| Image | `ghcr.io/benjamindebotte/violin` (built by `.github/workflows/ci.yml`) |
| Chart | `chart/` (Flux reads it straight from this repo, branch `main`) |
| nginx config | `nginx/` (SPA fallback on :8080, library on :8081, `/healthz`, security headers) |

## Run it locally

```sh
# Starts the read-only violin container (:8080 app, :8081 library) behind a local
# gateway that routes / -> :8080 and /library -> :8081 on http://localhost:8080
docker compose up --build
```

To run the container directly without the local gateway:

```sh
docker build -t violin .
# Port 8080 serves the app; port 8081 serves the library
docker run --rm -p 8080:8080 -p 8081:8081 --read-only --tmpfs /tmp:size=64m --tmpfs /srv/library:uid=101,gid=101,mode=0775 violin
```

`localhost` counts as a secure origin, so the microphone works. Anywhere else it needs https
(see `PHONE-TESTING.md`).

## Release

1. Bump the version in `package.json` **and** `chart/Chart.yaml` (`appVersion`, and `version` if
   the chart changed). They must agree: CI refuses a tag that does not match both.
2. Merge to `main`, then tag: `git tag -a v0.2.1 -m "v0.2.1" && git push origin v0.2.1`.
3. CI tests, lints the chart, builds the image, smoke-tests it the way the cluster runs it, and
   pushes `0.2.1`, `0.2`, `sha-<short>` (and `latest` from `main`).
4. In home-infrastructure, set `image.tag` in `apps/violin/helmrelease.yaml` to `0.2.1`
   (Renovate proposes this too). Flux rolls it out.

## First publish: make the package public

A new GHCR package may start private. Open GitHub, Packages, `violin`, Package settings, and set
the visibility to public (or the cluster cannot pull it without an image pull secret).

## Shared library (scores shared between devices)

Scores you import live in each device's browser. The shared library keeps one copy on the server,
so a score added on the PC shows up on the phone (Songs, "Shared library", Add).

- **Server split:** The library runs on **its own nginx port (8081)**, completely separate from the app (8080).
  Port 8080 has no library endpoints (any request returns the SPA shell or 404, never a write).
- **API & limits:** `GET /library/files/` lists files (JSON autoindex), `GET /library/files/<name>` fetches a file
  (`Content-Security-Policy: default-src 'none'; sandbox`, `nosniff`, `no-store`). `PUT` adds a file (`201`),
  returning `409 Conflict` if the name already exists (never overwrites; delete first). `DELETE` removes a file (`204`).
  Only valid MusicXML names (`[A-Za-z0-9._()-]`, `.musicxml` / `.mxl` / `.xml` lower-case, 1 to 100 chars) are accepted.
  File size limit is **5 MB** (`client_max_body_size 5m`). Writes require the `X-Violin-Library: 1` header.
- **Fail-closed chart:** `library.enabled` defaults to **false**. When enabled, the chart requires
  `library.persistence.existingClaim`, `ingress.enabled`, and `library.ingress.enabled` to be set or rendering fails
  (no silent emptyDir fallback). It renders Service port 8081, points library Ingress to 8081, sets `strategy: Recreate`,
  and mounts a 64 Mi disk emptyDir on `/tmp`.
- **Access control:** Reading is open to all signed-in users (Authelia). Writing and deleting are restricted to
  `group:admins` via Traefik / Authelia method rules. The client maps 403 to "writing is for admins".
- **Additive library:** Deleting from the library does not delete device copies, and deleting on device does not touch the library.
- **Cluster contract:** See `docs/specs/shared-library.md` for full details on NetworkPolicy, Authelia method rules,
  and Synology SMB share mounts (`subPath: violin-scores`, `uid=101,gid=101`).

## What is deliberately not here

- No login for the app itself: its data stays in the browser. Access is limited to the LAN by the
  `internal-only` middleware; only `/library` sits behind the login middleware.
- No autoscaling or replicas: one nginx pod serves a handful of files (`strategy: Recreate`).
