import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Backlinks from '../components/Backlinks';
import MarkdownView from '../components/MarkdownView';
import StatusBadge from '../components/StatusBadge';
import { parseNote } from '../lib/frontmatter';
import { renderMarkdown } from '../lib/markdown';
import { normalizeKey } from '../lib/normalize';
import { useRenderEnv } from '../lib/useRenderEnv';
import { useVault } from '../lib/useVault';

export default function NotePage() {
  const { title: rawTitle = '' } = useParams();
  const [params] = useSearchParams();
  const anchor = params.get('a');
  const snap = useVault();
  const resolved = snap.index.resolver.resolve(rawTitle) ?? rawTitle;
  const entry = snap.index.byTitle.get(normalizeKey(resolved));
  const note = entry ? snap.notes.get(entry.path) : undefined;
  const env = useRenderEnv(entry?.title);
  const html = useMemo(() => (note ? renderMarkdown(parseNote(note.content).body, env) : ''), [note, env]);

  useEffect(() => {
    if (!anchor) window.scrollTo(0, 0);
  }, [rawTitle, anchor]);

  if (!entry || !note) {
    if (!snap.loaded || snap.status === 'syncing') return <main className="page"><p className="hint">読み込み中…</p></main>;
    return (
      <main className="page">
        <h1>「{rawTitle}」は未作成です</h1>
        <Link className="button primary" to={`/new?title=${encodeURIComponent(rawTitle)}`}>この名前で新規作成</Link>
      </main>
    );
  }

  return (
    <main className="page note">
      <header className="note-header">
        <h1>{entry.title}</h1>
        <div className="note-meta">
          <StatusBadge status={entry.status} />
          {entry.aliases.length > 0 && <span className="aliases">別名: {entry.aliases.join('、')}</span>}
        </div>
        {entry.tags.length > 0 && (
          <div className="tags">
            {entry.tags.map((t) => (
              <Link key={t} className="tag" to={`/?tag=${encodeURIComponent(t)}`}>#{t}</Link>
            ))}
          </div>
        )}
      </header>
      <MarkdownView html={html} anchor={anchor} />
      <Backlinks title={entry.title} />
    </main>
  );
}
