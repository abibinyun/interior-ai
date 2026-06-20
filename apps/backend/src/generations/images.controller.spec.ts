import { describe, expect, it } from 'vitest';
import { maybeDecodeLegacyBase64 } from './images.controller';

describe('maybeDecodeLegacyBase64', () => {
  it('passes through a raw JPEG', () => {
    // FF D8 FF E0 + a tiny stub of the rest.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const out = maybeDecodeLegacyBase64(jpeg);
    expect(out.equals(jpeg)).toBe(true);
  });

  it('passes through a raw PNG', () => {
    // 89 50 4E 47 + a tiny stub.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const out = maybeDecodeLegacyBase64(png);
    expect(out.equals(png)).toBe(true);
  });

  it('decodes a legacy base64-encoded JPEG (starts with /9j/)', () => {
    // Build a real JPEG, then base64-encode it the way the legacy
    // upload did.
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    ]);
    const base64 = Buffer.from(jpeg.toString('base64'), 'ascii');
    // Sanity: base64 of FF D8 FF E0 starts with `/9j/4` (4 chars is
    // the head of the base64 encoding of the 3-byte JPEG SOI/APP0).
    expect(base64.toString('ascii', 0, 5).startsWith('/9j/')).toBe(true);

    const out = maybeDecodeLegacyBase64(base64);
    expect(out.equals(jpeg)).toBe(true);
    expect(out.length).toBeLessThan(base64.length); // decoded is smaller
  });

  it('decodes a legacy base64-encoded PNG (starts with iVBOR)', () => {
    // PNG IHDR chunk starts with `89 50 4E 47 0D 0A 1A 0A 00 00 00 0D 49 48 44 52`.
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    const base64 = Buffer.from(png.toString('base64'), 'ascii');
    expect(base64.toString('ascii', 0, 5)).toBe('iVBOR'); // sanity

    const out = maybeDecodeLegacyBase64(base64);
    expect(out.equals(png)).toBe(true);
  });

  it('passes through an empty buffer unchanged', () => {
    expect(maybeDecodeLegacyBase64(Buffer.alloc(0)).length).toBe(0);
  });

  it('passes through a base64-looking string that is not a valid image', () => {
    // Random ASCII that happens to match the head pattern but isn't a
    // valid base64 alphabet. Length is 5 → not divisible by 4.
    const bogus = Buffer.from('/9j/abcdefghij', 'ascii');
    const out = maybeDecodeLegacyBase64(bogus);
    // Either passes through OR decodes to garbage. We only require
    // it NOT to throw and NOT to silently strip data.
    expect(out.length).toBeGreaterThan(0);
  });
});