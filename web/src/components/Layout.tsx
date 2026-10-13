import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { fetchFamilies, fetchNotifications } from '../api';
import SearchableSelect from './SearchableSelect';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/expenses', label: 'Expenses', icon: '🧾' },
  { to: '/categories', label: 'Categories', icon: '🏷️' },
  { to: '/budgets', label: 'Budgets', icon: '🎯' },
  { to: '/goals', label: 'Goals', icon: '💰' },
  { to: '/income', label: 'Income', icon: '💵' },
  { to: '/statement-import', label: 'Credit Statement', icon: '📄' },
  { to: '/bank-statements?type=SAVINGS', label: 'Debit Statement', icon: '💳' },
  { to: '/bank-statements?type=CREDIT_CARD', label: 'Bank Statements', icon: '🏦' },
  { to: '/members', label: 'Members', icon: '👪' },
  { to: '/notifications', label: 'Alerts', icon: '🔔' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, families, activeFamily, setFamilies, setActiveFamily, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (families.length === 0) {
      fetchFamilies().then(setFamilies).catch(() => {});
    }
  }, [families.length, setFamilies]);

  useEffect(() => {
    const tick = () => fetchNotifications().then((ns) => setUnread(ns.filter((n) => !n.read).length)).catch(() => {});
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5 text-lg font-bold text-indigo-600">👨‍👩‍👧‍👦 Family Expenses</div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((item) => {
            const [pathname, search] = item.to.split('?');
            const isActive = search
              ? location.pathname === pathname && location.search.includes(search)
              : location.pathname === pathname || location.pathname.startsWith(pathname + '/');
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={() =>
                  `flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <span>
                  {item.icon} {item.label}
                </span>
                {item.to === '/notifications' && unread > 0 && (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{unread}</span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="m-3 rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100"
        >
          ⏻ Log out ({user?.name})
        </button>
      </aside>
      <main className="flex-1 p-6">
        <header className="mb-6 flex items-center justify-between">
          <div className="w-64">
            <SearchableSelect
              options={families.map((f) => ({ value: f.id, label: f.name }))}
              value={activeFamily?.id ?? ''}
              onChange={(id) => setActiveFamily(families.find((f) => f.id === id)!)}
              placeholder="Pick a family…"
            />
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
