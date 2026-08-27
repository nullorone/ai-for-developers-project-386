export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

export interface SlotDto {
  startsAt: string;
  endsAt: string;
}

export interface SlotListDto {
  calendarId: string;
  from: string;
  to: string;
  slotDurationMinutes: 30;
  generatedAt: string;
  slots: SlotDto[];
}
