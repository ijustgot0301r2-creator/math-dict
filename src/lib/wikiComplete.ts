import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { normalizeKey } from './normalize';

export interface CompletionNote {
  title: string;
  aliases: string[];
}

export interface WikiOption {
  label: string;
  detail?: string;
  insert: string; // text that replaces the query (including the closing ]])
  rank: number;
}

/**
 * Candidates for `[[query`: titles and aliases. Choosing an alias inserts `[[Title|alias]]`.
 * Pure function so it can be unit-tested.
 */
export function wikiOptions(notes: CompletionNote[], query: string, limit = 50): WikiOption[] {
  const q = normalizeKey(query);
  const out: WikiOption[] = [];
  for (const n of notes) {
    const tk = normalizeKey(n.title);
    const ti = q ? tk.indexOf(q) : 0;
    if (ti >= 0) out.push({ label: n.title, insert: `${n.title}]]`, rank: tk === q ? 0 : ti === 0 ? 1 : 3 });
    for (const a of n.aliases) {
      const ak = normalizeKey(a);
      const ai = q ? ak.indexOf(q) : -1; // aliases only when something was typed
      if (ai >= 0 && ti < 0) {
        out.push({ label: a, detail: `→ ${n.title}`, insert: `${n.title}|${a}]]`, rank: ak === q ? 0.5 : ai === 0 ? 2 : 4 });
      }
    }
  }
  out.sort((a, b) => a.rank - b.rank || a.label.length - b.label.length || a.label.localeCompare(b.label, 'ja'));
  return out.slice(0, limit);
}

export function wikiCompletionSource(getNotes: () => CompletionNote[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\[\[[^[\]|#\n]*$/);
    if (!m) return null;
    const query = m.text.slice(2);
    const from = m.from + 2;
    const options: Completion[] = wikiOptions(getNotes(), query).map((o) => ({
      label: o.label,
      detail: o.detail,
      apply: (view: EditorView, _c: Completion, f: number, to: number) => {
        // Swallow an already-present closing "]]" (e.g. inserted by the toolbar).
        const end = view.state.sliceDoc(to, to + 2) === ']]' ? to + 2 : to;
        view.dispatch({ changes: { from: f, to: end, insert: o.insert }, selection: { anchor: f + o.insert.length } });
      },
    }));
    return { from, options, filter: false };
  };
}
