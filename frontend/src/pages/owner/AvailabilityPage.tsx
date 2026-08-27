import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';

import { ApiError, bookingApi } from '../../shared/api/bookingApi';
import { formatLocalDateTime, localInputToUtc } from '../../shared/lib/dateTime';
import { ErrorState, LoadingState, SuccessState } from '../../shared/ui/AsyncState';

export function AvailabilityPage() {
  const queryClient = useQueryClient();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [validationError, setValidationError] = useState('');
  const windows = useQuery({
    queryKey: ['owner', 'availability'],
    queryFn: bookingApi.availability,
  });
  const createWindow = useMutation({
    mutationFn: () =>
      bookingApi.createAvailability({
        startsAt: localInputToUtc(startsAt),
        endsAt: localInputToUtc(endsAt),
      }),
    onSuccess: async () => {
      setStartsAt('');
      setEndsAt('');
      await queryClient.invalidateQueries({ queryKey: ['owner', 'availability'] });
      feedbackRef.current?.focus();
    },
  });
  const deleteWindow = useMutation({
    mutationFn: bookingApi.deleteAvailability,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['owner', 'availability'] });
      feedbackRef.current?.focus();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setValidationError('');
    if (!startsAt || !endsAt) {
      setValidationError('Заполните начало и конец интервала.');
      return;
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (end <= start) {
      setValidationError('Конец должен быть позже начала.');
      return;
    }
    if (![0, 30].includes(start.getUTCMinutes()) || ![0, 30].includes(end.getUTCMinutes())) {
      setValidationError('В UTC границы должны приходиться на :00 или :30.');
      return;
    }
    createWindow.mutate();
  }

  const mutationError = createWindow.error ?? deleteWindow.error;
  const conflict = mutationError instanceof ApiError && mutationError.status === 409;

  return (
    <div className="two-column">
      <form className="card stack" onSubmit={submit}>
        <h2>Добавить доступность</h2>
        <div className="field">
          <label htmlFor="availability-start">Начало</label>
          <input
            id="availability-start"
            type="datetime-local"
            step="60"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="availability-end">Конец</label>
          <input
            id="availability-end"
            type="datetime-local"
            step="60"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </div>
        <p className="muted">Введите местное время; в API оно будет отправлено в UTC.</p>
        {validationError ? (
          <p className="field-error" role="alert">
            {validationError}
          </p>
        ) : null}
        {createWindow.isError ? (
          <ErrorState
            message={
              conflict
                ? 'Интервал пересекается с существующим. Измените границы.'
                : 'Не удалось создать интервал.'
            }
          />
        ) : null}
        <button className="button" type="submit" disabled={createWindow.isPending}>
          {createWindow.isPending ? 'Добавляем…' : 'Добавить интервал'}
        </button>
      </form>

      <div className="stack">
        <h2>Опубликованные интервалы</h2>
        {windows.isPending ? <LoadingState /> : null}
        {windows.isError ? (
          <ErrorState
            message="Не удалось загрузить доступность."
            onRetry={() => windows.refetch()}
          />
        ) : null}
        {windows.data?.items.length === 0 ? (
          <p className="notice">Интервалов пока нет. Добавьте первый слева.</p>
        ) : null}
        {(createWindow.isSuccess || deleteWindow.isSuccess) &&
        !createWindow.isPending &&
        !deleteWindow.isPending ? (
          <div ref={feedbackRef} tabIndex={-1}>
            <SuccessState>Список доступности обновлен.</SuccessState>
          </div>
        ) : null}
        {deleteWindow.isError ? (
          <ErrorState
            message={
              conflict
                ? 'Интервал нельзя удалить: внутри есть будущая встреча.'
                : 'Не удалось удалить интервал.'
            }
          />
        ) : null}
        <ul className="card-list">
          {windows.data?.items.map((window) => (
            <li className="card card--row" key={window.id}>
              <span>
                {formatLocalDateTime(window.startsAt)} — {formatLocalDateTime(window.endsAt)}
              </span>
              <button
                className="button button--danger button--small"
                type="button"
                disabled={deleteWindow.isPending}
                onClick={() => deleteWindow.mutate(window.id)}
              >
                {deleteWindow.isPending && deleteWindow.variables === window.id
                  ? 'Удаляем…'
                  : 'Удалить'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
