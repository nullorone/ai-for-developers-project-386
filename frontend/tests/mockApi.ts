import type { components } from '../src/shared/api/generated/schema';

type Calendar = components['schemas']['Calendar'];
type Slot = components['schemas']['Slot'];
type OwnerBooking = components['schemas']['OwnerBooking'];
type AvailabilityWindow = components['schemas']['AvailabilityWindow'];

const calendarId = '6f1c2f0e-9a1e-4d3b-9a4a-0f5b3f2a1c11';
const bookingId = '8b6b8a2a-4a3e-4a63-9d0f-2f1a5c4b7e10';
const managementToken = 'mock-token-with-at-least-32-characters';

function utcAt(dayOffset: number, hour: number): string {
  const date = new Date();
  date.setHours(Math.floor(hour), hour % 1 === 0.5 ? 30 : 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().replace('.000Z', 'Z');
}

function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function slotAt(dayOffset: number, hour: number): Slot {
  return { startsAt: utcAt(dayOffset, hour), endsAt: utcAt(dayOffset, hour + 0.5) };
}

function slotsInsideRange(from: string): Slot[] {
  const firstStart = new Date(new Date(from).getTime() + 9 * 60 * 60 * 1_000);
  firstStart.setUTCSeconds(0, 0);
  firstStart.setUTCMinutes(firstStart.getUTCMinutes() < 30 ? 30 : 60);
  const secondStart = new Date(firstStart.getTime() + 30 * 60 * 1_000);
  return [firstStart, secondStart].map((startsAt) => ({
    startsAt: startsAt.toISOString().replace('.000Z', 'Z'),
    endsAt: new Date(startsAt.getTime() + 30 * 60 * 1_000).toISOString().replace('.000Z', 'Z'),
  }));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

function error(status: number, code: components['schemas']['ErrorCode']): Response {
  return json(
    {
      code,
      message: 'Mocked contract error.',
      details: [],
      requestId: '1b1c1a4f-2c58-4a4b-9d3a-6e0a2a2f8d21',
      timestamp: nowUtc(),
    } satisfies components['schemas']['Error'],
    status,
  );
}

export class ContractMockApi {
  conflictNextBooking = false;
  conflictNextReschedule = false;
  failCalendar = false;
  failNextBookingNetwork = false;
  emptySlots = false;
  bookingTokenHeaderWasUsed = false;
  bookingIdempotencyKeys: string[] = [];
  availability: AvailabilityWindow[] = [];
  ownerBookings: OwnerBooking[] = [
    {
      id: bookingId,
      startsAt: utcAt(2, 10),
      endsAt: utcAt(2, 10.5),
      durationMinutes: 30,
      status: 'CONFIRMED',
      guestName: 'Тестовый гость',
      guestEmailMasked: 'g***@example.com',
      createdAt: utcAt(-1, 10),
      rescheduledAt: null,
    },
  ];

  readonly calendar: Calendar = {
    id: calendarId,
    slug: 'demo',
    title: 'Консультация 30 минут',
    description: 'Обсудим задачу и следующие шаги.',
    ownerTimeZone: 'Europe/Amsterdam',
    slotDurationMinutes: 30,
    minimumLeadTimeMinutes: 60,
    bookingHorizonDays: 90,
  };

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    // Runtime default targets the real backend with its global prefix. The isolated
    // mock also accepts Prism-style unprefixed paths so tests cover both modes.
    const path = url.pathname.replace(/^\/api\/v1(?=\/)/, '');

    if (request.method === 'GET' && path === '/calendars/demo')
      return this.failCalendar ? error(500, 'INTERNAL_ERROR') : json(this.calendar);
    if (request.method === 'GET' && path === '/calendars/demo/slots') {
      const from = url.searchParams.get('from')!;
      const slots = this.emptySlots ? [] : slotsInsideRange(from);
      return json({
        calendarId,
        from,
        to: url.searchParams.get('to')!,
        slotDurationMinutes: 30,
        generatedAt: nowUtc(),
        slots,
      } satisfies components['schemas']['SlotList']);
    }
    if (request.method === 'POST' && path === '/calendars/demo/bookings') {
      this.bookingIdempotencyKeys.push(request.headers.get('Idempotency-Key') ?? '');
      if (this.failNextBookingNetwork) {
        this.failNextBookingNetwork = false;
        throw new TypeError('Mocked network failure');
      }
      if (this.conflictNextBooking) {
        this.conflictNextBooking = false;
        return error(409, 'SLOT_TAKEN');
      }
      const body = (await request.json()) as components['schemas']['CreateBookingRequest'];
      return json(
        {
          id: bookingId,
          calendarId,
          calendarSlug: 'demo',
          calendarTitle: this.calendar.title,
          startsAt: body.startsAt,
          endsAt: new Date(new Date(body.startsAt).getTime() + 1_800_000)
            .toISOString()
            .replace('.000Z', 'Z'),
          durationMinutes: 30,
          status: 'CONFIRMED',
          createdAt: nowUtc(),
          managementToken,
          managementPath: `/bookings/${bookingId}`,
        } satisfies components['schemas']['BookingCreated'],
        201,
      );
    }
    if (path === `/bookings/${bookingId}/cancellation`) {
      this.bookingTokenHeaderWasUsed = request.headers.get('X-Booking-Token') === managementToken;
      if (!this.bookingTokenHeaderWasUsed) return error(403, 'BOOKING_TOKEN_INVALID');
      return json({
        id: bookingId,
        calendarTitle: this.calendar.title,
        startsAt: utcAt(2, 10),
        endsAt: utcAt(2, 10.5),
        durationMinutes: 30,
        status: request.method === 'POST' ? 'CANCELLED' : 'CONFIRMED',
        cancelledAt: request.method === 'POST' ? nowUtc() : null,
        rescheduledAt: null,
        cancellable: request.method !== 'POST',
      } satisfies components['schemas']['BookingCancellationView']);
    }
    if (request.method === 'GET' && path === '/owner/availability')
      return json({
        calendarId,
        total: this.availability.length,
        maxWindows: 500,
        items: this.availability,
      } satisfies components['schemas']['AvailabilityWindowList']);
    if (request.method === 'POST' && path === '/owner/availability') {
      const body =
        (await request.json()) as components['schemas']['CreateAvailabilityWindowRequest'];
      const item: AvailabilityWindow = {
        id: 'c0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6071',
        ...body,
        createdAt: nowUtc(),
      };
      this.availability = [item];
      return json(item, 201);
    }
    if (request.method === 'DELETE' && path.startsWith('/owner/availability/')) {
      this.availability = [];
      return new Response(null, { status: 204 });
    }
    if (request.method === 'GET' && path === '/owner/bookings')
      return json({
        calendarId,
        total: this.ownerBookings.length,
        generatedAt: nowUtc(),
        items: this.ownerBookings,
      } satisfies components['schemas']['OwnerBookingList']);
    if (request.method === 'GET' && path === `/owner/bookings/${bookingId}/available-slots`)
      return json({
        bookingId,
        currentStartsAt: this.ownerBookings[0]!.startsAt,
        from: utcAt(0, 0),
        to: utcAt(30, 0),
        slotDurationMinutes: 30,
        generatedAt: nowUtc(),
        slots: [
          {
            startsAt: this.ownerBookings[0]!.startsAt,
            endsAt: this.ownerBookings[0]!.endsAt,
            current: true,
          },
          { ...slotAt(3, 11), current: false },
        ],
      } satisfies components['schemas']['RescheduleSlotList']);
    if (request.method === 'PATCH' && path === `/owner/bookings/${bookingId}/schedule`) {
      if (this.conflictNextReschedule) {
        this.conflictNextReschedule = false;
        return error(409, 'SLOT_TAKEN');
      }
      const body = (await request.json()) as components['schemas']['RescheduleBookingRequest'];
      this.ownerBookings[0] = {
        ...this.ownerBookings[0]!,
        startsAt: body.startsAt,
        endsAt: new Date(new Date(body.startsAt).getTime() + 1_800_000)
          .toISOString()
          .replace('.000Z', 'Z'),
        rescheduledAt: nowUtc(),
      };
      return json(this.ownerBookings[0]);
    }
    return error(404, 'MALFORMED_REQUEST');
  };

  managementRoute(): string {
    return `/bookings/${bookingId}#token=${managementToken}`;
  }
}
