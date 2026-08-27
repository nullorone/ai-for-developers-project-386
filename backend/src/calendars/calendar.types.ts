export interface CalendarRecord {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  ownerTimeZone: string;
  slotDurationMinutes: number;
  minimumLeadTimeMinutes: number;
  bookingHorizonDays: number;
}

export type CalendarDto = CalendarRecord;
