import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="hero stack stack--large">
      <p className="eyebrow">30 минут на важный разговор</p>
      <h1>Выберите удобное время без переписки</h1>
      <p className="lead">
        Гость бронирует свободный слот, а владелец публикует доступность и управляет будущими
        встречами.
      </p>
      <div className="actions">
        <Link className="button button--inline" to="/calendars/demo">
          Открыть календарь
        </Link>
        <Link className="button button--secondary button--inline" to="/owner/availability">
          Управлять календарем
        </Link>
      </div>
    </section>
  );
}
