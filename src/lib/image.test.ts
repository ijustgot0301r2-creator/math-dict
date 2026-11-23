import { describe, expect, it } from 'vitest';
import { attachmentName, fitSize, initialPlan, needsWebp } from './image';

describe('image helpers', () => {
  it('names attachments YYYYMMDD-HHmmss-xxxx.ext', () => {
    expect(attachmentName('png', new Date(2026, 10, 23, 15, 30, 12), 'a1b2')).toBe('20261123-153012-a1b2.png');
    expect(attachmentName('webp')).toMatch(/^\d{8}-\d{6}-[a-z0-9]{4}\.webp$/);
  });

  it('fits the long side to 1600px', () => {
    expect(fitSize(3200, 1200)).toEqual({ width: 1600, height: 600, scaled: true });
    expect(fitSize(1000, 4000)).toEqual({ width: 400, height: 1600, scaled: true });
    expect(fitSize(1600, 900)).toEqual({ width: 1600, height: 900, scaled: false });
  });

  it('keeps small files and gifs as they are', () => {
    expect(initialPlan('image/png', 100_000, false)).toEqual({ kind: 'original' });
    expect(initialPlan('image/jpeg', 2_000_000, false)).toEqual({ kind: 'original' });
    expect(initialPlan('image/gif', 9_000_000, true)).toEqual({ kind: 'original' });
  });

  it('re-encodes large or oversized images', () => {
    expect(initialPlan('image/png', 900_000, false)).toEqual({ kind: 'encode', mime: 'image/png' });
    expect(initialPlan('image/jpeg', 100, true)).toMatchObject({ kind: 'encode', mime: 'image/jpeg' });
    expect(initialPlan('image/heic', 100, false)).toMatchObject({ kind: 'encode', mime: 'image/jpeg' });
  });

  it('switches PNG over 500KB to WebP', () => {
    expect(needsWebp('image/png', 600 * 1024)).toBe(true);
    expect(needsWebp('image/png', 400 * 1024)).toBe(false);
    expect(needsWebp('image/jpeg', 900 * 1024)).toBe(false);
  });
});
