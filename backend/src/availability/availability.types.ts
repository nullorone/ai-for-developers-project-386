export interface AvailabilityWindowRecord {
  id: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
}

export type CreateWindowResult =
  | { kind: 'created'; window: AvailabilityWindowRecord }
  | { kind: 'limit' }
  | { kind: 'overlap'; window: AvailabilityWindowRecord };

export type DeleteWindowResult =
  { kind: 'deleted' } | { kind: 'notFound' } | { kind: 'hasBookings'; count: number };

export interface AvailabilityWindowDto {
  id: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

export interface AvailabilityWindowListDto {
  calendarId: string;
  total: number;
  maxWindows: 500;
  items: AvailabilityWindowDto[];
}
