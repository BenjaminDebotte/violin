#!/usr/bin/env bash
# Smoke test for the shared library server split (spec section 5 & 10, criteria A2-A6).
# Runs against a running container (or specified URLs).
# Usage: ./scripts/smoke-library.sh [APP_URL] [LIB_URL]
set -euo pipefail

APP_URL="${1:-http://localhost:8080}"
LIB_URL="${2:-http://localhost:8081}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> Testing app server on $APP_URL and library server on $LIB_URL"

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

pass() {
    echo "  OK: $1"
}

# --- 1. Port 8080: app server only (A2) ---
echo "--- Checking Port 8080 (App Server) ---"

# GET /library/files/ must return the SPA shell (with <div id="root">) or 404, never a file listing
code=$(curl -s -o "$TMP_DIR/resp8080_list" -w "%{http_code}" "$APP_URL/library/files/")
if [ "$code" = "200" ]; then
    grep -q '<div id="root">' "$TMP_DIR/resp8080_list" || fail "8080 /library/files/ returned 200 without SPA shell"
    pass "8080 /library/files/ returns SPA shell"
elif [ "$code" = "404" ]; then
    pass "8080 /library/files/ returns 404"
else
    fail "8080 /library/files/ returned unexpected status $code"
fi

# GET /library/files/test.xml returns SPA shell or 404
code=$(curl -s -o "$TMP_DIR/resp8080_file" -w "%{http_code}" "$APP_URL/library/files/test.xml")
if [ "$code" = "200" ]; then
    grep -q '<div id="root">' "$TMP_DIR/resp8080_file" || fail "8080 /library/files/test.xml returned 200 without SPA shell"
    pass "8080 /library/files/test.xml returns SPA shell"
elif [ "$code" = "404" ]; then
    pass "8080 /library/files/test.xml returns 404"
else
    fail "8080 /library/files/test.xml returned unexpected status $code"
fi

# PUT /library/files/test.xml on 8080 must never write (405 or 404)
code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "X-Violin-Library: 1" --data "test" "$APP_URL/library/files/test.xml")
[ "$code" = "405" ] || [ "$code" = "404" ] || fail "8080 PUT /library/files/ returned $code instead of 405/404"
pass "8080 PUT /library/files/ refused ($code)"

# DELETE /library/files/test.xml on 8080 must never delete (405 or 404)
code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "X-Violin-Library: 1" "$APP_URL/library/files/test.xml")
[ "$code" = "405" ] || [ "$code" = "404" ] || fail "8080 DELETE /library/files/ returned $code instead of 405/404"
pass "8080 DELETE /library/files/ refused ($code)"


# --- 2. Port 8081: redirects and non-library paths ---
echo "--- Checking Port 8081 Redirects & Defaults ---"

# GET /library and /library/ must answer relative 302 / (absolute_redirect off)
loc1=$(curl -s -o /dev/null -D - "$LIB_URL/library" | tr -d '\r' | awk -F': ' '/^[Ll]ocation:/ {print $2}')
[ "$loc1" = "/" ] || fail "/library did not redirect to relative / (got: '$loc1')"
pass "8081 /library answers relative 302 /"

loc2=$(curl -s -o /dev/null -D - "$LIB_URL/library/" | tr -d '\r' | awk -F': ' '/^[Ll]ocation:/ {print $2}')
[ "$loc2" = "/" ] || fail "/library/ did not redirect to relative / (got: '$loc2')"
pass "8081 /library/ answers relative 302 /"

# Default path returns 404
code=$(curl -s -o /dev/null -w "%{http_code}" "$LIB_URL/")
[ "$code" = "404" ] || fail "8081 / returned $code instead of 404"
pass "8081 / returns 404"


# --- 3. Port 8081: PUT 201, no-clobber 409, GET headers, DELETE 204 (A3, A6) ---
echo "--- Checking Port 8081 PUT / 409 / GET / DELETE ---"

# 3.1 Initial PUT returns 201
code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "X-Violin-Library: 1" --data "version-one-content" "$LIB_URL/library/files/smoke-a.xml")
[ "$code" = "201" ] || fail "PUT smoke-a.xml returned $code instead of 201"
pass "PUT smoke-a.xml returned 201"

