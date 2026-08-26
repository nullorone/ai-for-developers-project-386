import createClient, { type Client } from 'openapi-fetch';

import { appConfig } from '../config/env';
import type { paths } from './generated/schema';

/**
 * Единственная точка входа в API. Типы берутся из сгенерированного из корневого
 * `openapi.yaml` файла `generated/schema.d.ts`; вручную его править нельзя.
 *
 * Management token (`X-Booking-Token`) сюда не попадает по умолчанию: он живет
 * только в памяти/fragment URL и передается точечно в конкретном запросе
 * (правила M-6, M-7).
 */
export type ApiClient = Client<paths>;

export function createApiClient(baseUrl: string = appConfig.apiBaseUrl): ApiClient {
  return createClient<paths>({
    baseUrl,
    headers: { Accept: 'application/json' },
  });
}

export const apiClient: ApiClient = createApiClient();
