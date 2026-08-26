import { RouterProvider } from 'react-router-dom';

import { AppQueryProvider } from './providers/AppQueryProvider';
import { router } from './router';

export function App() {
  return (
    <AppQueryProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppQueryProvider>
  );
}
