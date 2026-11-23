import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchIndex } from '../lib/useSearchIndex';

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

export default function SearchBox() {
  const navigate = useNavigate();
  const getIndex = useSearchIndex();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const hits = useMemo(() => (q.trim() ? getIndex().search(q, 30) : []), [getIndex, q]);
  const trimmed = q.trim();
  // Selectable items: the hits, or a single "create" entry.
  const count = hits.length || (trimmed ? 1 : 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((k === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !isEditable(document.activeElement))) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setSel(0), [q]);

  function go(i: number) {
    if (hits.length) navigate(`/note/${encodeURIComponent(hits[i].title)}`);
    else if (trimmed) navigate(`/new?title=${encodeURIComponent(trimmed)}`);
    else return;
    setQ('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(sel);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="search">
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="go"
        placeholder="検索（/ または Ctrl+K）"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        aria-label="検索"
      />
      {open && trimmed && (
        <ul className="search-results" onMouseDown={(e) => e.preventDefault()}>
          {hits.map((h, i) => (
            <li key={h.title} className={i === sel ? 'selected' : ''} onClick={() => go(i)} onMouseEnter={() => setSel(i)}>
              <div className="search-title">
                {h.title}
                {h.kind === 'alias' && <span className="search-kind">別名: {h.alias}</span>}
                {h.kind === 'body' && <span className="search-kind">本文</span>}
              </div>
              {h.excerpt && <div className="search-excerpt">{h.excerpt}</div>}
            </li>
          ))}
          {hits.length === 0 && (
            <li className="selected search-create" onClick={() => go(0)}>
              『{trimmed}』を新規作成
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
