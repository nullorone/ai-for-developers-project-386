import { useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import type { BookingCreated } from '../../shared/api/bookingApi';
import { formatLocalDateTime } from '../../shared/lib/dateTime';

export function BookingConfirmationPage() {
  const { bookingId } = useParams();
  const location = useLocation();
  const booking = location.state as BookingCreated | null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), []);

  if (!booking || booking.id !== bookingId) {
    return (
      <section className="stack">
        <h1>Подтверждение недоступно</h1>
        <p>
          Защищенная ссылка показывается только сразу после бронирования и не сохраняется в
          браузере.
        </p>
        <Link className="button button--inline" to="/calendars/demo">
          Вернуться в календарь
        </Link>
      </section>
    );
  }

  const managementUrl = `${window.location.origin}${window.location.pathname}#${booking.managementPath}#token=${encodeURIComponent(booking.managementToken)}`;

  return (
    <section className="card stack stack--large" tabIndex={-1}>
      <p className="eyebrow">Готово</p>
      <h1 ref={headingRef} tabIndex={-1}>
        Бронирование подтверждено
      </h1>
      <p>
        <strong>{booking.calendarTitle}</strong>
      </p>
      <p>{formatLocalDateTime(booking.startsAt)}</p>
      <div className="notice notice--success">
        <strong>Сохраните ссылку для отмены.</strong>
        <p>Токен не сохраняется в хранилище браузера и восстановить эту ссылку позже нельзя.</p>
        <a className="break-word" href={managementUrl}>
          Открыть страницу управления бронированием
        </a>
      </div>
      <Link to={`/calendars/${booking.calendarSlug}`}>Вернуться в календарь</Link>
    </section>
  );
}
