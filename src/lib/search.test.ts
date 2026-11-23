import { describe, expect, it } from 'vitest';
import { indexNote } from './indexer';
import { SearchIndex } from './search';
import { buildTagTree, findTag } from './tagtree';

const notes = [
  { title: 'コンパクト', aliases: ['compact', 'コンパクト性'], content: '---\naliases: [compact]\n---\n任意の開被覆が有限部分被覆をもつ。' },
  { title: '局所コンパクト', aliases: [], content: '各点がコンパクトな近傍をもつ。' },
  { title: '位相空間', aliases: ['Topological Space'], content: '開集合系が与えられた集合。Compact とは限らない。' },
  { title: 'ハイネ・ボレルの定理', aliases: [], content: '有界閉集合は\nＣＯＭＰＡＣＴである。' },
];

describe('SearchIndex', () => {
  const idx = new SearchIndex(notes);

  it('orders title > alias > body matches', () => {
    const hits = idx.search('compact');
    expect(hits.map((h) => [h.title, h.kind])).toEqual([
      ['コンパクト', 'alias'],
      ['位相空間', 'body'],
      ['ハイネ・ボレルの定理', 'body'],
    ]);
    const jp = idx.search('コンパクト');
    expect(jp[0]).toEqual({ title: 'コンパクト', kind: 'title' });
    expect(jp[1]).toEqual({ title: '局所コンパクト', kind: 'title' });
  });

  it('normalizes width and case, and gives body excerpts', () => {
    const hits = idx.search('ｔｏｐｏｌｏｇｉｃａｌ');
    expect(hits[0]).toMatchObject({ title: '位相空間', kind: 'alias', alias: 'Topological Space' });
    const body = idx.search('有限部分');
    expect(body[0].excerpt).toContain('有限部分被覆');
  });

  it('does not search frontmatter as body', () => {
    expect(idx.search('aliases')).toEqual([]);
  });

  it('returns nothing for blank queries', () => {
    expect(idx.search('  ')).toEqual([]);
  });

  it('stays fast with 1000 notes', () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({
      title: `記事${i}`,
      aliases: [`alias${i}`],
      content: `本文 ${'位相空間の開集合と閉集合について述べる。'.repeat(100)} 番号${i}`,
    }));
    const big = new SearchIndex(many);
    const t0 = performance.now();
    big.search('閉集合について');
    big.search('番号999');
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe('buildTagTree', () => {
  const e = (title: string, tags: string[]) =>
    indexNote(`notes/${title}.md`, 's', `---\ntags: [${tags.join(', ')}]\n---\n`);
  const tree = buildTagTree([e('A', ['解析学/実解析', '位相空間論']), e('B', ['解析学']), e('C', [])]);

  it('nests tags and lists notes under each of their tags', () => {
    expect(tree.map((n) => n.name)).toEqual(['位相空間論', '解析学', '未分類']);
    const an = findTag(tree, '解析学')!;
    expect(an.notes.map((n) => n.title)).toEqual(['B']);
    expect(an.children[0].path).toBe('解析学/実解析');
    expect(an.children[0].notes.map((n) => n.title)).toEqual(['A']);
    expect(an.count).toBe(2);
    expect(findTag(tree, '位相空間論')!.notes.map((n) => n.title)).toEqual(['A']);
  });

  it('puts untagged notes into 未分類', () => {
    expect(tree[2].notes.map((n) => n.title)).toEqual(['C']);
  });
});
