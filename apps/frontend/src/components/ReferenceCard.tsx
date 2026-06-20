import { useState } from 'react';
import { getGenerationImageUrl } from '../api/generations';
import type { Reference } from '../api/references';
import { formatBytes } from '../lib/format';

export interface ReferenceCardProps {
  reference: Reference;
  /**
   * Called when the user confirms deletion. The parent is responsible
   * for showing the `<ConfirmDialog>` (we don't render it here so
   * the same card can be reused in different layouts).
   */
  onDelete?: (reference: Reference) => void;
  /**
   * When true, shows a delete button. The RoomDetailPage might want
   * to hide the control when the room is locked (e.g. project
   * COMPLETED).
   */
  canDelete?: boolean;
}

const SOURCE_LABEL: Record<Reference['sourceType'], string> = {
  GENERATED: 'From a generation',
  EXTERNAL_URL: 'External link',
  UPLOADED: 'Uploaded image',
};

/**
 * F8 visual card for a single reference inside a room's references
 * list. Renders the appropriate thumbnail for the source type:
 *  - GENERATED → the backend proxy URL for the generation's image
 *  - UPLOADED  → the short-TTL signed URL returned on read
 *  - EXTERNAL_URL → a text-only link with a favicon-ish glyph
 */
export function ReferenceCard({ reference, onDelete, canDelete = true }: ReferenceCardProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const imageUrl = pickImageUrl(reference);

  return (
    <article
      data-testid={`reference-card-${reference.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {reference.sourceType === 'EXTERNAL_URL' ? (
          <a
            href={reference.externalUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sand-50 to-stone-100 p-4 text-center text-sm font-medium text-forest-700 hover:underline"
          >
            {reference.externalUrl}
          </a>
        ) : imageUrl && !imageBroken ? (
          <img
            src={imageUrl}
            alt={reference.caption ?? `${SOURCE_LABEL[reference.sourceType]} reference`}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 p-3 text-center text-sm text-stone-500"
            data-testid="reference-card-placeholder"
          >
            {imageBroken ? 'Image could not be loaded' : SOURCE_LABEL[reference.sourceType]}
          </div>
        )}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-cream-50/95 px-2.5 py-1 text-xs font-medium text-stone-700 shadow-sm">
          {SOURCE_LABEL[reference.sourceType]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {reference.caption ? (
          <p className="text-sm text-stone-700">{reference.caption}</p>
        ) : (
          <p className="text-xs italic text-stone-400">No caption</p>
        )}
        <ReferenceMeta reference={reference} />
        <div className="mt-auto flex items-center justify-end pt-2">
          {canDelete && onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(reference)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
              data-testid={`reference-delete-${reference.id}`}
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function pickImageUrl(reference: Reference): string | null {
  if (reference.sourceType === 'GENERATED') {
    if (!reference.sourceId) return null;
    return getGenerationImageUrl({ id: reference.sourceId, status: 'COMPLETED' });
  }
  if (reference.sourceType === 'UPLOADED') {
    return reference.url ?? null;
  }
  return null;
}

function ReferenceMeta({ reference }: { reference: Reference }) {
  if (reference.sourceType === 'UPLOADED') {
    const size =
      reference.byteSize !== null && reference.byteSize !== undefined
        ? formatBytes(reference.byteSize)
        : null;
    return (
      <p className="text-xs text-stone-400">
        {reference.originalFilename ?? 'upload'}
        {reference.mimeType ? ` · ${reference.mimeType}` : ''}
        {size ? ` · ${size}` : ''}
      </p>
    );
  }
  if (reference.sourceType === 'EXTERNAL_URL') {
    return (
      <p className="truncate text-xs text-stone-400" title={reference.externalUrl ?? ''}>
        {reference.externalUrl}
      </p>
    );
  }
  return <p className="text-xs text-stone-400">Option {reference.sourceId?.slice(0, 8) ?? '—'}</p>;
}
