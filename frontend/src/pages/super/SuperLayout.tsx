import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";

import { useSuperAuthStore } from "../../store/superAuth";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm ${
    isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
  }`;

export function SuperLayout() {
  const navigate = useNavigate();
  const { token, admin, logout } = useSuperAuthStore();

  if (!token) {
    return <Navigate to="/super/login" replace />;
  }

  const onLogout = () => {
    logout();
    navigate("/super/login");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-slate-900">VoltPos · Платформа</span>
            <nav className="flex gap-2">
              <NavLink to="/super" end className={linkClass}>Обзор</NavLink>
              <NavLink to="/super/orgs" className={linkClass}>Магазины</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{admin?.name || admin?.email}</span>
            <button
              onClick={onLogout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
