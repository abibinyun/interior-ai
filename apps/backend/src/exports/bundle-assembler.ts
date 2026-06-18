import { Reference, StyleProfile } from '@prisma/client';
import {
  AssembledBundle,
  BundleFile,
  BundleManifest,
  BundleProjectSummary,
  BundleRoomEntry,
} from './types';

/**
 * Inputs to the pure assembler. Service code gathers these via Prisma
 * and the storage adapter's `download` method, then hands a fully
 * materialised view to this function so it can be unit-tested without
 * any IO. The shape is intentionally minimal — only the fields the
 * assembler actually reads.
 */
export interface AssemblerInput {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'DRAFT';
    createdAt: Date;
    completedAt: Date | null;
    updatedAt: Date;
  };
  styleProfile: Pick<StyleProfile, 'styleKey' | 'styleNotes'> | null;
  rooms: Array<
    RoomInput
  >;
}

export interface RoomInput {
  id: string;
  roomType: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  designBrief: {
    purpose: string | null;
    occupants: string | null;
    lightingPreferences: string | null;
    furnitureRequirements: string | null;
    constraints: string | null;
  } | null;
  approvedGeneration: GenerationLineageNode | null;
  approvedImageBuffer: Buffer | null;
  approvedImageExt: string | null;
  references: Array<{
    ref: Reference;
    binaryBuffer: Buffer | null;
  }>;
}

export interface GenerationLineageNode {
  id: string;
  batchId: string;
  optionIndex: number;
  parentGenerationId: string | null;
  prompt: string;
  negativePrompt: string | null;
  status: string;
  createdAt: Date;
  lineage?: GenerationLineageNode[];
}

const ROOM_SLUG_PATTERN = /[^a-z0-9-]+/g;

