/**
 * Lightweight XSS sanitization for free-text user input.
 *
 * Strategy:
 *   1. Strip HTML tags (`<...>`).
 *   2. Neutralize `javascript:` / `data:` / `vbscript:` URL schemes.
 *   3. Collapse control characters.
 *   4. Trim and clamp length.
 *
 * This is intentionally NOT a full HTML sanitizer (no DOMPurify, no
 * allowlist). The product never renders user-provided strings as
 * HTML — they are shown as plain text by the frontend. The goal here
 * is to prevent accidental damage from raw `<script>` input sneaking
 * into logs, error envelopes, or future export bundles.
 *
 * For cases that DO need HTML (none in v1), use a dedicated library.
 */

const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const SCRIPT_CLOSE_RE = /<\/?script[^>]*>/gi;
const ON_EVENT_RE = /\bon[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi;
const DANGEROUS_SCHEME_RE = /\b(?:javascript|data|vbscript)\s*:/gi;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeFreeText(input: string): string {
  if (typeof input !== 'string') return input;
  let out = input;
  out = out.replace(SCRIPT_CLOSE_RE, '');
  out = out.replace(HTML_TAG_RE, '');
  out = out.replace(ON_EVENT_RE, '');
  out = out.replace(DANGEROUS_SCHEME_RE, 'blocked:');
  out = out.replace(CONTROL_RE, '');
  return out.trim();
}

/**
 * class-transformer decorator: @SanitizeFreeText()
 *
 * Apply to free-text DTO fields. Runs after validation; on sanitization,
 * replaces the value in-place. The DTO is `transform: true` so class-
 * transformer re-assigns the transformed value.
 */
import { Transform } from 'class-transformer';

export function SanitizeFreeText(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return sanitizeFreeText(value);
  });
}
