/**
 * F8 multipart upload helper that exposes XHR upload progress
 * events. The standard `apiFetch` uses `fetch`, which doesn't
 * expose upload progress in browsers, so for the References upload
 * flow we use XHR directly.
 *
 * The XHR path mirrors the typed `apiFetch` envelope normalization
 * so the rest of the codebase can treat the response identically
 * to a JSON `apiFetch` call (errors → `ApiError` with the same
 * `code`/`message`/`fields`/`traceId` shape).
 */
import { ApiError, type ErrorCode } from './error';

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadOptions {
  url: string;
  file: File;
  caption?: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

interface RawErrorBody {
  error?: { code?: string; message?: string; traceId?: string; fields?: Record<string, string> };
}

export async function uploadWithProgress<T>(opts: UploadOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', opts.url, true);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (evt) => {
      if (!opts.onProgress) return;
      if (evt.lengthComputable) {
        opts.onProgress({ loaded: evt.loaded, total: evt.total });
      }
    };
    xhr.onload = () => {
      const status = xhr.status;
      const body: unknown = xhr.response ?? xhr.responseText;
      if (status >= 200 && status < 300) {
        resolve(body as T);
        return;
      }
      const parsed = (body && typeof body === 'object' ? (body as RawErrorBody) : null);
      const errCode = (parsed?.error?.code ?? 'INTERNAL') as ErrorCode;
      const errMessage = parsed?.error?.message ?? `Request failed (${status})`;
      const errTrace = parsed?.error?.traceId;
      const errFields = parsed?.error?.fields;
      const err = new ApiError(status, errCode, {
        ...(errMessage ? { message: errMessage } : {}),
        ...(errTrace ? { traceId: errTrace } : {}),
        ...(errFields ? { fields: errFields } : {}),
      });
      reject(err);
    };
    xhr.onerror = () => {
      reject(new ApiError(0, 'INTERNAL', { message: 'Network error during upload.' }));
    };
    xhr.onabort = () => {
      reject(new ApiError(0, 'INTERNAL', { message: 'Upload aborted.' }));
    };
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    const form = new FormData();
    form.append('file', opts.file);
    if (opts.caption) form.append('caption', opts.caption);
    xhr.send(form);
  });
}
