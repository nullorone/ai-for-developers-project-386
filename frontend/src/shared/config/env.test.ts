import { describe, expect, it } from 'vitest';

import { DEFAULT_API_BASE_URL, readAppConfig } from './env';

describe('readAppConfig', () => {
  it('подставляет адрес реального local API, когда переменная не задана', () => {
    expect(readAppConfig({})).toEqual({ apiBaseUrl: DEFAULT_API_BASE_URL });
  });

  it('убирает завершающие слэши, чтобы пути контракта склеивались однозначно', () => {
    expect(readAppConfig({ VITE_API_BASE_URL: 'https://api.example.com/api/v1/' })).toEqual({
      apiBaseUrl: 'https://api.example.com/api/v1',
    });
  });

  it('падает на невалидном URL, а не молча использует его', () => {
    expect(() => readAppConfig({ VITE_API_BASE_URL: 'not-a-url' })).toThrow(
      /Некорректные переменные окружения/,
    );
  });
});
