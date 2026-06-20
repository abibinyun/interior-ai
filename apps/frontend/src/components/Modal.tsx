import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Optional footer slot (e.g. action buttons). */
  footer?: ReactNode;
  /** ARIA label for the close button; defaults to "Close". */
  closeLabel?: string;
}

/**
 * Accessible modal dialog. Built with a native `<dialog>` element so
 * we get focus trapping + escape-to-close + scroll lock for free.
 *
 * Usage:
 *   <Modal open={isOpen} onClose={() => setIsOpen(false)} title="…">
 *     <form>…</form>
 *   </Modal>
 *
 * The parent owns the `open` state. We expose `onClose` rather than
 * mutating the open state directly so the parent can intercept and
 * guard against closing with unsaved changes.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = 'Close',
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Cancel event fires on <dialog> when the user presses Escape or
  // clicks the backdrop. Forward it as onClose.
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClose={onClose}
      className="w-full max-w-lg rounded-2xl border border-stone-100 bg-white p-0 shadow-xl backdrop:bg-stone-900/30"
      aria-labelledby="modal-title"
    >
      <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-4">
        <div>
          <h2 id="modal-title" className="font-display text-lg font-semibold text-stone-900">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer ? (
        <div className="flex justify-end gap-2 border-t border-stone-100 bg-stone-50/60 px-6 py-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}