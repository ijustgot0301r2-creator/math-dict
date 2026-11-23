import { Link } from 'react-router-dom';
import { renderInline } from '../lib/markdown';
import { useRenderEnv } from '../lib/useRenderEnv';
import { useVault } from '../lib/useVault';

export default function Backlinks({ title }: { title: string }) {
  const { index } = useVault();
  const env = useRenderEnv(title);
  const list = index.backlinks.get(title) ?? [];
  return (
    <section className="backlinks">
      <h2>被リンク（{list.length}）</h2>
      {list.length === 0 && <p className="hint">この記事を参照している記事はありません。</p>}
      <ul>
        {list.map((b) => (
          <li key={b.from}>
            <Link to={`/note/${encodeURIComponent(b.from)}`} className="backlink-title">{b.from}</Link>
            {b.excerpts.slice(0, 3).map((ex, i) => (
              <div key={i} className="excerpt markdown" dangerouslySetInnerHTML={{ __html: renderInline(ex, env) }} />
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
