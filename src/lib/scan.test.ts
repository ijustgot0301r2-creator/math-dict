import { describe, expect, it } from 'vitest';
import { scanWikiLinks } from './scan';

const targets = (s: string) => scanWikiLinks(s).map((l) => l.target);

describe('scanWikiLinks', () => {
  it('finds plain, aliased, heading and block links', () => {
    const ls = scanWikiLinks(
      '[[コンパクト]] [[コンパクト|コンパクトな]] [[ハイネ・ボレルの定理#証明]] [[ハイネ・ボレルの定理#^thm-main]]',
    );
    expect(ls.map((l) => [l.target, l.anchor, l.display])).toEqual([
      ['コンパクト', null, null],
      ['コンパクト', null, 'コンパクトな'],
      ['ハイネ・ボレルの定理', '証明', null],
      ['ハイネ・ボレルの定理', '^thm-main', null],
    ]);
  });

  it('ignores links inside inline math', () => {
    expect(targets('$[[a]]$ と [[b]]')).toEqual(['b']);
  });

  it('ignores links inside display math (multi-line)', () => {
    expect(targets('$$\n[[a]]\n$$\n[[b]]')).toEqual(['b']);
    expect(targets('> $$\n> [[a]]\n> $$\n> [[b]]')).toEqual(['b']);
  });

  it('ignores links inside inline code and fenced code', () => {
    expect(targets('`[[a]]` ``x [[b]] x`` [[c]]')).toEqual(['c']);
    expect(targets('```\n[[a]]\n```\n[[b]]\n~~~md\n[[c]]\n~~~')).toEqual(['b']);
    expect(targets('> ```\n> [[a]]\n> ```\n> [[b]]')).toEqual(['b']);
  });

  it('does not treat $ followed by space or digits as math', () => {
    expect(targets('price $ 5 [[a]] and $3 [[b]]')).toEqual(['a', 'b']);
  });

  it('respects escapes', () => {
    expect(targets('\\$ [[a]] \\$')).toEqual(['a']);
    expect(targets('\\[[a]]')).toEqual([]);
  });

  it('detects embeds and escaped pipes in tables', () => {
    const [img, tbl] = scanWikiLinks('![[x.png]] | [[a\\|b]] |');
    expect(img.embed).toBe(true);
    expect(tbl.target).toBe('a');
    expect(tbl.display).toBe('b');
  });

  it('reports target offsets', () => {
    const s = 'x [[ 位相 #h|d]]';
    const [l] = scanWikiLinks(s);
    expect(s.slice(l.targetStart, l.targetEnd)).toBe('位相');
  });

  it('does not span lines', () => {
    expect(targets('[[a\nb]]')).toEqual([]);
  });
});
