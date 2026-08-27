const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatLocalDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function formatLocalDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatInTimeZone(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(value));
}

export function formatLocalTime(value: string): string {
  return timeFormatter.format(new Date(value));
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function localDateValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function localDayUtcRange(date: string): { from: string; to: string } {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(`${date}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: toUtcSeconds(from), to: toUtcSeconds(to) };
}

export function localInputToUtc(value: string): string {
  return toUtcSeconds(new Date(value));
}

export function toUtcSeconds(value: Date): string {
  return value.toISOString().replace('.000Z', 'Z');
}
