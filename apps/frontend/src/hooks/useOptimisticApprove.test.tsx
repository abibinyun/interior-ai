import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/error';
import { useOptimisticApprove } from './useOptimisticApprove';
import type * as GenerationsApi from '../api/generations';

const approveMock = vi.fn();
vi.mock('../api/generations', async () => {
  const actual = await vi.importActual<typeof GenerationsApi>('../api/generations');
  return {
    ...actual,
    approve: (...args: unknown[]) => approveMock(...args),
  };
});

function makeWrapper(initialRoom: { id: string; approvedGenerationId: string | null; status: string }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(['rooms', initialRoom.id], {
    ...initialRoom,
    roomType: 'LIVING_ROOM',
    projectId: 'p_1',
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    QueryClientProvider({ client: qc, children });
  return { qc, wrapper };
}

describe('useOptimisticApprove', () => {
  beforeEach(() => {
    approveMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flips the room status to APPROVED optimistically before the server returns', async () => {
    approveMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: 'APPROVED' }), 50)),
    );
    const { qc, wrapper } = makeWrapper({ id: 'r_1', approvedGenerationId: null, status: 'IN_REVIEW' });

    const { result } = renderHook(() => useOptimisticApprove(), { wrapper });

    act(() => {
      result.current.mutate({ roomId: 'r_1', generationId: 'g_99' });
    });

    // Optimistic: the room should be APPROVED + approvedGenerationId='g_99'
    // before the mutation actually resolves.
    await waitFor(() => {
      const room = qc.getQueryData<{ approvedGenerationId: string | null; status: string }>([
        'rooms',
        'r_1',
      ]);
      expect(room?.approvedGenerationId).toBe('g_99');
      expect(room?.status).toBe('APPROVED');
    });
  });

  it('rolls back to the previous state when the server returns an error', async () => {
    approveMock.mockRejectedValue(new ApiError(409, 'CONFLICT'));
    const { qc, wrapper } = makeWrapper({ id: 'r_1', approvedGenerationId: null, status: 'IN_REVIEW' });

    const { result } = renderHook(() => useOptimisticApprove(), { wrapper });

    act(() => {
      result.current.mutate({ roomId: 'r_1', generationId: 'g_99' });
    });

    // Wait for the rollback to happen (onError path).
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const room = qc.getQueryData<{ approvedGenerationId: string | null; status: string }>([
      'rooms',
      'r_1',
    ]);
    expect(room?.approvedGenerationId).toBeNull();
    expect(room?.status).toBe('IN_REVIEW');
  });
});