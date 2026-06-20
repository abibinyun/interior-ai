import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ReferenceCard } from './ReferenceCard';
import type { Reference } from '../api/references';

function makeReference(overrides: Partial<Reference> = {}): Reference {
  return {
    id: 'ref_1',
    roomId: 'r_1',
    sourceType: 'GENERATED',
    sourceId: 'g_99',
    storageObjectKey: null,
    externalUrl: null,
    mimeType: null,
    byteSize: null,
    originalFilename: null,
    caption: 'Inspiration for the reading nook',
    createdAt: '2026-06-20T12:00:00.000Z',
    ...overrides,
  };
}

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('<ReferenceCard />', () => {
  it('renders a GENERATED reference with the backend proxy URL and the caption', () => {
    renderInRouter(<ReferenceCard reference={makeReference()} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/images/generations/g_99');
    expect(img).toHaveAttribute('alt', 'Inspiration for the reading nook');
    expect(screen.getByText('From a generation')).toBeInTheDocument();
    expect(screen.getByText('Inspiration for the reading nook')).toBeInTheDocument();
  });

  it('renders an EXTERNAL_URL reference as a click-through card', () => {
    renderInRouter(
      <ReferenceCard
        reference={makeReference({
          sourceType: 'EXTERNAL_URL',
          externalUrl: 'https://example.com/inspo',
          sourceId: null,
        })}
      />,
    );
    const link = screen.getByRole('link', { name: /example\.com\/inspo/i });
    expect(link).toHaveAttribute('href', 'https://example.com/inspo');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('External link')).toBeInTheDocument();
  });

  it('renders an UPLOADED reference using the signed url field with caption + meta', () => {
    renderInRouter(
      <ReferenceCard
        reference={makeReference({
          id: 'ref_2',
          sourceType: 'UPLOADED',
          sourceId: null,
          storageObjectKey: 'dev/projects/p/rooms/r/references/ref_2/file.png',
          mimeType: 'image/png',
          byteSize: 2048,
          originalFilename: 'inspo.png',
          url: 'https://signed.example.com/inspo.png',
          urlExpiresAt: '2026-06-20T12:15:00.000Z',
        })}
      />,
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://signed.example.com/inspo.png');
    expect(screen.getByText('Uploaded image')).toBeInTheDocument();
    expect(screen.getByText(/inspo\.png/)).toBeInTheDocument();
  });

  it('shows a "No caption" fallback when caption is null', () => {
    renderInRouter(<ReferenceCard reference={makeReference({ caption: null })} />);
    expect(screen.getByText('No caption')).toBeInTheDocument();
  });

  it('calls onDelete with the reference when the delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderInRouter(<ReferenceCard reference={makeReference()} onDelete={onDelete} />);
    await user.click(screen.getByTestId('reference-delete-ref_1'));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'ref_1' }));
  });

  it('hides the delete button when canDelete is false', () => {
    renderInRouter(<ReferenceCard reference={makeReference()} canDelete={false} />);
    expect(screen.queryByTestId('reference-delete-ref_1')).not.toBeInTheDocument();
  });

  it('renders the placeholder when there is no image source available', () => {
    renderInRouter(
      <ReferenceCard
        reference={makeReference({
          sourceType: 'GENERATED',
          sourceId: null,
        })}
      />,
    );
    expect(screen.getByTestId('reference-card-placeholder')).toBeInTheDocument();
  });
});
