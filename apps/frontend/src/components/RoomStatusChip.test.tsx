import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoomStatusChip } from './RoomStatusChip';
import type { RoomStatus } from '../api/rooms';

describe('<RoomStatusChip />', () => {
  it.each<[RoomStatus, string]>([
    ['BRIEF_DRAFT', 'Brief draft'],
    ['IN_REVIEW', 'In review'],
    ['APPROVED', 'Approved'],
    ['GENERATING', 'Generating'],
  ])('renders the friendly label for %s', (status, label) => {
    render(<RoomStatusChip status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});