import { describe, expect, it } from 'vitest';
import { extractPreview } from './preview';

const NOTE = `---
tags: [位相空間論]
---
# コンパクト

導入の段落です。

> [!definition]- 定義（コンパクト）
> 位相空間 $X$ が **コンパクト** であるとは、任意の開被覆が有限部分被覆をもつこと。 ^def-compact

## 性質

性質の段落。 ^p-prop

### 細目

細かい話。

## 例

例の段落。
`;

describe('extractPreview', () => {
  it('prefers the summary', () => {
    expect(extractPreview('---\nsummary: 要約です\n---\n本文', null)).toEqual({ kind: 'summary', markdown: '要約です' });
  });

  it('falls back to the first definition callout (unfolded)', () => {
    const p = extractPreview(NOTE, null);
    expect(p.kind).toBe('definition');
    expect(p.markdown.startsWith('> [!definition] 定義（コンパクト）')).toBe(true);
    expect(p.markdown).toContain('有限部分被覆');
  });

  it('falls back to the first paragraph', () => {
    expect(extractPreview('# 見出し\n\n最初の段落\n続き\n\n次の段落', null)).toEqual({
      kind: 'paragraph',
      markdown: '最初の段落\n続き',
    });
  });

  it('previews a heading section including sub-headings', () => {
    const p = extractPreview(NOTE, '性質');
    expect(p.kind).toBe('heading');
    expect(p.markdown).toContain('性質の段落');
    expect(p.markdown).toContain('細かい話');
    expect(p.markdown).not.toContain('例の段落');
  });

  it('previews a block by id (callout block id names the whole callout)', () => {
    const p = extractPreview(NOTE, '^def-compact');
    expect(p.kind).toBe('block');
    expect(p.markdown).toContain('[!definition]');
    expect(extractPreview(NOTE, '^p-prop')).toEqual({ kind: 'block', markdown: '性質の段落。 ^p-prop' });
  });

  it('strips blockquote markers for blocks inside quotes', () => {
    const p = extractPreview('> [!theorem] 定理\n> 一つ目 ^a\n>\n> 二つ目', '^a');
    expect(p.markdown).toBe('一つ目 ^a');
  });

  it('flags missing anchors but still shows something', () => {
    expect(extractPreview(NOTE, '存在しない').kind).toBe('missing-anchor');
  });

  it('reports empty notes', () => {
    expect(extractPreview('', null).kind).toBe('empty');
  });
});
