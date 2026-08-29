import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';

import {
  apiErrorMessage,
  bookingApi,
  isApiErrorCode,
  type BookingCreated,
} from '../../shared/api/bookingApi';
import {
  browserTimeZone,
  formatLocalTime,
  localDateValue,
  localDayUtcRange,
} from '../../shared/lib/dateTime';
import { ErrorState, LoadingState } from '../../shared/ui/AsyncState';

const guestSchema = z.object({
  guestName: z
    .string()
    .trim()
    .min(2, 'Введите не менее 2 символов.')
    .max(80, 'Имя не должно быть длиннее 80 символов.')
    .refine(
      (value) =>
        [...value].every((character) => {
          const code = character.charCodeAt(0);
          return code > 31 && code !== 127;
        }),
      'Уберите управляющие символы.',
    ),
  guestEmail: z
    .string()
    .trim()
    .email('Введите корректный email.')
    .max(254, 'Email не должен быть длиннее 254 символов.'),
  comment: z
    .string()
    .max(500, 'Комментарий не должен быть длиннее 500 символов.')
    .refine(
      (value) => value.split(/\r?\n/).length <= 10,
      'Комментарий может содержать до 10 строк.',
    ),
});

type GuestForm = z.infer<typeof guestSchema>;

export function CalendarPage() {
  const { slug = 'demo' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(localDateValue());
  const [selectedSlot, setSelectedSlot] = useState<string>();
  const conflictRef = useRef<HTMLDivElement>(null);
  const attemptRef = useRef<{ payload: string; key: string }>();
  const range = useMemo(() => localDayUtcRange(date), [date]);
  const calendar = useQuery({
    queryKey: ['calendar', slug],
    queryFn: () => bookingApi.calendar(slug),
  });
  const slots = useQuery({
    queryKey: ['slots', slug, range.from, range.to],
    queryFn: () => bookingApi.slots(slug, range.from, range.to),
  });
  const form = useForm<GuestForm>({
    resolver: zodResolver(guestSchema),
    defaultValues: { guestName: '', guestEmail: '', comment: '' },
  });

  const booking = useMutation({
    mutationFn: (values: GuestForm) => {
      if (!selectedSlot) throw new Error('Сначала выберите время.');
      const body = {
        startsAt: selectedSlot,
        guestName: values.guestName.trim(),
        guestEmail: values.guestEmail.trim(),
        ...(values.comment.trim() ? { comment: values.comment.trim() } : {}),
      };
      const payload = JSON.stringify(body);
      if (attemptRef.current?.payload !== payload) {
        attemptRef.current = { payload, key: crypto.randomUUID() };
      }
      return bookingApi.createBooking(slug, body, attemptRef.current.key);
    },
    onSuccess: async (created: BookingCreated) => {
      attemptRef.current = undefined;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['slots', slug] }),
        queryClient.invalidateQueries({ queryKey: ['owner', 'bookings'] }),
      ]);
      navigate(`/bookings/${created.id}/confirmed`, { state: created });
    },
    onError: async (error) => {
      if (isApiErrorCode(error, 'SLOT_TAKEN')) {
        setSelectedSlot(undefined);
        await queryClient.invalidateQueries({ queryKey: ['slots', slug] });
        conflictRef.current?.focus();
      } else if (isApiErrorCode(error, 'IDEMPOTENCY_KEY_REUSED')) {
        attemptRef.current = undefined;
      }
    },
  });

  if (calendar.isPending) return <LoadingState>Загружаем календарь…</LoadingState>;
  if (calendar.isError) {
    return (
      <ErrorState
        message={apiErrorMessage(calendar.error, 'Не удалось загрузить календарь.')}
        onRetry={() => calendar.refetch()}
      />
    );
  }

  const isConflict = isApiErrorCode(booking.error, 'SLOT_TAKEN');

  return (
    <section className="stack stack--large">
      <div>
        <p className="eyebrow">Публичный календарь</p>
        <h1>{calendar.data.title}</h1>
        {calendar.data.description ? <p className="lead">{calendar.data.description}</p> : null}
        <p className="muted">Время показано для {browserTimeZone()}.</p>
      </div>

      <div className="card stack">
        <label htmlFor="booking-date">Дата звонка</label>
        <input
          id="booking-date"
          type="date"
          min={localDateValue()}
          max={localDateValue(
            new Date(Date.now() + calendar.data.bookingHorizonDays * 24 * 60 * 60 * 1_000),
          )}
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setSelectedSlot(undefined);
          }}
        />

        <fieldset>
          <legend>Свободное время</legend>
          {slots.isPending ? <LoadingState>Ищем свободные слоты…</LoadingState> : null}
          {slots.isError ? (
            <ErrorState
              message={apiErrorMessage(slots.error, 'Не удалось получить свободное время.')}
              onRetry={() => slots.refetch()}
            />
          ) : null}
          {slots.data?.slots.length === 0 ? (
            <p className="notice">
              На выбранную дату свободного времени нет. Выберите другую дату.
            </p>
          ) : null}
          <div className="slot-grid">
            {slots.data?.slots.map((slot) => (
              <label className="slot" key={slot.startsAt}>
                <input
                  type="radio"
                  name="slot"
                  value={slot.startsAt}
                  checked={selectedSlot === slot.startsAt}
                  onChange={() => setSelectedSlot(slot.startsAt)}
                />
                <span>{formatLocalTime(slot.startsAt)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <form
        className="card stack"
        onSubmit={form.handleSubmit((values) => booking.mutate(values))}
        noValidate
      >
        <h2>Ваши данные</h2>
        <div className="field">
          <label htmlFor="guest-name">Имя</label>
          <input
            id="guest-name"
            autoComplete="name"
            aria-invalid={Boolean(form.formState.errors.guestName)}
            {...form.register('guestName')}
          />
          {form.formState.errors.guestName ? (
            <p className="field-error">{form.formState.errors.guestName.message}</p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="guest-email">Email</label>
          <input
            id="guest-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(form.formState.errors.guestEmail)}
            {...form.register('guestEmail')}
          />
          {form.formState.errors.guestEmail ? (
            <p className="field-error">{form.formState.errors.guestEmail.message}</p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="guest-comment">
            Комментарий <span className="muted">(необязательно)</span>
          </label>
          <textarea
            id="guest-comment"
            rows={4}
            aria-invalid={Boolean(form.formState.errors.comment)}
            {...form.register('comment')}
          />
          <small className="muted">До 500 символов и 10 строк.</small>
          {form.formState.errors.comment ? (
            <p className="field-error">{form.formState.errors.comment.message}</p>
          ) : null}
        </div>
        {!selectedSlot ? <p className="field-error">Выберите свободное время.</p> : null}
        {isConflict ? (
          <div className="notice notice--error" role="alert" tabIndex={-1} ref={conflictRef}>
            Это время уже занято. Мы обновили список — выберите другой слот.
          </div>
        ) : booking.isError ? (
          <ErrorState
            message={apiErrorMessage(
              booking.error,
              'Не удалось создать бронирование. Данные сохранены — попробуйте снова.',
            )}
          />
        ) : null}
        <button className="button" type="submit" disabled={!selectedSlot || booking.isPending}>
          {booking.isPending ? 'Бронируем…' : 'Подтвердить бронирование'}
        </button>
      </form>
    </section>
  );
}
