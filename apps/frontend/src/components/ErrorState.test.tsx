import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/error';
import { ErrorState } from './ErrorState';

describe('<ErrorState />', () => {
  it('renders a friendly title and message for an ApiError', () => {
    render(
      <ErrorState
        error={new ApiError(401, 'UNAUTHENTICATED', {
          message: 'Missing or invalid session.',
          traceId: 'req_test_xyz',
        })}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Session expired' })).toBeInTheDocument();
    expect(screen.getByText(/your session expired/i)).toBeInTheDocument();
    expect(screen.getByText('req_test_xyz')).toBeInTheDocument();
  });

  it('renders the retry button when onRetry is given', () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(500, 'INTERNAL')} onRetry={onRetry} />);
    const button = screen.getByRole('button', { name: /try again/i });
    button.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the trace-id block when no traceId is present', () => {
    render(<ErrorState error={new Error('plain')} />);
    expect(screen.queryByText(/reference:/i)).not.toBeInTheDocument();
  });

  it('renders the heading as override when title is provided', () => {
    render(<ErrorState error={new ApiError(404, 'NOT_FOUND')} title="Custom heading" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Custom heading' })).toBeInTheDocument();
  });

  it('renders the per-code recovery hint when one is mapped', () => {
    render(<ErrorState error={new ApiError(404, 'NOT_FOUND')} />);
    expect(screen.getByText(/Next step/i)).toBeInTheDocument();
    expect(screen.getByText(/Go back/i)).toBeInTheDocument();
  });

  it('omits the recovery hint when the code has no suggestion', () => {
    render(<ErrorState error={new ApiError(422, 'BUSINESS_RULE_VIOLATION')} />);
    expect(screen.queryByText(/Next step/i)).not.toBeInTheDocument();
  });

  it('respects hideHint', () => {
    render(<ErrorState error={new ApiError(404, 'NOT_FOUND')} hideHint />);
    expect(screen.queryByText(/Next step/i)).not.toBeInTheDocument();
  });
});