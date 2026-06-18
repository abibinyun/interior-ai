import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  AnchorBuilder,
  ANCHOR_MAX_CHARS,
  ANCHOR_SEGMENT_MAX_CHARS,
  ANCHOR_SEPARATOR,
} from '../src/generations/anchor-builder';

describe('M11 — Consistency Anchor (pure compose)', () => {
  const builder = new AnchorBuilder(/* prisma unused in compose() */ null as never);

  it('returns null when there is no style and no approved rooms', () => {
    expect(builder.compose(null, null, [])).toBeNull();
  });

  it('returns null when style has neither key nor notes and no rooms are approved', () => {
    expect(builder.compose(null, '', [])).toBeNull();
  });

  it('emits a style-only anchor when no rooms are approved', () => {
    const out = builder.compose('JAPANDI', 'warm woods', []);
    expect(out).not.toBeNull();
    expect(out).toMatch(/^House-wide design language: /);
    expect(out).toContain('style=JAPANDI');
    expect(out).toContain('warm woods');
    expect(out!.length).toBeLessThanOrEqual(ANCHOR_MAX_CHARS);
  });

  it('emits one room segment when one room is approved', () => {
    const out = builder.compose('JAPANDI', 'warm woods', [
      {
        roomType: 'LIVING_ROOM',
        prompt: 'A serene living room with low sofa and oak floor.',
        updatedAt: new Date('2026-06-01T00:00:00Z'),
      },
    ]);
    expect(out).not.toBeNull();
    expect(out).toContain('living room:');
    expect(out).toContain('A serene living room with low sofa and oak floor');
  });

  it('orders room segments by input order (anchor builder does not re-sort; upstream query handles order)', () => {
    const out = builder.compose('JAPANDI', null, [
      { roomType: 'LIVING_ROOM', prompt: 'Living prompt.', updatedAt: new Date('2026-06-01') },
      { roomType: 'KITCHEN', prompt: 'Kitchen prompt.', updatedAt: new Date('2026-06-02') },
    ]);
    expect(out).not.toBeNull();
    const livingIdx = out!.indexOf('living room:');
    const kitchenIdx = out!.indexOf('kitchen:');
    expect(livingIdx).toBeGreaterThanOrEqual(0);
    expect(kitchenIdx).toBeGreaterThan(livingIdx);
  });

  it('truncates long style notes to the per-segment cap', () => {
    const longNotes = 'x'.repeat(ANCHOR_SEGMENT_MAX_CHARS * 4);
    const out = builder.compose('JAPANDI', longNotes, []);
    expect(out).not.toBeNull();
    const stylePart = out!.match(/style=JAPANDI [^|]+/)?.[0] ?? '';
    // The segment includes the "style=JAPANDI " prefix; the notes portion
    // itself is truncated to ANCHOR_SEGMENT_MAX_CHARS.
    expect(stylePart).toContain('style=JAPANDI ');
    expect(stylePart.endsWith('…')).toBe(true);
    expect(stylePart.length).toBeLessThanOrEqual(
      'style=JAPANDI '.length + ANCHOR_SEGMENT_MAX_CHARS,
    );
  });

  it('truncates long room prompts to the per-segment cap', () => {
    const longPrompt = 'p'.repeat(ANCHOR_SEGMENT_MAX_CHARS * 4);
    const out = builder.compose(null, null, [
      { roomType: 'LIVING_ROOM', prompt: longPrompt, updatedAt: new Date('2026-06-01') },
    ]);
    expect(out).not.toBeNull();
    const roomPart = out!.match(/living room: [^|]+/)?.[0] ?? '';
    expect(roomPart.length).toBeLessThanOrEqual(
      'living room: '.length + ANCHOR_SEGMENT_MAX_CHARS,
    );
    expect(roomPart.endsWith('…')).toBe(true);
  });

  it('drops oldest room segments when total exceeds ANCHOR_MAX_CHARS and appends a tail marker', () => {
    const rooms = Array.from({ length: 12 }).map((_, i) => ({
      roomType: 'LIVING_ROOM',
      prompt: `Room ${i}: ${'x'.repeat(ANCHOR_SEGMENT_MAX_CHARS - 20)}`,
      updatedAt: new Date(`2026-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    }));
    const out = builder.compose(null, null, rooms);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(ANCHOR_MAX_CHARS);
    expect(out).toMatch(/\(\+\d+ earlier rooms\)$/);
    const dropped = Number(out!.match(/\(\+(\d+) earlier/)?.[1] ?? '0');
    expect(dropped).toBeGreaterThan(0);
  });

  it('keeps the style segment even when room segments would overflow', () => {
    const rooms = Array.from({ length: 8 }).map((_, i) => ({
      roomType: 'LIVING_ROOM',
      prompt: `Room ${i}: ${'x'.repeat(ANCHOR_SEGMENT_MAX_CHARS - 20)}`,
      updatedAt: new Date(`2026-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    }));
    const out = builder.compose('JAPANDI', 'notes', rooms);
    expect(out).not.toBeNull();
    expect(out).toContain('style=JAPANDI');
  });

  it('joins segments with the documented separator', () => {
    const out = builder.compose('SCANDINAVIAN', null, [
      { roomType: 'LIVING_ROOM', prompt: 'Bright living.', updatedAt: new Date('2026-06-01') },
      { roomType: 'KITCHEN', prompt: 'Clean kitchen.', updatedAt: new Date('2026-06-02') },
    ]);
    expect(out).not.toBeNull();
    expect(out!.includes(ANCHOR_SEPARATOR)).toBe(true);
  });

  it('skips approved rooms whose approved_generation prompt is missing', () => {
    const out = builder.compose('JAPANDI', null, [
      { roomType: 'LIVING_ROOM', prompt: null, updatedAt: new Date('2026-06-01') },
      { roomType: 'KITCHEN', prompt: 'Kitchen prompt.', updatedAt: new Date('2026-06-02') },
    ]);
    expect(out).not.toBeNull();
    expect(out).toContain('kitchen:');
    expect(out).not.toContain('living room:');
  });
});
