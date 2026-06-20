import { useEffect, useState } from 'react';
import { ApiError } from '../lib/error';
import { useUpdateBrief } from '../hooks/useRoomBrief';
import type { DesignBrief, Room } from '../api/rooms';
import { TextAreaField } from './FormField';

export interface BriefEditorProps {
  room: Room;
}

/**
 * F4 Design Brief editor.
 *
 * Five free-text fields from `UpdateBriefDto`. Pre-populated from
 * `room.designBrief` on first load; subsequent edits are
 * client-state until "Save brief" is clicked (avoids hammering the
 * backend on every keystroke).
 */
export function BriefEditor({ room }: BriefEditorProps) {
  const initial: Partial<DesignBrief> = room.designBrief ?? {};
  const [purpose, setPurpose] = useState(initial.purpose ?? '');
  const [occupants, setOccupants] = useState(initial.occupants ?? '');
  const [lightingPreferences, setLightingPreferences] = useState(
    initial.lightingPreferences ?? '',
  );
  const [furnitureRequirements, setFurnitureRequirements] = useState(
    initial.furnitureRequirements ?? '',
  );
  const [constraints, setConstraints] = useState(initial.constraints ?? '');
  const update = useUpdateBrief(room.id);

  // Re-seed when the room's brief changes (e.g., after a successful save).
  useEffect(() => {
    if (room.designBrief) {
      const b = room.designBrief;
      setPurpose(b.purpose ?? '');
      setOccupants(b.occupants ?? '');
      setLightingPreferences(b.lightingPreferences ?? '');
      setFurnitureRequirements(b.furnitureRequirements ?? '');
      setConstraints(b.constraints ?? '');
    }
  }, [room.designBrief]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({
      purpose: purpose.trim() || undefined,
      occupants: occupants.trim() || undefined,
      lightingPreferences: lightingPreferences.trim() || undefined,
      furnitureRequirements: furnitureRequirements.trim() || undefined,
      constraints: constraints.trim() || undefined,
    });
  };

  const fieldErrors =
    update.error instanceof ApiError && update.error.fields ? update.error.fields : {};

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-testid="brief-editor">
      <TextAreaField
        label="Purpose"
        name="purpose"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        placeholder="What is this room for? (e.g. Family relaxation)"
        rows={2}
        helper="1–2 sentences. Sets the room's headline intent."
        error={fieldErrors.purpose ?? null}
      />
      <TextAreaField
        label="Occupants"
        name="occupants"
        value={occupants}
        onChange={(e) => setOccupants(e.target.value)}
        placeholder="Who uses it? (e.g. Two adults, one child, one cat)"
        rows={2}
        helper="Helps the AI right-size furniture and circulation."
        error={fieldErrors.occupants ?? null}
      />
      <TextAreaField
        label="Lighting preferences"
        name="lightingPreferences"
        value={lightingPreferences}
        onChange={(e) => setLightingPreferences(e.target.value)}
        placeholder="Natural, dimmable, warm, task-focused…"
        rows={2}
        error={fieldErrors.lightingPreferences ?? null}
      />
      <TextAreaField
        label="Furniture requirements"
        name="furnitureRequirements"
        value={furnitureRequirements}
        onChange={(e) => setFurnitureRequirements(e.target.value)}
        placeholder="Sectional, dining table for 6, etc."
        rows={2}
        error={fieldErrors.furnitureRequirements ?? null}
      />
      <TextAreaField
        label="Constraints"
        name="constraints"
        value={constraints}
        onChange={(e) => setConstraints(e.target.value)}
        placeholder="Anything you can't change (radiator, load-bearing wall, etc.)"
        rows={2}
        error={fieldErrors.constraints ?? null}
      />

      <div className="flex items-center justify-end gap-3">
        {update.isSuccess && !update.isPending ? (
          <span className="text-xs text-forest-700" role="status">
            Saved
          </span>
        ) : null}
        <button
          type="submit"
          disabled={update.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : room.designBrief ? 'Update brief' : 'Save brief'}
        </button>
      </div>
    </form>
  );
}