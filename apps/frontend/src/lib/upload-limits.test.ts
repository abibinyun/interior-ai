import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  describeUploadLimits,
  isAllowedImageMimeType,
} from './upload-limits';

describe('upload-limits', () => {
  it('keeps MAX_UPLOAD_BYTES at 10 MB to mirror backend SG-06', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_UPLOAD_MB).toBe(10);
  });

  it('allows exactly the three image MIME types the backend accepts', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('isAllowedImageMimeType narrows to the allow-list', () => {
    expect(isAllowedImageMimeType('image/jpeg')).toBe(true);
    expect(isAllowedImageMimeType('image/png')).toBe(true);
    expect(isAllowedImageMimeType('image/webp')).toBe(true);
    expect(isAllowedImageMimeType('image/gif')).toBe(false);
    expect(isAllowedImageMimeType('text/plain')).toBe(false);
    expect(isAllowedImageMimeType('')).toBe(false);
  });

  it('describeUploadLimits returns a one-line helper string', () => {
    expect(describeUploadLimits()).toMatch(/JPEG/);
    expect(describeUploadLimits()).toMatch(/PNG/);
    expect(describeUploadLimits()).toMatch(/WebP/);
    expect(describeUploadLimits()).toMatch(/10\s*MB/);
  });
});
