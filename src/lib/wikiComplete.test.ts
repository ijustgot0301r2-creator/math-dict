import { describe, expect, it } from 'vitest';
import { wikiOptions } from './wikiComplete';

const notes = [
  { title: 'コンパクト', aliases: ['compact', 'コンパクトな'] },
  { title: '局所コンパクト', aliases: [] },
  { title: '位相空間', aliases: ['Topological space'] },
];

describe('wikiOptions', () => {
  it('lists titles first, exact/prefix matches ranked higher', () => {
    const o = wikiOptions(notes, 'コンパクト');
    expect(o[0]).toMatchObject({ label: 'コンパクト', insert: 'コンパクト]]' });
    expect(o.map((x) => x.label)).toContain('局所コンパクト');
  });

  it('inserts [[Title|alias]] when an alias is chosen', () => {
    const o = wikiOptions(notes, 'topo');
    expect(o).toEqual([
      { label: 'Topological space', detail: '→ 位相空間', insert: '位相空間|Topological space]]', rank: 2 },
    ]);
  });

  it('does not duplicate a note whose title already matched', () => {
    const o = wikiOptions(notes, 'コンパクトな');
    expect(o.map((x) => x.insert)).toEqual(['コンパクト|コンパクトな]]']);
  });

  it('shows titles (not aliases) for an empty query', () => {
    expect(wikiOptions(notes, '').map((x) => x.label).sort()).toEqual(['コンパクト', '位相空間', '局所コンパクト'].sort());
  });

  it('is width/case-insensitive', () => {
    expect(wikiOptions(notes, 'ＣＯＭＰＡＣＴ')[0].insert).toBe('コンパクト|compact]]');
  });
});
