import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { autocompletion, completionKeymap, startCompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { wikiCompletionSource, type CompletionNote } from '../lib/wikiComplete';

export interface EditorHandle {
  /** Insert text at the cursor (replacing the selection); the cursor ends `cursorBack` chars before the end. */
  insert: (text: string, cursorBack?: number) => void;
  /** Wrap the selection with before/after. */
  wrap: (before: string, after: string) => void;
  /** Insert a block at the start of a fresh line. */
  insertBlock: (text: string) => void;
  complete: () => void;
  focus: () => void;
}

interface Props {
  initialValue: string;
  onChange: (v: string) => void;
  getNotes: () => CompletionNote[];
  onFocusChange?: (focused: boolean) => void;
  onPasteFiles?: (files: File[]) => void;
}

const theme = EditorView.theme({
  '&': { fontSize: '16px', height: '100%' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Noto Sans Mono CJK JP", monospace', lineHeight: '1.6' },
  '.cm-content': { padding: '8px 0' },
  '&.cm-focused': { outline: 'none' },
});

const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(
  { initialValue, onChange, getNotes, onFocusChange, onPasteFiles },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, getNotes, onFocusChange, onPasteFiles });
  cb.current = { onChange, getNotes, onFocusChange, onPasteFiles };

  useEffect(() => {
    const files = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          markdown(),
          EditorView.lineWrapping,
          placeholder('本文（Markdown）'),
          autocompletion({ override: [wikiCompletionSource(() => cb.current.getNotes())], icons: false }),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
            if (u.focusChanged) cb.current.onFocusChange?.(u.view.hasFocus);
          }),
          EditorView.domEventHandlers({
            paste(e) {
              const f = files(e.clipboardData?.files);
              if (!f.length || !cb.current.onPasteFiles) return false;
              e.preventDefault();
              cb.current.onPasteFiles(f);
              return true;
            },
            drop(e, view) {
              const f = files(e.dataTransfer?.files);
              if (!f.length || !cb.current.onPasteFiles) return false;
              e.preventDefault();
              const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
              if (pos !== null) view.dispatch({ selection: { anchor: pos } });
              cb.current.onPasteFiles(f);
              return true;
            },
          }),
          EditorView.contentAttributes.of({ autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }),
          theme,
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once per mount; remount (key) to load a different document.
  }, []);

  useImperativeHandle(ref, () => ({
    insert(text, cursorBack = 0) {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length - cursorBack } });
      v.focus();
    },
    wrap(before, after) {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const sel = v.state.sliceDoc(from, to);
      v.dispatch({
        changes: { from, to, insert: before + sel + after },
        selection: sel ? { anchor: from + before.length, head: from + before.length + sel.length } : { anchor: from + before.length },
      });
      v.focus();
    },
    insertBlock(text) {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const line = v.state.doc.lineAt(from);
      const prefix = line.text.trim() === '' ? '' : from === line.from ? '' : '\n\n';
      const insert = prefix + text;
      const start = line.text.trim() === '' ? line.from : from;
      const end = line.text.trim() === '' ? Math.max(to, line.to) : to;
      v.dispatch({ changes: { from: start, to: end, insert }, selection: { anchor: start + insert.length } });
      v.focus();
    },
    complete() {
      if (view.current) startCompletion(view.current);
    },
    focus() {
      view.current?.focus();
    },
  }));

  return <div ref={host} className="editor-host" />;
});

export default MarkdownEditor;
