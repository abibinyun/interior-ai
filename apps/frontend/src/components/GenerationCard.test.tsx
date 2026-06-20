import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GenerationCard } from './GenerationCard';
import { GENERATION_STATUS_LABEL, generationErrorTitle } from './generation-status';
import type { Generation } from '../api/generations';

function makeGen(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'g_1',
    roomId: 'r_1',
    batchId: 'b_1',
    optionIndex: 1,
    parentGenerationId: null,
    prompt: 'A living room with a sectional and warm wood.',
    negativePrompt: null,
    imageUrl: 'https://fake.storage/living.png',
    signedImageUrl: 'https://fake.storage/signed/living.png',
    signedImageUrlExpiresAt: '2026-06-20T13:00:00.000Z',
    storageObjectKey: 'projects/p1/rooms/r1/generations/g1.png',
    status: 'COMPLETED',
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-06-20T12:00:00.000Z',
    updatedAt: '2026-06-20T12:00:00.000Z',
    ...overrides,
  };
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('GENERATION_STATUS_LABEL', () => {
  it('has labels for every status', () => {
    expect(GENERATION_STATUS_LABEL.PENDING).toBeTruthy();
    expect(GENERATION_STATUS_LABEL.PROCESSING).toBeTruthy();
    expect(GENERATION_STATUS_LABEL.COMPLETED).toBeTruthy();
    expect(GENERATION_STATUS_LABEL.FAILED).toBeTruthy();
  });
});

describe('generationErrorTitle', () => {
  it('returns a friendly title per documented error_code', () => {
    expect(generationErrorTitle('PROVIDER_TIMEOUT')).toBe('Provider timed out');
    expect(generationErrorTitle('PROVIDER_REJECTED')).toBe('Provider rejected the request');
    expect(generationErrorTitle('PROVIDER_BROKEN')).toBe('Provider returned malformed data');
    expect(generationErrorTitle('STORAGE_FAILED')).toBe('Couldn’t store the image');
  });
  it('falls back to a generic line for null / unknown codes', () => {
    expect(generationErrorTitle(null)).toBe('Generation failed');
  });
});

describe('<GenerationCard />', () => {
  it('renders the image + Option N label when COMPLETED', () => {
    renderWithRouter(<GenerationCard generation={makeGen()} isApproved={false} />);
    expect(screen.getByAltText('Generation 1')).toBeInTheDocument();
    expect(screen.getByText(/Option 1/)).toBeInTheDocument();
  });

  it('renders the Approve button labelled "Approved" when this is the approved option', () => {
    renderWithRouter(
      <GenerationCard generation={makeGen({ id: 'g_a' })} isApproved={true} onApprove={() => undefined} />,
    );
    const btn = screen.getByTestId('approve-button-1');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toMatch(/approved/i);
    expect(screen.getByText('✓ Approved')).toBeInTheDocument();
  });

  it('renders the Approve button when not approved', () => {
    renderWithRouter(
      <GenerationCard generation={makeGen()} isApproved={false} onApprove={() => undefined} />,
    );
    expect(screen.getByTestId('approve-button-1')).toBeInTheDocument();
  });

  it('renders the friendly error title for FAILED rows', () => {
    renderWithRouter(
      <GenerationCard
        generation={makeGen({
          status: 'FAILED',
          errorCode: 'PROVIDER_TIMEOUT',
          errorMessage: 'Pollinations did not respond in 60 seconds.',
        })}
        isApproved={false}
      />,
    );
    expect(screen.getByText('Provider timed out')).toBeInTheDocument();
    expect(screen.getByText('Pollinations did not respond in 60 seconds.')).toBeInTheDocument();
  });

  it('renders a pulsing skeleton for PENDING/PROCESSING rows', () => {
    const { container } = renderWithRouter(
      <GenerationCard generation={makeGen({ status: 'PROCESSING', imageUrl: null })} isApproved={false} />,
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.getByText(GENERATION_STATUS_LABEL.PROCESSING)).toBeInTheDocument();
  });

  it('renders the Refine link when refineHref is provided', () => {
    renderWithRouter(
      <GenerationCard
        generation={makeGen()}
        isApproved={false}
        refineHref={`/generations/g_1?roomId=r_1`}
      />,
    );
    const link = screen.getByTestId('refine-link-1');
    expect(link.getAttribute('href')).toBe('/generations/g_1?roomId=r_1');
  });
});