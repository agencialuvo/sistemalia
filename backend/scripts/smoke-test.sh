#!/usr/bin/env bash
# E2E smoke test for Módulo 01 (Auth) against real Postgres/Redis.
#
# Prerequisites:
#   1. docker compose -f backend/docker-compose.yml up -d   (from backend/)
#   2. cd backend && npx prisma migrate dev                 (first run only)
#   3. cd backend && npm run build && node dist/main.js      (server on :4000)
#
# Usage: bash backend/scripts/smoke-test.sh
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
EMAIL="smoketest+$(date +%s)@example.com"
PASSWORD="Passw0rd123"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

pass() { echo "PASS - $1"; }
fail() { echo "FAIL - $1"; exit 1; }

echo "== 1. POST /auth/register =="
STATUS=$(curl -s -o /tmp/register.json -w '%{http_code}' -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"fullName\":\"Smoke Test\",\"recaptchaToken\":\"dev\"}")
[ "$STATUS" = "201" ] || fail "register returned $STATUS: $(cat /tmp/register.json)"
pass "user registered ($EMAIL)"

USER_ID=$(docker exec sistemalia-postgres psql -U sistemalia -d sistemalia -t -A \
  -c "SELECT id FROM \"User\" WHERE email='$EMAIL';")
[ -n "$USER_ID" ] || fail "user not found in Postgres"
pass "user row exists in Postgres (id=$USER_ID)"

OTP=$(docker exec sistemalia-redis redis-cli GET "otp:$USER_ID" | tr -d '\r')
[ -n "$OTP" ] && [ "$OTP" != "" ] || fail "OTP not found in Redis for otp:$USER_ID"
pass "OTP found in Redis ($OTP)"

echo "== 2. POST /auth/verify-otp =="
STATUS=$(curl -s -o /tmp/verify.json -w '%{http_code}' -X POST "$API_URL/auth/verify-otp" \
  -H "Content-Type: application/json" -c "$COOKIE_JAR" \
  -d "{\"email\":\"$EMAIL\",\"code\":\"$OTP\"}")
[ "$STATUS" = "200" ] || fail "verify-otp returned $STATUS: $(cat /tmp/verify.json)"
grep -q '"status":"ACTIVE"' /tmp/verify.json || fail "user not ACTIVE after verify-otp"
grep -q access_token "$COOKIE_JAR" || fail "access_token cookie missing"
grep -q refresh_token "$COOKIE_JAR" || fail "refresh_token cookie missing"
pass "OTP verified, user ACTIVE, session cookies set"

echo "== 3. POST /auth/login =="
STATUS=$(curl -s -o /tmp/login.json -w '%{http_code}' -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" -c "$COOKIE_JAR" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
[ "$STATUS" = "200" ] || fail "login returned $STATUS: $(cat /tmp/login.json)"
pass "login succeeded with real credentials"

echo "== 4. POST /auth/refresh (bonus) =="
STATUS=$(curl -s -o /tmp/refresh.json -w '%{http_code}' -X POST "$API_URL/auth/refresh" -b "$COOKIE_JAR")
[ "$STATUS" = "200" ] || fail "refresh returned $STATUS: $(cat /tmp/refresh.json)"
pass "refresh rotated the session"

echo "== 5. Negative checks (bonus) =="
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"WrongPass1\"}")
[ "$STATUS" = "401" ] || fail "wrong password should be 401, got $STATUS"
pass "wrong password correctly rejected (401)"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"fullName\":\"Dup\",\"recaptchaToken\":\"dev\"}")
[ "$STATUS" = "409" ] || fail "duplicate register should be 409, got $STATUS"
pass "duplicate registration correctly rejected (409)"

echo
echo "All checks passed."
