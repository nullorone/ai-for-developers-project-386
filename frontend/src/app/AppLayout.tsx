import { Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <span className="app-shell__brand">Запись на звонок</span>
      </header>
      <main className="app-shell__main" id="main">
        <Outlet />
      </main>
      <footer className="app-shell__footer">
        <small>MVP-каркас. Продуктовые сценарии появятся на следующем этапе.</small>
      </footer>
    </div>
  );
}
