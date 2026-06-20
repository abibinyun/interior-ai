import { describe, expect, it } from 'vitest';
import { summarizeRoomStatuses } from './room-progress';

describe('summarizeRoomStatuses', () => {
  it('returns zeros for an empty list', () => {
    expect(summarizeRoomStatuses([])).toEqual({ total: 0, approved: 0 });
  });

  it('counts only APPROVED rooms', () => {
    const summary = summarizeRoomStatuses([
      { status: 'APPROVED' },
      { status: 'IN_REVIEW' },
      { status: 'BRIEF_DRAFT' },
      { status: 'APPROVED' },
      { status: 'GENERATING' },
    ]);
    expect(summary).toEqual({ total: 5, approved: 2 });
  });

  it('accepts loose-string statuses (e.g. from ProjectWithRelations)', () => {
    const summary = summarizeRoomStatuses([
      { status: 'APPROVED' },
      { status: 'APPROVED' },
      { status: 'IN_REVIEW' },
    ]);
    expect(summary).toEqual({ total: 3, approved: 2 });
  });

  it('treats any non-APPROVED status as not-approved', () => {
    const summary = summarizeRoomStatuses([
      { status: 'unknown_future_status' },
      { status: '' },
      { status: 'APPROVED' },
    ]);
    expect(summary.approved).toBe(1);
  });
});
