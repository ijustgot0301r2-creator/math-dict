import { parseNote, type Status } from './frontmatter';
import { imageMime, normalizeKey, titleFromPath } from './normalize';
import { Resolver } from './resolve';
import { scanWikiLinks } from './scan';

export interface LinkRef {
  target: string;
  anchor: string | null;
  /** The source line containing the link (trimmed, callout markers removed). */
  excerpt: string;
}

/** Per-note index data, persisted in IndexedDB alongside the note body. */
export interface NoteIndexEntry {
  path: string;
  title: string;
  sha: string;
  aliases: string[];
  tags: string[];
  status: Status;
  summary: string;
  created: string;
  updated: string;
  links: LinkRef[];
}

export interface Backlink {
  from: string;
  excerpts: string[];
}

export interface VaultIndex {
  entries: NoteIndexEntry[];
  byTitle: Map<string, NoteIndexEntry>; // normalized title -> entry
  resolver: Resolver;
  backlinks: Map<string, Backlink[]>; // title -> notes linking to it
  tags: string[];
}

const MAX_EXCERPT = 160;

export function excerptLine(line: string): string {
  let s = line.replace(/^(\s*>)+\s?/, '').replace(/^\[![\w-]+\][+-]?\s*/, '').replace(/\s\^[\w-]+\s*$/, '').trim();
  if (s.length > MAX_EXCERPT) s = s.slice(0, MAX_EXCERPT) + '…';
  return s;
}

export function indexNote(path: string, sha: string, content: string): NoteIndexEntry {
  const { fm, body } = parseNote(content);
  const links: LinkRef[] = [];
  for (const occ of scanWikiLinks(body)) {
    if (!occ.target) continue; // same-note anchor link
    if (occ.embed && imageMime(occ.target)) continue; // image embed, not a note link
    const ls = body.lastIndexOf('\n', occ.start) + 1;
    const le = body.indexOf('\n', occ.end);
    links.push({ target: occ.target, anchor: occ.anchor, excerpt: excerptLine(body.slice(ls, le < 0 ? body.length : le)) });
  }
  return {
    path,
    title: titleFromPath(path),
    sha,
    aliases: dedupe(fm.aliases),
    tags: dedupe(fm.tags),
    status: fm.status,
    summary: fm.summary,
    created: fm.created,
    updated: fm.updated,
    links,
  };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

export function buildIndex(input: NoteIndexEntry[]): VaultIndex {
  const entries = [...input].sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  const resolver = new Resolver(entries);
  const byTitle = new Map<string, NoteIndexEntry>();
  for (const e of entries) {
    const k = normalizeKey(e.title);
    if (!byTitle.has(k)) byTitle.set(k, e);
  }
  const backlinks = new Map<string, Backlink[]>();
  const tagSet = new Set<string>();
  for (const e of entries) {
    for (const t of e.tags) {
      // include parent tags for completion
      const parts = t.split('/');
      for (let i = 1; i <= parts.length; i++) tagSet.add(parts.slice(0, i).join('/'));
    }
    const perTarget = new Map<string, string[]>();
    for (const l of e.links) {
      const to = resolver.resolve(l.target);
      if (!to) continue;
      const arr = perTarget.get(to) ?? [];
      if (!arr.includes(l.excerpt)) arr.push(l.excerpt);
      perTarget.set(to, arr);
    }
    for (const [to, excerpts] of perTarget) {
      if (to === e.title) continue; // self reference
      const arr = backlinks.get(to) ?? [];
      arr.push({ from: e.title, excerpts });
      backlinks.set(to, arr);
    }
  }
  return { entries, byTitle, resolver, backlinks, tags: [...tagSet].sort((a, b) => a.localeCompare(b, 'ja')) };
}

/** Unresolved link targets (for diagnostics). */
export function unresolvedTargets(index: VaultIndex): string[] {
  const s = new Set<string>();
  for (const e of index.entries) for (const l of e.links) if (!index.resolver.resolve(l.target)) s.add(l.target);
  return [...s];
}
