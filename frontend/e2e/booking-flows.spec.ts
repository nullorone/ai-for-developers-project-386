import { expect, test, type Page, type Route } from '@playwright/test';

const calendarId = '6f1c2f0e-9a1e-4d3b-9a4a-0f5b3f2a1c11';
const bookingId = '8b6b8a2a-4a3e-4a63-9d0f-2f1a5c4b7e10';
const managementToken = 'playwright-management-token-1234567890';
const firstSlot = '2030-09-02T09:00:00Z';
const secondSlot = '2030-09-02T10:00:00Z';
const createdAt = '2030-09-01T08:00:00Z';

interface FixtureState {
  cancelled: boolean;
  conflictNextBooking: boolean;
  availability: Array<Record<string, unknown>>;
  bookingStartsAt: string;
}

test('гость бронирует и отменяет встречу по token link', async ({ page }) => {
  const state = await installContractFixture(page);
  await page.goto('/#/calendars/demo');

  await page.getByRole('radio').first().check();
  await page.getByLabel('Имя').fill('Playwright Guest');
  await page.getByLabel('Email').fill('guest@example.com');
  await page.getByRole('button', { name: 'Подтвердить бронирование' }).click();

  await expect(page.getByRole('heading', { name: 'Бронирование подтверждено' })).toBeVisible();
  const managementLink = page.getByRole('link', {
    name: 'Открыть страницу управления бронированием',
  });
  await expect(managementLink).toHaveAttribute('href', new RegExp(`#token=${managementToken}$`));
  await managementLink.click();
  await page.getByRole('button', { name: 'Отменить бронирование' }).click();

  await expect(page.getByText(/бронирование отменено/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отменить бронирование' })).toHaveCount(0);
  expect(state.cancelled).toBe(true);
});

test('владелец создает availability и переносит встречу', async ({ page }) => {
  const state = await installContractFixture(page);
  await page.goto('/#/owner/availability');

  await page.getByLabel('Начало').fill('2030-09-03T09:00');
  await page.getByLabel('Конец').fill('2030-09-03T11:00');
  await page.getByRole('button', { name: 'Добавить интервал' }).click();
  await expect(page.getByRole('button', { name: 'Удалить' })).toBeVisible();
  expect(state.availability).toHaveLength(1);

  await page.goto('/#/owner/bookings');
  await page.getByRole('link', { name: 'Выбрать новое время' }).click();
  await page.getByRole('radio').check();
  await page.getByRole('button', { name: 'Перенести встречу' }).click();

  await expect(page.getByText('Встреча успешно перенесена.')).toBeVisible();
  expect(state.bookingStartsAt).toBe(secondSlot);
});

test('конфликт бронирования обновляет UI и требует выбрать другой слот', async ({ page }) => {
  const state = await installContractFixture(page);
  state.conflictNextBooking = true;
  await page.goto('/#/calendars/demo');

  await page.getByRole('radio').first().check();
  await page.getByLabel('Имя').fill('Conflicting Guest');
  await page.getByLabel('Email').fill('conflict@example.com');
  await page.getByRole('button', { name: 'Подтвердить бронирование' }).click();

  await expect(page.getByRole('alert')).toContainText('время уже занято');
  await expect(page.getByRole('button', { name: 'Подтвердить бронирование' })).toBeDisabled();
});

async function installContractFixture(page: Page): Promise<FixtureState> {
  const state: FixtureState = {
    cancelled: false,
    conflictNextBooking: false,
    availability: [],
    bookingStartsAt: firstSlot,
  };

  await page.route('**/api/v1/**', async (route) => handleApi(route, state));
  return state;
}

async function handleApi(route: Route, state: FixtureState): Promise<void> {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace('/api/v1', '');
  const method = request.method();

  if (method === 'GET' && path === '/calendars/demo') {
    return json(route, {
      id: calendarId,
      slug: 'demo',
      title: 'Консультация 30 минут',
      description: 'Playwright contract fixture',
      ownerTimeZone: 'UTC',
      slotDurationMinutes: 30,
      minimumLeadTimeMinutes: 60,
      bookingHorizonDays: 90,
    });
  }
  if (method === 'GET' && path === '/calendars/demo/slots') {
    return json(route, {
      calendarId,
      from: firstSlot,
      to: '2030-09-03T00:00:00Z',
      slotDurationMinutes: 30,
      generatedAt: createdAt,
      slots: [slot(firstSlot), slot(secondSlot)],
    });
  }
  if (method === 'POST' && path === '/calendars/demo/bookings') {
    if (state.conflictNextBooking) {
      state.conflictNextBooking = false;
      return problem(route, 409, 'SLOT_TAKEN');
    }
    const body = request.postDataJSON() as { startsAt: string };
    state.bookingStartsAt = body.startsAt;
    return json(
      route,
      {
        id: bookingId,
        calendarId,
        calendarSlug: 'demo',
        calendarTitle: 'Консультация 30 минут',
        startsAt: body.startsAt,
        endsAt: plusThirtyMinutes(body.startsAt),
        durationMinutes: 30,
        status: 'CONFIRMED',
        createdAt,
        managementToken,
        managementPath: `/bookings/${bookingId}`,
      },
      201,
    );
  }
  if (path === `/bookings/${bookingId}/cancellation`) {
    expect(request.headers()['x-booking-token']).toBe(managementToken);
    if (method === 'POST') state.cancelled = true;
    return json(route, {
      id: bookingId,
      calendarTitle: 'Консультация 30 минут',
      startsAt: state.bookingStartsAt,
      endsAt: plusThirtyMinutes(state.bookingStartsAt),
      durationMinutes: 30,
      status: state.cancelled ? 'CANCELLED' : 'CONFIRMED',
      cancelledAt: state.cancelled ? createdAt : null,
      rescheduledAt: null,
      cancellable: !state.cancelled,
    });
  }
  if (method === 'GET' && path === '/owner/availability') {
    return json(route, {
      calendarId,
      total: state.availability.length,
      maxWindows: 500,
      items: state.availability,
    });
  }
  if (method === 'POST' && path === '/owner/availability') {
    const body = request.postDataJSON() as Record<string, unknown>;
    state.availability = [{ id: 'c0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6071', ...body, createdAt }];
    return json(route, state.availability[0], 201);
  }
  if (method === 'GET' && path === '/owner/bookings') {
    return json(route, {
      calendarId,
      total: 1,
      generatedAt: createdAt,
      items: [ownerBooking(state.bookingStartsAt)],
    });
  }
  if (method === 'GET' && path === `/owner/bookings/${bookingId}/available-slots`) {
    return json(route, {
      bookingId,
      currentStartsAt: state.bookingStartsAt,
      from: firstSlot,
      to: '2030-10-02T09:00:00Z',
      slotDurationMinutes: 30,
      generatedAt: createdAt,
      slots: [
        { ...slot(state.bookingStartsAt), current: true },
        { ...slot(secondSlot), current: false },
      ],
    });
  }
  if (method === 'PATCH' && path === `/owner/bookings/${bookingId}/schedule`) {
    state.bookingStartsAt = (request.postDataJSON() as { startsAt: string }).startsAt;
    return json(route, ownerBooking(state.bookingStartsAt));
  }
  return problem(route, 404, 'MALFORMED_REQUEST');
}

function slot(startsAt: string) {
  return { startsAt, endsAt: plusThirtyMinutes(startsAt) };
}

function ownerBooking(startsAt: string) {
  return {
    id: bookingId,
    startsAt,
    endsAt: plusThirtyMinutes(startsAt),
    durationMinutes: 30,
    status: 'CONFIRMED',
    guestName: 'Playwright Guest',
    guestEmailMasked: 'g***@example.com',
    createdAt,
    rescheduledAt: startsAt === firstSlot ? null : createdAt,
  };
}

function plusThirtyMinutes(value: string): string {
  return new Date(new Date(value).getTime() + 30 * 60_000).toISOString().replace('.000Z', 'Z');
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function problem(route: Route, status: number, code: string): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({
      code,
      message: code,
      details: [],
      requestId: bookingId,
      timestamp: createdAt,
    }),
  });
}
