export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');

export interface UploadRequest {
  key: string;
  body: Buffer;
  contentType: string;
  upsert?: boolean;
}

export interface UploadResult {
  key: string;
  publicUrl: string;
}

export interface SignedUrlResult {
  key: string;
  signedUrl: string;
  expiresAt: Date;
}

export interface StorageError extends Error {
  code: 'STORAGE_FAILED' | 'UPLOAD_REJECTED';
  key?: string;
  statusCode?: number;
}

export function isStorageError(err: unknown): err is StorageError {
  return err instanceof Error && 'code' in err &&
    ['STORAGE_FAILED', 'UPLOAD_REJECTED'].includes((err as StorageError).code);
}

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function buildGenerationKey(
  env: string,
  projectId: string,
  roomId: string,
  generationId: string,
  contentType: string,
): string {
  const ext = mimeToExt(contentType);
  return `${env}/projects/${projectId}/rooms/${roomId}/generations/${generationId}.${ext}`;
}

export function buildReferenceKey(
  env: string,
  projectId: string,
  roomId: string,
  referenceId: string,
  filename: string,
): string {
  const safe = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^\.+/, '');
  return `${env}/projects/${projectId}/rooms/${roomId}/references/${referenceId}/${safe}`;
}

function mimeToExt(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

export interface StorageAdapter {
  readonly name: string;
  upload(request: UploadRequest): Promise<UploadResult>;
  signedUrl(key: string, ttlSeconds: number): Promise<SignedUrlResult>;
  delete(key: string): Promise<void>;
}
