import { useEffect, useState, type RefObject } from 'react';
import { CALLOUT_LABELS } from '../lib/markdown';
import type { EditorHandle } from './MarkdownEditor';

interface Props {
  editor: RefObject<EditorHandle | null>;
  onImage?: () => void;
}

/** Keep the toolbar glued to the top of the on-screen keyboard (iOS does not resize the layout viewport). */
function useKeyboardBottom(): number {
  const [bottom, setBottom] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBottom(Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return bottom;
}

export default function EditorToolbar({ editor, onImage }: Props) {
  const bottom = useKeyboardBottom();
  const [menu, setMenu] = useState(false);
  const e = () => editor.current;

  // Buttons must not steal focus from the editor (keeps the keyboard open).
  const keep = (ev: React.PointerEvent | React.MouseEvent) => ev.preventDefault();

  const buttons: { label: string; title: string; run: () => void }[] = [
    { label: '$', title: 'インライン数式', run: () => e()?.wrap('$', '$') },
    { label: '$$', title: 'ディスプレイ数式', run: () => e()?.wrap('$$\n', '\n$$') },
    {
      label: '[[',
      title: '記事リンク',
      run: () => {
        e()?.insert('[[]]', 2);
        e()?.complete();
      },
    },
    { label: '|', title: '縦棒', run: () => e()?.insert('|') },
    { label: '▣', title: 'ブロック（callout）', run: () => setMenu((m) => !m) },
    { label: '🖼', title: '画像', run: () => onImage?.() },
    { label: '\\', title: 'バックスラッシュ', run: () => e()?.insert('\\') },
    { label: '{}', title: '波括弧', run: () => e()?.wrap('{', '}') },
    { label: '^', title: '上付き', run: () => e()?.insert('^') },
    { label: '_', title: '下付き', run: () => e()?.insert('_') },
  ];

  function callout(type: string) {
    setMenu(false);
    const fold = type === 'proof' ? '-' : '';
    e()?.insertBlock(`> [!${type}]${fold} ${CALLOUT_LABELS[type]}\n> `);
  }

  return (
    <div className="editor-toolbar" style={{ bottom }} onPointerDown={keep} onMouseDown={keep}>
      {menu && (
        <div className="callout-menu">
          {Object.entries(CALLOUT_LABELS).map(([type, label]) => (
            <button key={type} onClick={() => callout(type)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="toolbar-row">
        {buttons.map((b) => (
          <button key={b.label} title={b.title} aria-label={b.title} onClick={b.run}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
