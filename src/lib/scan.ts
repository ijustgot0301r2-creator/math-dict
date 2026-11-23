/**
 * Source scanners shared by the indexer, the rename rewriter and the markdown renderer.
 * Wiki links inside fenced code, inline code and math ($...$, $$...$$) are ignored.
 */

const isWs = (c: string | undefined) => c === undefined || /\s/.test(c);

/**
 * `src[start]` is a single `$`. Returns the index of the closing `$` or -1.
 * Rules (pandoc-like): the opening `$` must be followed by a non-space,
 * the closing `$` must be preceded by a non-space and not followed by a digit.
 */
export function findInlineMathEnd(src: string, start: number): number {
  const first = src[start + 1];
  if (first === undefined || first === '$' || isWs(first)) return -1;
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '\n' && /^\n[ \t>]*\n/.test(src.slice(i, i + 64))) return -1; // paragraph break
    if (c === '$') {
      if (isWs(src[i - 1])) continue;
      if (src[i + 1] !== undefined && /\d/.test(src[i + 1])) continue;
      return i;
    }
  }
  return -1;
}

/** `src[start..start+1]` is `$$`. Returns the index of the closing `$$` or -1. */
export function findDisplayMathEnd(src: string, start: number): number {
  for (let i = start + 2; i < src.length - 1; i++) {
    if (src[i] === '\\') {
      i++;
      continue;
    }
    if (src[i] === '$' && src[i + 1] === '$') return i;
  }
  return -1;
}

export interface WikiLinkParts {
  target: string;
  anchor: string | null;
  display: string | null;
  /** Offset of the target text within the inner string. */
  targetOffset: number;
  targetLength: number;
}

/** Parse the inside of `[[...]]`: `target#anchor|display` (`\|` is accepted as the separator, as in tables). */
export function parseLinkInner(inner: string): WikiLinkParts {
  const pipe = inner.indexOf('|');
  let left = pipe >= 0 ? inner.slice(0, pipe) : inner;
  const display = pipe >= 0 ? inner.slice(pipe + 1) : null;
  if (left.endsWith('\\')) left = left.slice(0, -1);
  const hash = left.indexOf('#');
  const rawTarget = hash >= 0 ? left.slice(0, hash) : left;
  const anchor = hash >= 0 ? left.slice(hash + 1).trim() : null;
  const lead = rawTarget.length - rawTarget.trimStart().length;
  const target = rawTarget.trim();
  return {
    target,
    anchor: anchor || null,
    display: display !== null && display.trim() !== '' ? display.trim() : null,
    targetOffset: lead,
    targetLength: target.length,
  };
}

export interface WikiLinkOcc extends WikiLinkParts {
  /** Start of the whole link (at `!` for embeds). */
  start: number;
  end: number;
  embed: boolean;
  targetStart: number;
  targetEnd: number;
}

const FENCE_OPEN = /^((?:[ \t]*>)*)[ \t]{0,3}(`{3,}|~{3,})/;

export function scanWikiLinks(text: string): WikiLinkOcc[] {
  const out: WikiLinkOcc[] = [];
  let fence: { ch: string; len: number } | null = null;
  let i = 0;
  const n = text.length;
  while (i < n) {
    // Line-start handling for fenced code blocks.
    if (i === 0 || text[i - 1] === '\n') {
      const eol = text.indexOf('\n', i);
      const line = text.slice(i, eol < 0 ? n : eol);
      const m = line.match(FENCE_OPEN);
      if (fence) {
        if (m && m[2][0] === fence.ch && m[2].length >= fence.len && line.slice(m[0].length).trim() === '') fence = null;
        i = eol < 0 ? n : eol + 1;
        continue;
      }
      if (m && !(m[2][0] === '`' && line.slice(m[0].length).includes('`'))) {
        fence = { ch: m[2][0], len: m[2].length };
        i = eol < 0 ? n : eol + 1;
        continue;
      }
    }
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') {
      let run = 1;
      while (text[i + run] === '`') run++;
      const close = findBacktickRun(text, i + run, run);
      i = close >= 0 ? close + run : i + run;
      continue;
    }
    if (c === '$') {
      if (text[i + 1] === '$') {
        const e = findDisplayMathEnd(text, i);
        i = e >= 0 ? e + 2 : i + 2;
      } else {
        const e = findInlineMathEnd(text, i);
        i = e >= 0 ? e + 1 : i + 1;
      }
      continue;
    }
    if (c === '[' && text[i + 1] === '[') {
      const embed = text[i - 1] === '!' && text[i - 2] !== '\\';
      const close = text.indexOf(']]', i + 2);
      const nl = text.indexOf('\n', i + 2);
      if (close >= 0 && (nl < 0 || close < nl)) {
        const inner = text.slice(i + 2, close);
        if (inner.trim() !== '' && !inner.includes('[[')) {
          const parts = parseLinkInner(inner);
          if (parts.target !== '' || parts.anchor) {
            const targetStart = i + 2 + parts.targetOffset;
            out.push({
              ...parts,
              start: embed ? i - 1 : i,
              end: close + 2,
              embed,
              targetStart,
              targetEnd: targetStart + parts.targetLength,
            });
          }
          i = close + 2;
          continue;
        }
      }
      i += 2;
      continue;
    }
    i++;
  }
  return out;
}

function findBacktickRun(text: string, from: number, len: number): number {
  let i = from;
  while (i < text.length) {
    const j = text.indexOf('`', i);
    if (j < 0) return -1;
    // Do not cross a blank line.
    if (/\n[ \t>]*\n/.test(text.slice(i, j))) return -1;
    let run = 1;
    while (text[j + run] === '`') run++;
    if (run === len) return j;
    i = j + run;
  }
  return -1;
}
