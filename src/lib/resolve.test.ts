import { describe, expect, it } from 'vitest';
import { Resolver } from './resolve';
import { validateTitle } from './normalize';

describe('Resolver', () => {
  const r = new Resolver([
    { title: 'コンパクト', aliases: ['compact', 'コンパクト性'] },
    { title: 'Compact Space', aliases: [] },
    { title: '位相空間', aliases: ['コンパクト'] },
  ]);
  it('prefers exact title over alias', () => {
    expect(r.resolve('コンパクト')).toBe('コンパクト');
  });
  it('resolves aliases', () => {
    expect(r.resolve('コンパクト性')).toBe('コンパクト');
  });
  it('ignores case and NFKC width differences', () => {
    expect(r.resolve('COMPACT')).toBe('コンパクト');
    expect(r.resolve('ｃｏｍｐａｃｔ space')).toBe('Compact Space');
    expect(r.resolve('ｺﾝﾊﾟｸﾄ')).toBe('コンパクト');
  });
  it('returns null for unresolved links', () => {
    expect(r.resolve('ない記事')).toBeNull();
  });
  it('accepts .md suffix and folders', () => {
    expect(r.resolve('notes/位相空間.md')).toBe('位相空間');
  });
});

describe('validateTitle', () => {
  it('rejects forbidden characters', () => {
    for (const c of ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '#', '^', '[', ']']) {
      expect(validateTitle(`a${c}b`)).not.toBeNull();
    }
  });
  it('accepts ordinary titles', () => {
    expect(validateTitle('ハイネ・ボレルの定理')).toBeNull();
  });
  it('rejects empty and padded titles', () => {
    expect(validateTitle('')).not.toBeNull();
    expect(validateTitle(' a')).not.toBeNull();
  });
});
