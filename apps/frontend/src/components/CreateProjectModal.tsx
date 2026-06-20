import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/error';
import { Modal } from './Modal';
import { TextAreaField, TextField } from './FormField';
import { useCreateProject } from '../hooks/useCreateProject';

export interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Create Project modal — posts to `POST /api/projects` and routes to
 * the new project's detail page on success.
 *
 * Field-level errors come from the backend's `error.fields` map
 * (populated by the global ValidationPipe per M15). The hook surfaces
 * the thrown `ApiError`, which we render below each input.
 */
export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateProject({
    onSuccess: (project) => {
      onClose();
      setName('');
      setDescription('');
      navigate(`/projects/${project.id}`);
    },
  });

  // Per-field errors pulled from the backend envelope.
  const fieldErrors =
    create.error instanceof ApiError && create.error.fields ? create.error.fields : {};
  // Top-level error (e.g. CONFLICT for duplicate name).
  const topLevelError =
    create.error && (!fieldErrors || Object.keys(fieldErrors).length === 0)
      ? create.error
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      name: name.trim(),
      description: description.trim() ? description.trim() : undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a new project"
      description="One project per house or room set."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={create.isPending}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-project-form"
            disabled={create.isPending || name.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create project'}
          </button>
        </>
      }
    >
      <form id="create-project-form" onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="Project name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Dream House"
          maxLength={80}
          autoFocus
          error={fieldErrors.name ?? null}
          helper="Up to 80 characters. You can rename later."
        />
        <TextAreaField
          label="Description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this project is about (optional)"
          maxLength={1000}
          error={fieldErrors.description ?? null}
          helper="Up to 1000 characters."
        />
        {topLevelError ? (
          <p role="alert" className="text-sm text-clay-500">
            {topLevelError.message ?? 'Could not create the project.'}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}