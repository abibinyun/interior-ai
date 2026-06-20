import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ProjectProgress } from './ProjectProgress';

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('<ProjectProgress />', () => {
  it('shows "0 of 0 approved" with an empty bar when no rooms exist', () => {
    renderInRouter(<ProjectProgress total={0} approved={0} />);
    expect(screen.getByTestId('project-progress-counts')).toHaveTextContent('0 of 0 approved');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows the raw counts in the label', () => {
    renderInRouter(<ProjectProgress total={4} approved={2} />);
    expect(screen.getByTestId('project-progress-counts')).toHaveTextContent('2 of 4 approved');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('shows "All rooms approved" when total > 0 and approved === total', () => {
    renderInRouter(<ProjectProgress total={3} approved={3} />);
    expect(screen.getByText('All rooms approved')).toBeInTheDocument();
    expect(screen.getByTestId('project-progress-counts')).toHaveTextContent('3 of 3 approved');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('rounds the percent for non-divisible totals', () => {
    renderInRouter(<ProjectProgress total={3} approved={1} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  });
});
