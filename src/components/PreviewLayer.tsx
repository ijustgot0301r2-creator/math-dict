import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { renderMarkdown } from '../lib/markdown';
import { normalizeKey } from '../lib/normalize';
import { extractPreview } from '../lib/preview';
import { useRenderEnv } from '../lib/useRenderEnv';
import { useVault } from '../lib/useVault';
import MarkdownView from './MarkdownView';
import StatusBadge from './StatusBadge';

const HOVER_MS = 300;
const LONG_PRESS_MS = 500;
const CLOSE_MS = 400;
const MAX_DEPTH = 3;

interface Item {
  /** Resolved note title, or null for an unresolved link. */
  title: string | null;
  target: string;
  anchor: string | null;
  link: HTMLElement;
  rect: DOMRect;
}

function linkInfo(a: HTMLElement): Omit<Item, 'link' | 'rect'> {
  return {
    title: a.dataset.title ?? null,
    target: a.dataset.title ?? a.dataset.target ?? '',
    anchor: a.dataset.anchor ?? null,
  };
}

const levelOf = (el: Element | null): number => Number((el?.closest('.preview-popup') as HTMLElement | null)?.dataset.level ?? 0);
const wikiLinkOf = (t: EventTarget | null): HTMLElement | null =>
  t instanceof Element ? (t.closest('a.wikilink') as HTMLElement | null) : null;

export default function PreviewLayer() {
  const [stack, setStack] = useState<Item[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const location = useLocation();

  const open = useCallback((a: HTMLElement) => {
    const lvl = levelOf(a);
    if (lvl >= MAX_DEPTH) return;
    const item: Item = { ...linkInfo(a), link: a, rect: a.getBoundingClientRect() };
    setStack((s) => [...s.slice(0, lvl), item]);
  }, []);

  const truncate = useCallback((n: number) => setStack((s) => (s.length > n ? s.slice(0, n) : s)), []);

  // Close everything on navigation.
  useEffect(() => setStack([]), [location.pathname, location.search]);

  useEffect(() => {
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let pressStart: { x: number; y: number } | null = null;
    let suppressClick = false;

    // ---- mouse (PC) ----
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const target = e.target as Element;
      const s = stackRef.current;
      // Which depth is the pointer "inside"?
      let keep = levelOf(target);
      s.forEach((it, i) => {
        if (it.link.contains(target)) keep = Math.max(keep, i + 1);
      });
      clearTimeout(closeTimer);
      if (keep < s.length) closeTimer = setTimeout(() => truncate(keep), CLOSE_MS);

      const a = wikiLinkOf(target);
      clearTimeout(hoverTimer);
      if (a && !s.some((it) => it.link === a)) hoverTimer = setTimeout(() => open(a), HOVER_MS);
    };
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const a = wikiLinkOf(e.target);
      if (a && !(e.relatedTarget instanceof Node && a.contains(e.relatedTarget))) clearTimeout(hoverTimer);
    };

    // ---- touch (long press) ----
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        // Clicking outside all popups closes them.
        if (!(e.target as Element).closest('.preview-popup')) truncate(0);
        return;
      }
      const a = wikiLinkOf(e.target);
      if (!a) {
        if (!(e.target as Element).closest('.preview-popup')) truncate(0);
        return;
      }
      pressStart = { x: e.clientX, y: e.clientY };
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        suppressClick = true;
        pressStart = null;
        open(a);
      }, LONG_PRESS_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) {
        clearTimeout(pressTimer);
        pressStart = null;
      }
    };
    const onUp = () => {
      clearTimeout(pressTimer);
      pressStart = null;
    };
    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      if (wikiLinkOf(e.target)) e.preventDefault();
    };
    const onScroll = (e: Event) => {
      // Popups are fixed-positioned: close them when the page (not a popup) scrolls.
      if (!(e.target instanceof Element && e.target.closest('.preview-popup'))) truncate(0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') truncate(0);
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(hoverTimer);
      clearTimeout(closeTimer);
      clearTimeout(pressTimer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, truncate]);

  return (
    <>
      {stack.map((it, i) => (
        <Popup key={i} item={it} level={i + 1} onClose={() => truncate(i)} onCloseAll={() => truncate(0)} />
      ))}
    </>
  );
}

interface PopupProps {
  item: Item;
  level: number;
  onClose: () => void;
  onCloseAll: () => void;
}

function Popup({ item, level, onClose, onCloseAll }: PopupProps) {
  const navigate = useNavigate();
  const snap = useVault();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const entry = item.title ? snap.index.byTitle.get(normalizeKey(item.title)) : undefined;
  const note = entry ? snap.notes.get(entry.path) : undefined;
  const env = useRenderEnv(entry?.title);
  const preview = useMemo(() => (note ? extractPreview(note.content, item.anchor) : null), [note, item.anchor]);
  const html = useMemo(() => (preview?.markdown ? renderMarkdown(preview.markdown, env) : ''), [preview, env]);

  // Place below the link if there is room, otherwise above; clamp horizontally.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const r = item.rect;
    const w = el.offsetWidth;
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - w - 8));
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const h = Math.min(el.scrollHeight, vh * 0.6);
    if (below >= h || below >= above) setPos({ left, top: r.bottom + 6, maxHeight: Math.max(120, below) });
    else setPos({ left, top: Math.max(8, r.top - 6 - Math.min(h, above)), maxHeight: above });
  }, [item.rect, html]);

  const go = (href: string) => {
    onCloseAll();
    navigate(href);
  };

  return (
    <div
      ref={ref}
      className="preview-popup"
      data-level={level}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? 0,
        maxHeight: pos?.maxHeight,
        zIndex: 60 + level,
      }}
      role="dialog"
      aria-label={`${item.target} のプレビュー`}
    >
      <div className="preview-head">
        <span className="preview-title">
          {entry?.title ?? item.target}
          {item.anchor && <span className="preview-anchor"> &gt; {item.anchor}</span>}
        </span>
        {entry && <StatusBadge status={entry.status} />}
        <button className="icon" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>
      {entry && note ? (
        <>
          {preview?.kind === 'missing-anchor' && <p className="hint">「{item.anchor}」が見つかりません。</p>}
          {html ? <MarkdownView html={html} className="preview-body" /> : <p className="hint">（本文がありません）</p>}
          <div className="preview-actions">
            <button
              className="primary"
              onClick={() =>
                go(`/note/${encodeURIComponent(entry.title)}${item.anchor ? `?a=${encodeURIComponent(item.anchor)}` : ''}`)
              }
            >
              記事を開く
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="unresolved-note">未作成</p>
          <div className="preview-actions">
            <button className="primary" onClick={() => go(`/new?title=${encodeURIComponent(item.target)}`)}>
              「{item.target}」を作成
            </button>
          </div>
        </>
      )}
    </div>
  );
}
