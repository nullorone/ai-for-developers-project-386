import type { ReactNode } from 'react';

export function LoadingState({ children = 'Загрузка…' }: { children?: ReactNode }) {
  return (
    <p className="notice" role="status" aria-live="polite">
      {children}
    </p>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice--error" role="alert" tabIndex={-1}>
      <p>{message}</p>
      {onRetry ? (
        <button className="button button--secondary" type="button" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  );
}

export function SuccessState({ children }: { children: ReactNode }) {
  return (
    <p className="notice notice--success" role="status" aria-live="polite" tabIndex={-1}>
      {children}
    </p>
  );
}
