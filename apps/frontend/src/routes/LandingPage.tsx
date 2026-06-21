export function LandingPage() {
  return (
    <section>
      {/* Hero section with subtle gradient background + faint diamond pattern */}
      <div className="relative -mx-6 -mt-12 mb-12 overflow-hidden bg-gradient-to-b from-cream-100/80 via-cream-50/40 to-transparent px-6 pb-8 pt-20">
        {/* Decorative diamond pattern — very faint, positioned behind the text */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-16 h-96 w-96 text-stone-900/[0.03]"
          viewBox="0 0 200 200"
          fill="currentColor"
        >
          <pattern id="diamonds" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="none" />
            <path d="M20 0 40 20 20 40 0 20Z" />
          </pattern>
          <rect width="200" height="200" fill="url(#diamonds)" />
        </svg>

        <h1 className="relative text-display-lg font-display font-semibold text-stone-900">
          Design every room with intention.
        </h1>
        <p className="relative mt-4 max-w-2xl text-lg text-stone-700">
          Interior AI walks you from a blank house to a finished, downloadable design pack. Pick a
          style, brief each room, generate three options at a time, refine, and approve the ones
          that feel right.
        </p>
        <div className="relative mt-6 flex gap-3">
          <a
            href="/projects"
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-medium text-cream-50 shadow-sm transition hover:bg-stone-800 hover:shadow-md"
          >
            Start a project
          </a>
          <a
            href="/projects"
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
          >
            Browse existing
          </a>
        </div>
      </div>

      {/* Section divider */}
      <div className="mb-10 h-px w-24 bg-gradient-to-r from-stone-200 to-transparent" />

      {/* Feature cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        <FeatureCard
          icon="✦"
          title="Pick a style"
          body="Japandi, Scandinavian, Mid-century — every room you generate carries the same house-wide language."
        />
        <FeatureCard
          icon="◈"
          title="Generate, three at a time"
          body="Brief the room, get three options, compare them side-by-side, refine what you like."
        />
        <FeatureCard
          icon="⬡"
          title="Export the whole house"
          body="One ZIP with approved images, prompts, references, and per-room notes. Ready to hand to your contractor or interior designer."
        />
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <article className="group rounded-2xl border border-stone-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-200 hover:shadow-md">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-stone-50 text-lg text-stone-400 transition group-hover:bg-forest-500/10 group-hover:text-forest-500">
        {icon}
      </div>
      <h3 className="font-display text-xl text-stone-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p>
    </article>
  );
}
