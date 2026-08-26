import { appConfig } from '../../shared/config/env';

export function HomePage() {
  return (
    <section className="stack">
      <h1>Каркас приложения готов</h1>
      <p className="muted">
        Это нейтральная стартовая страница. Продуктовые сценарии гостя и владельца реализуются на
        следующем этапе поверх контракта <code>openapi.yaml</code>.
      </p>
      <dl className="stack">
        <div>
          <dt className="muted">Базовый адрес API</dt>
          <dd>
            <code>{appConfig.apiBaseUrl}</code>
          </dd>
        </div>
      </dl>
    </section>
  );
}
