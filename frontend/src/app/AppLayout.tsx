import { Link, Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <Link className="app-shell__brand" to="/">
          Созвон
        </Link>
        <nav aria-label="Основная навигация">
          <Link to="/calendars/demo">Записаться</Link>
          <Link to="/owner/availability">Владельцу</Link>
        </nav>
      </header>
      <main className="app-shell__main" id="main">
        <Outlet />
      </main>
      <footer className="app-shell__footer">
        <small>Время показывается в часовом поясе вашего браузера.</small>
      </footer>
    </div>
  );
}
