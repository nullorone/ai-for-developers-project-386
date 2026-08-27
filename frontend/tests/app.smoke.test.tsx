import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../src/app/App';
import { apiClient } from '../src/shared/api/client';

describe('smoke: приложение', () => {
  it('рендерит стартовую страницу MVP', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: /выберите удобное время/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /открыть календарь/i })).toBeVisible();
  });

  it('собирает типизированный клиент из сгенерированного контракта', () => {
    // Проверяем не сеть, а то, что codegen отработал и клиент собран:
    // отсутствие generated/schema.d.ts уронит typecheck и этот импорт.
    expect(typeof apiClient.GET).toBe('function');
    expect(typeof apiClient.POST).toBe('function');
  });
});
