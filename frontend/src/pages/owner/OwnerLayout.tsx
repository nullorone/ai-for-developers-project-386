import { NavLink, Outlet } from 'react-router-dom';

export function OwnerLayout() {
  return (
    <section className="stack stack--large">
      <div>
        <p className="eyebrow">Раздел владельца</p>
        <h1>Управление календарем</h1>
        <p className="notice notice--warning">
          Учебный MVP: owner-раздел публичен и не подходит для production.
        </p>
      </div>
      <nav className="tabs" aria-label="Разделы владельца">
        <NavLink to="/owner/availability">Доступность</NavLink>
        <NavLink to="/owner/bookings">Будущие встречи</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
