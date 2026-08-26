#!/usr/bin/env node
/**
 * Smoke-проверка контракта через mock server Prism.
 *
 * Поднимает `prism mock openapi.yaml` на свободном порту, проходит happy path
 * гостя и владельца, а также ключевые ошибки, и сверяет коды ответов и форму тел.
 * Prism валидирует запросы по контракту, поэтому проверка заодно подтверждает,
 * что документ пригоден для генерации mock API.
 *
 * Запуск: npm run smoke:mock
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
// Prism обслуживает операции от корня, отбрасывая базовый путь сервера `/api/v1`.
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = '6Qk9m2Xh1sT0pV7cRb4YwLdF3nJgZaEu8HrKtN5MvQo';
const BOOKING_ID = '8b6b8a2a-4a3e-4a63-9d0f-2f1a5c4b7e10';
const WINDOW_ID = 'c0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6071';

const prism = spawn(
  process.execPath,
  [
    'node_modules/@stoplight/prism-cli/dist/index.js',
    'mock',
    'openapi.yaml',
    '--port',
    String(PORT),
    '--host',
    '127.0.0.1',
    '--errors',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

let prismLog = '';
prism.stdout.on('data', (chunk) => {
  prismLog += chunk;
});
prism.stderr.on('data', (chunk) => {
  prismLog += chunk;
});

const failures = [];
let checks = 0;

async function waitForMock() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // mock server is not listening yet
    }
    await delay(500);
  }
  throw new Error(`Prism did not start on port ${PORT}.\n${prismLog}`);
}

async function check(name, request, expectations) {
  checks += 1;
  const { path, method = 'GET', headers = {}, body, prefer } = request;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json, application/problem+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (response.status !== expectations.status) {
    failures.push(
      `${name}: expected HTTP ${expectations.status}, got ${response.status}. Body: ${text.slice(0, 400)}`,
    );
    return payload;
  }

  for (const field of expectations.fields ?? []) {
    if (payload === null || !(field in payload)) {
      failures.push(`${name}: response body is missing "${field}". Body: ${text.slice(0, 400)}`);
    }
  }

  if (expectations.code && payload?.code !== expectations.code) {
    failures.push(`${name}: expected error code ${expectations.code}, got ${payload?.code}.`);
  }

  console.log(`  ok  ${name} -> ${response.status}`);
  return payload;
}

try {
  await waitForMock();
  console.log(`Prism mock is up on ${BASE}\n`);

  console.log('Guest happy path:');
  await check(
    'GET /calendars/demo',
    { path: '/calendars/demo' },
    { status: 200, fields: ['id', 'slug', 'ownerTimeZone', 'slotDurationMinutes'] },
  );
  await check(
    'GET /calendars/demo/slots',
    { path: '/calendars/demo/slots?from=2026-09-01T00:00:00Z&to=2026-09-08T00:00:00Z' },
    { status: 200, fields: ['calendarId', 'from', 'to', 'slots'] },
  );
  await check(
    'POST /calendars/demo/bookings',
    {
      path: '/calendars/demo/bookings',
      method: 'POST',
      headers: { 'Idempotency-Key': '8f14e45fceea167a5a36dedd4bea2543' },
      body: {
        startsAt: '2026-09-01T09:00:00Z',
        guestName: 'Alex Guest',
        guestEmail: 'guest@example.com',
      },
    },
    { status: 201, fields: ['id', 'startsAt', 'endsAt', 'status', 'managementToken', 'managementPath'] },
  );
  await check(
    'GET /bookings/{id}/cancellation',
    { path: `/bookings/${BOOKING_ID}/cancellation`, headers: { 'X-Booking-Token': TOKEN } },
    { status: 200, fields: ['id', 'status', 'cancelledAt', 'cancellable'] },
  );
  await check(
    'POST /bookings/{id}/cancellation',
    {
      path: `/bookings/${BOOKING_ID}/cancellation`,
      method: 'POST',
      headers: { 'X-Booking-Token': TOKEN },
      prefer: 'example=cancelled',
    },
    { status: 200, fields: ['id', 'status', 'cancelledAt'] },
  );

  console.log('\nOwner happy path:');
  await check(
    'GET /owner/availability',
    { path: '/owner/availability' },
    { status: 200, fields: ['calendarId', 'total', 'items'] },
  );
  await check(
    'POST /owner/availability',
    {
      path: '/owner/availability',
      method: 'POST',
      body: { startsAt: '2026-09-03T09:00:00Z', endsAt: '2026-09-03T13:00:00Z' },
    },
    { status: 201, fields: ['id', 'startsAt', 'endsAt'] },
  );
  await check(
    'DELETE /owner/availability/{id}',
    { path: `/owner/availability/${WINDOW_ID}`, method: 'DELETE' },
    { status: 204 },
  );
  await check(
    'GET /owner/bookings',
    { path: '/owner/bookings' },
    { status: 200, fields: ['calendarId', 'total', 'items'] },
  );
  await check(
    'GET /owner/bookings/{id}/available-slots',
    { path: `/owner/bookings/${BOOKING_ID}/available-slots` },
    { status: 200, fields: ['bookingId', 'currentStartsAt', 'slots'] },
  );
  await check(
    'PATCH /owner/bookings/{id}/schedule',
    {
      path: `/owner/bookings/${BOOKING_ID}/schedule`,
      method: 'PATCH',
      body: { startsAt: '2026-09-01T10:00:00Z' },
    },
    { status: 200, fields: ['id', 'startsAt', 'endsAt', 'status', 'rescheduledAt'] },
  );

  console.log('\nKey error paths:');
  await check(
    '404 calendar not found',
    { path: '/calendars/demo', prefer: 'code=404' },
    { status: 404, code: 'CALENDAR_NOT_FOUND', fields: ['code', 'message', 'requestId'] },
  );
  await check(
    '422 invalid slot range',
    {
      path: '/calendars/demo/slots?from=2026-09-01T00:00:00Z&to=2026-09-08T00:00:00Z',
      prefer: 'code=422',
    },
    { status: 422, code: 'VALIDATION_ERROR', fields: ['code', 'details', 'requestId'] },
  );
  await check(
    '409 slot taken on create',
    {
      path: '/calendars/demo/bookings',
      method: 'POST',
      prefer: 'code=409, example=slotTaken',
      body: {
        startsAt: '2026-09-01T09:00:00Z',
        guestName: 'Alex Guest',
        guestEmail: 'guest@example.com',
      },
    },
    { status: 409, code: 'SLOT_TAKEN', fields: ['code', 'message', 'requestId'] },
  );
  await check(
    '409 idempotency key reused',
    {
      path: '/calendars/demo/bookings',
      method: 'POST',
      prefer: 'code=409, example=idempotencyKeyReused',
      headers: { 'Idempotency-Key': '8f14e45fceea167a5a36dedd4bea2543' },
      body: {
        startsAt: '2026-09-01T09:00:00Z',
        guestName: 'Alex Guest',
        guestEmail: 'guest@example.com',
      },
    },
    { status: 409, code: 'IDEMPOTENCY_KEY_REUSED', fields: ['code', 'details'] },
  );
  await check(
    '403 invalid management token',
    {
      path: `/bookings/${BOOKING_ID}/cancellation`,
      headers: { 'X-Booking-Token': TOKEN },
      prefer: 'code=403',
    },
    { status: 403, code: 'BOOKING_TOKEN_INVALID', fields: ['code', 'message', 'requestId'] },
  );
  await check(
    '409 availability overlap',
    {
      path: '/owner/availability',
      method: 'POST',
      prefer: 'code=409',
      body: { startsAt: '2026-09-03T09:00:00Z', endsAt: '2026-09-03T13:00:00Z' },
    },
    { status: 409, code: 'AVAILABILITY_OVERLAP', fields: ['code', 'details'] },
  );
  await check(
    '409 window has bookings',
    { path: `/owner/availability/${WINDOW_ID}`, method: 'DELETE', prefer: 'code=409' },
    { status: 409, code: 'AVAILABILITY_WINDOW_HAS_BOOKINGS', fields: ['code', 'details'] },
  );
  await check(
    '409 slot taken on reschedule',
    {
      path: `/owner/bookings/${BOOKING_ID}/schedule`,
      method: 'PATCH',
      prefer: 'code=409, example=slotTaken',
      body: { startsAt: '2026-09-01T10:00:00Z' },
    },
    { status: 409, code: 'SLOT_TAKEN', fields: ['code', 'details'] },
  );
  await check(
    '429 rate limited',
    { path: '/calendars/demo', prefer: 'code=429' },
    { status: 429, code: 'RATE_LIMITED', fields: ['code', 'retryAfterSeconds'] },
  );
  await check(
    '500 internal error',
    { path: '/calendars/demo', prefer: 'code=500' },
    { status: 500, code: 'INTERNAL_ERROR', fields: ['code', 'requestId'] },
  );
  await check(
    '503 readiness failure',
    { path: '/health/ready', prefer: 'code=503' },
    { status: 503, fields: ['status', 'checks'] },
  );

  console.log('\nRequest validation by the contract:');
  await check(
    'missing X-Booking-Token is rejected by the mock',
    { path: `/bookings/${BOOKING_ID}/cancellation` },
    { status: 400, code: 'MALFORMED_REQUEST' },
  );
  await check(
    'unknown body property is rejected by the mock',
    {
      path: '/calendars/demo/bookings',
      method: 'POST',
      body: {
        startsAt: '2026-09-01T09:00:00Z',
        guestName: 'Alex Guest',
        guestEmail: 'guest@example.com',
        endsAt: '2026-09-01T10:00:00Z',
      },
    },
    { status: 422 },
  );
} catch (error) {
  failures.push(String(error?.message ?? error));
} finally {
  prism.kill('SIGTERM');
}

console.log('');
if (failures.length > 0) {
  console.error(`Mock smoke test failed: ${failures.length} of ${checks} checks.`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`Mock smoke test passed: ${checks} checks.`);
