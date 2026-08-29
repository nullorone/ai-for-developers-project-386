import type { Prisma } from '@prisma/client';

export const BOOKING_EVENT_TYPES = [
  'booking.created',
  'booking.cancelled',
  'booking.rescheduled',
] as const;

export type BookingEventType = (typeof BOOKING_EVENT_TYPES)[number];

/** Stable, versioned integration contract. Payload intentionally excludes guest PII and secrets. */
export interface BookingEventEnvelope {
  eventId: string;
  eventType: BookingEventType;
  version: 1;
  occurredAt: string;
  aggregateId: string;
  correlationId: string;
  payload: Prisma.JsonValue;
}

export function isBookingEventType(value: string): value is BookingEventType {
  return BOOKING_EVENT_TYPES.some((candidate) => candidate === value);
}

export function parseEnvelope(value: unknown): BookingEventEnvelope {
  if (!value || typeof value !== 'object') throw new Error('event envelope must be an object');
  const event = value as Partial<BookingEventEnvelope>;
  if (
    typeof event.eventId !== 'string' ||
    typeof event.aggregateId !== 'string' ||
    typeof event.correlationId !== 'string' ||
    typeof event.occurredAt !== 'string' ||
    event.version !== 1 ||
    typeof event.eventType !== 'string' ||
    !isBookingEventType(event.eventType) ||
    event.payload === undefined
  ) {
    throw new Error('unsupported or malformed event envelope');
  }
  return event as BookingEventEnvelope;
}
