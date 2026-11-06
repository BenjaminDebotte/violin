#!/usr/bin/env bash
# Verifies that dist/sw.js excludes /library from the service worker navigation fallback (spec section 9).
set -euo pipefail

SW_FILE="dist/sw.js"

if [ ! -f "$SW_FILE" ]; then
    echo "FAIL: $SW_FILE not found. Run npm run build first." >&2
    exit 1
fi

if grep -q 'denylist:\[/\^\\\/library/\]' "$SW_FILE" || grep -q 'denylist:.*\/library' "$SW_FILE"; then
    echo "OK: $SW_FILE excludes /library from navigation fallback"
    exit 0
else
    echo "FAIL: $SW_FILE does not contain navigateFallbackDenylist for /library" >&2
    exit 1
fi
