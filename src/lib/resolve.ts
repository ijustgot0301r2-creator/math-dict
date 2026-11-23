import { normalizeKey } from './normalize';

/** Strip a trailing `.md` and any folder part from a link target. */
export function cleanTarget(target: string): string {
  let t = target.trim();
  if (/\.md$/i.test(t)) t = t.slice(0, -3);
  const slash = t.lastIndexOf('/');
  if (slash >= 0) t = t.slice(slash + 1);
  return t;
}

export interface Resolvable {
  title: string;
  aliases: string[];
}

/** Link resolution: (1) exact title, then (2) exact alias — both NFKC + case-insensitive. */
export class Resolver {
  private titles = new Map<string, string>();
  private aliases = new Map<string, string>();

  constructor(notes: Iterable<Resolvable>) {
    for (const n of notes) {
      const k = normalizeKey(n.title);
      if (!this.titles.has(k)) this.titles.set(k, n.title);
    }
    for (const n of notes) {
      for (const a of n.aliases) {
        const k = normalizeKey(a);
        if (k && !this.aliases.has(k)) this.aliases.set(k, n.title);
      }
    }
  }

  resolve(target: string): string | null {
    const k = normalizeKey(cleanTarget(target));
    if (!k) return null;
    return this.titles.get(k) ?? this.aliases.get(k) ?? null;
  }

  hasTitle(title: string): boolean {
    return this.titles.has(normalizeKey(title));
  }
}
