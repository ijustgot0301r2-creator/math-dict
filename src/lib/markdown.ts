import MarkdownIt from 'markdown-it';
import type { StateBlock, StateCore, StateInline, Token } from 'markdown-it';
import katex from 'katex';
import { basename, imageMime, normalizeKey } from './normalize';
import { findDisplayMathEnd, findInlineMathEnd, parseLinkInner } from './scan';

export interface RenderEnv {
  /** Resolve a link target to an existing note title (or null = unresolved). */
  resolve: (target: string) => string | null;
  /** Title of the note being rendered (for `[[#heading]]`). */
  currentTitle?: string;
}

export const CALLOUT_LABELS: Record<string, string> = {
  definition: '定義',
  theorem: '定理',
  proposition: '命題',
  lemma: '補題',
  corollary: '系',
  proof: '証明',
  example: '例',
  remark: '注意',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const meta = (t: Token): Record<string, any> => (t.meta ?? {}) as Record<string, any>;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------- math ----------

const katexCache = new Map<string, string>();
export function renderMath(tex: string, display: boolean): string {
  const key = (display ? 'D' : 'I') + tex;
  let html = katexCache.get(key);
  if (html === undefined) {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false });
    if (katexCache.size > 3000) katexCache.clear();
    katexCache.set(key, html);
  }
  return html;
}

function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src.slice(0, state.posMax);
  const pos = state.pos;
  if (src[pos] !== '$') return false;
  if (src[pos + 1] === '$') {
    const end = findDisplayMathEnd(src, pos);
    if (end < 0) return false;
    if (!silent) {
      const t = state.push('math_inline', 'math', 0);
      t.content = src.slice(pos + 2, end);
      t.meta = { display: true };
    }
    state.pos = end + 2;
    return true;
  }
  const end = findInlineMathEnd(src, pos);
  if (end < 0) return false;
  if (!silent) {
    const t = state.push('math_inline', 'math', 0);
    t.content = src.slice(pos + 1, end);
    t.meta = { display: false };
  }
  state.pos = end + 1;
  return true;
}

function lineText(state: StateBlock, line: number): string {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const first = lineText(state, startLine);
  if (!first.startsWith('$$')) return false;
  const rest = first.slice(2);
  const restTrim = rest.trimEnd();
  let content: string;
  let last = startLine;
  if (restTrim.length >= 2 && restTrim.endsWith('$$')) {
    const inner = restTrim.slice(0, -2);
    if (inner.includes('$$')) return false;
    content = inner;
  } else {
    if (rest.includes('$$')) return false; // `$$a$$ text` is inline math in a paragraph
    const lines = [rest];
    let found = false;
    for (let l = startLine + 1; l < endLine; l++) {
      if (state.sCount[l] < state.blkIndent && lineText(state, l).trim() !== '') break;
      const t = lineText(state, l);
      const tt = t.trimEnd();
      if (tt.endsWith('$$')) {
        lines.push(tt.slice(0, -2));
        last = l;
        found = true;
        break;
      }
      lines.push(t);
    }
    if (!found) return false;
    content = lines.join('\n');
  }
  if (silent) return true;
  const tok = state.push('math_block', 'math', 0);
  tok.block = true;
  tok.content = content.trim();
  tok.map = [startLine, last + 1];
  state.line = last + 1;
  return true;
}

// ---------- wiki links ----------

function wikiLink(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  let pos = state.pos;
  const max = state.posMax;
  let embed = false;
  if (src[pos] === '!') {
    embed = true;
    pos++;
  }
  if (src[pos] !== '[' || src[pos + 1] !== '[') return false;
  const close = src.indexOf(']]', pos + 2);
  if (close < 0 || close + 2 > max) return false;
  const inner = src.slice(pos + 2, close);
  if (!inner.trim() || inner.includes('\n') || inner.includes('[[')) return false;
  const parts = parseLinkInner(inner);
  if (!parts.target && !parts.anchor) return false;
  if (!silent) {
    const t = state.push('wikilink', 'a', 0);
    t.meta = { ...parts, embed };
  }
  state.pos = close + 2;
  return true;
}

export function noteHref(title: string, anchor?: string | null): string {
  return `#/note/${encodeURIComponent(title)}${anchor ? `?a=${encodeURIComponent(anchor)}` : ''}`;
}

export function newNoteHref(title: string): string {
  return `#/new?title=${encodeURIComponent(title)}`;
}

