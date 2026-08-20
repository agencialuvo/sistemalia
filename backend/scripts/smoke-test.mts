// E2E smoke test against real Postgres/Redis.
//
// Cubre Módulo 01 (Auth, pasos 1-5), Módulo 02 (Tenant, pasos 6-9) y
// Módulo 03 (Servicios y Categorías, pasos 10-15).
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

async function getJson(path: string, cookies?: Map<string, string>): Promise<JsonResponse> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { ...(cookies ? { Cookie: cookieHeader(cookies) } : {}) },
  });
  const json = (await res.json().catch(() => ({}))) as unknown as Record<string, unknown>;
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return { status: res.status, body: json, cookies: parseCookies(setCookie) };
}

// --- Módulo 03 helpers ----------------------------------------------------
//
// Every /services route resolves its tenant from the `x-tenant-id` header
// (TenantContextInterceptor verifies membership before @TenantId() hands it to
// the handler), so these carry it. Without the header the API answers 403 —
// which is itself asserted in step 10.

function tenantHeaders(cookies: Map<string, string>, tenantId?: string): Record<string, string> {
  return {
    Cookie: cookieHeader(cookies),
    ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
  };
}

async function readJson(res: Response): Promise<JsonResponse> {
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return { status: res.status, body: json, cookies: parseCookies(setCookie) };
}

async function tenantGet(
  path: string,
  cookies: Map<string, string>,
  tenantId?: string,
): Promise<JsonResponse> {
  return readJson(await fetch(`${API_URL}${path}`, { headers: tenantHeaders(cookies, tenantId) }));
}

async function tenantPost(
  path: string,
  body: Record<string, unknown>,
  cookies: Map<string, string>,
  tenantId?: string,
): Promise<JsonResponse> {
  return readJson(
    await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tenantHeaders(cookies, tenantId) },
      body: JSON.stringify(body),
    }),
  );
}

async function tenantDelete(
  path: string,
  cookies: Map<string, string>,
  tenantId?: string,
): Promise<JsonResponse> {
  return readJson(
    await fetch(`${API_URL}${path}`, { method: 'DELETE', headers: tenantHeaders(cookies, tenantId) }),
  );
}

/** An array-of-arrays becomes the CSV the importer reads. Quoting matters:
 *  descriptions and contraindication lists contain the delimiter. */
function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\r\n');
}

/** Response of POST /services/import, as ServicesService.importFromExcel builds it. */
interface ImportReport {
  successCount: number;
  totalRows: number;
  imported: number;
  dryRun: boolean;
  errors: Array<{ row: number; column: string; error: string }>;
  newCategoryNames: string[];
  createdCategories: string[];
}

