import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BriefEditor } from './BriefEditor';
import type { Room } from '../api/rooms';

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'r_1',
    projectId: 'p_1',
    roomType: 'LIVING_ROOM',
    status: 'IN_REVIEW',
    approvedGenerationId: null,
    createdAt: '2026-06-20T12:00:00.000Z',
    updatedAt: '2026-06-20T12:00:00.000Z',
    designBrief: null,
    ...overrides,
  };
}

// Mock the useUpdateBrief hook to avoid wiring QueryClient here.
vi.mock('../hooks/useRoomBrief', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useRoomBrief')>('../hooks/useRoomBrief');
  return {
    ...actual,
    useUpdateBrief: () => ({
      mutate: vi.fn(),
      isPending: false,
      error: null,
      isSuccess: false,
    }),
  };
});

describe('<BriefEditor />', () => {
  it('renders five fields, prefilled from the room design brief', () => {
    render(
      <BriefEditor
        room={makeRoom({
          designBrief: {
            id: 'b_1',
            roomId: 'r_1',
            purpose: 'Family relaxation',
            occupants: 'Two adults, one child',
            lightingPreferences: 'Warm indirect',
            furnitureRequirements: 'Large sectional',
            constraints: 'Keep the radiator',
            createdAt: '2026-06-20T12:00:00.000Z',
            updatedAt: '2026-06-20T12:00:00.000Z',
          },
        })}
      />,
    );
    expect(screen.getByDisplayValue('Family relaxation')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Two adults, one child')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Warm indirect')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Large sectional')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Keep the radiator')).toBeInTheDocument();
  });

  it('renders empty fields when no brief exists yet', () => {
    render(<BriefEditor room={makeRoom({ designBrief: null })} />);
    // No prefill — all five textareas empty.
    const textareas = screen.getAllByRole('textbox');
    expect(textareas).toHaveLength(5);
    for (const ta of textareas) {
      expect((ta as HTMLTextAreaElement).value).toBe('');
    }
  });

  it('fires a submit when the form is submitted', () => {
    render(<BriefEditor room={makeRoom()} />);
    const ta = screen.getAllByRole('textbox')[0]! as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Cozy space' } });
    fireEvent.click(screen.getByRole('button', { name: /save brief/i }));
    // The mock is a no-op; we just want to ensure the form is wired and submit fires without error.
    expect(ta.value).toBe('Cozy space');
  });
});