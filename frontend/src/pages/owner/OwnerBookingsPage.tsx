import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { bookingApi } from '../../shared/api/bookingApi';
import { formatLocalDateTime } from '../../shared/lib/dateTime';
import { ErrorState, LoadingState } from '../../shared/ui/AsyncState';

export function OwnerBookingsPage() {
  const bookings = useQuery({ queryKey: ['owner', 'bookings'], queryFn: bookingApi.ownerBookings });

  if (bookings.isPending) return <LoadingState>Загружаем встречи…</LoadingState>;
  if (bookings.isError)
    return (
      <ErrorState message="Не удалось загрузить встречи." onRetry={() => bookings.refetch()} />
    );

  return (
    <div className="stack">
      <h2>Будущие встречи</h2>
      {bookings.data.items.length === 0 ? <p className="notice">Будущих встреч пока нет.</p> : null}
      <ul className="card-list">
        {bookings.data.items.map((booking) => (
          <li className="card stack" key={booking.id}>
            <h3>{booking.guestName}</h3>
            <p>{formatLocalDateTime(booking.startsAt)}</p>
            <p className="muted">{booking.guestEmailMasked}</p>
            <Link
              className="button button--secondary button--inline"
              to={`/owner/bookings/${booking.id}/reschedule`}
            >
              Выбрать новое время
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
