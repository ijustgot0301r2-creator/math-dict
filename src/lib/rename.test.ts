import { describe, expect, it } from 'vitest';
import { rewriteLinks } from './rename';

describe('rewriteLinks', () => {
  it('rewrites plain, aliased and anchored links', () => {
    const src = '[[旧]] [[旧|表示]] [[旧#見出し]] [[旧#^blk|x]] ![[旧]] [[旧名]] [[別]]';
    const r = rewriteLinks(src, '旧', '新');
    expect(r.text).toBe('[[新]] [[新|表示]] [[新#見出し]] [[新#^blk|x]] ![[新]] [[旧名]] [[別]]');
    expect(r.count).toBe(5);
  });

  it('matches case- and width-insensitively', () => {
    expect(rewriteLinks('[[COMPACT]] [[ｃｏｍｐａｃｔ]]', 'compact', 'Compactness').text).toBe(
      '[[Compactness]] [[Compactness]]',
    );
  });

  it('leaves links in math and code untouched', () => {
    const src = '$[[旧]]$ `[[旧]]`\n```\n[[旧]]\n```\n$$\n[[旧]]\n$$\n[[旧]]';
    expect(rewriteLinks(src, '旧', '新').text).toBe('$[[旧]]$ `[[旧]]`\n```\n[[旧]]\n```\n$$\n[[旧]]\n$$\n[[新]]');
  });

  it('does not touch frontmatter', () => {
    const src = '---\nsummary: "[[旧]]"\n---\n[[旧]]';
    expect(rewriteLinks(src, '旧', '新').text).toBe('---\nsummary: "[[旧]]"\n---\n[[新]]');
  });

  it('returns the same text when nothing matches', () => {
    expect(rewriteLinks('abc', '旧', '新')).toEqual({ text: 'abc', count: 0 });
  });
});
