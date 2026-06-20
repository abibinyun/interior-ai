import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../lib/error';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  describeUploadLimits,
  isAllowedImageMimeType,
} from '../lib/upload-limits';
import { Modal } from './Modal';
import { SelectField, TextAreaField, TextField } from './FormField';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';
import { formatBytes } from '../lib/format';
import { useGenerationsByRoom } from '../hooks/useGenerations';
import { useAddReference } from '../hooks/useReferences';
import { useUploadReferenceWithProgress } from '../hooks/useUploadReferenceWithProgress';

export interface AddReferenceModalProps {
  open: boolean;
  roomId: string;
  onClose: () => void;
  /**
   * Called after a successful add/upload so the parent can show
   * a toast or navigate. The hook-level cache invalidation already
   * refreshes the references list.
   */
  onCreated?: () => void;
}

type Tab = 'GENERATED' | 'EXTERNAL_URL' | 'UPLOADED';

const TAB_LABEL: Record<Tab, string> = {
  GENERATED: 'From a generation',
  EXTERNAL_URL: 'External link',
  UPLOADED: 'Upload an image',
};

const TAB_ORDER: ReadonlyArray<Tab> = ['GENERATED', 'EXTERNAL_URL', 'UPLOADED'];

/**
 * F8 tabbed modal for adding a reference to a room. Three flows:
 *
 *  - **GENERATED**   pick a generation in this room (loaded via
 *    `useGenerationsByRoom`); backend rejects cross-room with 404.
 *  - **EXTERNAL_URL** paste a link (validated client-side; backend
 *    re-validates with `@IsUrl`).
 *  - **UPLOADED**    file picker with client-side MIME + size
 *    validation (DoD: 12 MB → blocked before any backend call).
 *    Live upload progress via `useUploadReferenceWithProgress`.
 *
 * Each tab delegates to the relevant mutation hook; this component
 * only orchestrates the UI and surfaces backend errors via the
 * shared `<ErrorState />`.
 */
