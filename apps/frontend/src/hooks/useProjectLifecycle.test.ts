import { describe, expect, it } from 'vitest';
import { countRoomStatuses } from './useProjectLifecycle';
import type { ProjectWithRelations } from '../api/projects';

function makeProject(rooms: Array<{ status: string }>): ProjectWithRelations {
  return {
    id: 'p_1',
    name: 'Test',
    description: null,
    status: 'IN_PROGRESS',
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    completedAt: null,
    styleProfile: null,
    rooms: rooms.map((r, i) => ({
      id: `r_${i}`,
      projectId: 'p_1',
      roomType: 'LIVING_ROOM',
      status: r.status,
      approvedGenerationId: null,
      updatedAt: '2026-06-20T00:00:00.000Z',
    })),
  };
}

describe('countRoomStatuses', () => {
  it('returns zeros for undefined', () => {
    expect(countRoomStatuses(undefined)).toEqual({ total: 0, approved: 0 });
  });

  it('counts only APPROVED rooms', () => {
    const summary = countRoomStatuses(
      makeProject([
        { status: 'APPROVED' },
        { status: 'IN_REVIEW' },
        { status: 'BRIEF_DRAFT' },
        { status: 'APPROVED' },
      ]),
    );
    expect(summary).toEqual({ total: 4, approved: 2 });
  });

  it('counts total correctly when nothing is approved', () => {
    const summary = countRoomStatuses(
      makeProject([{ status: 'IN_REVIEW' }, { status: 'BRIEF_DRAFT' }]),
    );
    expect(summary).toEqual({ total: 2, approved: 0 });
  });

  it('treats a zero-room project as 0 of 0', () => {
    expect(countRoomStatuses(makeProject([]))).toEqual({ total: 0, approved: 0 });
  });
});
