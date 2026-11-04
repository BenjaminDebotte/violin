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

## What is deliberately not here

- No Authelia in front: all data stays in the browser (localStorage / IndexedDB), the cluster
  holds nothing. Access is limited to the LAN by the `internal-only` middleware.
- No autoscaling or replicas: one nginx pod serves a handful of files.