function renderWikiLink(tokens: Token[], idx: number, _o: unknown, env: RenderEnv): string {
  const m = meta(tokens[idx]) as ReturnType<typeof parseLinkInner> & { embed: boolean };
  if (m.embed && imageMime(m.target)) {
    const width = m.display && /^\d+(x\d+)?$/.test(m.display) ? ` width="${m.display.split('x')[0]}"` : '';
    const alt = m.display && !width ? m.display : m.target;
    return `<img class="attachment" data-attachment="${escapeHtml(basename(m.target))}" alt="${escapeHtml(alt)}"${width}>`;
  }
  const text = m.display ?? (m.target ? (m.anchor ? `${m.target} > ${m.anchor}` : m.target) : (m.anchor ?? ''));
  const title = m.target ? env?.resolve?.(m.target) : (env?.currentTitle ?? null);
  const anchorAttr = m.anchor ? ` data-anchor="${escapeHtml(m.anchor)}"` : '';
  if (title) {
    return `<a class="wikilink" href="${escapeHtml(noteHref(title, m.anchor))}" data-title="${escapeHtml(title)}"${anchorAttr}>${escapeHtml(text)}</a>`;
  }
  return `<a class="wikilink unresolved" href="${escapeHtml(newNoteHref(m.target))}" data-target="${escapeHtml(m.target)}"${anchorAttr}>${escapeHtml(text)}</a>`;
}

// ---------- callouts & block ids ----------

const CALLOUT_RE = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/;

function matchingClose(tokens: Token[], openIdx: number): number {
  const open = tokens[openIdx];
  const closeType = open.type.replace('_open', '_close');
  for (let j = openIdx + 1; j < tokens.length; j++) {
    if (tokens[j].type === closeType && tokens[j].level === open.level) return j;
  }
  return -1;
}

function calloutRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open.type !== 'blockquote_open') continue;
    const p = tokens[i + 1];
    const inl = tokens[i + 2];
    if (!p || p.type !== 'paragraph_open' || !inl || inl.type !== 'inline') continue;
    const nl = inl.content.indexOf('\n');
    const firstLine = nl < 0 ? inl.content : inl.content.slice(0, nl);
    const m = firstLine.match(CALLOUT_RE);
    if (!m) continue;
    const close = matchingClose(tokens, i);
    if (close < 0) continue;
    const type = m[1].toLowerCase();
    const fold = m[2] as '' | '+' | '-';
    open.meta = { ...(open.meta ?? {}), callout: type, fold };
    tokens[close].meta = { ...(tokens[close].meta ?? {}), callout: type, fold };

    const titleOpen = new state.Token('callout_title_open', 'div', 1);
    titleOpen.meta = { callout: type, fold };
    const titleInline = new state.Token('inline', '', 0);
    titleInline.content = m[3];
    titleInline.children = [];
    titleInline.map = p.map;
    const titleClose = new state.Token('callout_title_close', 'div', -1);
    titleOpen.level = titleClose.level = open.level + 1;
    titleInline.level = open.level + 2;
    titleClose.meta = { fold };

    const rest = nl < 0 ? '' : inl.content.slice(nl + 1);
    if (rest.trim() === '') {
      tokens.splice(i + 1, 3, titleOpen, titleInline, titleClose);
    } else {
      inl.content = rest;
      if (p.map) p.map = [p.map[0] + 1, p.map[1]];
      tokens.splice(i + 1, 0, titleOpen, titleInline, titleClose);
    }
  }
}

const BLOCK_ID_RE = /(^|\s)\^([A-Za-z0-9-]+)[ \t]*$/;

function blockIdRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const inl = tokens[i];
    if (inl.type !== 'inline' || tokens[i - 1]?.type !== 'paragraph_open') continue;
    const m = inl.content.match(BLOCK_ID_RE);
    if (!m) continue;
    const id = m[2];
    const pOpen = tokens[i - 1];
    inl.content = inl.content.slice(0, m.index! + m[1].length).trimEnd();
    let target: Token = pOpen;
    const after = tokens[i + 2];
    const before = tokens[i - 2];
    if (inl.content === '') {
      // Standalone "^id" line: applies to the previous block.
      let j = i - 2;
      while (j >= 0 && tokens[j].level > pOpen.level) j--;
      const prevClose = tokens[j];
      tokens.splice(i - 1, 3);
      i -= 2;
      if (prevClose?.type.endsWith('_close')) {
        const k = findOpen(tokens, j);
        if (k < 0) continue;
        target = tokens[k];
      } else if (prevClose?.block && prevClose.nesting === 0) {
        target = prevClose; // math_block, fence, ...
      } else continue;
    } else if (after?.type === 'blockquote_close' && after.meta?.callout) {
      // Last paragraph of a callout: the id names the whole callout.
      const k = findOpen(tokens, i + 2);
      if (k >= 0) target = tokens[k];
    } else if (pOpen.hidden && before?.type === 'list_item_open') {
      target = before;
    }
    target.attrSet('data-block', id);
    target.meta = { ...(target.meta ?? {}), blockId: id };
  }
}

