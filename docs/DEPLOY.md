# Deploying Violin Coach

The app is a static site. It ships as a small container (nginx, non-root, read-only filesystem)
and a Helm chart, both in this repository. The home cluster
([home-infrastructure](https://github.com/BenjaminDebotte/home-infrastructure), `apps/violin/`)
runs it with Flux.

| Piece | Where |
| --- | --- |
| Image | `ghcr.io/benjamindebotte/violin` (built by `.github/workflows/ci.yml`) |
| Chart | `chart/` (Flux reads it straight from this repo, branch `main`) |
| nginx config | `nginx/` (SPA fallback, cache rules, `/healthz`, microphone allowed for the origin) |

## Run it locally

```sh
docker build -t violin .
docker run --rm -p 8080:8080 --read-only --tmpfs /tmp violin   # http://localhost:8080
```

`localhost` counts as a secure origin, so the microphone works. Anywhere else it needs https
(see `PHONE-TESTING.md`).

## Release

1. Bump the version in `package.json` **and** `chart/Chart.yaml` (`appVersion`, and `version` if
   the chart changed). They must agree: CI refuses a tag that does not match both.
2. Merge to `main`, then tag: `git tag -a v0.2.0 -m "v0.2.0" && git push origin v0.2.0`.
3. CI tests, lints the chart, builds the image, smoke-tests it the way the cluster runs it, and
   pushes `0.2.0`, `0.2`, `sha-<short>` (and `latest` from `main`).
4. In home-infrastructure, set `image.tag` in `apps/violin/helmrelease.yaml` to `0.2.0`
   (Renovate proposes this too). Flux rolls it out.

## First publish: make the package public

A new GHCR package may start private. Open GitHub, Packages, `violin`, Package settings, and set
the visibility to public (or the cluster cannot pull it without an image pull secret).

## Shared library (scores shared between devices)

Scores you import live in each device's browser. The shared library keeps one copy on the server,
so a score added on the PC shows up on the phone (Songs, "Shared library", Add).

- **Server:** plain nginx, no extra service. `GET /library/files/` lists the files (JSON), a file
  is read at `/library/files/<name>`, `PUT` adds and `DELETE` removes. Only plain MusicXML file
  names (`[A-Za-z0-9._()-]`, `.musicxml` / `.mxl` / `.xml`, 10 MB at most) are accepted, and writes
  need an `X-Violin-Library` header (blocks cross-site forgery).
- **Storage:** the files live in `/srv/library`. In the chart, `library.persistence.existingClaim`
  mounts a PVC there (the cluster uses a Synology SMB share); without it an emptyDir is used and
  the files are lost on restart. `docker run` just uses the folder in the image.
- **Who can use it:** the app does no login. `library.ingress` creates a second Ingress for `/library`
  only, so the cluster can put its login middleware in front of the library while the app itself
  stays open (a PWA must fetch its manifest and service worker without a login redirect). The app
  shows a "Sign in" button when the middleware redirects.
- **Not a backup:** deleting from the library does not touch copies already on devices.

## What is deliberately not here

- No login for the app itself: its data stays in the browser. Access is limited to the LAN by the
  `internal-only` middleware; only `/library` sits behind the login middleware.
- No autoscaling or replicas: one nginx pod serves a handful of files.
