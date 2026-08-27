export interface BookingCreatedDto {
  id: string;
  calendarId: string;
  calendarSlug: string;
  calendarTitle: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: 30;
  status: 'CONFIRMED';
  createdAt: string;
  managementToken: string;
  managementPath: string;
}

export interface BookingCancellationDto {
  id: string;
  calendarTitle: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: 30;
  status: 'CONFIRMED' | 'CANCELLED';
  cancelledAt: string | null;
  rescheduledAt: string | null;
  cancellable: boolean;
}

export interface BookingCancellationRecord {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: 'CONFIRMED' | 'CANCELLED';
  managementTokenHash: string;
  cancelledAt: Date | null;
  rescheduledAt: Date | null;
  calendar: { title: string };
}

export interface CreateBookingResult {
  booking: BookingCreatedDto;
  replayed: boolean;
}
