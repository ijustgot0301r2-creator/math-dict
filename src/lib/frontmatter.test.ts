import { describe, expect, it } from 'vitest';
import { emptyFrontmatter, nowIso, parseNote, serializeNote } from './frontmatter';

const SAMPLE = `---
aliases: [compact, コンパクト性, コンパクトな]
tags: [位相空間論, 解析学/実解析]
status: draft        # draft | review | understood
summary: 任意の開被覆が有限部分被覆をもつ位相空間。
created: 2026-11-23T15:30:00+09:00
updated: 2026-11-23T15:30:00+09:00
---
本文
`;

describe('frontmatter', () => {
  it('parses the spec example', () => {
    const { fm, body, bodyLineOffset } = parseNote(SAMPLE);
    expect(fm.aliases).toEqual(['compact', 'コンパクト性', 'コンパクトな']);
    expect(fm.tags).toEqual(['位相空間論', '解析学/実解析']);
    expect(fm.status).toBe('draft');
    expect(fm.summary).toBe('任意の開被覆が有限部分被覆をもつ位相空間。');
    expect(fm.created).toBe('2026-11-23T15:30:00+09:00');
    expect(body).toBe('本文\n');
    expect(bodyLineOffset).toBe(8);
  });

  it('parses block lists, quotes and # tags (Obsidian style)', () => {
    const { fm } = parseNote(
      "---\naliases:\n  - \"a, b\"\n  - 'c''d'\ntags:\n  - \"#位相\"\n  - 解析\nstatus: understood\ncssclasses: wide\n---\nx",
    );
    expect(fm.aliases).toEqual(['a, b', "c'd"]);
    expect(fm.tags).toEqual(['位相', '解析']);
    expect(fm.status).toBe('understood');
    expect(fm.extra).toEqual(['cssclasses: wide']);
  });

  it('treats missing or unknown status as draft', () => {
    expect(parseNote('no frontmatter').fm.status).toBe('draft');
    expect(parseNote('---\nstatus: weird\n---\n').fm.status).toBe('draft');
  });

  it('handles block scalar summary', () => {
    const { fm } = parseNote('---\nsummary: >\n  一行目\n  二行目\n---\n');
    expect(fm.summary).toBe('一行目 二行目');
  });

  it('round-trips through serialize', () => {
    const fm = {
      ...emptyFrontmatter(),
      aliases: ['a: b', 'x'],
      tags: ['t/u'],
      status: 'review' as const,
      summary: '#始まり',
      extra: ['foo: 1'],
    };
    const text = serializeNote(fm, '\n\n本文');
    const back = parseNote(text);
    expect(back.fm.aliases).toEqual(['a: b', 'x']);
    expect(back.fm.tags).toEqual(['t/u']);
    expect(back.fm.status).toBe('review');
    expect(back.fm.summary).toBe('#始まり');
    expect(back.fm.extra).toEqual(['foo: 1']);
    expect(back.body).toBe('本文');
  });

  it('formats local time with offset', () => {
    expect(nowIso(new Date())).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
  });
});
