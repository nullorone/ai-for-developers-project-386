export interface OwnerBookingRecord {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: 'CONFIRMED' | 'CANCELLED';
  guestName: string;
  guestEmail: string;
  createdAt: Date;
  rescheduledAt: Date | null;
}

export interface OwnerBookingDto {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: 30;
  status: 'CONFIRMED' | 'CANCELLED';
  guestName: string;
  guestEmailMasked: string;
  createdAt: string;
  rescheduledAt: string | null;
}

export interface OwnerBookingListDto {
  calendarId: string;
  total: number;
  generatedAt: string;
  items: OwnerBookingDto[];
}

export interface RescheduleSlotListDto {
  bookingId: string;
  currentStartsAt: string;
  from: string;
  to: string;
  slotDurationMinutes: 30;
  generatedAt: string;
  slots: Array<{ startsAt: string; endsAt: string; current: boolean }>;
}
