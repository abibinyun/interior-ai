import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RoomDashboardCard } from './RoomDashboardCard';
import type { RoomDashboardCardProps } from './RoomDashboardCard';

function makeRoom(overrides: Partial<RoomDashboardCardProps['room']> = {}) {
  return {
    id: 'r_42',
    projectId: 'p_1',
    roomType: 'LIVING_ROOM',
    status: 'IN_REVIEW' as const,
    approvedGenerationId: null,
    ...overrides,
  };
}

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const PROJECT_ID = 'p_1';

describe('<RoomDashboardCard />', () => {
  it('shows a placeholder (no image) when there is no approved generation', () => {
    renderInRouter(<RoomDashboardCard room={makeRoom()} projectId={PROJECT_ID} />);
    expect(screen.getByTestId('room-dashboard-placeholder')).toHaveTextContent('Living Room');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows an image when an approved generation id is set', () => {
    renderInRouter(
      <RoomDashboardCard
        room={makeRoom({
          status: 'APPROVED',
          approvedGenerationId: 'g_99',
        })}
        projectId={PROJECT_ID}
      />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/images/generations/g_99');
    expect(img).toHaveAttribute('alt', 'Living Room approved design');
    expect(screen.getByText('✓ Approved')).toBeInTheDocument();
  });

  it('does not render the Design Next Room CTA by default', () => {
    renderInRouter(
      <RoomDashboardCard
        room={makeRoom({ status: 'APPROVED', approvedGenerationId: 'g_99' })}
        projectId={PROJECT_ID}
      />,
    );
    expect(screen.queryByTestId('design-next-room-r_42')).not.toBeInTheDocument();
  });

  it('renders the Design Next Room CTA when showDesignNextCta is true and the room is approved', () => {
    renderInRouter(
      <RoomDashboardCard
        room={makeRoom({ status: 'APPROVED', approvedGenerationId: 'g_99' })}
        projectId={PROJECT_ID}
        showDesignNextCta
      />,
    );
    const cta = screen.getByTestId('design-next-room-r_42');
    expect(cta).toHaveAttribute('href', `/projects/${PROJECT_ID}/rooms`);
    expect(cta).toHaveTextContent('Design next room');
  });

  it('does not render the Design Next Room CTA on non-approved rooms even with showDesignNextCta', () => {
    renderInRouter(
      <RoomDashboardCard room={makeRoom()} projectId={PROJECT_ID} showDesignNextCta />,
    );
    expect(screen.queryByTestId('design-next-room-r_42')).not.toBeInTheDocument();
  });

  it('renders the status chip with the friendly label for each status', () => {
    const { rerender } = renderInRouter(
      <RoomDashboardCard room={makeRoom({ status: 'BRIEF_DRAFT' })} projectId={PROJECT_ID} />,
    );
    expect(screen.getByText('Brief draft')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <RoomDashboardCard room={makeRoom({ status: 'IN_REVIEW' })} projectId={PROJECT_ID} />
      </MemoryRouter>,
    );
    expect(screen.getByText('In review')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <RoomDashboardCard room={makeRoom({ status: 'GENERATING' })} projectId={PROJECT_ID} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Generating')).toBeInTheDocument();
  });

  it('links the thumbnail area to the room detail page', () => {
    renderInRouter(
      <RoomDashboardCard room={makeRoom({ id: 'r_77' })} projectId={PROJECT_ID} />,
    );
    const link = screen.getByRole('link', { name: /open living room/i });
    expect(link).toHaveAttribute('href', '/rooms/r_77');
  });

  it('uses the placeholderLabel override when provided', () => {
    renderInRouter(
      <RoomDashboardCard
        room={makeRoom()}
        projectId={PROJECT_ID}
        placeholderLabel="No image yet"
      />,
    );
    expect(screen.getByTestId('room-dashboard-placeholder')).toHaveTextContent('No image yet');
  });
});
