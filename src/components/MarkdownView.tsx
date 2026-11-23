import { useEffect, useRef } from 'react';
import { findAnchor } from '../lib/anchor';
import { useVault, useVaultApi } from '../lib/useVault';

interface Props {
  html: string;
  anchor?: string | null;
  className?: string;
}

export default function MarkdownView({ html, anchor, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const vault = useVaultApi();
  const { attachments, online } = useVault();

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

  // Private-repo images: resolve ![[name]] placeholders to cached Blob URLs.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;
    for (const img of root.querySelectorAll<HTMLImageElement>('img[data-attachment]')) {
      const name = img.dataset.attachment!;
      if (!attachments[name]) {
        img.classList.add('missing');
        img.title = `画像「${name}」が見つかりません`;
        continue;
      }
      img.classList.add('loading');
      void vault.attachmentUrl(name).then((url) => {
        if (cancelled) return;
        img.classList.remove('loading');
        if (url) {
          img.classList.remove('missing');
          img.src = url;
        } else {
          img.classList.add('missing');
          img.title = online ? `画像「${name}」を読み込めませんでした` : 'オフラインのため画像を読み込めません';
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [html, attachments, online, vault]);

  return <div ref={ref} className={`markdown ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
