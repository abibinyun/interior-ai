import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

/**
 * Application shell — top nav + content + footer.
 *
 * F2 enhances the F1 placeholder with:
 * - Branded wordmark + tagline
 * - Active-link styling
 * - Session-id chip (compact, low-prominence)
 * - Generous whitespace + premium typography (per architecture §4.2)
 *
 * All real screens land in F2–F9; this shell is stable across them.
 */
export function AppShell() {
  const session = useSession();
  const sid = session.data?.sessionId;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-100 bg-cream-50/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
          <Link to="/" className="flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-semibold tracking-tight text-stone-900">
              Interior
            </span>
            <span className="font-display text-2xl font-semibold tracking-tight text-forest-500">
              AI
            </span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-6 text-sm">
            <NavItem to="/projects">Projects</NavItem>
            <NavItem to="/styles" disabled>
              Style catalog
            </NavItem>
            <NavItem to="/settings" disabled>
              Settings
            </NavItem>
            <span
              className="hidden text-xs text-stone-400 sm:inline"
              data-testid="session-id"
              title={sid ? `Session: ${sid}` : 'Establishing session…'}
            >
              {sid ? `sid ${sid.slice(0, 8)}…` : '…'}
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6 text-xs text-stone-400">
          <span>Interior AI — interior design, end to end.</span>
          <span className="font-mono text-stone-300">F2 App Shell</span>
        </div>
      </footer>
    </div>
  );
}

function NavItem({
  to,
  children,
  disabled,
}: {
  to: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="cursor-not-allowed text-stone-300"
        title="Coming soon"
      >
        {children}
      </span>
    );
  }
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        isActive
          ? 'text-stone-900 font-medium'
          : 'text-stone-500 hover:text-stone-900 transition-colors'
      }
    >
      {children}
    </NavLink>
  );
}