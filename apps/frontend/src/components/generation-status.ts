import type { Generation, GenerationErrorCode } from '../api/generations';

export const GENERATION_STATUS_LABEL: Record<Generation['status'], string> = {
  PENDING: 'Queued',
  PROCESSING: 'Generating',
  COMPLETED: 'Ready',
  FAILED: 'Failed',
};

const ERROR_CODE_TITLE: Record<NonNullable<GenerationErrorCode>, string> = {
  PROVIDER_TIMEOUT: 'Provider timed out',
  PROVIDER_REJECTED: 'Provider rejected the request',
  PROVIDER_BROKEN: 'Provider returned malformed data',
  STORAGE_FAILED: 'Couldn’t store the image',
};

/**
 * Friendly title for a generation error_code. Falls back to a generic
 * "Generation failed" when no code is set.
 */
export function generationErrorTitle(code: GenerationErrorCode): string {
  if (!code) return 'Generation failed';
  return ERROR_CODE_TITLE[code] ?? 'Generation failed';
}