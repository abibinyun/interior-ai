import { Injectable } from '@nestjs/common';
import { BriefOverrideDto, RefinementsDto } from './dto/start-batch.dto';

export interface ComposeContext {
  styleKey: string | null;
  styleNotes: string | null;
  roomType: string;
  brief: {
    purpose: string | null;
    occupants: string | null;
    lightingPreferences: string | null;
    furnitureRequirements: string | null;
    constraints: string | null;
  };
  briefOverride?: BriefOverrideDto;
  refinements?: RefinementsDto;
  consistencyAnchor?: string;
}

export interface ComposedPrompt {
  prompt: string;
  negativePrompt: string;
  variations: Array<{ optionIndex: number; prompt: string; negativePrompt: string }>;
}

/**
 * Composes a Generation prompt from structured intent. Never accepts a
 * fully-formed prompt from the client (G-07). Output respects G-06 by
 * including style, room type, brief fields, and (if present) the
 * consistency anchor.
 */
@Injectable()
export class PromptComposer {
  compose(ctx: ComposeContext): ComposedPrompt {
    const effectiveBrief = this.mergeBrief(ctx.brief, ctx.briefOverride);
    const basePrompt = this.buildBasePrompt(ctx, effectiveBrief);
    const baseNegative = this.buildNegativePrompt(ctx, effectiveBrief);

    return {
      prompt: basePrompt,
      negativePrompt: baseNegative,
      variations: [
        { optionIndex: 1, prompt: this.varyOption(basePrompt, 1), negativePrompt: baseNegative },
        { optionIndex: 2, prompt: this.varyOption(basePrompt, 2), negativePrompt: baseNegative },
        { optionIndex: 3, prompt: this.varyOption(basePrompt, 3), negativePrompt: baseNegative },
      ],
    };
  }

  private buildBasePrompt(ctx: ComposeContext, brief: ComposeContext['brief']): string {
    const parts: string[] = [];

    if (ctx.styleKey) {
      parts.push(`Interior design in ${ctx.styleKey.replace(/_/g, ' ').toLowerCase()} style.`);
    } else {
      parts.push(`Interior design of a ${this.humanizeRoomType(ctx.roomType)}.`);
    }

    if (ctx.styleNotes) parts.push(ctx.styleNotes.trim());
    parts.push(`Room type: ${this.humanizeRoomType(ctx.roomType)}.`);

    if (brief.purpose) parts.push(`Purpose: ${brief.purpose.trim()}.`);
    if (brief.occupants) parts.push(`Occupants: ${brief.occupants.trim()}.`);
    if (brief.lightingPreferences) parts.push(`Lighting: ${brief.lightingPreferences.trim()}.`);
    if (brief.furnitureRequirements) parts.push(`Furniture: ${brief.furnitureRequirements.trim()}.`);
    if (brief.constraints) parts.push(`Constraints: ${brief.constraints.trim()}.`);

    if (ctx.refinements) {
      const r = ctx.refinements;
      if (r.colors) parts.push(`Color emphasis: ${r.colors.trim()}.`);
      if (r.objects) parts.push(`Object emphasis: ${r.objects.trim()}.`);
      if (r.furniture) parts.push(`Furniture adjustment: ${r.furniture.trim()}.`);
      if (r.materials) parts.push(`Material emphasis: ${r.materials.trim()}.`);
      if (r.lighting) parts.push(`Lighting adjustment: ${r.lighting.trim()}.`);
      if (r.layout) parts.push(`Layout: ${r.layout.trim()}.`);
      if (r.styleEmphasis) parts.push(`Style emphasis: ${r.styleEmphasis.trim()}.`);
    }

    if (ctx.consistencyAnchor) parts.push(ctx.consistencyAnchor.trim());

    parts.push('Photorealistic interior photography, high resolution, professional lighting.');
    return parts.join(' ');
  }

  private buildNegativePrompt(ctx: ComposeContext, brief: ComposeContext['brief']): string {
    const parts: string[] = [
      'blurry, low quality, distorted, watermark, text, signature, frame, cartoon, illustration',
    ];
    if (brief.constraints) {
      parts.push(`avoid: ${brief.constraints.trim()}`);
    }
    void ctx;
    return parts.join(', ');
  }

  private varyOption(base: string, optionIndex: number): string {
    const variants: Record<number, string> = {
      1: 'balanced, harmonious composition with natural light',
      2: 'warm, cozy atmosphere with rich textures',
      3: 'bright, airy feel with accent details',
    };
    return `${base} ${variants[optionIndex] ?? ''}`.trim();
  }

  private mergeBrief(original: ComposeContext['brief'], override?: BriefOverrideDto): ComposeContext['brief'] {
    if (!override) return original;
    return {
      purpose: override.purpose ?? original.purpose,
      occupants: override.occupants ?? original.occupants,
      lightingPreferences: override.lightingPreferences ?? original.lightingPreferences,
      furnitureRequirements: override.furnitureRequirements ?? original.furnitureRequirements,
      constraints: override.constraints ?? original.constraints,
    };
  }

  private humanizeRoomType(t: string): string {
    return t.replace(/_/g, ' ').toLowerCase();
  }
}
