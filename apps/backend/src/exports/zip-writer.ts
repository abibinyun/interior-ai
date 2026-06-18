import JSZip from 'jszip';
import { BundleFile } from './types';

/**
 * Build a ZIP archive from a list of bundle files.
 *
 * - Text files (JSON, markdown) are written with DEFLATE compression.
 * - Binary assets (images) are written with STORE (no compression) to keep
 *   the byte output exactly equal to the input bytes — this is part of
 *   the E-04 reproducibility guarantee for the binary portion of the
 *   bundle.
 *
 * The order of insertion is deterministic (the caller controls it).
 * JSZip's central directory is laid out in insertion order, so given the
 * same file list the output is byte-identical (modulo timestamps, which
 * are fixed at 1980-01-01 below to make this verifiable in tests).
 */
export async function buildZip(files: BundleFile[]): Promise<Buffer> {
  const zip = new JSZip();

  for (const file of files) {
    const opts: JSZip.JSZipFileOptions = { date: FIXED_TIMESTAMP };
    if (file.binary) {
      // STORE — no compression header overhead, byte-stable output.
      zip.file(file.path, file.content, { ...opts, compression: 'STORE' });
    } else {
      // DEFLATE — text content compresses well and the deterministic
      // insertion order keeps the central directory stable.
      zip.file(file.path, file.content, { ...opts, compression: 'DEFLATE' });
    }
  }

  return await zip.generateAsync({
    type: 'nodebuffer',
    // No global compression flag; per-file setting above takes effect.
    compression: 'DEFLATE',
    streamFiles: false,
  });
}

/**
 * Fixed ZIP timestamp (1980-01-01 00:00:00 UTC) for every file.
 * ZIP standard requires dates >= 1980, and using a fixed date keeps the
 * output byte-identical across runs (E-04).
 */
const FIXED_TIMESTAMP = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));