# 3.2 Second PUT to same name returns 409 (no overwrite)
code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "X-Violin-Library: 1" --data "version-two-content" "$LIB_URL/library/files/smoke-a.xml")
[ "$code" = "409" ] || fail "Second PUT smoke-a.xml returned $code instead of 409"
pass "Second PUT smoke-a.xml returned 409 (no-clobber)"

# 3.3 GET returns initial bytes and security headers (A3, A6)
curl -s -D "$TMP_DIR/headers_a" "$LIB_URL/library/files/smoke-a.xml" > "$TMP_DIR/body_a"
content=$(cat "$TMP_DIR/body_a")
[ "$content" = "version-one-content" ] || fail "File content was overwritten! Got '$content'"
pass "GET smoke-a.xml preserved original content"

grep -qi '^content-security-policy:.*default-src '\''none'\'';.*sandbox' "$TMP_DIR/headers_a" || fail "Missing or incorrect CSP on GET"
grep -qi '^x-content-type-options:.*nosniff' "$TMP_DIR/headers_a" || fail "Missing nosniff header on GET"
grep -qi '^cache-control:.*no-store' "$TMP_DIR/headers_a" || fail "Missing no-store header on GET"
pass "GET smoke-a.xml carries CSP sandbox, nosniff, no-store headers"

# 3.4 DELETE returns 204
code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "X-Violin-Library: 1" "$LIB_URL/library/files/smoke-a.xml")
[ "$code" = "204" ] || fail "DELETE smoke-a.xml returned $code instead of 204"
pass "DELETE smoke-a.xml returned 204"

# 3.5 GET after DELETE returns 404
code=$(curl -s -o /dev/null -w "%{http_code}" "$LIB_URL/library/files/smoke-a.xml")
[ "$code" = "404" ] || fail "GET after DELETE returned $code instead of 404"
pass "GET after DELETE returned 404"

# 3.6 DELETE absent returns 404
code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "X-Violin-Library: 1" "$LIB_URL/library/files/nonexistent.xml")
[ "$code" = "404" ] || fail "DELETE absent returned $code instead of 404"
pass "DELETE absent returned 404"


# --- 4. Port 8081: Name rule, trailing newlines, sub-paths, methods (A4) ---
echo "--- Checking Name Hardening & Method Whitelist (A4) ---"

check_status() {
    local desc="$1"
    local expected="$2"
    shift 2
    local actual
    actual=$(curl -s -o /dev/null -w "%{http_code}" "$@")
    if [ "$actual" = "$expected" ]; then
        pass "$desc ($actual)"
    else
        fail "$desc (expected $expected, got $actual)"
    fi
}

check_status "Trailing newline rejected" 403 -X PUT -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/a.xml%0a"
check_status "Dotfile rejected" 403 -X PUT -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/.hidden.xml"
check_status "Bad extension .pdf rejected" 403 -X PUT -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/a.pdf"
check_status "Upper-case .XML rejected" 403 -X PUT -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/a.XML"
check_status "Upper-case .MXL rejected" 403 -X PUT -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/a.MXL"

# Subpaths and path traversal
code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/sub/a.xml")
[ "$code" = "403" ] || [ "$code" = "404" ] || fail "Subpath returned $code instead of 403/404"
pass "Subpath rejected ($code)"

