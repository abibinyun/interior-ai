export interface ProjectProgressProps {
  /**
   * Total number of rooms in the project. Always rendered, even
   * before the user adds any rooms (shows "0 of 0 approved").
   */
  total: number;
  /**
   * Count of rooms currently in `APPROVED` status.
   */
  approved: number;
}

/**
 * F7 compact "X of N rooms approved" indicator. The bar fills
 * proportionally; the label always shows the raw counts so the
 * user can see at-a-glance how close they are to "Mark house
 * complete".
 */
export function ProjectProgress({ total, approved }: ProjectProgressProps) {
  const percent = total === 0 ? 0 : Math.round((approved / total) * 100);
  const allDone = total > 0 && approved === total;
  return (
    <section
      aria-label="Project progress"
      data-testid="project-progress"
      className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-semibold text-stone-900">
          {allDone ? 'All rooms approved' : 'Progress'}
        </h2>
        <span className="text-xs text-stone-500" data-testid="project-progress-counts">
          {approved} of {total} approved
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-stone-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={`h-full transition-[width] ${allDone ? 'bg-forest-500' : 'bg-sand-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}
