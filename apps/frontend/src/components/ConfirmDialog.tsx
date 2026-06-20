import type { ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Lightweight confirmation modal. Used by Approve, Reopen, and any
 * future destructive-ish flow that needs a single tap-to-confirm.
 *
 * The `destructive` flag toggles the confirm button color to the
 * clay/red palette so the user gets a visual cue that the action is
 * not easily reversible.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const confirmClass = destructive
    ? 'inline-flex items-center gap-2 rounded-xl bg-clay-500 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-clay-500/90 disabled:opacity-50'
    : 'inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-stone-700 disabled:opacity-50';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={confirmClass}
            data-testid="confirm-dialog-confirm"
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-stone-700">{description}</div>
    </Modal>
  );
}