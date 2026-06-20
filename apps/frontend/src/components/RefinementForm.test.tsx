import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RefinementForm } from './RefinementForm';
import type * as GenHookModule from '../hooks/useGenerations';

// Mock the useCreateBatch hook so we don't need QueryClient wiring.
vi.mock('../hooks/useGenerations', async () => {
  const actual = await vi.importActual<typeof GenHookModule>('../hooks/useGenerations');
  return {
    ...actual,
    useCreateBatch: () => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    }),
  };
});

describe('<RefinementForm />', () => {
  it('renders all 7 refinement fields', () => {
    render(<RefinementForm roomId="r_1" parentGenerationId="g_1" />);
    expect(screen.getByLabelText('Colors')).toBeInTheDocument();
    expect(screen.getByLabelText('Objects & decor')).toBeInTheDocument();
    expect(screen.getByLabelText('Furniture')).toBeInTheDocument();
    expect(screen.getByLabelText('Materials')).toBeInTheDocument();
    expect(screen.getByLabelText('Lighting')).toBeInTheDocument();
    expect(screen.getByLabelText('Layout')).toBeInTheDocument();
    expect(screen.getByLabelText('Style emphasis')).toBeInTheDocument();
  });

  it('disables the submit button until at least one field has a value', () => {
    render(<RefinementForm roomId="r_1" parentGenerationId="g_1" />);
    const btn = screen.getByRole('button', { name: /refine/i });
    expect(btn).toBeDisabled();
  });

  it('enables the submit button once any field is filled', () => {
    render(<RefinementForm roomId="r_1" parentGenerationId="g_1" />);
    const colors = screen.getByLabelText('Colors');
    fireEvent.change(colors, { target: { value: 'Deeper greens' } });
    const btn = screen.getByRole('button', { name: /refine/i });
    expect(btn).not.toBeDisabled();
  });
});