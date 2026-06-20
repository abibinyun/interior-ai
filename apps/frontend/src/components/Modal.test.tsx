import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('<Modal />', () => {
  it('renders title and description', () => {
    render(
      <Modal open={true} onClose={() => undefined} title="My modal" description="A modal">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'My modal' })).toBeInTheDocument();
    expect(screen.getByText('A modal')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders the footer when provided', () => {
    render(
      <Modal
        open={true}
        onClose={() => undefined}
        title="With footer"
        footer={<button type="button">Save</button>}
      >
        Body
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClose when the X button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Closable">
        Body
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render title as a heading when description is absent', () => {
    render(
      <Modal open={true} onClose={() => undefined} title="Just title">
        Body
      </Modal>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Just title' })).toBeInTheDocument();
  });
});