import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('<EmptyState />', () => {
  it('renders the title', () => {
    render(<EmptyState title="Nothing here yet" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing here yet' })).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="Empty" description="Try creating one." />);
    expect(screen.getByText('Try creating one.')).toBeInTheDocument();
  });

  it('renders the action when provided', () => {
    render(
      <EmptyState
        title="Empty"
        action={<button type="button">Create</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });
});