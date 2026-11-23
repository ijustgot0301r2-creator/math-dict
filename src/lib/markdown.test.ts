import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';
import { Resolver } from './resolve';

const resolver = new Resolver([{ title: 'コンパクト', aliases: ['compact'] }]);
const env = { resolve: (t: string) => resolver.resolve(t), currentTitle: '現在' };
const r = (s: string) => renderMarkdown(s, env);

describe('markdown rendering', () => {
  it('renders resolved and unresolved wiki links', () => {
    const html = r('[[compact|コンパクトな]] と [[未作成]]');
    expect(html).toContain('class="wikilink" href="#/note/%E3%82%B3%E3%83%B3%E3%83%91%E3%82%AF%E3%83%88"');
    expect(html).toContain('>コンパクトな</a>');
    expect(html).toContain('class="wikilink unresolved"');
    expect(html).toContain('#/new?title=');
  });

  it('passes heading/block anchors in links', () => {
    const html = r('[[コンパクト#^def]] [[#見出し]]');
    expect(html).toContain('?a=%5Edef');
    expect(html).toContain('data-title="現在"');
  });

  it('does not create links inside math or code', () => {
    const html = r('$[[コンパクト]]$ `[[コンパクト]]`\n\n$$\n[[コンパクト]]\n$$');
    expect(html).not.toContain('wikilink');
    expect(html).toContain('katex');
    expect(html).toContain('<code>[[コンパクト]]</code>');
  });

  it('renders inline and display math', () => {
    const html = r('$x^2$ と\n\n$$\\int_0^1 f$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('math-display');
    expect(html).toContain('katex-display');
  });

  it('renders callouts with labels, fold state and block ids', () => {
    const html = r(
      '> [!definition] 定義（コンパクト）\n> 位相空間 $X$ が **コンパクト** ^def-compact\n\n> [!proof]- 証明\n> 明らか\n\n> [!theorem]+\n> 本文\n\n> [!foo] 何か\n> x',
    );
    expect(html).toContain('<div class="callout callout-definition" data-callout="definition" data-block="def-compact">');
    expect(html).toContain('定義（コンパクト）');
    expect(html).not.toContain('^def-compact');
    expect(html).toMatch(/<details class="callout callout-proof"[^>]*>\n<summary class="callout-title">/);
    expect(html).not.toMatch(/callout-proof"[^>]* open/);
    expect(html).toMatch(/<details class="callout callout-theorem"[^>]* open>/);
    expect(html).toContain('<span class="callout-label">定理</span>');
    expect(html).toContain('callout-generic');
  });

  it('assigns block ids to paragraphs and headings get anchors', () => {
    const html = r('## 証明\n\nある段落 ^p1\n\n- 項目 ^li');
    expect(html).toContain('<h2 data-heading="証明">');
    expect(html).toContain('<p data-block="p1">ある段落</p>');
    expect(html).toContain('<li data-block="li">');
  });

  it('assigns standalone block ids to the previous block', () => {
    const html = r('| a |\n|---|\n| b |\n\n^tbl');
    expect(html).toContain('<table data-block="tbl">');
  });

  it('renders attachments as placeholders', () => {
    const html = r('![[20261123-153012-a1b2.png]] ![x](../attachments/y.png)');
    expect(html).toContain('data-attachment="20261123-153012-a1b2.png"');
    expect(html).toContain('data-attachment="y.png"');
  });

  it('does not render raw HTML', () => {
    expect(r('<script>alert(1)</script>')).not.toContain('<script>');
  });
});
