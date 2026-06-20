import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../lib/error';
import { ErrorState } from '../components/ErrorState';
import { Modal } from '../components/Modal';
import { ProjectProgress } from '../components/ProjectProgress';
import { RoomStatusChip } from '../components/RoomStatusChip';
import { SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import { useCreateRoom, useProjectRooms } from '../hooks/useProjectRooms';
import { useProject } from '../hooks/useProject';
import { summarizeRoomStatuses } from '../lib/room-progress';
import { useState } from 'react';
import type { RoomType } from '../api/rooms';

const ROOM_TYPE_OPTIONS: Array<{ value: RoomType; label: string }> = [
  { value: 'LIVING_ROOM', label: 'Living Room' },
  { value: 'DINING_ROOM', label: 'Dining Room' },
  { value: 'KITCHEN', label: 'Kitchen' },
  { value: 'MASTER_BEDROOM', label: 'Master Bedroom' },
  { value: 'BATHROOM', label: 'Bathroom' },
  { value: 'WORKSPACE', label: 'Workspace' },
];

/**
 * F3 Rooms page — list every room in the project, with status chips,
 * and an "Add room" inline modal that posts to
 * `POST /api/projects/:id/rooms`.
 */
export function RoomsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const rooms = useProjectRooms(projectId);
  const createRoom = useCreateRoom(projectId ?? '');
  const [open, setOpen] = useState(false);

  if (!projectId) return <p className="text-stone-500">No project id in the URL.</p>;

  if (project.isPending || rooms.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />;
  if (rooms.isError) return <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />;

  const fieldErrors =
    createRoom.error instanceof ApiError && createRoom.error.fields
      ? createRoom.error.fields
      : {};

  const usedTypes = new Set(rooms.data.items.map((r) => r.roomType));
  const availableOptions = ROOM_TYPE_OPTIONS.filter((o) => !usedTypes.has(o.value));
  const summary = summarizeRoomStatuses(rooms.data.items);

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to={`/projects/${projectId}`}
            className="text-xs uppercase tracking-wider text-stone-400 hover:text-stone-600"
          >
            ← {project.data.name}
          </Link>
          <h1 className="mt-1 font-display text-display-md font-semibold text-stone-900">Rooms</h1>
          <p className="mt-1 text-sm text-stone-500">
            One room per space. You can brief + generate each one separately.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={availableOptions.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
          data-testid="add-room-button"
        >
          + Add room
        </button>
      </header>

      <ProjectProgress total={summary.total} approved={summary.approved} />

      {rooms.data.items.length === 0 ? (
        <EmptyRoomsHint onAdd={() => setOpen(true)} />
) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Room list">
          {rooms.data.items.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-stone-900">
                  {humanizeRoomType(r.roomType)}
                </h3>
                <RoomStatusChip status={r.status} />
              </div>
              <p className="mt-1 text-xs text-stone-400">
                {r.approvedGenerationId ? 'Approved · ready to export' : 'No approval yet'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  to={`/rooms/${r.id}`}
                  className="text-xs font-medium text-forest-500 hover:text-forest-700"
                >
                  Brief →
                </Link>
                <span className="text-stone-200">·</span>
                <Link
                  to={`/rooms/${r.id}/generations`}
                  className="text-xs font-medium text-forest-500 hover:text-forest-700"
                >
                  Generate →
                </Link>
                {r.approvedGenerationId ? (
                  <>
                    <span className="text-stone-200">·</span>
                    <span className="text-xs text-stone-400">Ready to export</span>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddRoomModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => setOpen(false)}
        createRoom={createRoom}
        fieldErrors={fieldErrors}
        availableOptions={availableOptions}
      />
    </section>
  );
}

function humanizeRoomType(rt: RoomType): string {
  return rt
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function EmptyRoomsHint({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="placeholder-card mx-auto max-w-xl space-y-4 text-center">
      <h2 className="font-display text-2xl font-semibold text-stone-900">Add your first room</h2>
      <p className="text-stone-600">
        Each room gets its own brief, generates three options at a time, and exports as part of
        the project’s final ZIP.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700"
      >
        + Add your first room
      </button>
    </div>
  );
}

interface AddRoomModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  createRoom: ReturnType<typeof useCreateRoom>;
  fieldErrors: Record<string, string>;
  availableOptions: Array<{ value: RoomType; label: string }>;
}

function AddRoomModal({
  open,
  onClose,
  onCreated,
  createRoom,
  fieldErrors,
  availableOptions,
}: AddRoomModalProps) {
  const [selected, setSelected] = useState<RoomType | ''>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    createRoom.mutate(
      { roomType: selected },
      {
        onSuccess: () => {
          setSelected('');
          onCreated();
        },
      },
    );
  };

  if (availableOptions.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title="All room types are in use" closeLabel="Close">
        <p className="text-sm text-stone-600">
          This project already has every supported room type. Add another project to keep going.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a room"
      description="Pick a room type. You'll brief it next."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={createRoom.isPending}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-room-form"
            disabled={createRoom.isPending || !selected}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
          >
            {createRoom.isPending ? 'Adding…' : 'Add room'}
          </button>
        </>
      }
    >
      <form id="add-room-form" onSubmit={handleSubmit} className="space-y-3">
        <SelectField
          label="Room type"
          name="roomType"
          required
          value={selected}
          onChange={(e) => setSelected(e.target.value as RoomType | '')}
          error={fieldErrors.roomType ?? null}
          helper="Each project can have at most one room of each type."
        >
          <option value="" disabled>
            Choose a room…
          </option>
          {availableOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
      </form>
    </Modal>
  );
}