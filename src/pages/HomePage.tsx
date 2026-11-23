import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { STATUSES, STATUS_LABEL, type Status } from '../lib/frontmatter';
import { buildTagTree, findTag, type TagNode } from '../lib/tagtree';
import { useVault } from '../lib/useVault';

const COLLAPSE_KEY = 'math-dict:collapsed-tags';
const FILTER_KEY = 'math-dict:status-filter';

function loadSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function storeSet(key: string, s: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...s]));
}

export default function HomePage() {
  const snap = useVault();
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag');
  const [filter, setFilter] = useState<Set<Status>>(() => loadSet(FILTER_KEY) as Set<Status>);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadSet(COLLAPSE_KEY));

  const entries = useMemo(
    () => (filter.size ? snap.index.entries.filter((e) => filter.has(e.status)) : snap.index.entries),
    [snap.index, filter],
  );
  const tree = useMemo(() => buildTagTree(entries), [entries]);
  const tagNode = tag !== null ? findTag(tree, tag) : null;
  const shown = tag !== null ? (tagNode ? [tagNode] : []) : tree;

  function updateFilter(next: Set<Status>) {
    setFilter(next);
    storeSet(FILTER_KEY, next);
  }

  function toggleFilter(s: Status) {
    const next = new Set(filter);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    updateFilter(next);
  }

  function toggle(path: string) {
    const next = new Set(collapsed);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setCollapsed(next);
    storeSet(COLLAPSE_KEY, next);
  }

  return (
    <main className="page home">
      <div className="home-actions">
        <Link to="/new" className="button primary">
          ＋ 新規記事
        </Link>
        <div className="filters" role="group" aria-label="ステータスで絞り込み">
          <button className={filter.size === 0 ? 'chip active' : 'chip'} onClick={() => updateFilter(new Set())}>
            すべて
          </button>
          {STATUSES.map((s) => (
            <button key={s} className={filter.has(s) ? 'chip active' : 'chip'} onClick={() => toggleFilter(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {tag !== null && (
        <div className="banner info">
          タグ「{tag || '未分類'}」を表示中
          <button className="link" onClick={() => setParams({})}>
            すべてのタグ
          </button>
        </div>
      )}
      {!snap.loaded ? (
        <p className="hint">読み込み中…</p>
      ) : snap.index.entries.length === 0 ? (
        <p className="hint">
          {snap.status === 'syncing' ? '同期中…' : 'まだ記事がありません。「新規記事」から作成してください。'}
        </p>
      ) : shown.length === 0 ? (
        <p className="hint">該当する記事はありません。</p>
      ) : (
        <ul className="tagtree">
          {shown.map((n) => (
            <TagItem key={n.path || '__untagged'} node={n} collapsed={collapsed} toggle={toggle} />
          ))}
        </ul>
      )}
    </main>
  );
}

interface TagItemProps {
  node: TagNode;
  collapsed: Set<string>;
  toggle: (p: string) => void;
}

function TagItem({ node, collapsed, toggle }: TagItemProps) {
  const key = node.path || '__untagged';
  const isCollapsed = collapsed.has(key);
  return (
    <li className="tag-node">
      <button className="tag-toggle" onClick={() => toggle(key)} aria-expanded={!isCollapsed}>
        <span className="caret">{isCollapsed ? '▸' : '▾'}</span>
        <span className="tag-name">{node.name}</span>
        <span className="tag-count">{node.count}</span>
      </button>
      {!isCollapsed && (
        <ul>
          {node.children.map((c) => (
            <TagItem key={c.path} node={c} collapsed={collapsed} toggle={toggle} />
          ))}
          {node.notes.map((e) => (
            <li key={e.path} className="note-item">
              <Link to={`/note/${encodeURIComponent(e.title)}`}>{e.title}</Link>
              <StatusBadge status={e.status} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
