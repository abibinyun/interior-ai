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

/**
 * Storage key for an export bundle ZIP. Per rule E-05 the key is fixed
 * at `exports/projects/{projectId}/v{version}.zip` and is append-only
 * (versions monotonically increase; existing keys are never overwritten).
 */
export function buildExportKey(env: string, projectId: string, version: number): string {
  return `${env}/exports/projects/${projectId}/v${version}.zip`;
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
  /**
   * Download an object as a Buffer. Used by the export bundle assembler
   * (M14) to inline approved image binaries and UPLOADED reference assets
   * into the ZIP. Throws StorageError on failure (including 404).
   */
  download(key: string): Promise<Buffer>;
  signedUrl(key: string, ttlSeconds: number): Promise<SignedUrlResult>;
  delete(key: string): Promise<void>;
}
