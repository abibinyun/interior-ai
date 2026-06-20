import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/error';
import type * as ReferencesApi from '../api/references';
import type * as GenerationsApi from '../api/generations';
import type { AddReferenceInput } from '../api/references';
import { AddReferenceModal } from './AddReferenceModal';

const addReferenceMock = vi.fn();
const listGenerationsMock = vi.fn((_roomId: string) =>
  Promise.resolve({
    items: [
      {
        id: 'g_99',
        roomId: 'r_1',
        batchId: 'b_1',
        optionIndex: 1,
        parentGenerationId: null,
        prompt: 'a long enough prompt for testing',
        negativePrompt: null,
        imageUrl: null,
        signedImageUrl: null,
        signedImageUrlExpiresAt: null,
        storageObjectKey: null,
        status: 'COMPLETED',
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      },
    ],
  }),
);
vi.mock('../api/references', async () => {
  const actual = await vi.importActual<typeof ReferencesApi>('../api/references');
  return {
    ...actual,
    addReference: (roomId: string, input: AddReferenceInput) =>
      addReferenceMock(roomId, input),
  };
});
vi.mock('../api/generations', async () => {
  const actual = await vi.importActual<typeof GenerationsApi>('../api/generations');
  return {
    ...actual,
    listGenerationsByRoom: (roomId: string) => listGenerationsMock(roomId),
  };
});

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  // Pre-seed the generations list so the GeneratedTab dropdown has
  // a target on first render (avoids the Skeleton placeholder).
  qc.setQueryData(['rooms', 'r_1', 'generations'], {
    items: [
      {
        id: 'g_99',
        roomId: 'r_1',
        batchId: 'b_1',
        optionIndex: 1,
        parentGenerationId: null,
        prompt: 'a long enough prompt for testing',
        negativePrompt: null,
        imageUrl: null,
        signedImageUrl: null,
        signedImageUrlExpiresAt: null,
        storageObjectKey: null,
        status: 'COMPLETED',
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      },
    ],
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    QueryClientProvider({ client: qc, children });
  return { qc, wrapper };
}

function renderModal(props: Partial<React.ComponentProps<typeof AddReferenceModal>> = {}) {
  const defaultProps: React.ComponentProps<typeof AddReferenceModal> = {
    open: true,
    roomId: 'r_1',
    onClose: vi.fn(),
  };
  return render(<AddReferenceModal {...defaultProps} {...props} />, {
    wrapper: makeWrapper().wrapper,
  });
}

describe('<AddReferenceModal />', () => {
  beforeEach(() => {
    addReferenceMock.mockReset();
    listGenerationsMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the three tabs with the Generated tab active by default', () => {
    renderModal();
    expect(screen.getByRole('tab', { name: 'From a generation' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'External link' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Upload an image' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('switches tabs on click', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('tab', { name: 'External link' }));
    expect(screen.getByRole('tab', { name: 'External link' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText(/External URL/)).toBeInTheDocument();
  });

  it('submits a GENERATED reference with the picked generation + caption', async () => {
    const user = userEvent.setup();
    addReferenceMock.mockResolvedValue({ id: 'ref_new' });
    renderModal();
    await user.selectOptions(screen.getByLabelText('Generation'), 'g_99');
    await user.type(screen.getByLabelText(/Caption/), 'inspo');
    await user.click(screen.getByTestId('add-reference-submit'));
    await waitFor(() => {
      expect(addReferenceMock).toHaveBeenCalledWith('r_1', {
        sourceType: 'GENERATED',
        sourceId: 'g_99',
        caption: 'inspo',
      });
    });
  });

  it('validates EXTERNAL_URL before allowing submit', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('tab', { name: 'External link' }));
    const submit = screen.getByTestId('add-reference-submit');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/External URL/), 'not-a-url');
    expect(submit).toBeDisabled();

    await user.clear(screen.getByLabelText(/External URL/));
    await user.type(screen.getByLabelText(/External URL/), 'https://example.com/inspo');
    expect(submit).toBeEnabled();
  });

  it('rejects oversize uploads client-side before any backend call (DoD)', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('tab', { name: 'Upload an image' }));
    const file = new File([new Uint8Array(12 * 1024 * 1024)], 'huge.png', {
      type: 'image/png',
    });
    const input = screen.getByTestId('upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByTestId('upload-client-error')).toHaveTextContent(/10\s*MB/);
    expect(screen.getByTestId('add-reference-submit')).toBeDisabled();
  });

  it('rejects unsupported MIME types client-side', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('tab', { name: 'Upload an image' }));
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const input = screen.getByTestId('upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByTestId('upload-client-error')).toHaveTextContent(/text\/plain/);
    expect(screen.getByTestId('add-reference-submit')).toBeDisabled();
  });

  it('surfaces backend errors via <ErrorState />', async () => {
    const user = userEvent.setup();
    addReferenceMock.mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
    renderModal();
    await user.selectOptions(screen.getByLabelText('Generation'), 'g_99');
    await user.click(screen.getByTestId('add-reference-submit'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn.?t find/i);
  });
});
