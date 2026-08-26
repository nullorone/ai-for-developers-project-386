import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../src/app/App';
import { apiClient } from '../src/shared/api/client';

describe('smoke: каркас приложения', () => {
  it('рендерит нейтральную стартовую страницу', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: /каркас приложения готов/i })).toBeVisible();
    expect(screen.getByText(/запись на звонок/i)).toBeVisible();
  });

  it('собирает типизированный клиент из сгенерированного контракта', () => {
    // Проверяем не сеть, а то, что codegen отработал и клиент собран:
    // отсутствие generated/schema.d.ts уронит typecheck и этот импорт.
    expect(typeof apiClient.GET).toBe('function');
    expect(typeof apiClient.POST).toBe('function');
  });
});
