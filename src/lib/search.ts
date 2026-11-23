import { parseNote } from './frontmatter';
import { normalizeKey } from './normalize';

export interface SearchHit {
  title: string;
  kind: 'title' | 'alias' | 'body';
  alias?: string;
  excerpt?: string;
}

interface Doc {
  title: string;
  titleKey: string;
  aliases: { raw: string; key: string }[];
  body: string;
  bodyKey: string;
}

const EXCERPT_RADIUS = 40;

/**
 * In-memory search over titles, aliases and bodies.
 * Everything is NFKC-normalized and lower-cased once up front so each keystroke is a plain substring scan.
 */
export class SearchIndex {
  private docs: Doc[];

  constructor(notes: Iterable<{ title: string; aliases: string[]; content: string }>) {
    this.docs = [];
    for (const n of notes) {
      const body = parseNote(n.content).body;
      this.docs.push({
        title: n.title,
        titleKey: normalizeKey(n.title),
        aliases: n.aliases.map((a) => ({ raw: a, key: normalizeKey(a) })),
        body,
        bodyKey: body.normalize('NFKC').toLowerCase(),
      });
    }
  }

  search(query: string, limit = 50): SearchHit[] {
    const q = normalizeKey(query);
    if (!q) return [];
    const titleHits: { d: Doc; rank: number }[] = [];
    const aliasHits: { d: Doc; alias: string; rank: number }[] = [];
    const bodyHits: Doc[] = [];
    for (const d of this.docs) {
      const ti = d.titleKey.indexOf(q);
      if (ti >= 0) {
        titleHits.push({ d, rank: d.titleKey === q ? 0 : ti === 0 ? 1 : 2 });
        continue;
      }
      const a = d.aliases.find((x) => x.key.includes(q));
      if (a) {
        aliasHits.push({ d, alias: a.raw, rank: a.key === q ? 0 : a.key.startsWith(q) ? 1 : 2 });
        continue;
      }
      if (d.bodyKey.includes(q)) bodyHits.push(d);
    }
    const byRank = <T extends { d: Doc; rank: number }>(a: T, b: T) =>
      a.rank - b.rank || a.d.title.length - b.d.title.length || a.d.title.localeCompare(b.d.title, 'ja');
    titleHits.sort(byRank);
    aliasHits.sort(byRank);
    const out: SearchHit[] = [
      ...titleHits.map(({ d }) => ({ title: d.title, kind: 'title' as const })),
      ...aliasHits.map(({ d, alias }) => ({ title: d.title, kind: 'alias' as const, alias })),
    ].slice(0, limit);
    for (const d of bodyHits) {
      if (out.length >= limit) break;
      out.push({ title: d.title, kind: 'body', excerpt: bodyExcerpt(d.body, q) });
    }
    return out;
  }
}

function bodyExcerpt(body: string, q: string): string {
  for (const line of body.split('\n')) {
    const disp = line.normalize('NFKC');
    const i = disp.toLowerCase().indexOf(q);
    if (i < 0) continue;
    const start = Math.max(0, i - EXCERPT_RADIUS);
    const end = Math.min(disp.length, i + q.length + EXCERPT_RADIUS);
    return (start > 0 ? '…' : '') + disp.slice(start, end).trim() + (end < disp.length ? '…' : '');
  }
  // Match spans a line break: fall back to the normalized text.
  const flat = body.normalize('NFKC');
  const i = flat.toLowerCase().indexOf(q);
  return flat.slice(Math.max(0, i - EXCERPT_RADIUS), i + q.length + EXCERPT_RADIUS).replace(/\s+/g, ' ');
}