async function importCsv(
  rows: (string | number)[][],
  cookies: Map<string, string>,
  tenantId: string,
  dryRun: boolean,
): Promise<{ status: number; body: ImportReport }> {
  const form = new FormData();
  form.append('file', new Blob([toCsv(rows)], { type: 'text/csv' }), 'servicios.csv');
  const res = await fetch(`${API_URL}/services/import?dryRun=${dryRun}`, {
    method: 'POST',
    headers: tenantHeaders(cookies, tenantId),
    body: form,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as ImportReport };
}

interface ServiceRow {
  id: string;
  name: string;
  isActive: boolean;
  structureType: string;
  sessionCount: number | null;
  singlePrice: string;
  packagePrice: string | null;
  depositAmount: string | null;
  depositIsPercentage: boolean;
  durationMinutes: number;
  bufferMinutes: number;
  category: { id: string; name: string; color: string | null };
}

// 8x8 PNG signature is all `validate()` checks for — the magic-number check
// doesn't decode the image, so padding bytes after the signature are enough
// to pass as a well-formed image/png upload.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

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

  // Session used for Módulo 02: the freshest access_token, issued by the
  // /auth/refresh rotation in step 4.
  const session = refresh.cookies;
  const RUC = '20100070970'; // valid Módulo 11 checksum, prefix 20 (persona jurídica)

  console.log('== 6. GET /api/v1/tax/sunat/:ruc (consulta + caché Redis) ==');
  const sunat1 = await getJson(`/api/v1/tax/sunat/${RUC}`, session);
  if (sunat1.status !== 200) fail(`sunat query returned ${sunat1.status}: ${JSON.stringify(sunat1.body)}`);
  const sunatBody1 = sunat1.body as { success?: boolean; source?: string; data?: { razonSocial?: string } };
  if (sunatBody1.success !== true) fail(`sunat query did not succeed: ${JSON.stringify(sunat1.body)}`);
  if (!sunatBody1.data?.razonSocial) fail('sunat response missing taxpayer data');
  pass(`consulta SUNAT resuelta (source=${sunatBody1.source}, razonSocial=${sunatBody1.data.razonSocial})`);

  const cachedRaw = redisGet(`sunat:ruc:${RUC}`);
  if (!cachedRaw) fail(`SUNAT result not cached in Redis for sunat:ruc:${RUC}`);
  pass('resultado SUNAT cacheado en Redis (sunat:ruc:*)');

  const sunat2 = await getJson(`/api/v1/tax/sunat/${RUC}`, session);
  if (sunat2.status !== 200) fail(`second sunat query returned ${sunat2.status}`);
  const sunatBody2 = sunat2.body as { source?: string };
  if (sunatBody2.source !== 'cache') fail(`second query should be served from cache, got source=${sunatBody2.source}`);
  pass('segunda consulta SUNAT servida desde caché (source=cache)');

  console.log('== 7. POST /tenant/upload-logo ==');
  const form = new FormData();
  form.append('file', new Blob([PNG_SIGNATURE], { type: 'image/png' }), 'logo.png');
  const uploadRes = await fetch(`${API_URL}/tenant/upload-logo`, {
    method: 'POST',
    headers: { Cookie: cookieHeader(session) },
    body: form,
  });
  const uploadBody = (await uploadRes.json().catch(() => ({}))) as {
    logoUrl?: string;
    size?: number;
    mimeType?: string;
  };
  if (uploadRes.status !== 201) fail(`upload-logo returned ${uploadRes.status}: ${JSON.stringify(uploadBody)}`);
  if (!uploadBody.logoUrl) fail('upload-logo did not return a logoUrl');
  pass(`logotipo subido (${uploadBody.logoUrl})`);

  console.log('== 8. POST /tenant/onboarding ==');
  const onboarding = await postJson(
    '/tenant/onboarding',
    {
      identityType: 'EMPRESA',
      taxIdType: 'RUC20',
      taxId: RUC,
      legalName: 'Centro Estetico Demo S.A.C.',
      fiscalAddress: 'Av. Larco 123, Miraflores, Lima',
      commercialName: 'LIA Beauty Center',
      specialty: 'MEDICINA_ESTETICA',
      logoUrl: uploadBody.logoUrl,
      branch: {
        name: 'Sede Principal',
        address: 'Av. Larco 123, Miraflores, Lima',
        ubigeoCode: '150122',
        whatsappNumber: '+51987654321',
        defaultAppointmentMinutes: 60,
        workingHours: [
          { dayOfWeek: 1, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '13:00', breakEnd: '14:00' },
          { dayOfWeek: 2, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '13:00', breakEnd: '14:00' },
          { dayOfWeek: 3, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '13:00', breakEnd: '14:00' },
          { dayOfWeek: 4, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '13:00', breakEnd: '14:00' },
          { dayOfWeek: 5, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '13:00', breakEnd: '14:00' },
          { dayOfWeek: 6, isOpen: true, openTime: '09:00', closeTime: '13:00' },
        ],
      },
    },
    session,
  );
  if (onboarding.status !== 201) fail(`onboarding returned ${onboarding.status}: ${JSON.stringify(onboarding.body)}`);
  const onboardingBody = onboarding.body as { tenantId?: string; branchId?: string; role?: string };
  if (!onboardingBody.tenantId || !onboardingBody.branchId) fail('onboarding did not return tenantId/branchId');
  if (onboardingBody.role !== 'ADMIN_OWNER') fail(`expected role ADMIN_OWNER, got ${onboardingBody.role}`);
  pass(`tenant provisionado (tenantId=${onboardingBody.tenantId})`);

  const tenantId = onboardingBody.tenantId;
  const branchId = onboardingBody.branchId;

  const tenantRow = psql(`SELECT "commercialName" FROM "Tenant" WHERE id='${tenantId}';`);
  if (!tenantRow) fail('Tenant row not found in Postgres');
  pass(`fila Tenant creada en Postgres (${tenantRow})`);

  const branchRow = psql(`SELECT id FROM "Branch" WHERE id='${branchId}' AND "tenantId"='${tenantId}';`);
  if (!branchRow) fail('Branch row not found in Postgres');
  pass('fila Branch (sede principal) creada en Postgres');

  const workingHoursCount = psql(`SELECT count(*) FROM "BranchWorkingHour" WHERE "branchId"='${branchId}';`);
  if (workingHoursCount !== '7') fail(`expected 7 BranchWorkingHour rows, got ${workingHoursCount}`);
  pass('7 filas BranchWorkingHour creadas (semana completa)');

  const membershipRole = psql(
    `SELECT role FROM "TenantUser" WHERE "tenantId"='${tenantId}' AND "userId"='${userId}';`,
  );
  if (membershipRole !== 'ADMIN_OWNER') fail(`expected TenantUser role ADMIN_OWNER, got ${membershipRole}`);
  pass('fila TenantUser creada con role=ADMIN_OWNER');

  console.log('== 9. GET /tenant/me ==');
  const me = await getJson('/tenant/me', session);
  if (me.status !== 200) fail(`tenant/me returned ${me.status}: ${JSON.stringify(me.body)}`);
  const myTenants = me.body as unknown as Array<{ id?: string; role?: string; commercialName?: string }>;
  if (!Array.isArray(myTenants)) fail('tenant/me did not return an array');
  const membership = myTenants.find((t) => t.id === tenantId);
  if (!membership) fail('created tenant not found in /tenant/me response');
  if (membership.role !== 'ADMIN_OWNER') fail(`expected /tenant/me role ADMIN_OWNER, got ${membership.role}`);
  pass(`GET /tenant/me confirma membresía ADMIN_OWNER (${membership.commercialName})`);

  // =========================================================================
  // Módulo 03 — Catálogo de Servicios y Categorías
  // (.specify/features/03-services/spec.md)
  // =========================================================================

  console.log('== 10. POST /services/categories ==');

  // Isolation first: everything below depends on the header actually being
  // enforced, so prove it before trusting any of it.
  const noTenant = await tenantGet('/services', session);
  if (noTenant.status !== 403) fail(`GET /services without x-tenant-id should be 403, got ${noTenant.status}`);
  pass('sin x-tenant-id la API rechaza el acceso (403)');

  const categoryRes = await tenantPost(
    '/services/categories',
    { name: 'Facial', description: 'Tratamientos de rostro', color: '#E11D48' },
    session,
    tenantId,
  );
  if (categoryRes.status !== 201) fail(`create category returned ${categoryRes.status}: ${JSON.stringify(categoryRes.body)}`);
  const category = categoryRes.body as unknown as { id?: string; name?: string; color?: string };
  if (!category.id) fail('create category did not return an id');
  if (category.name !== 'Facial' || category.color !== '#E11D48') fail(`category fields not persisted: ${JSON.stringify(category)}`);
  const categoryId = category.id;
  pass(`categoría creada (id=${categoryId}, color=${category.color})`);

  const categoryRow = psql(
    `SELECT name FROM "ServiceCategory" WHERE id='${categoryId}' AND "tenantId"='${tenantId}';`,
  );
  if (categoryRow !== 'Facial') fail(`ServiceCategory row not found in Postgres, got "${categoryRow}"`);
  pass('fila ServiceCategory creada en Postgres y ligada al tenant');

  const duplicate = await tenantPost('/services/categories', { name: 'Facial' }, session, tenantId);
  if (duplicate.status !== 409) fail(`duplicate category should be 409, got ${duplicate.status}`);
  pass('nombre de categoría duplicado rechazado (409)');

  console.log('== 11. POST /services (servicio único) ==');
  const singleRes = await tenantPost(
    '/services',
    {
      categoryId,
      name: 'Limpieza facial profunda',
      commercialDescription: 'Higiene facial con extracción, vapor ozono y mascarilla calmante.',
      structureType: 'SINGLE',
      singlePrice: 120,
      durationMinutes: 60,
      bufferMinutes: 10,
      contraindications: ['EMBARAZO', 'ROSÁCEA ACTIVA'],
      paymentMethod: 'IN_PERSON',
    },
    session,
    tenantId,
  );
  if (singleRes.status !== 201) fail(`create service returned ${singleRes.status}: ${JSON.stringify(singleRes.body)}`);
  const single = singleRes.body as unknown as ServiceRow;
  if (!single.id) fail('create service did not return an id');
  // The money contract: Prisma Decimal is serialised as a fixed 2-decimal
  // STRING. A number here would mean the client is one float operation away
  // from losing cents.
  if (single.singlePrice !== '120.00') fail(`expected singlePrice "120.00" as a string, got ${JSON.stringify(single.singlePrice)}`);
  if (JSON.stringify(singleRes.body).includes('"d":[')) fail('raw Prisma Decimal leaked into the JSON response');
  pass(`servicio único creado (precio="${single.singlePrice}" como string, sin Decimal crudo)`);

  const singleId = single.id;

  const serviceRow = psql(
    `SELECT "singlePrice" FROM "Service" WHERE id='${singleId}' AND "tenantId"='${tenantId}';`,
  );
  if (serviceRow !== '120.00') fail(`Service row not stored as Decimal(10,2), got "${serviceRow}"`);
  pass('fila Service persistida en Postgres con Decimal(10,2)');

  console.log('== 12. POST /services (paquete de sesiones + anticipo) ==');
  const packageRes = await tenantPost(
    '/services',
    {
      categoryId,
      name: 'Depilación láser axilas',
      commercialDescription: 'Paquete de 6 sesiones con láser de diodo.',
      structureType: 'SESSIONS',
      sessionCount: 6,
      frequencyDays: 30,
      singlePrice: 199.9,
      packagePrice: 999.99,
      durationMinutes: 45,
      bufferMinutes: 10,
      requiresEvaluation: true,
      evaluationServiceId: singleId,
      evaluationCost: 80,
      isEvaluationDeductible: true,
      deductibleExpirationDays: 30,
      paymentMethod: 'DEPOSIT',
      depositAmount: 30,
      depositIsPercentage: true,
    },
    session,
    tenantId,
  );
  if (packageRes.status !== 201) fail(`create package returned ${packageRes.status}: ${JSON.stringify(packageRes.body)}`);
  const pkg = packageRes.body as unknown as ServiceRow;
  if (pkg.sessionCount !== 6) fail(`expected 6 sessions, got ${pkg.sessionCount}`);
  if (pkg.singlePrice !== '199.90' || pkg.packagePrice !== '999.99') {
    fail(`package prices lost precision: ${pkg.singlePrice} / ${pkg.packagePrice}`);
  }
  if (pkg.depositAmount !== '30.00' || pkg.depositIsPercentage !== true) {
    fail(`deposit not persisted: ${pkg.depositAmount} / ${pkg.depositIsPercentage}`);
  }
  pass(`paquete creado (6 sesiones, ${pkg.singlePrice} c/u, paquete ${pkg.packagePrice}, anticipo ${pkg.depositAmount}%)`);

  const packageId = pkg.id;

  // Conditional validation is the part most likely to rot silently, so the
  // two directions are both asserted: a package with no session count must be
  // refused, and a percentage deposit above 100 must be refused.
  const badPackage = await tenantPost(
    '/services',
    {
      categoryId,
      name: 'Paquete incompleto',
      commercialDescription: 'Sin número de sesiones.',
      structureType: 'SESSIONS',
      packagePrice: 500,
      singlePrice: 100,
      durationMinutes: 30,
    },
    session,
    tenantId,
  );
  if (badPackage.status !== 400) fail(`package without sessionCount should be 400, got ${badPackage.status}`);
  pass('paquete sin número de sesiones rechazado (400)');

  const badDeposit = await tenantPost(
    '/services',
    {
      categoryId,
      name: 'Anticipo imposible',
      commercialDescription: 'Anticipo del 120 por ciento.',
      structureType: 'SINGLE',
      singlePrice: 100,
      durationMinutes: 30,
      paymentMethod: 'DEPOSIT',
      depositAmount: 120,
      depositIsPercentage: true,
    },
    session,
    tenantId,
  );
  if (badDeposit.status !== 400) fail(`120% deposit should be 400, got ${badDeposit.status}`);
  pass('anticipo del 120% rechazado (400)');

  console.log('== 13. GET /services (filtros y búsqueda) ==');
  const all = await tenantGet('/services', session, tenantId);
  const allRows = all.body as unknown as ServiceRow[];
  if (!Array.isArray(allRows) || allRows.length !== 2) fail(`expected 2 services, got ${JSON.stringify(all.body)}`);
  if (!allRows[0].category?.name) fail('category not embedded in the list response');
  pass(`listado devuelve 2 servicios con la categoría embebida (${allRows[0].category.name})`);

  // Accent- and case-insensitive: the DB does the matching, so "LASER" has to
  // find "láser" for the search box to behave the way users expect.
  const search = await tenantGet('/services?search=DEPILACI%C3%93N', session, tenantId);
  const searchRows = search.body as unknown as ServiceRow[];
  if (searchRows.length !== 1 || searchRows[0].id !== packageId) {
    fail(`search returned ${searchRows.length} rows, expected only the package`);
  }
  pass('búsqueda por texto encuentra el servicio (insensible a mayúsculas)');

  const searchDescription = await tenantGet('/services?search=diodo', session, tenantId);
  if ((searchDescription.body as unknown as ServiceRow[]).length !== 1) {
    fail('search does not cover the commercial description');
  }
  pass('la búsqueda también cubre la descripción comercial');

  const byCategory = await tenantGet(`/services?categoryId=${categoryId}`, session, tenantId);
  if ((byCategory.body as unknown as ServiceRow[]).length !== 2) fail('category filter did not return both services');
  pass('filtro por categoría devuelve los 2 servicios');

  const noMatch = await tenantGet('/services?search=inexistente', session, tenantId);
  if ((noMatch.body as unknown as ServiceRow[]).length !== 0) fail('search for a missing term returned rows');
  pass('búsqueda sin coincidencias devuelve lista vacía');

  console.log('== 14. GET /services/template + POST /services/import ==');
  const templateRes = await fetch(`${API_URL}/services/template`, {
    headers: tenantHeaders(session, tenantId),
  });
  if (templateRes.status !== 200) fail(`template download returned ${templateRes.status}`);
  const templateBuffer = Buffer.from(await templateRes.arrayBuffer());
  // .xlsx is a zip: "PK" is the only cheap proof the bytes are a real workbook
  // and not an error page served with the right Content-Type.
  if (templateBuffer.subarray(0, 2).toString() !== 'PK') fail('template is not a valid .xlsx (missing PK zip signature)');
  if (templateBuffer.length < 5000) fail(`template suspiciously small: ${templateBuffer.length} bytes`);
  const disposition = templateRes.headers.get('content-disposition') ?? '';
  if (!disposition.includes('.xlsx')) fail(`template not served as an attachment: ${disposition}`);
  pass(`plantilla .xlsx descargada (${templateBuffer.length} bytes, zip válido)`);

  // A matrix on purpose: reordered columns, unaccented headers, a price
  // written the way a person types it, and one deliberately broken row.
  const importMatrix: (string | number)[][] = [
    ['Precio unitario (S/)', 'Nombre del servicio', 'Categoria', 'Duracion (min)', 'Descripcion comercial', 'Tipo', 'N de sesiones', 'Precio del paquete (S/)', 'Metodo de pago', 'Estado'],
    ['S/ 1,299.90', 'Rejuvenecimiento facial', 'Facial', 60, 'Radiofrecuencia y vitaminas.', 'ÚNICO', '', '', 'EN CAJA', 'ACTIVO'],
    [250, 'Masaje reductor', 'Corporal', 45, 'Masaje modelador, 10 sesiones.', 'SESIONES', 10, 2000, 'EN CAJA', 'ACTIVO'],
    [80, 'Consulta nutricional', 'Nutrición', 30, 'Evaluación nutricional integral.', 'unico', '', '', '', 'INACTIVO'],
    ['abc', 'Servicio con precio roto', 'Facial', 30, 'Fila que debe fallar.', 'ÚNICO', '', '', '', ''],
  ];

  const categoriesBefore = psql(`SELECT count(*) FROM "ServiceCategory" WHERE "tenantId"='${tenantId}';`);

  const dryRun = await importCsv(importMatrix, session, tenantId, true);
  if (dryRun.status !== 200) fail(`dry run returned ${dryRun.status}: ${JSON.stringify(dryRun.body)}`);
  if (dryRun.body.successCount !== 3) fail(`dry run expected 3 valid rows, got ${dryRun.body.successCount}`);
  if (dryRun.body.errors.length !== 1) fail(`dry run expected 1 error, got ${JSON.stringify(dryRun.body.errors)}`);
  if (dryRun.body.errors[0].row !== 5) fail(`error should point at row 5, got row ${dryRun.body.errors[0].row}`);
  if (!dryRun.body.errors[0].column || !dryRun.body.errors[0].error) fail('import error does not name the column and reason');
  pass(`vista previa: 3 filas válidas, 1 error en la fila ${dryRun.body.errors[0].row} (${dryRun.body.errors[0].column})`);

  const announced = [...dryRun.body.newCategoryNames].sort().join(', ');
  if (announced !== 'Corporal, Nutrición') fail(`dry run should announce Corporal + Nutrición, got "${announced}"`);
  pass(`vista previa anuncia las categorías a crear (${announced})`);

  if (dryRun.body.imported !== 0) fail(`dry run must not import anything, reported ${dryRun.body.imported}`);
  const categoriesAfterDryRun = psql(`SELECT count(*) FROM "ServiceCategory" WHERE "tenantId"='${tenantId}';`);
  if (categoriesAfterDryRun !== categoriesBefore) {
    fail(`dry run created categories in Postgres (${categoriesBefore} -> ${categoriesAfterDryRun})`);
  }
  pass('la vista previa no escribió nada en Postgres (dryRun real)');

  const realImport = await importCsv(importMatrix, session, tenantId, false);
  if (realImport.status !== 200) fail(`import returned ${realImport.status}: ${JSON.stringify(realImport.body)}`);
  if (realImport.body.imported !== 3) fail(`expected 3 imported services, got ${realImport.body.imported}`);
  pass('importación real: 3 servicios creados, la fila inválida omitida');

  const categoryNames = psql(
    `SELECT string_agg(name, ', ' ORDER BY name) FROM "ServiceCategory" WHERE "tenantId"='${tenantId}';`,
  );
  if (categoryNames !== 'Corporal, Facial, Nutrición') {
    fail(`auto-created categories wrong, Postgres has: ${categoryNames}`);
  }
  pass(`auto-creación de categorías confirmada en Postgres (${categoryNames})`);

  const imported = await tenantGet('/services?search=Rejuvenecimiento', session, tenantId);
  const importedRow = (imported.body as unknown as ServiceRow[])[0];
  if (importedRow?.singlePrice !== '1299.90') fail(`"S/ 1,299.90" not parsed correctly, got ${importedRow?.singlePrice}`);
  pass('el monto "S/ 1,299.90" se importó como 1299.90');

  const inactiveImport = await tenantGet('/services?search=nutricional', session, tenantId);
  const inactiveRow = (inactiveImport.body as unknown as ServiceRow[])[0];
  if (inactiveRow?.isActive !== false) fail('"INACTIVO" was not imported as an inactive service');
  if (inactiveRow?.structureType !== 'SINGLE') fail('"unico" in lowercase was not recognised');
  pass('"INACTIVO" y "unico" en minúscula interpretados correctamente');

  console.log('== 15. DELETE /services/:id (baja lógica) ==');
  const deleted = await tenantDelete(`/services/${singleId}`, session, tenantId);
  if (deleted.status !== 200) fail(`delete returned ${deleted.status}: ${JSON.stringify(deleted.body)}`);
  if ((deleted.body as unknown as ServiceRow).isActive !== false) fail('DELETE did not set isActive=false');
  pass('DELETE /services/:id devuelve el servicio con isActive=false');

  // The whole point of a logical delete: the row must survive, because the
  // appointment history points at it.
  const survivingRow = psql(`SELECT "isActive" FROM "Service" WHERE id='${singleId}';`);
  if (survivingRow !== 'f') fail(`Service row should still exist with isActive=false, psql returned "${survivingRow}"`);
  pass('la fila sigue existiendo en Postgres (no se borró, sólo se desactivó)');

  const stillReadable = await tenantGet(`/services/${singleId}`, session, tenantId);
  if (stillReadable.status !== 200) fail(`deactivated service should still be readable, got ${stillReadable.status}`);
  pass('el servicio desactivado se sigue pudiendo leer por id');

  const activeOnly = await tenantGet('/services?isActive=true', session, tenantId);
  const activeIds = (activeOnly.body as unknown as ServiceRow[]).map((s) => s.id);
  if (activeIds.includes(singleId)) fail('deactivated service still appears in the isActive=true list');
  pass('el servicio desactivado desaparece del filtro isActive=true');

  const inactiveOnly = await tenantGet('/services?isActive=false', session, tenantId);
  const inactiveIds = (inactiveOnly.body as unknown as ServiceRow[]).map((s) => s.id);
  if (!inactiveIds.includes(singleId)) fail('deactivated service missing from the isActive=false list');
  pass('el servicio desactivado aparece en el filtro isActive=false');

  console.log(`\nAll ${passCount} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
