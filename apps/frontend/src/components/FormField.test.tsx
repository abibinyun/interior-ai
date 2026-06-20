import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextAreaField, TextField } from './FormField';

describe('<TextField />', () => {
  it('renders the label, input, and helper text', () => {
    render(<TextField label="Name" name="name" helper="Up to 80 chars" placeholder="Type here" />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
    expect(screen.getByText('Up to 80 chars')).toBeInTheDocument();
  });

  it('shows the required asterisk', () => {
    render(<TextField label="Name" name="name" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders the error in place of the helper', () => {
    render(<TextField label="Name" name="name" error="required" helper="ignored" />);
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });

  it('fires onChange', () => {
    const onChange = vi.fn();
    render(<TextField label="Name" name="name" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('<TextAreaField />', () => {
  it('renders the textarea with rows', () => {
    render(<TextAreaField label="Notes" name="notes" rows={4} />);
    const ta = screen.getByLabelText('Notes');
    expect(ta.tagName).toBe('TEXTAREA');
    expect((ta as HTMLTextAreaElement).rows).toBe(4);
  });

  it('shows the error when provided', () => {
    render(<TextAreaField label="Notes" name="notes" error="too long" />);
    expect(screen.getByText('too long')).toBeInTheDocument();
  });
});