import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Ответы контракта зависят от текущего времени (правило S-5),
        // поэтому кэш держим коротким и не перезапрашиваем на каждый фокус.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        // Мутации контракта не идемпотентны без Idempotency-Key (правило B-7):
        // политика повторов появится вместе с реализацией сценариев.
        retry: 0,
      },
    },
  });
}
