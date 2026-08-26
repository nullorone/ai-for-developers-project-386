import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { routerFutureFlags, routes } from '../src/app/router';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
    future: routerFutureFlags,
  });
  return render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
}

describe('маршрутизация', () => {
  it('показывает стартовую страницу на корневом маршруте', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: /каркас приложения готов/i })).toBeVisible();
  });

  it('показывает страницу 404 на неизвестном маршруте', async () => {
    renderAt('/unknown-route');
    expect(await screen.findByRole('heading', { name: /страница не найдена/i })).toBeVisible();
  });
});
