import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as ProjectLifecycle from '../hooks/useProjectLifecycle';
import { ProjectCompletionCard } from './ProjectCompletionCard';
import type { ProjectWithRelations } from '../api/projects';

const completeMock = vi.fn();
const reopenMock = vi.fn();
vi.mock('../hooks/useProjectLifecycle', async () => {
  const actual = await vi.importActual<typeof ProjectLifecycle>('../hooks/useProjectLifecycle');
  return {
    ...actual,
    useCompleteProject: (projectId: string) => ({
      mutate: (input: void, opts?: { onError?: (err: unknown) => void }) =>
        completeMock(projectId, input, opts),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    }),
    useReopenProject: (projectId: string) => ({
      mutate: (input: void, opts?: { onError?: (err: unknown) => void }) =>
        reopenMock(projectId, input, opts),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    }),
  };
});

function makeProject(
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED',
  rooms: Array<{ status: string }>,
): ProjectWithRelations {
  return {
    id: 'p_1',
    name: 'Test House',
    description: null,
    status,
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    completedAt: status === 'COMPLETED' ? '2026-06-21T00:00:00.000Z' : null,
    styleProfile: null,
    rooms: rooms.map((r, i) => ({
      id: `r_${i}`,
      projectId: 'p_1',
      roomType: 'LIVING_ROOM',
      status: r.status,
      approvedGenerationId: r.status === 'APPROVED' ? `g_${i}` : null,
      updatedAt: '2026-06-20T00:00:00.000Z',
    })),
  };
}

function renderCard(project: ProjectWithRelations) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ProjectCompletionCard project={project} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('<ProjectCompletionCard />', () => {
  beforeEach(() => {
    completeMock.mockReset();
    reopenMock.mockReset();
  });

  it('shows the disabled Mark House Complete CTA when no rooms are approved', () => {
    renderCard(
      makeProject('IN_PROGRESS', [
        { status: 'BRIEF_DRAFT' },
        { status: 'IN_REVIEW' },
      ]),
    );
    const button = screen.getByTestId('mark-complete-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('completion-counts')).toHaveTextContent('0 of 2 rooms approved');
  });

  it('enables the Mark House Complete CTA when all rooms are approved', () => {
    renderCard(
      makeProject('IN_PROGRESS', [{ status: 'APPROVED' }, { status: 'APPROVED' }]),
    );
    const button = screen.getByTestId('mark-complete-button');
    expect(button).toBeEnabled();
    expect(screen.getByTestId('completion-counts')).toHaveTextContent('2 of 2 rooms approved');
  });

  it('calls completeProject on click', async () => {
    const user = userEvent.setup();
    completeMock.mockResolvedValue({});
    renderCard(makeProject('IN_PROGRESS', [{ status: 'APPROVED' }]));
    await user.click(screen.getByTestId('mark-complete-button'));
    expect(completeMock).toHaveBeenCalledWith('p_1', undefined, expect.any(Object));
  });

  it('shows the Reopen + Open exports CTAs when COMPLETED', () => {
    renderCard(makeProject('COMPLETED', [{ status: 'APPROVED' }]));
    expect(screen.getByTestId('open-exports-button')).toHaveAttribute(
      'href',
      '/projects/p_1/exports',
    );
    expect(screen.getByTestId('reopen-project-button')).toBeInTheDocument();
    expect(screen.queryByTestId('mark-complete-button')).not.toBeInTheDocument();
  });

  it('calls reopenProject when the Reopen CTA is clicked', async () => {
    const user = userEvent.setup();
    reopenMock.mockResolvedValue({});
    renderCard(makeProject('COMPLETED', [{ status: 'APPROVED' }]));
    await user.click(screen.getByTestId('reopen-project-button'));
    expect(reopenMock).toHaveBeenCalledWith('p_1', undefined, expect.any(Object));
  });
});
