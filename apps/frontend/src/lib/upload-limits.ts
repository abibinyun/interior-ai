/**
 * Client-side mirror of the backend's upload validation (rule SG-06).
 * Keeping the values in one place so the picker, the modal, and the
 * test helpers all stay in lockstep.
 *
 * The backend re-validates these in `ReferencesService.uploadReference`
 * — we enforce them client-side so we can surface a friendly error
 * before round-tripping an obviously-rejected upload.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export function isAllowedImageMimeType(mime: string): mime is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * One-line, user-facing explanation of the upload limits. Used by
 * the modal's helper text + the picker helper.
 */
export function describeUploadLimits(): string {
  return `JPEG, PNG, or WebP. Up to ${MAX_UPLOAD_MB} MB.`;
}
