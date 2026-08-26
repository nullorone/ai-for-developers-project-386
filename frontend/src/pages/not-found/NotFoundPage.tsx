import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="stack">
      <h1>Страница не найдена</h1>
      <p className="muted">Проверьте ссылку или вернитесь на стартовую страницу.</p>
      <p>
        <Link to="/">На главную</Link>
      </p>
    </section>
  );
}