code=$(curl --path-as-is -s -o /dev/null -w "%{http_code}" -X PUT -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/..%2fa.xml")
[ "$code" = "403" ] || [ "$code" = "404" ] || [ "$code" = "400" ] || fail "Path traversal returned $code instead of 403/404/400"
pass "Path traversal rejected ($code)"

# Over-long names (101 characters rejected; 100 characters accepted)
name101=$(printf 'a%.0s' {1..97}).xml
name100=$(printf 'a%.0s' {1..96}).xml
[ "${#name101}" -eq 101 ] || fail "Internal test error: name101 length is ${#name101}"
[ "${#name100}" -eq 100 ] || fail "Internal test error: name100 length is ${#name100}"

check_status "101 char name rejected" 403 -X PUT -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/$name101"
check_status "100 char name accepted" 201 -X PUT -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/$name100"
check_status "Clean up 100 char name" 204 -X DELETE -H "X-Violin-Library: 1" "$LIB_URL/library/files/$name100"

# Header validation
check_status "Missing header rejected" 403 -X PUT --data "x" "$LIB_URL/library/files/nohead.xml"
check_status "Empty header rejected" 403 -X PUT -H "X-Violin-Library:" --data "x" "$LIB_URL/library/files/nohead.xml"
check_status "Whitespace header rejected" 403 -X PUT -H "X-Violin-Library:   " --data "x" "$LIB_URL/library/files/nohead.xml"

# Refused HTTP methods
check_status "Method POST rejected" 403 -X POST -H "X-Violin-Library: 1" --data "x" "$LIB_URL/library/files/post.xml"
check_status "Method MKCOL rejected" 403 -X MKCOL -H "X-Violin-Library: 1" "$LIB_URL/library/files/folder"
check_status "Method MOVE rejected" 403 -X MOVE -H "X-Violin-Library: 1" "$LIB_URL/library/files/a.xml"
check_status "Method COPY rejected" 403 -X COPY -H "X-Violin-Library: 1" "$LIB_URL/library/files/a.xml"
check_status "Method PROPFIND rejected" 403 -X PROPFIND -H "X-Violin-Library: 1" "$LIB_URL/library/files/"


# --- 5. Port 8081: 5 MB cap and parallel PUTs (A5) ---
echo "--- Checking 5 MB Size Limit & Concurrency (A5) ---"

# 5.1 Body over 5 MB (6 MB) must return 413
dd if=/dev/zero of="$TMP_DIR/over5m.xml" bs=1M count=6 2>/dev/null
check_status "Payload > 5 MB returns 413" 413 -X PUT -H "X-Violin-Library: 1" --data-binary @"$TMP_DIR/over5m.xml" "$LIB_URL/library/files/over5m.xml"

# 5.2 Ten parallel uploads of ~4.8 MB (fits under 5 MB limit, total ~48 MB fits in 64 MB /tmp tmpfs)
dd if=/dev/zero of="$TMP_DIR/valid_4_8m.xml" bs=1024 count=4800 2>/dev/null
pids=()
echo "  Launching 10 parallel 4.8 MB PUTs..."
for i in $(seq 1 10); do
    (
        res=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "X-Violin-Library: 1" \
            --data-binary @"$TMP_DIR/valid_4_8m.xml" "$LIB_URL/library/files/par-$i.xml")
        echo "$res" > "$TMP_DIR/par_res_$i"
    ) &
    pids+=($!)
done

for pid in "${pids[@]}"; do
    wait "$pid"
done

for i in $(seq 1 10); do
    res=$(cat "$TMP_DIR/par_res_$i")
    [ "$res" = "201" ] || fail "Parallel upload #$i returned $res instead of 201"
    # Clean up
    curl -s -o /dev/null -X DELETE -H "X-Violin-Library: 1" "$LIB_URL/library/files/par-$i.xml"
done
pass "Ten parallel uploads succeeded without 500 error"


# --- 6. Port 8081: XHTML payload sandbox test (A6) ---
echo "--- Checking XHTML Sandbox CSP (A6) ---"

cat << "EOF" > "$TMP_DIR/xss.xml"
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>XSS Test</title></head>
  <body><script>alert(1)</script></body>
</html>
EOF

check_status "PUT xss.xml" 201 -X PUT -H "X-Violin-Library: 1" --data-binary @"$TMP_DIR/xss.xml" "$LIB_URL/library/files/xss.xml"

curl -s -D "$TMP_DIR/headers_xss" "$LIB_URL/library/files/xss.xml" > /dev/null
grep -qi '^content-security-policy:.*default-src '\''none'\'';.*sandbox' "$TMP_DIR/headers_xss" || fail "XSS file missing CSP sandbox header"
grep -qi '^x-content-type-options:.*nosniff' "$TMP_DIR/headers_xss" || fail "XSS file missing nosniff header"
pass "XHTML file safely restricted by CSP sandbox and nosniff"

check_status "Clean up xss.xml" 204 -X DELETE -H "X-Violin-Library: 1" "$LIB_URL/library/files/xss.xml"

echo "==> All shared library smoke checks PASSED!"
