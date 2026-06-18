/**
 * Domain types for the export bundle (M14).
 *
 * The manifest is the structured `payload` jsonb stored alongside the ZIP
 * (the ZIP itself is in object storage). The manifest makes the bundle
 * discoverable + scriptable: a reviewer can read the manifest to know
 * exactly which files are inside without unzipping.
 *
 * `BundleFile` is also the in-memory representation of one entry inside
 * the assembler before it is handed to the ZIP writer.
 */

export type BundleProjectStatus = 'IN_PROGRESS' | 'COMPLETED' | 'DRAFT';

export interface BundleProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: BundleProjectStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface BundleStyleProfile {
  styleKey: string;
  styleNotes: string | null;
}

export interface BundleRoomEntry {
  id: string;
  roomType: string;
  status: string;
  approvedGenerationId: string | null;
  approvedImageFile: string | null;
  promptFile: string | null;
  notesFile: string | null;
  referencesCount: number;
}

export interface BundleFile {
  path: string;
  content: Buffer | string;
  /**
   * True for binary assets. The ZIP writer uses STORE (no compression) for
   * binaries and DEFLATE for text to keep byte-level reproducibility
   * (E-04) for the text content while still compressing where it helps.
   */
  binary: boolean;
}

export interface BundleManifest {
  schemaVersion: 1;
  generatedAt: string;
  project: BundleProjectSummary;
  styleProfile: BundleStyleProfile | null;
  rooms: BundleRoomEntry[];
  files: Array<{ path: string; byteSize: number }>;
}

export interface AssembledBundle {
  manifest: BundleManifest;
  files: BundleFile[];
}

export interface SerializedExportBundle {
  id: string;
  projectId: string;
  version: number;
  byteSize: number;
  createdAt: string;
  manifest: BundleManifest;
  downloadUrl?: string;
  downloadUrlExpiresAt?: string;
}

export interface ListedExportBundle {
  id: string;
  projectId: string;
  version: number;
  byteSize: number;
  createdAt: string;
}
