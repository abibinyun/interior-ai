/**
 * Locale-aware formatting helpers.
 *
 * The frontend uses the browser's locale (`navigator.language`) by
 * default, falling back to `en-US`. This is fine for v1 — the app is
 * a single-locale product (English UI strings in `docs/00-product-vision.md`).
 */

/** Format an ISO 8601 timestamp as a human-friendly date (e.g. "Jun 14, 2026"). */
export function formatDate(iso: string, locale: string = defaultLocale()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format an ISO 8601 timestamp as a date + time (e.g. "Jun 14, 2026, 3:24 PM"). */
export function formatDateTime(iso: string, locale: string = defaultLocale()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Format a byte count as a human-readable string (e.g. 1234567 -> "1.2 MB"). */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(decimals)} ${units[i]}`;
}

function defaultLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en-US';
}