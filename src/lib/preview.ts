import type { Token } from 'markdown-it';
import { parseNote } from './frontmatter';
import { md } from './markdown';
import { normalizeKey } from './normalize';

export interface PreviewSource {
  kind: 'summary' | 'definition' | 'paragraph' | 'heading' | 'block' | 'empty' | 'missing-anchor';
  /** Markdown to render in the popup. */
  markdown: string;
}

const noopEnv = { resolve: () => null };

function sliceLines(lines: string[], map: [number, number], quoteDepth: number): string {
  let out = lines.slice(map[0], map[1]);
  for (let d = 0; d < quoteDepth; d++) out = out.map((l) => l.replace(/^\s{0,3}>\s?/, ''));
  return out.join('\n').trim();
}

/** Number of enclosing (non-callout-target) blockquotes of token i. */
function quoteDepth(tokens: Token[], i: number): number {
  let depth = 0;
  let level = tokens[i].level;
  for (let k = i - 1; k >= 0 && level > 0; k--) {
    const t = tokens[k];
    if (t.nesting === 1 && t.level < level) {
      if (t.type === 'blockquote_open') depth++;
      level = t.level;
    }
  }
  return depth;
}

/**
 * Pick what to show in a link preview:
 * heading/block anchor → that section; otherwise summary → first [!definition] → first paragraph.
 */
export function extractPreview(content: string, anchor: string | null): PreviewSource {
  const { fm, body } = parseNote(content);
  const tokens = md.parse(body, noopEnv);
  const lines = body.split('\n');

  if (anchor) {
    const a = anchor.split('#').pop()!.trim();
    if (a.startsWith('^')) {
      const id = a.slice(1);
      const i = tokens.findIndex((t) => t.meta?.blockId === id && t.map);
      if (i >= 0) return { kind: 'block', markdown: sliceLines(lines, tokens[i].map as [number, number], quoteDepth(tokens, i)) };
    } else {
      const key = normalizeKey(a);
      const i = tokens.findIndex((t, k) => t.type === 'heading_open' && normalizeKey(tokens[k + 1]?.content ?? '') === key);
      if (i >= 0 && tokens[i].map) {
        const level = Number(tokens[i].tag.slice(1));
        let end = lines.length;
        for (let k = i + 1; k < tokens.length; k++) {
          const t = tokens[k];
          if (t.type === 'heading_open' && Number(t.tag.slice(1)) <= level && t.map && t.level === tokens[i].level) {
            end = t.map[0];
            break;
          }
        }
        return { kind: 'heading', markdown: lines.slice(tokens[i].map[0], end).join('\n').trim() };
      }
    }
    // Anchor not found: fall through to the default preview, but flag it.
    const d = defaultPreview(fm.summary, tokens, lines);
    return { ...d, kind: d.kind === 'empty' ? 'empty' : 'missing-anchor' };
  }
  return defaultPreview(fm.summary, tokens, lines);
}

function defaultPreview(summary: string, tokens: Token[], lines: string[]): PreviewSource {
  if (summary.trim()) return { kind: 'summary', markdown: summary.trim() };
  const def = tokens.findIndex((t) => t.type === 'blockquote_open' && t.meta?.callout === 'definition' && t.map);
  if (def >= 0) {
    // Show the definition's content without its fold marker so it is open in the popup.
    const src = sliceLines(lines, tokens[def].map as [number, number], quoteDepth(tokens, def));
    return { kind: 'definition', markdown: src.replace(/^(\s*>\s*\[![\w-]+\])[+-]/, '$1') };
  }
  const p = tokens.findIndex((t) => t.type === 'paragraph_open' && t.level === 0 && t.map);
  if (p >= 0) return { kind: 'paragraph', markdown: sliceLines(lines, tokens[p].map as [number, number], 0) };
  return { kind: 'empty', markdown: '' };
}
