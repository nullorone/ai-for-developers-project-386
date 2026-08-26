import { createHashRouter } from 'react-router-dom';

import { HomePage } from '../pages/home/HomePage';
import { NotFoundPage } from '../pages/not-found/NotFoundPage';
import { AppLayout } from './AppLayout';

// Hash routing выбран заранее: frontend деплоится на GitHub Pages,
// где нет server-side fallback на index.html. Кроме того, management token
// живет во fragment URL (правило M-7), см. docs/api.md.
export const routes = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/** Флаги будущего поведения React Router включены заранее, чтобы не накапливать долг. */
export const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
} as const;

export const router = createHashRouter(routes, { future: routerFutureFlags });