function findOpen(tokens: Token[], closeIdx: number): number {
  const close = tokens[closeIdx];
  const openType = close.type.replace('_close', '_open');
  for (let k = closeIdx - 1; k >= 0; k--) if (tokens[k].type === openType && tokens[k].level === close.level) return k;
  return -1;
}

function headingRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open' && tokens[i + 1]?.type === 'inline') {
      tokens[i].attrSet('data-heading', normalizeKey(tokens[i + 1].content));
    }
  }
}

function renderCalloutOpen(tokens: Token[], idx: number): string {
  const t = tokens[idx];
  const type = meta(t).callout as string;
  const known = type in CALLOUT_LABELS;
  const cls = `callout callout-${known ? type : 'generic'}`;
  const block = t.attrGet('data-block');
  const attrs = ` class="${cls}" data-callout="${escapeHtml(type)}"${block ? ` data-block="${escapeHtml(String(block))}"` : ''}`;
  if (meta(t).fold) return `<details${attrs}${meta(t).fold === '+' ? ' open' : ''}>\n`;
  return `<div${attrs}>\n`;
}

// ---------- factory ----------

function createMarkdown() {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
  md.inline.ruler.before('escape', 'math_inline', mathInline);
  md.inline.ruler.before('link', 'wikilink', wikiLink);
  md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.core.ruler.after('block', 'callout', calloutRule);
  md.core.ruler.after('callout', 'block_id', blockIdRule);
  md.core.ruler.after('inline', 'heading_anchor', headingRule);

  const r = md.renderer.rules;
  r.math_inline = (tokens, idx) => renderMath(tokens[idx].content, meta(tokens[idx]).display);
  r.math_block = (tokens, idx) => {
    const block = tokens[idx].attrGet('data-block');
    return `<div class="math-display"${block ? ` data-block="${escapeHtml(String(block))}"` : ''}>${renderMath(tokens[idx].content, true)}</div>\n`;
  };
  r.wikilink = (tokens, idx, o, env) => renderWikiLink(tokens, idx, o, env as unknown as RenderEnv);

  const bqOpen = r.blockquote_open ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
  const bqClose = r.blockquote_close ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
  r.blockquote_open = (t, i, o, e, self) => (meta(t[i]).callout ? renderCalloutOpen(t, i) : bqOpen(t, i, o, e, self));
  r.blockquote_close = (t, i, o, e, self) =>
    meta(t[i]).callout ? `</div>${meta(t[i]).fold ? '</details>' : '</div>'}\n` : bqClose(t, i, o, e, self);
  r.callout_title_open = (t, i) => {
    const type = meta(t[i]).callout as string;
    const label = CALLOUT_LABELS[type] ?? type;
    const tag = meta(t[i]).fold ? 'summary' : 'div';
    const title = t[i + 1]?.content?.trim() ?? '';
    const showLabel = !title || !title.startsWith(label);
    return `<${tag} class="callout-title">${showLabel ? `<span class="callout-label">${escapeHtml(label)}</span>` : ''}`;
  };
  r.callout_title_close = (t, i) => `</${meta(t[i]).fold ? 'summary' : 'div'}><div class="callout-content">\n`;

  const imgDefault = r.image!;
  r.image = (tokens, idx, o, env, self) => {
    const t = tokens[idx];
    const src = String(t.attrGet('src') ?? '');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(src) && imageMime(src)) {
      const name = basename(decodeURIComponentSafe(src));
      return `<img class="attachment" data-attachment="${escapeHtml(name)}" alt="${escapeHtml(t.content)}">`;
    }
    return imgDefault(tokens, idx, o, env, self);
  };
  const linkOpen = r.link_open ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
  r.link_open = (t, i, o, e, self) => {
    const href = String(t[i].attrGet('href') ?? '');
    if (/^https?:/i.test(href)) {
      t[i].attrSet('target', '_blank');
      t[i].attrSet('rel', 'noopener noreferrer');
    }
    return linkOpen(t, i, o, e, self);
  };
  return md;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export const md = createMarkdown();

export function renderMarkdown(body: string, env: RenderEnv): string {
  return md.render(body, env as never);
}

export function renderInline(text: string, env: RenderEnv): string {
  return md.renderInline(text, env as never);
}
