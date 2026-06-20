export interface StyleAnchorBannerProps {
  /**
   * The consistency anchor string from `GET /api/rooms/:id`. Null
   * when the project has no style profile AND no approved rooms
   * (per CA-01); the banner does not render in that case.
   */
  anchor: string | null | undefined;
}

/**
 * F7 read-only summary card that surfaces the project's
 * consistency anchor at the top of room screens.
 *
 * The anchor is the server-computed string that subsequent
 * generations inherit — surfacing it in the UI helps the user
 * understand "why does the new batch feel consistent with the
 * rest of the house?". The text itself is server-controlled
 * (never user-editable) so we render it verbatim, no escaping.
 */
export function StyleAnchorBanner({ anchor }: StyleAnchorBannerProps) {
  if (!anchor) return null;
  return (
    <aside
      role="note"
      aria-label="House-wide design language"
      data-testid="style-anchor-banner"
      className="rounded-2xl border border-forest-500/30 bg-forest-500/5 p-4 text-sm text-stone-700 shadow-sm"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-forest-500/15 text-[10px] font-semibold uppercase tracking-wider text-forest-700">
          CA
        </span>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-forest-700">
          House-wide design language
        </h2>
      </div>
      <p className="text-stone-700">{anchor}</p>
    </aside>
  );
}
