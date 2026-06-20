import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="placeholder-card max-w-xl space-y-4">
      <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">
        404
      </span>
      <h1 className="font-display text-display-md font-semibold">Not found</h1>
      <p className="text-stone-600">
        That page doesn&apos;t exist (yet). Real screens arrive milestone by milestone — F2 first.
      </p>
      <Link to="/" className="inline-block text-sm font-medium text-forest-500 hover:text-forest-700">
        ← Back to home
      </Link>
    </section>
  );
}