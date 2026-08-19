// E2E smoke test for Módulo 01 (Auth) against real Postgres/Redis.
//
// Prerequisites:
//   1. docker compose -f backend/docker-compose.yml up -d   (from backend/)
//   2. cd backend && npx prisma migrate dev                 (first run only)
//   3. cd backend && npm run build && node dist/main.js      (server on :4000)
//
// Usage: node backend/scripts/smoke-test.ts   (Node 24+, no build step needed)

import { execFileSync } from 'node:child_process';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const POSTGRES_CONTAINER = process.env.POSTGRES_CONTAINER ?? 'sistemalia-postgres';
const REDIS_CONTAINER = process.env.REDIS_CONTAINER ?? 'sistemalia-redis';

const email = `smoketest+${Date.now()}@example.com`;
const password = 'Passw0rd123';

let passCount = 0;

function pass(label: string): void {
  passCount += 1;
  console.log(`PASS - ${label}`);
}

function fail(label: string): never {
  console.error(`FAIL - ${label}`);
  process.exit(1);
}

// execFileSync (array args, no shell) so quoting is exact regardless of
// host shell — execSync's string form goes through cmd.exe on Windows,
// which eats the double quotes psql needs around "User"/"RefreshToken".
function psql(sql: string): string {
  return execFileSync('docker', [
    'exec',
    POSTGRES_CONTAINER,
    'psql',
    '-U',
    'sistemalia',
    '-d',
    'sistemalia',
    '-t',
    '-A',
    '-c',
    sql,
  ])
    .toString()
    .trim();
}

function redisGet(key: string): string {
  return execFileSync('docker', ['exec', REDIS_CONTAINER, 'redis-cli', 'GET', key])
    .toString()
    .trim();
}

interface JsonResponse {
  status: number;
  body: Record<string, unknown>;
  cookies: Map<string, string>;
}

function parseCookies(setCookieHeaders: string[]): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const header of setCookieHeaders) {
    const [pair] = header.split(';');
    const [name, value] = pair.split('=');
    if (name && value) cookies.set(name.trim(), value.trim());
  }
  return cookies;
}

function cookieHeader(cookies: Map<string, string>): string {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  cookies?: Map<string, string>,
): Promise<JsonResponse> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { Cookie: cookieHeader(cookies) } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return { status: res.status, body: json, cookies: parseCookies(setCookie) };
}

async function main() {
  console.log('== 1. POST /auth/register ==');
  const register = await postJson('/auth/register', {
    email,
    password,
    fullName: 'Smoke Test',
    recaptchaToken: 'dev',
  });
  if (register.status !== 201) fail(`register returned ${register.status}: ${JSON.stringify(register.body)}`);
  pass(`user registered (${email})`);

  const userId = psql(`SELECT id FROM "User" WHERE email='${email}';`);
  if (!userId) fail('user not found in Postgres');
  pass(`user row exists in Postgres (id=${userId})`);

  const otp = redisGet(`otp:${userId}`);
  if (!otp) fail(`OTP not found in Redis for otp:${userId}`);
  pass(`OTP found in Redis (${otp})`);

  console.log('== 2. POST /auth/verify-otp ==');
  const verify = await postJson('/auth/verify-otp', { email, code: otp });
  if (verify.status !== 200) fail(`verify-otp returned ${verify.status}: ${JSON.stringify(verify.body)}`);
  const verifiedUser = verify.body.user as { status?: string } | undefined;
  if (verifiedUser?.status !== 'ACTIVE') fail('user not ACTIVE after verify-otp');
  if (!verify.cookies.has('access_token')) fail('access_token cookie missing');
  const firstRefreshToken = verify.cookies.get('refresh_token');
  if (!firstRefreshToken) fail('refresh_token cookie missing');
  pass('OTP verified, user ACTIVE, session cookies set');

  console.log('== 3. POST /auth/login ==');
  const login = await postJson('/auth/login', { email, password });
  if (login.status !== 200) fail(`login returned ${login.status}: ${JSON.stringify(login.body)}`);
  pass('login succeeded with real credentials');

  console.log('== 4. POST /auth/refresh (rotation) ==');
  const refresh = await postJson('/auth/refresh', {}, login.cookies);
  if (refresh.status !== 200) fail(`refresh returned ${refresh.status}: ${JSON.stringify(refresh.body)}`);
  const newRefreshToken = refresh.cookies.get('refresh_token');
  if (!newRefreshToken) fail('refresh did not return a new refresh_token cookie');
  if (newRefreshToken === login.cookies.get('refresh_token')) {
    fail('refresh token was not rotated (same value returned)');
  }
  pass('refresh rotated the session (new refresh_token issued)');

  // The refresh token presented to /auth/refresh (from login) must now be
  // revoked in Postgres; the one from verify-otp (never used for refresh)
  // must still be untouched.
  const revokedCount = psql(
    `SELECT count(*) FROM "RefreshToken" WHERE "userId"='${userId}' AND revoked=true;`,
  );
  if (revokedCount !== '1') fail(`expected exactly 1 revoked refresh token, got ${revokedCount}`);
  pass('old refresh token correctly revoked after rotation');

  console.log('== 5. Negative checks ==');
  const wrongPassword = await postJson('/auth/login', { email, password: 'WrongPass1' });
  if (wrongPassword.status !== 401) fail(`wrong password should be 401, got ${wrongPassword.status}`);
  pass('wrong password correctly rejected (401)');

  const dup = await postJson('/auth/register', {
    email,
    password,
    fullName: 'Dup',
    recaptchaToken: 'dev',
  });
  if (dup.status !== 409) fail(`duplicate register should be 409, got ${dup.status}`);
  pass('duplicate registration correctly rejected (409)');

  console.log(`\nAll ${passCount} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
