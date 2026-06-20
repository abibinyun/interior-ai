import { useSession } from '../hooks/useSession';

export function SettingsPage() {
  const session = useSession();
  return (
    <article className="space-y-6">
      <header>
        <h1 className="font-display text-display-md font-semibold text-stone-900">Settings</h1>
        <p className="mt-1 text-sm text-stone-500">Account-level settings.</p>
      </header>
      <section className="placeholder-card space-y-2">
        <h2 className="font-display text-xl font-semibold">Session</h2>
        <p className="text-sm text-stone-600">
          Your session id (this is the only identifier the app uses — no login, no email).
        </p>
        <code
          className="block break-all rounded-lg bg-stone-100 p-3 font-mono text-xs text-stone-700"
          data-testid="session-id-full"
        >
          {session.data?.sessionId ?? '…'}
        </code>
        <p className="text-xs text-stone-400">
          Clearing your browser cookies will start a new session and your in-progress projects will
          be invisible to the new session id.
        </p>
      </section>
    </article>
  );
}