import { splitFrontmatter } from './frontmatter';
import { normalizeKey } from './normalize';
import { cleanTarget } from './resolve';
import { scanWikiLinks } from './scan';

/**
 * Rewrite `[[old]]`, `[[old|…]]`, `[[old#…]]` (and embeds) to point at `newTitle`.
 * Only links whose target is the old *title* are rewritten; alias links keep working on their own.
 * Links inside code / math are left untouched. Frontmatter is not modified.
 */
export function rewriteLinks(text: string, oldTitle: string, newTitle: string): { text: string; count: number } {
  const { body } = splitFrontmatter(text);
  const offset = text.length - body.length;
  const oldKey = normalizeKey(oldTitle);
  const hits = scanWikiLinks(body).filter((o) => o.target && normalizeKey(cleanTarget(o.target)) === oldKey);
  if (!hits.length) return { text, count: 0 };
  let out = text;
  for (const h of [...hits].reverse()) {
    out = out.slice(0, offset + h.targetStart) + newTitle + out.slice(offset + h.targetEnd);
  }
  return { text: out, count: hits.length };
}
