export function LandingPage() {
  return (
    <section className="space-y-8">
      <h1 className="text-display-lg font-display font-semibold text-stone-900">
        Design every room with intention.
      </h1>
      <p className="max-w-2xl text-lg text-stone-700">
        Interior AI walks you from a blank house to a finished, downloadable design pack. Pick a
        style, brief each room, generate three options at a time, refine, and approve the ones
        that feel right.
      </p>
      <div className="flex gap-3">
        <a
          href="/projects"
          className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-medium text-cream-50 hover:bg-stone-700"
        >
          Start a project
        </a>
        <a
          href="/projects"
          className="rounded-xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Browse existing
        </a>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        <article className="placeholder-card">
          <h3 className="font-display text-xl">Pick a style</h3>
          <p className="mt-2 text-sm text-stone-600">
            Japandi, Scandinavian, Mid-century — every room you generate carries the same
            house-wide language.
          </p>
        </article>
        <article className="placeholder-card">
          <h3 className="font-display text-xl">Generate, three at a time</h3>
          <p className="mt-2 text-sm text-stone-600">
            Brief the room, get three options, compare them side-by-side, refine what you like.
          </p>
        </article>
        <article className="placeholder-card">
          <h3 className="font-display text-xl">Export the whole house</h3>
          <p className="mt-2 text-sm text-stone-600">
            One ZIP with approved images, prompts, references, and per-room notes. Ready to hand
            to your contractor or interior designer.
          </p>
        </article>
      </div>
    </section>
  );
}