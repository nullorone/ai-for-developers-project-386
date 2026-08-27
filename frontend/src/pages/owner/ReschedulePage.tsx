import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, bookingApi } from '../../shared/api/bookingApi';
import { formatLocalDate, formatLocalDateTime, formatLocalTime } from '../../shared/lib/dateTime';
import { ErrorState, LoadingState, SuccessState } from '../../shared/ui/AsyncState';

export function ReschedulePage() {
  const { bookingId = '' } = useParams();
  const queryClient = useQueryClient();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const slots = useQuery({
    queryKey: ['owner', 'bookings', bookingId, 'slots'],
    queryFn: () => bookingApi.rescheduleSlots(bookingId),
    retry: false,
  });
  const reschedule = useMutation({
    mutationFn: () => bookingApi.reschedule(bookingId, selectedSlot),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owner', 'bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['owner', 'bookings', bookingId, 'slots'] }),
      ]);
      feedbackRef.current?.focus();
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setSelectedSlot('');
        await queryClient.invalidateQueries({
          queryKey: ['owner', 'bookings', bookingId, 'slots'],
        });
        feedbackRef.current?.focus();
      }
    },
  });

  if (slots.isPending) return <LoadingState>Ищем варианты переноса…</LoadingState>;
  if (slots.isError) {
    const notReschedulable = slots.error instanceof ApiError && slots.error.status === 409;
    return (
      <ErrorState
        message={
          notReschedulable
            ? 'Эту встречу уже нельзя перенести. Исходные данные не изменены.'
            : 'Не удалось получить слоты для переноса.'
        }
        onRetry={notReschedulable ? undefined : () => slots.refetch()}
      />
    );
  }

  const alternatives = slots.data.slots.filter((slot) => !slot.current);
  const conflict = reschedule.error instanceof ApiError && reschedule.error.status === 409;

  return (
    <div className="card stack stack--large">
      <div>
        <p className="eyebrow">Перенос встречи</p>
        <h2>Выберите новое время</h2>
        <p>
          Текущее: <strong>{formatLocalDateTime(slots.data.currentStartsAt)}</strong>
        </p>
      </div>
      {alternatives.length === 0 ? (
        <p className="notice">
          Других свободных слотов сейчас нет. Исходная встреча остается без изменений.
        </p>
      ) : null}
      <fieldset>
        <legend>Свободные слоты</legend>
        <div className="slot-grid slot-grid--wide">
          {alternatives.map((slot) => (
            <label className="slot" key={slot.startsAt}>
              <input
                type="radio"
                name="new-slot"
                checked={selectedSlot === slot.startsAt}
                onChange={() => setSelectedSlot(slot.startsAt)}
              />
              <span>
                {formatLocalDate(slot.startsAt)}, {formatLocalTime(slot.startsAt)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {reschedule.isSuccess ? (
        <div ref={feedbackRef} tabIndex={-1}>
          <SuccessState>Встреча успешно перенесена.</SuccessState>
        </div>
      ) : null}
      {reschedule.isError ? (
        <div ref={feedbackRef} tabIndex={-1}>
          <ErrorState
            message={
              conflict
                ? 'Выбранное время уже занято. Список обновлен, а исходная встреча сохранена.'
                : 'Не удалось перенести встречу. Исходная встреча сохранена.'
            }
          />
        </div>
      ) : null}
      <div className="actions">
        <button
          className="button"
          type="button"
          disabled={!selectedSlot || reschedule.isPending}
          onClick={() => reschedule.mutate()}
        >
          {reschedule.isPending ? 'Переносим…' : 'Перенести встречу'}
        </button>
        <Link to="/owner/bookings">Назад к встречам</Link>
      </div>
    </div>
  );
}