function slugifyRoomType(roomType: string): string {
  return roomType
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(ROOM_SLUG_PATTERN, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extensionForMime(mime: string | null | undefined): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

function referenceFileName(referenceId: string, ext: string): string {
  return `${referenceId}.${ext}`;
}

function referenceMetaFileName(referenceId: string): string {
  return `${referenceId}.json`;
}

/**
 * Build the bundle in memory. Pure: no IO, no clock reads. The caller
 * provides already-downloaded buffers so the same input produces the
 * same bytes (E-04).
 */
export function assembleBundle(input: AssemblerInput): AssembledBundle {
  const files: BundleFile[] = [];
  const fileSizes: Array<{ path: string; byteSize: number }> = [];

  const projectSummary: BundleProjectSummary = {
    id: input.project.id,
    name: input.project.name,
    description: input.project.description,
    status: input.project.status,
    createdAt: input.project.createdAt.toISOString(),
    completedAt: input.project.completedAt ? input.project.completedAt.toISOString() : null,
  };

  const projectSummaryJson = JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'project-summary',
      project: projectSummary,
    },
    null,
    2,
  );
  files.push({ path: 'project-summary.json', content: projectSummaryJson, binary: false });
  fileSizes.push({ path: 'project-summary.json', byteSize: Buffer.byteLength(projectSummaryJson) });

  if (input.styleProfile) {
    const styleJson = JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'style-profile',
        styleKey: input.styleProfile.styleKey,
        styleNotes: input.styleProfile.styleNotes,
      },
      null,
      2,
    );
    files.push({ path: 'style-profile.json', content: styleJson, binary: false });
    fileSizes.push({ path: 'style-profile.json', byteSize: Buffer.byteLength(styleJson) });
  }

  const roomEntries: BundleRoomEntry[] = [];
  // Sort rooms by createdAt for deterministic file ordering.
  const rooms = [...input.rooms].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  for (const room of rooms) {
    const slug = slugifyRoomType(room.roomType) || 'room';
    let approvedImageFile: string | null = null;
    let promptFile: string | null = null;
    let notesFile: string | null = null;

    if (room.approvedGeneration && room.approvedImageBuffer && room.approvedImageExt) {
      const path = `approved-images/${slug}.${room.approvedImageExt}`;
      files.push({ path, content: room.approvedImageBuffer, binary: true });
      fileSizes.push({ path, byteSize: room.approvedImageBuffer.length });
      approvedImageFile = path;
    }

    if (room.approvedGeneration) {
      const gen = room.approvedGeneration;
      const promptJson = JSON.stringify(
        {
          schemaVersion: 1,
          kind: 'approved-prompt',
          roomId: room.id,
          roomType: room.roomType,
          generation: {
            id: gen.id,
            batchId: gen.batchId,
            optionIndex: gen.optionIndex,
            prompt: gen.prompt,
            negativePrompt: gen.negativePrompt,
            parentGenerationId: gen.parentGenerationId,
            createdAt: gen.createdAt.toISOString(),
            lineage: (gen.lineage ?? []).map((node) => ({
              id: node.id,
              optionIndex: node.optionIndex,
              parentGenerationId: node.parentGenerationId,
              status: node.status,
            })),
          },
        },
        null,
        2,
      );
      const path = `prompts/${slug}.json`;
      files.push({ path, content: promptJson, binary: false });
      fileSizes.push({ path, byteSize: Buffer.byteLength(promptJson) });
      promptFile = path;
    }

    const notesMd = renderRoomNotes(room);
    const notesPath = `room-notes/${slug}.md`;
    files.push({ path: notesPath, content: notesMd, binary: false });
    fileSizes.push({ path: notesPath, byteSize: Buffer.byteLength(notesMd) });
    notesFile = notesPath;

    // References (sorted by createdAt for determinism).
    const refs = [...room.references].sort(
      (a, b) => a.ref.createdAt.getTime() - b.ref.createdAt.getTime(),
    );
    for (const { ref, binaryBuffer } of refs) {
      const meta = {
        schemaVersion: 1,
        kind: 'reference',
        id: ref.id,
        roomId: ref.roomId,
        sourceType: ref.sourceType,
        sourceId: ref.sourceId,
        externalUrl: ref.externalUrl,
        storageObjectKey: ref.storageObjectKey,
        mimeType: ref.mimeType,
        byteSize: ref.byteSize === null ? null : Number(ref.byteSize),
        originalFilename: ref.originalFilename,
        caption: ref.caption,
        createdAt: ref.createdAt.toISOString(),
      };
      const metaJson = JSON.stringify(meta, null, 2);
      const metaPath = `references/${referenceMetaFileName(ref.id)}`;
      files.push({ path: metaPath, content: metaJson, binary: false });
      fileSizes.push({ path: metaPath, byteSize: Buffer.byteLength(metaJson) });

      if (ref.sourceType === 'UPLOADED' && binaryBuffer) {
        const ext = extensionForMime(ref.mimeType);
        const path = `references/${referenceFileName(ref.id, ext)}`;
        files.push({ path, content: binaryBuffer, binary: true });
        fileSizes.push({ path, byteSize: binaryBuffer.length });
      }
    }

    roomEntries.push({
      id: room.id,
      roomType: room.roomType,
      status: room.status,
      approvedGenerationId: room.approvedGeneration?.id ?? null,
      approvedImageFile,
      promptFile,
      notesFile,
      referencesCount: refs.length,
    });
  }

  const manifest: BundleManifest = {
    schemaVersion: 1,
    generatedAt: input.project.updatedAt.toISOString(),
    project: projectSummary,
    styleProfile: input.styleProfile
      ? { styleKey: input.styleProfile.styleKey, styleNotes: input.styleProfile.styleNotes }
      : null,
    rooms: roomEntries,
    files: fileSizes,
  };

  return { manifest, files };
}

function renderRoomNotes(
  room: RoomInput,
): string {
  const lines: string[] = [];
  lines.push(`# ${titleCase(room.roomType)}`);
  lines.push('');
  lines.push(`Room id: \`${room.id}\``);
  lines.push(`Status: ${room.status}`);
  if (room.approvedGeneration) {
    lines.push(`Approved generation: \`${room.approvedGeneration.id}\``);
  } else {
    lines.push('Approved generation: _(none)_');
  }
  lines.push('');

  if (room.designBrief) {
    lines.push('## Design Brief');
    lines.push('');
    const b = room.designBrief;
    if (b.purpose) appendSection(lines, 'Purpose', b.purpose);
    if (b.occupants) appendSection(lines, 'Occupants', b.occupants);
    if (b.lightingPreferences) appendSection(lines, 'Lighting', b.lightingPreferences);
    if (b.furnitureRequirements) appendSection(lines, 'Furniture requirements', b.furnitureRequirements);
    if (b.constraints) appendSection(lines, 'Constraints', b.constraints);
    if (
      !b.purpose &&
      !b.occupants &&
      !b.lightingPreferences &&
      !b.furnitureRequirements &&
      !b.constraints
    ) {
      lines.push('_No brief recorded yet._');
    }
  } else {
    lines.push('## Design Brief');
    lines.push('');
    lines.push('_No brief recorded yet._');
  }

  return lines.join('\n') + '\n';
}

function appendSection(lines: string[], heading: string, body: string): void {
  lines.push(`### ${heading}`);
  lines.push('');
  for (const ln of body.split(/\r?\n/)) {
    lines.push(ln);
  }
  lines.push('');
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}
