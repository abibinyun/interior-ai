interface PlaceholderProps {
  title: string;
  hint: string;
}

export function PlaceholderCard({ title, hint }: PlaceholderProps) {
  return (
    <section className="placeholder-card max-w-2xl space-y-3">
      <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">
        F1 placeholder
      </span>
      <h1 className="font-display text-display-md font-semibold">{title}</h1>
      <p className="text-stone-600">{hint}</p>
    </section>
  );
}