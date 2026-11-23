import { describe, expect, it } from 'vitest';
import { buildIndex, indexNote } from './indexer';
import { planSync } from './sync';

const note = (title: string, content: string) => indexNote(`notes/${title}.md`, 'sha-' + title, content);

describe('indexNote', () => {
  it('extracts metadata and links, skipping math/code and image embeds', () => {
    const e = note(
      'コンパクト',
      '---\naliases: [compact]\ntags: [位相空間論]\nstatus: review\n---\n> [!definition] 定義\n> [[位相空間]] $X$ が [[開被覆]] ... ^def\n\n$[[数式]]$ `[[コード]]` ![[a.png]] ![[埋め込み]]',
    );
    expect(e.title).toBe('コンパクト');
    expect(e.aliases).toEqual(['compact']);
    expect(e.status).toBe('review');
    expect(e.links.map((l) => l.target)).toEqual(['位相空間', '開被覆', '埋め込み']);
    expect(e.links[0].excerpt).toBe('[[位相空間]] $X$ が [[開被覆]] ...');
  });
});

describe('buildIndex', () => {
  it('computes backlinks via titles and aliases', () => {
    const idx = buildIndex([
      note('コンパクト', '---\naliases: [compact]\n---\n'),
      note('位相空間', '[[compact|コンパクト]]な空間\n\nまた [[コンパクト#性質]]'),
      note('ハイネ・ボレル', '[[コンパクト]] と [[未作成]]'),
    ]);
    const bl = idx.backlinks.get('コンパクト')!;
    expect(bl.map((b) => b.from).sort()).toEqual(['ハイネ・ボレル', '位相空間'].sort());
    expect(bl.find((b) => b.from === '位相空間')!.excerpts).toHaveLength(2);
    expect(idx.resolver.resolve('未作成')).toBeNull();
  });

  it('collects hierarchical tags including parents', () => {
    const idx = buildIndex([note('a', '---\ntags: [解析学/実解析]\n---\n')]);
    expect(idx.tags).toEqual(['解析学', '解析学/実解析']);
  });
});

describe('performance', () => {
  it('rebuilds the global index for 1000 notes quickly (startup from cache)', () => {
    const entries = Array.from({ length: 1000 }, (_, i) =>
      note(`記事${i}`, `---\naliases: [a${i}]\ntags: [分野${i % 20}/下位${i % 5}]\n---\n${'[[記事' + ((i * 7) % 1000) + ']] と $x^2$ の説明。\n'.repeat(20)}`),
    );
    const t0 = performance.now();
    const idx = buildIndex(entries);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(idx.backlinks.size).toBeGreaterThan(900);
  });
});

describe('planSync', () => {
  it('fetches only changed notes and removes deleted ones', () => {
    const cached = new Map([
      ['notes/a.md', '1'],
      ['notes/b.md', '2'],
      ['notes/gone.md', '3'],
    ]);
    const plan = planSync(cached, [
      { path: 'notes', mode: '040000', type: 'tree', sha: 't' },
      { path: 'notes/a.md', mode: '100644', type: 'blob', sha: '1' },
      { path: 'notes/b.md', mode: '100644', type: 'blob', sha: '2x' },
      { path: 'notes/new.md', mode: '100644', type: 'blob', sha: '4' },
      { path: 'attachments/p.png', mode: '100644', type: 'blob', sha: '5' },
      { path: 'README.md', mode: '100644', type: 'blob', sha: '6' },
    ]);
    expect(plan.fetch.map((e) => e.path)).toEqual(['notes/b.md', 'notes/new.md']);
    expect(plan.remove).toEqual(['notes/gone.md']);
    expect(plan.attachments).toEqual({ 'p.png': { path: 'attachments/p.png', sha: '5' } });
  });
});
