import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

/**
 * Application shell — top nav + content outlet. Every screen renders
 * inside this shell so the navigation chrome is consistent across the
 * app.
 *
 * F1 scope: empty placeholders for every screen. The nav links route
 * to the correct placeholders so the user can navigate the entire
 * IA without seeing 404s. Real screens land in F2–F9.
 */
export function AppShell() {
  const session = useSession();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-stone-100 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            Interior&nbsp;<span className="text-forest-500">AI</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                isActive ? 'text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-900'
              }
            >
              Projects
            </NavLink>
            <span className="text-xs text-stone-400" data-testid="session-id">
              {session.data ? `sid ${session.data.sessionId.slice(0, 8)}…` : '…'}
            </span>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-stone-100 bg-white/50">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-stone-400">
          Interior AI — F1 Foundation. Real screens land in F2–F9.
        </div>
      </footer>
    </div>
  );
}