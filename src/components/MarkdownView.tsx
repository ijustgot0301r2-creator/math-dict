import { useEffect, useRef } from 'react';
import { findAnchor } from '../lib/anchor';

interface Props {
  html: string;
  anchor?: string | null;
  className?: string;
}

export default function MarkdownView({ html, anchor, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !anchor) return;
    const el = findAnchor(root, anchor);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.closest('details')?.setAttribute('open', '');
    el.scrollIntoView({ block: 'start' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }, [html, anchor]);

  return <div ref={ref} className={`markdown ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