export function AddReferenceModal({ open, roomId, onClose, onCreated }: AddReferenceModalProps) {
  const [tab, setTab] = useState<Tab>('GENERATED');
  const [caption, setCaption] = useState('');

  // Reset internal state every time the modal closes.
  useEffect(() => {
    if (!open) {
      setTab('GENERATED');
      setCaption('');
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add reference"
      description="Pick a source. Generations and external links go in instantly; uploads stream while the file is sent."
      data-testid="add-reference-modal"
    >
      <div role="tablist" aria-label="Reference source" className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1">
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === t
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            data-testid={`add-reference-tab-${t}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <TextAreaField
        label="Caption (optional)"
        name="caption"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={500}
        placeholder="Why is this reference here?"
        helper="Up to 500 characters. Helps future you remember the intent."
      />

      <div className="mt-4">
        {tab === 'GENERATED' ? (
          <GeneratedTab roomId={roomId} caption={caption} onDone={onCreated} onClose={onClose} />
        ) : tab === 'EXTERNAL_URL' ? (
          <ExternalUrlTab roomId={roomId} caption={caption} onDone={onCreated} onClose={onClose} />
        ) : (
          <UploadTab roomId={roomId} caption={caption} onDone={onCreated} onClose={onClose} />
        )}
      </div>
    </Modal>
  );
}

function GeneratedTab({
  roomId,
  caption,
  onDone,
  onClose,
}: {
  roomId: string;
  caption: string;
  onDone?: () => void;
  onClose: () => void;
}) {
  const gens = useGenerationsByRoom(roomId);
  const add = useAddReference(roomId);
  const [selected, setSelected] = useState('');

  const options = useMemo(() => {
    const items = gens.data?.items ?? [];
    // Only COMPLETED generations are referenceable (others have no
    // image to point at). Server enforces this too, but filtering
    // client-side avoids a guaranteed-failing submit.
    return items
      .filter((g) => g.status === 'COMPLETED')
      .map((g) => ({
        value: g.id,
        label: `Option ${g.optionIndex} · ${new Date(g.createdAt).toLocaleString()}`,
      }));
  }, [gens.data]);

  if (gens.isPending) return <Skeleton className="h-24 w-full" />;
  if (gens.isError)
    return <ErrorState error={gens.error} onRetry={() => gens.refetch()} />;

  if (options.length === 0) {
    return (
      <p className="text-sm text-stone-500" data-testid="no-generations-hint">
        Generate at least one option first — references can only point to completed generations.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <SelectField
        label="Generation"
        name="generationId"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        helper="Pick a completed option from this room."
      >
        <option value="" disabled>
          Choose a generation…
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      {add.isError ? (
        <ErrorState
          error={add.error}
          onRetry={() => {
            if (!selected) return;
            add.mutate(
              { sourceType: 'GENERATED', sourceId: selected, caption: caption || undefined },
              {
                onSuccess: () => {
                  setSelected('');
                  onDone?.();
                  onClose();
                },
              },
            );
          }}
        />
      ) : null}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (!selected) return;
            add.mutate(
              { sourceType: 'GENERATED', sourceId: selected, caption: caption || undefined },
              {
                onSuccess: () => {
                  setSelected('');
                  onDone?.();
                  onClose();
                },
              },
            );
          }}
          disabled={!selected || add.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
          data-testid="add-reference-submit"
        >
          {add.isPending ? 'Adding…' : 'Add reference'}
        </button>
      </div>
    </div>
  );
}

function ExternalUrlTab({
  roomId,
  caption,
  onDone,
  onClose,
}: {
  roomId: string;
  caption: string;
  onDone?: () => void;
  onClose: () => void;
}) {
  const add = useAddReference(roomId);
  const [url, setUrl] = useState('');

  const trimmed = url.trim();
  const isValidUrl = useMemo(() => {
    if (!trimmed) return false;
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, [trimmed]);

  const fieldErrors =
    add.error instanceof ApiError && add.error.fields ? add.error.fields : {};

  return (
    <div className="space-y-3">
      <TextField
        label="External URL"
        name="externalUrl"
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/inspiration"
        helper="Public link to a Houzz article, Pinterest pin, etc."
        error={fieldErrors.externalUrl ?? null}
      />
      {add.isError && !fieldErrors.externalUrl ? (
        <ErrorState error={add.error} />
      ) : null}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isValidUrl) return;
            add.mutate(
              { sourceType: 'EXTERNAL_URL', externalUrl: trimmed, caption: caption || undefined },
              {
                onSuccess: () => {
                  setUrl('');
                  onDone?.();
                  onClose();
                },
              },
            );
          }}
          disabled={!isValidUrl || add.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
          data-testid="add-reference-submit"
        >
          {add.isPending ? 'Adding…' : 'Add reference'}
        </button>
      </div>
    </div>
  );
}

function UploadTab({
  roomId,
  caption,
  onDone,
  onClose,
}: {
  roomId: string;
  caption: string;
  onDone?: () => void;
  onClose: () => void;
}) {
  const upload = useUploadReferenceWithProgress(roomId);
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (next: File | null) => {
    setClientError(null);
    upload.reset();
    if (!next) {
      setFile(null);
      return;
    }
    if (!isAllowedImageMimeType(next.type)) {
      setClientError(
        `${next.type || 'Unknown type'} isn't supported. ${describeUploadLimits()}`,
      );
      setFile(null);
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      setClientError(
        `That's ${formatBytes(next.size)}. ${describeUploadLimits()}`,
      );
      setFile(null);
      return;
    }
    setFile(next);
  };

  const fieldErrors =
    upload.error instanceof ApiError && upload.error.fields ? upload.error.fields : {};

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-sm font-medium text-stone-800">Image file</span>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
          data-testid="upload-input"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-stone-700 file:mr-3 file:rounded-xl file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-cream-50 hover:file:bg-stone-700"
        />
        <span className="mt-1 block text-xs text-stone-400">{describeUploadLimits()}</span>
      </label>

      {file ? (
        <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <span className="truncate" data-testid="upload-file-summary">
            {file.name} · {formatBytes(file.size)}
          </span>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="text-xs text-stone-500 hover:text-stone-900"
          >
            Clear
          </button>
        </div>
      ) : null}

      {upload.progress ? (
        <div data-testid="upload-progress" className="space-y-1">
          <div className="flex justify-between text-xs text-stone-500">
            <span>Uploading…</span>
            <span>{upload.progress.percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full bg-forest-500 transition-[width]"
              style={{ width: `${upload.progress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {clientError ? (
        <p
          role="alert"
          data-testid="upload-client-error"
          className="rounded-xl border border-clay-500/30 bg-clay-500/5 px-3 py-2 text-sm text-clay-500"
        >
          {clientError}
        </p>
      ) : null}

      {Object.keys(fieldErrors).length > 0 ? (
        <ul className="space-y-1 text-xs text-clay-500">
          {Object.entries(fieldErrors).map(([k, v]) => (
            <li key={k}>
              <span className="font-mono">{k}</span>: {v}
            </li>
          ))}
        </ul>
      ) : null}

      {upload.isError && Object.keys(fieldErrors).length === 0 && !clientError ? (
        <ErrorState error={upload.error} />
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={upload.isPending}
          className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (!file) return;
            upload.mutate(
              { file, caption: caption || undefined },
              {
                onSuccess: () => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = '';
                  onDone?.();
                  onClose();
                },
              },
            );
          }}
          disabled={!file || upload.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
          data-testid="add-reference-submit"
        >
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </div>
  );
}
