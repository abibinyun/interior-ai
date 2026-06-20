import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('<ConfirmDialog />', () => {
  it('renders the title and description', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Approve?"
        description="This will lock the design for export."
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Approve?' })).toBeInTheDocument();
    expect(screen.getByText('This will lock the design for export.')).toBeInTheDocument();
  });

  it('renders the default and custom confirm/cancel labels', () => {
    render(
      <ConfirmDialog
        open={true}
        title="t"
        confirmLabel="Yes, do it"
        cancelLabel="Never mind"
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Yes, do it' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Never mind' })).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="t"
        onConfirm={onConfirm}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="t"
        onConfirm={() => undefined}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons when pending', () => {
    render(
      <ConfirmDialog
        open={true}
        title="t"
        pending={true}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});