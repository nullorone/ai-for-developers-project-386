import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { ApiError, bookingApi } from '../../shared/api/bookingApi';
import { formatLocalDateTime } from '../../shared/lib/dateTime';
import { ErrorState, LoadingState, SuccessState } from '../../shared/ui/AsyncState';

export function CancellationPage() {
  const { bookingId = '' } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const resultRef = useRef<HTMLDivElement>(null);
  const token = useMemo(
    () => new URLSearchParams(location.hash.replace(/^#/, '')).get('token') ?? '',
    [location.hash],
  );
  const booking = useQuery({
    queryKey: ['cancellation', bookingId, token],
    queryFn: () => bookingApi.cancellation(bookingId, token),
    enabled: Boolean(bookingId && token),
    retry: false,
  });
  const cancellation = useMutation({
    mutationFn: () => bookingApi.cancel(bookingId, token),
    onSuccess: (data) => {
      queryClient.setQueryData(['cancellation', bookingId, token], data);
    },
  });

  useEffect(() => {
    if (cancellation.isSuccess || cancellation.isError) resultRef.current?.focus();
  }, [cancellation.isError, cancellation.isSuccess]);

  if (!token) {
    return (
      <ErrorState message="В ссылке нет management token. Откройте полную ссылку, полученную после бронирования." />
    );
  }
  if (booking.isPending) return <LoadingState>Проверяем защищенную ссылку…</LoadingState>;
  if (booking.isError) {
    const invalid = booking.error instanceof ApiError && booking.error.status === 403;
    return (
      <ErrorState
        message={
          invalid
            ? 'Ссылка недействительна или токен не подходит.'
            : 'Не удалось загрузить бронирование.'
        }
        onRetry={invalid ? undefined : () => booking.refetch()}
      />
    );
  }

  return (
    <section className="card stack stack--large">
      <p className="eyebrow">Управление бронированием</p>
      <h1>{booking.data.calendarTitle}</h1>
      <p>{formatLocalDateTime(booking.data.startsAt)}</p>
      {booking.data.status === 'CANCELLED' && !cancellation.isSuccess ? (
        <div ref={resultRef} tabIndex={-1}>
          <SuccessState>Бронирование уже отменено. Повторных действий не требуется.</SuccessState>
        </div>
      ) : null}
      {cancellation.isSuccess ? (
        <div ref={resultRef} tabIndex={-1}>
          <SuccessState>Бронирование отменено, время снова доступно гостям.</SuccessState>
        </div>
      ) : null}
      {cancellation.isError ? (
        <ErrorState
          message={
            cancellation.error instanceof ApiError && cancellation.error.status === 409
              ? 'Встреча уже началась или прошла — отменить ее нельзя.'
              : 'Не удалось отменить бронирование. Попробуйте снова.'
          }
        />
      ) : null}
      {booking.data.cancellable ? (
        <button
          className="button button--danger"
          type="button"
          disabled={cancellation.isPending}
          onClick={() => cancellation.mutate()}
        >
          {cancellation.isPending ? 'Отменяем…' : 'Отменить бронирование'}
        </button>
      ) : null}
      <Link to="/calendars/demo">Открыть календарь</Link>
    </section>
  );
}
