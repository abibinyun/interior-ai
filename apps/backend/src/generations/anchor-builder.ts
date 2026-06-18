import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Default cap for the TOTAL anchor string length, in characters.
 * ADR-011: the anchor is composed of (a) truncated style_notes plus (b)
 * truncated approved-room prompts joined with separators. This cap bounds
 * the total token cost injected into the composed prompt.
 */
export const ANCHOR_MAX_CHARS = 1200;

/** Per-segment cap for any single prompt line or style note. */
export const ANCHOR_SEGMENT_MAX_CHARS = 240;

export const ANCHOR_SEPARATOR = ' | ';

const ANCHOR_PREFIX = 'House-wide design language:';

interface ApprovedRoomPromptRow {
  roomType: string;
  prompt: string | null;
  updatedAt: Date;
}

@Injectable()
export class AnchorBuilder {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute the consistency anchor string for a project.
   *
   * Algorithm (per docs/03-business-rules.md CA-05 and ADR-011):
   *   1. Start with style_key + truncated style_notes (one segment).
   *   2. For each approved room (ordered by updatedAt ASC), build a segment
   *      `<humanize(roomType)>: <truncated(prompt)>`.
   *   3. Join segments with ` | `.
   *   4. Total output length (prefix + segments + optional tail) must stay
   *      within ANCHOR_MAX_CHARS. If it would overflow, drop oldest
   *      approved-room segments first (style stays) until it fits.
   *   5. When segments were dropped, append ` (+N earlier rooms)` so the
   *      caller knows the anchor was truncated.
   *   6. Return null when nothing to anchor on (no style and no approvals).
   *
   * Rule CA-04: the anchor is read-only — this method never accepts user
   * input and the result is consumed only inside PromptComposer.
   */
  async build(projectId: string): Promise<string | null> {
    const style = await this.prisma.styleProfile.findUnique({
      where: { projectId },
      select: { styleKey: true, styleNotes: true },
    });

    const approved = await this.prisma.room.findMany({
      where: { projectId, status: 'APPROVED' },
      select: {
        id: true,
        approvedGenerationId: true,
        roomType: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    });

    let prompts: ApprovedRoomPromptRow[] = [];
    if (approved.length > 0) {
      const approvedIds = approved
        .map((r) => r.approvedGenerationId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      if (approvedIds.length > 0) {
        const rows = await this.prisma.generation.findMany({
          where: { id: { in: approvedIds } },
          select: { id: true, prompt: true, roomId: true },
        });
        const promptByRoomId = new Map<string, string | null>();
        for (const row of rows) promptByRoomId.set(row.roomId, row.prompt);
        prompts = approved
          .filter((r) => promptByRoomId.has(r.id))
          .map((r) => ({
            roomType: r.roomType,
            prompt: promptByRoomId.get(r.id) ?? null,
            updatedAt: r.updatedAt,
          }));
      }
    }

    return this.compose(style?.styleKey ?? null, style?.styleNotes ?? null, prompts);
  }

  /**
   * Pure composition helper. Exposed so it can be unit-tested without DB.
   *
   * Returns null when there is nothing to anchor on (no style and no approvals).
   */
  compose(
    styleKey: string | null,
    styleNotes: string | null,
    approvedPrompts: ApprovedRoomPromptRow[],
  ): string | null {
    const styleSeg = this.styleSegment(styleKey, styleNotes);
    const allRoomSegs = approvedPrompts
      .map((row) => this.roomSegment(row))
      .filter((s): s is string => s !== null);

    if (styleSeg === null && allRoomSegs.length === 0) return null;

    // Drop oldest room segments until total fits within ANCHOR_MAX_CHARS.
    // Style segment is preserved (it is the project's anchor).
    let keptRoomCount = allRoomSegs.length;
    let droppedCount = 0;
    while (keptRoomCount > 0) {
      const candidate = this.format(styleSeg, allRoomSegs, keptRoomCount, droppedCount);
      if (candidate.length <= ANCHOR_MAX_CHARS) {
        return candidate;
      }
      keptRoomCount -= 1;
      droppedCount += 1;
    }
    // Only style fits (no rooms kept) — still useful, no tail.
    if (styleSeg !== null) {
      return this.format(styleSeg, allRoomSegs, 0, droppedCount);
    }
    return null;
  }

  private format(
    styleSeg: string | null,
    allRoomSegs: string[],
    keptRoomCount: number,
    droppedCount: number,
  ): string {
    const head: string[] = [];
    if (styleSeg !== null) head.push(styleSeg);
    head.push(...allRoomSegs.slice(0, keptRoomCount));
    const tail = droppedCount > 0 ? ` (+${droppedCount} earlier rooms)` : '';
    if (head.length === 0) {
      // Shouldn't happen given the caller's contract, but be defensive.
      return `${ANCHOR_PREFIX}${tail}`;
    }
    return `${ANCHOR_PREFIX} ${head.join(ANCHOR_SEPARATOR)}${tail}`;
  }

  private styleSegment(styleKey: string | null, styleNotes: string | null): string | null {
    if (!styleKey && !styleNotes) return null;
    const key = styleKey ? `style=${styleKey}` : null;
    const notes = styleNotes ? this.truncate(styleNotes.trim(), ANCHOR_SEGMENT_MAX_CHARS) : null;
    const parts = [key, notes].filter((p): p is string => p !== null && p.length > 0);
    if (parts.length === 0) return null;
    return parts.join(' ');
  }

  private roomSegment(row: ApprovedRoomPromptRow): string | null {
    if (!row.prompt) return null;
    const humanRoom = this.humanizeRoomType(row.roomType);
    const snippet = this.truncate(row.prompt.trim(), ANCHOR_SEGMENT_MAX_CHARS);
    return `${humanRoom}: ${snippet}`;
  }

  private truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, Math.max(0, max - 1))}…`;
  }

  private humanizeRoomType(t: string): string {
    return t.replace(/_/g, ' ').toLowerCase();
  }
}
