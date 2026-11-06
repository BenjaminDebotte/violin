#!/usr/bin/env bash
# Automated tests for the Helm chart (spec section 8.1 & 10, criterion A1).
# Verifies fail-closed behavior, default rendering, and enabled rendering.
set -euo pipefail

CHART_DIR="chart"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> Testing Helm chart in $CHART_DIR"

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

pass() {
    echo "  OK: $1"
}

# --- 1. Defaults render no library volume, no port 8081, no library Ingress (A1) ---
echo "--- 1. Testing Default Values ---"
helm template violin "$CHART_DIR" > "$TMP_DIR/defaults.yaml"

# Assert no library volume or volumeMount
if grep -q '/srv/library' "$TMP_DIR/defaults.yaml"; then
    fail "Default chart rendered /srv/library volumeMount"
fi
if grep -q 'name: library' "$TMP_DIR/defaults.yaml"; then
    fail "Default chart rendered library volume or port"
fi
if grep -q '8081' "$TMP_DIR/defaults.yaml"; then
    fail "Default chart referenced port 8081"
fi
if grep -q 'violin-library' "$TMP_DIR/defaults.yaml"; then
    fail "Default chart rendered library Ingress"
fi

# Assert /tmp is a 64Mi disk emptyDir (not medium: Memory)
grep -q 'name: tmp' "$TMP_DIR/defaults.yaml" || fail "/tmp volume is missing"
grep -q 'sizeLimit: 64Mi' "$TMP_DIR/defaults.yaml" || fail "/tmp sizeLimit 64Mi is missing"
if grep -A 3 'name: tmp' "$TMP_DIR/defaults.yaml" | grep -q 'medium: Memory'; then
    fail "/tmp should be disk emptyDir, but has medium: Memory"
fi
pass "Default values render cleanly with no library components and 64Mi disk /tmp"


# --- 2. Chart fails closed when library.enabled without prerequisites (A1) ---
echo "--- 2. Testing Fail-Closed Validation ---"

assert_fails() {
    local desc="$1"
    shift
    if helm template violin "$CHART_DIR" "$@" > /dev/null 2>&1; then
        fail "Expected failure for '$desc', but helm template succeeded!"
    fi
    pass "$desc rejected"
}

assert_fails "library.enabled=true alone" \
    --set library.enabled=true

assert_fails "library.enabled=true with claim only (no ingress)" \
    --set library.enabled=true \
    --set library.persistence.existingClaim=scores-pvc

assert_fails "library.enabled=true with claim and app ingress (no library ingress)" \
    --set library.enabled=true \
    --set library.persistence.existingClaim=scores-pvc \
    --set ingress.enabled=true

assert_fails "library.enabled=true with both ingresses but no claim" \
    --set library.enabled=true \
    --set ingress.enabled=true \
    --set library.ingress.enabled=true

assert_fails "library.enabled=true with claim and library ingress (no app ingress)" \
    --set library.enabled=true \
    --set library.persistence.existingClaim=scores-pvc \
    --set library.ingress.enabled=true

assert_fails "library.enabled=true with claim and both ingresses (no library ingress annotations)" \
    --set library.enabled=true \
    --set library.persistence.existingClaim=scores-pvc \
    --set ingress.enabled=true \
    --set library.ingress.enabled=true


# --- 3. Enabled renders claim, subPath, port 8081, library Ingress to 8081, Recreate (A1) ---
echo "--- 3. Testing Enabled Configuration ---"

helm template violin "$CHART_DIR" \
    --set library.enabled=true \
    --set library.persistence.existingClaim=scores-pvc \
    --set library.persistence.subPath=violin-scores \
    --set ingress.enabled=true \
    --set library.ingress.enabled=true \
    --set 'library.ingress.annotations.traefik\.ingress\.kubernetes\.io/router\.middlewares=authelia@kubernetescrd' \
    > "$TMP_DIR/enabled.yaml"

# Strategy: Recreate
grep -A 2 'strategy:' "$TMP_DIR/enabled.yaml" | grep -q 'type: Recreate' || fail "Deployment strategy is not Recreate"
pass "Deployment uses strategy: Recreate"

# Persistent volume and subPath
grep -q 'claimName: scores-pvc' "$TMP_DIR/enabled.yaml" || fail "Missing PVC claimName: scores-pvc"
grep -q 'mountPath: /srv/library' "$TMP_DIR/enabled.yaml" || fail "Missing mountPath: /srv/library"
grep -q 'subPath: "violin-scores"' "$TMP_DIR/enabled.yaml" || fail "Missing subPath: violin-scores"
pass "Library volume rendered with existingClaim and subPath"

# Service port 8081
grep -A 25 -E '^kind: Service$' "$TMP_DIR/enabled.yaml" | grep -q 'port: 8081' || fail "Service missing port 8081"
grep -A 25 -E '^kind: Service$' "$TMP_DIR/enabled.yaml" | grep -q 'name: library' || fail "Service missing library port name"
pass "Service exposes port 8081 as 'library'"

# Container port 8081
grep -A 15 'containerPort:' "$TMP_DIR/enabled.yaml" | grep -q 'containerPort: 8081' || fail "Container missing library port 8081"
pass "Container exposes port 8081"

# Library Ingress pointing to 8081
grep -q 'name: violin-library' "$TMP_DIR/enabled.yaml" || fail "Missing Ingress violin-library"
grep -A 30 'name: violin-library' "$TMP_DIR/enabled.yaml" | grep -A 4 'backend:' | grep -q 'number: 8081' || fail "Library Ingress backend port is not 8081"
pass "Library Ingress renders and points to backend port 8081"

echo "==> All Helm chart tests PASSED!"
