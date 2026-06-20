import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BundleCard } from './BundleCard';
import type { ListedExportBundle } from '../api/exports';

function makeBundle(overrides: Partial<ListedExportBundle> = {}): ListedExportBundle {
  return {
    id: 'b_1',
    projectId: 'p_1',
    version: 1,
    byteSize: 1_234_567,
    createdAt: '2026-06-20T12:00:00.000Z',
    ...overrides,
  };
}

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('<BundleCard />', () => {
  it('renders the version, size, and creation date', () => {
    renderInRouter(<BundleCard bundle={makeBundle({ version: 3, byteSize: 5_242_880 })} />);
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText(/5\.0\s*MB|5\s*MB/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 20, 2026/)).toBeInTheDocument();
  });

  it('shows the Latest badge when isLatest is true', () => {
    renderInRouter(<BundleCard bundle={makeBundle()} isLatest />);
    expect(screen.getByTestId('bundle-latest-badge')).toHaveTextContent('Latest');
  });

  it('hides the Latest badge when isLatest is false', () => {
    renderInRouter(<BundleCard bundle={makeBundle()} />);
    expect(screen.queryByTestId('bundle-latest-badge')).not.toBeInTheDocument();
  });

  it('renders a Preview link when previewHref is provided', () => {
    renderInRouter(<BundleCard bundle={makeBundle({ id: 'b_99' })} previewHref="/exports/b_99" />);
    const link = screen.getByTestId('bundle-preview-link-b_99');
    expect(link).toHaveAttribute('href', '/exports/b_99');
    expect(link).toHaveTextContent(/Preview/);
  });

  it('omits the Preview link when previewHref is not provided', () => {
    renderInRouter(<BundleCard bundle={makeBundle()} />);
    expect(screen.queryByRole('link', { name: /Preview/ })).not.toBeInTheDocument();
  });
});
