import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, formatDateTime } from './format';

describe('formatDate', () => {
  it('formats a valid ISO date to a human-readable string', () => {
    expect(formatDate('2026-06-14T15:00:00.000Z', 'en-US')).toMatch(/Jun 14, 2026/);
  });

  it('returns the original input on invalid date', () => {
    expect(formatDate('not-a-date', 'en-US')).toBe('not-a-date');
  });
});

describe('formatDateTime', () => {
  it('formats a valid ISO datetime', () => {
    expect(formatDateTime('2026-06-14T15:00:00.000Z', 'en-US')).toMatch(/Jun 14, 2026/);
    expect(formatDateTime('2026-06-14T15:00:00.000Z', 'en-US')).toMatch(/\d/);
  });

  it('returns the original input on invalid date', () => {
    expect(formatDateTime('not-a-date', 'en-US')).toBe('not-a-date');
  });
});

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes and megabytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('returns em-dash for negative or NaN', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});