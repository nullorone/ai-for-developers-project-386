import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../src/app/providers/queryClient';
import { routerFutureFlags, routes } from '../src/app/router';
import { ContractMockApi } from './mockApi';

let mock: ContractMockApi;

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path], future: routerFutureFlags });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mock = new ContractMockApi();
  vi.stubGlobal('fetch', mock.fetch);
  localStorage.clear();
  sessionStorage.clear();
});

describe('ключевые сценарии на contract mock', () => {
  it('бронирует слот и не сохраняет management token в browser storage', async () => {
    const user = userEvent.setup();
    renderAt('/calendars/demo');

    expect(await screen.findByRole('heading', { name: 'Консультация 30 минут' })).toBeVisible();
    await user.click((await screen.findAllByRole('radio'))[0]!);
    await user.type(screen.getByLabelText('Имя'), 'Тест Гость');
    await user.type(screen.getByLabelText('Email'), 'guest@example.com');
    await user.click(screen.getByRole('button', { name: 'Подтвердить бронирование' }));

    expect(await screen.findByRole('heading', { name: 'Бронирование подтверждено' })).toBeVisible();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it('при конфликте обновляет слоты и просит выбрать другое время', async () => {
    mock.conflictNextBooking = true;
    const user = userEvent.setup();
    renderAt('/calendars/demo');

    await user.click((await screen.findAllByRole('radio'))[0]!);
    await user.type(screen.getByLabelText('Имя'), 'Тест Гость');
    await user.type(screen.getByLabelText('Email'), 'guest@example.com');
    await user.click(screen.getByRole('button', { name: 'Подтвердить бронирование' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('время уже занято');
    expect(screen.getByRole('button', { name: 'Подтвердить бронирование' })).toBeDisabled();
  });

  it('повторяет неясный create с тем же Idempotency-Key', async () => {
    mock.failNextBookingNetwork = true;
    const user = userEvent.setup();
    renderAt('/calendars/demo');

    await user.click((await screen.findAllByRole('radio'))[0]!);
    await user.type(screen.getByLabelText('Имя'), 'Тест Гость');
    await user.type(screen.getByLabelText('Email'), 'guest@example.com');
    await user.click(screen.getByRole('button', { name: 'Подтвердить бронирование' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Данные сохранены');

    await user.click(screen.getByRole('button', { name: 'Подтвердить бронирование' }));
    expect(await screen.findByRole('heading', { name: 'Бронирование подтверждено' })).toBeVisible();
    expect(mock.bookingIdempotencyKeys).toHaveLength(2);
    expect(mock.bookingIdempotencyKeys[0]).toBeTruthy();
    expect(mock.bookingIdempotencyKeys[1]).toBe(mock.bookingIdempotencyKeys[0]);
  });

  it('показывает validation, empty и server error состояния', async () => {
    const user = userEvent.setup();
    mock.emptySlots = true;
    const view = renderAt('/calendars/demo');

    expect(await screen.findByText(/свободного времени нет/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Подтвердить бронирование' }));
    expect(screen.getByText(/выберите свободное время/i)).toBeVisible();

    view.unmount();
    mock.failCalendar = true;
    renderAt('/calendars/demo');
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис временно недоступен');
  });

  it('отменяет только с токеном из fragment и показывает повторную отмену', async () => {
    const user = userEvent.setup();
    renderAt(mock.managementRoute());

    await user.click(await screen.findByRole('button', { name: 'Отменить бронирование' }));
    expect(await screen.findByText(/бронирование отменено/i)).toBeVisible();
    expect(mock.bookingTokenHeaderWasUsed).toBe(true);
    expect(screen.queryByRole('button', { name: 'Отменить бронирование' })).not.toBeInTheDocument();
  });

  it('после неуспешного переноса сохраняет исходное время в UI', async () => {
    mock.conflictNextReschedule = true;
    const originalStart = mock.ownerBookings[0]!.startsAt;
    const user = userEvent.setup();
    renderAt(`/owner/bookings/${mock.ownerBookings[0]!.id}/reschedule`);

    await user.click((await screen.findAllByRole('radio'))[0]!);
    await user.click(screen.getByRole('button', { name: 'Перенести встречу' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('исходная встреча сохранена');
    expect(mock.ownerBookings[0]!.startsAt).toBe(originalStart);
    await waitFor(() => expect(screen.getByText(/Текущее:/)).toBeVisible());
  });

  it('создает и удаляет интервал доступности', async () => {
    const user = userEvent.setup();
    renderAt('/owner/availability');

    expect(await screen.findByText(/интервалов пока нет/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Начало'), { target: { value: '2026-09-03T09:00' } });
    fireEvent.change(screen.getByLabelText('Конец'), { target: { value: '2026-09-03T11:00' } });
    await user.click(screen.getByRole('button', { name: 'Добавить интервал' }));
    expect(await screen.findByRole('button', { name: 'Удалить' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(await screen.findByText(/интервалов пока нет/i)).toBeVisible();
  });
});
