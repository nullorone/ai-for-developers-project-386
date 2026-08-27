import type { components } from './generated/schema';
import { apiClient } from './client';

export type Calendar = components['schemas']['Calendar'];
export type Slot = components['schemas']['Slot'];
export type SlotList = components['schemas']['SlotList'];
export type BookingCreated = components['schemas']['BookingCreated'];
export type BookingCancellationView = components['schemas']['BookingCancellationView'];
export type AvailabilityWindowList = components['schemas']['AvailabilityWindowList'];
export type OwnerBookingList = components['schemas']['OwnerBookingList'];
export type OwnerBooking = components['schemas']['OwnerBooking'];
export type RescheduleSlotList = components['schemas']['RescheduleSlotList'];
export type ErrorBody = components['schemas']['Error'];

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorBody['code'],
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data;
  const error = result.error as Partial<ErrorBody> | undefined;
  throw new ApiError(
    result.response.status,
    error?.code ?? 'INTERNAL_ERROR',
    error?.message ?? 'Сервис временно недоступен.',
  );
}

function expectEmpty(result: { error?: unknown; response: Response }): void {
  if (result.response.ok) return;
  const error = result.error as Partial<ErrorBody> | undefined;
  throw new ApiError(
    result.response.status,
    error?.code ?? 'INTERNAL_ERROR',
    error?.message ?? 'Сервис временно недоступен.',
  );
}

export const bookingApi = {
  async calendar(slug: string): Promise<Calendar> {
    return unwrap(await apiClient.GET('/calendars/{slug}', { params: { path: { slug } } }));
  },
  async slots(slug: string, from: string, to: string): Promise<SlotList> {
    return unwrap(
      await apiClient.GET('/calendars/{slug}/slots', {
        params: { path: { slug }, query: { from, to } },
      }),
    );
  },
  async createBooking(
    slug: string,
    body: components['schemas']['CreateBookingRequest'],
    idempotencyKey: string,
  ): Promise<BookingCreated> {
    return unwrap(
      await apiClient.POST('/calendars/{slug}/bookings', {
        params: { path: { slug }, header: { 'Idempotency-Key': idempotencyKey } },
        body,
      }),
    );
  },
  async cancellation(bookingId: string, token: string): Promise<BookingCancellationView> {
    return unwrap(
      await apiClient.GET('/bookings/{bookingId}/cancellation', {
        params: { path: { bookingId }, header: { 'X-Booking-Token': token } },
      }),
    );
  },
  async cancel(bookingId: string, token: string): Promise<BookingCancellationView> {
    return unwrap(
      await apiClient.POST('/bookings/{bookingId}/cancellation', {
        params: { path: { bookingId }, header: { 'X-Booking-Token': token } },
      }),
    );
  },
  async availability(): Promise<AvailabilityWindowList> {
    return unwrap(await apiClient.GET('/owner/availability'));
  },
  async createAvailability(body: components['schemas']['CreateAvailabilityWindowRequest']) {
    return unwrap(await apiClient.POST('/owner/availability', { body }));
  },
  async deleteAvailability(windowId: string): Promise<void> {
    expectEmpty(
      await apiClient.DELETE('/owner/availability/{windowId}', {
        params: { path: { windowId } },
      }),
    );
  },
  async ownerBookings(): Promise<OwnerBookingList> {
    return unwrap(await apiClient.GET('/owner/bookings'));
  },
  async rescheduleSlots(bookingId: string): Promise<RescheduleSlotList> {
    return unwrap(
      await apiClient.GET('/owner/bookings/{bookingId}/available-slots', {
        params: { path: { bookingId } },
      }),
    );
  },
  async reschedule(bookingId: string, startsAt: string): Promise<OwnerBooking> {
    return unwrap(
      await apiClient.PATCH('/owner/bookings/{bookingId}/schedule', {
        params: { path: { bookingId } },
        body: { startsAt },
      }),
    );
  },
};
