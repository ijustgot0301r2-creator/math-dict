import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import EditorToolbar from '../components/EditorToolbar';
import FrontmatterForm from '../components/FrontmatterForm';
import MarkdownEditor, { type EditorHandle } from '../components/MarkdownEditor';
import MarkdownView from '../components/MarkdownView';
import Modal from '../components/Modal';
import { toast } from '../components/Toast';
import { AppVault, ConflictError } from '../lib/appVault';
import * as db from '../lib/db';
import { emptyFrontmatter, parseNote, STATUSES, type Frontmatter, type Status } from '../lib/frontmatter';
import { renderMarkdown } from '../lib/markdown';
import { normalizeKey, notePath, titleFromPath, validateTitle } from '../lib/normalize';
import { rewriteLinks } from '../lib/rename';
import { useMediaQuery, WIDE } from '../lib/useMediaQuery';
import { useRenderEnv } from '../lib/useRenderEnv';
import { useVault, useVaultApi } from '../lib/useVault';
import { errorMessage } from '../lib/vault';

interface FormState {
  path: string | null;
  title: string;
  fm: Frontmatter;
  body: string;
  baseSha: string | null;
}

type Pending = { kind: 'save' } | { kind: 'rename'; mode: 'rewrite' | 'alias' };

const sameForm = (a: FormState, b: FormState) =>
  a.title === b.title &&
  a.body === b.body &&
  a.fm.status === b.fm.status &&
  a.fm.summary === b.fm.summary &&
  a.fm.aliases.join('\n') === b.fm.aliases.join('\n') &&
  a.fm.tags.join('\n') === b.fm.tags.join('\n');

export default function EditPage({ isNew }: { isNew: boolean }) {
  const { title: routeTitle = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const vault = useVaultApi();
  const snap = useVault();
  const wide = useMediaQuery(WIDE);
  const editorRef = useRef<EditorHandle>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [base, setBase] = useState<FormState | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [draftPrompt, setDraftPrompt] = useState<db.Draft | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Pending | null>(null);
  const [renameAsk, setRenameAsk] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);

  const entry = isNew ? undefined : snap.index.byTitle.get(normalizeKey(routeTitle));
  const baseNote = entry ? snap.notes.get(entry.path) : undefined;

  // ---- initialise once the cache is loaded ----
  useEffect(() => {
    if (form || !snap.loaded) return;
    if (!isNew && !baseNote) return;
    let init: FormState;
    let key: string;
    if (isNew || !baseNote) {
      init = { path: null, title: params.get('title') ?? '', fm: emptyFrontmatter(), body: '', baseSha: null };
      key = `new:${init.title}`;
    } else {
      const p = parseNote(baseNote.content);
      init = { path: baseNote.path, title: titleFromPath(baseNote.path), fm: p.fm, body: p.body, baseSha: baseNote.sha };
      key = baseNote.path;
    }
    setForm(init);
    setBase(init);
    setDraftKey(key);
    void db.getDraft(key).then((d) => {
      if (d && !sameForm(init, fromDraft(d, init))) setDraftPrompt(d);
    });
  }, [form, snap.loaded, isNew, baseNote, params]);

  // ---- autosave draft ----
  useEffect(() => {
    if (!form || !base || !draftKey || draftPrompt) return;
    const t = setTimeout(() => {
      if (sameForm(form, base)) void db.deleteDraft(draftKey);
      else
        void db.putDraft({
          key: draftKey,
          title: form.title,
          aliases: form.fm.aliases,
          tags: form.fm.tags,
          status: form.fm.status,
          summary: form.fm.summary,
          body: form.body,
          baseSha: form.baseSha,
          savedAt: Date.now(),
        });
    }, 700);
    return () => clearTimeout(t);
  }, [form, base, draftKey, draftPrompt]);

  const env = useRenderEnv(form?.title);
  const deferredBody = useDeferredValue(form?.body ?? '');
  const previewHtml = useMemo(() => renderMarkdown(deferredBody, env), [deferredBody, env]);
  const getNotes = useCallback(() => vault.getSnapshot().index.entries, [vault]);

  const oldTitle = form?.path ? titleFromPath(form.path) : null;
  const renaming = !!form && !!oldTitle && form.title !== oldTitle;
  const rewriteCount = useMemo(() => {
    if (!renameAsk || !oldTitle || !form) return 0;
    let n = 0;
    for (const note of snap.notes.values()) {
      if (note.path !== form.path && rewriteLinks(note.content, oldTitle, form.title).count) n++;
    }
    return n;
  }, [renameAsk, oldTitle, form, snap.notes]);

  if (!form) {
    if (!isNew && snap.loaded && snap.status !== 'syncing' && !baseNote) {
      return (
        <main className="page">
          <p>「{routeTitle}」が見つかりません。</p>
        </main>
      );
    }
    return (
      <main className="page">
        <p className="hint">読み込み中…</p>
      </main>
    );
  }

  const update = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const titleError = form.title ? validateTitle(form.title) : null;

  async function finish(title: string, message: string) {
    await db.deleteDraft(draftKey);
    toast(message);
    navigate(`/note/${encodeURIComponent(title)}`, { replace: true });
  }

  async function run(op: Pending, force = false) {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      if (op.kind === 'save') {
        await vault.saveNote({ ...form, force });
        await finish(form.title, '保存しました');
      } else {
        const r = await vault.renameNote({ ...form, path: form.path!, oldTitle: oldTitle!, mode: op.mode, force });
        await finish(
          r.title,
          op.mode === 'rewrite' ? `名前を変更しました（${r.rewritten} 件の記事のリンクを書き換え）` : '名前を変更し、旧タイトルを別名に加えました',
        );
      }
    } catch (e) {
      if (e instanceof ConflictError) setConflict(op);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!form) return;
    const err = validateTitle(form.title);
    if (err) return setError(err);
    if (vault.titleTaken(form.title, form.path)) return setError(`「${form.title}」という記事はすでにあります`);
    if (renaming) return setRenameAsk(true);
    void run({ kind: 'save' });
  }

  async function reloadFromServer() {
    if (!form) return;
    // Clipboard first, while we are still inside the click gesture (iOS).
    const mine = AppVault.compose(form.fm, form.body);
    const copied = navigator.clipboard?.writeText(mine).then(
      () => true,
      () => false,
    );
    setConflict(null);
    setBusy(true);
    try {
      const path = form.path ?? notePath(form.title);
      const n = await vault.reloadNote(path);
      const ok = await copied;
      if (!n) {
        toast('サーバー側ではこの記事は削除されています。' + (ok ? '自分の変更はクリップボードにコピーしました' : ''));
        return;
      }
      const p = parseNote(n.content);
      const next = { path: n.path, title: titleFromPath(n.path), fm: p.fm, body: p.body, baseSha: n.sha };
      setForm(next);
      setBase(next);
      setEditorKey((k) => k + 1);
      await db.deleteDraft(draftKey);
      toast(ok ? 'サーバー側の内容を読み込みました。自分の変更はクリップボードにコピーしてあります' : 'サーバー側の内容を読み込みました（クリップボードへのコピーには失敗しました）');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function restoreDraft(d: db.Draft) {
    setForm((f) => (f ? fromDraft(d, f) : f));
    setEditorKey((k) => k + 1);
    setDraftPrompt(null);
  }

  function cancel() {
    if (form && base && !sameForm(form, base)) setDiscardAsk(true);
    else leave();
  }

  function leave() {
    void db.deleteDraft(draftKey);
    if (base?.path) navigate(`/note/${encodeURIComponent(base.title)}`);
    else navigate('/');
  }

  const offline = !snap.online;
  const editor = (
    <div className="editor-pane" hidden={!wide && tab !== 'edit'}>
      <MarkdownEditor
        key={editorKey}
        ref={editorRef}
        initialValue={form.body}
        onChange={(body) => update({ body })}
        getNotes={getNotes}
        onFocusChange={setFocused}
      />
    </div>
  );
  const preview = (
    <div className="preview-pane" hidden={!wide && tab !== 'preview'}>
      <MarkdownView html={previewHtml} />
    </div>
  );

  return (
    <main className={`page edit ${wide ? 'wide' : 'narrow'}`}>
      <div className="edit-bar">
        <button onClick={cancel} disabled={busy}>
          キャンセル
        </button>
        <span className="edit-state">{isNew ? '新規作成' : '編集'}</span>
        <button className="primary" onClick={save} disabled={busy || offline || !form.title}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
      {offline && <div className="banner info">オフラインです。保存はオンラインに戻ってからできます（下書きは端末に自動保存されます）。</div>}
      {error && <div className="banner error">{error}</div>}
      <input
        className={`title-input ${titleError ? 'invalid' : ''}`}
        value={form.title}
        placeholder="タイトル"
        onChange={(e) => update({ title: e.target.value })}
        aria-label="タイトル"
      />
      {titleError && <p className="error field-error">{titleError}</p>}
      <details className="fm-details" open={wide || isNew}>
        <summary>別名・タグ・ステータス・要約</summary>
        <FrontmatterForm fm={form.fm} onChange={(fm) => update({ fm })} tagSuggestions={snap.index.tags} />
      </details>
      {!wide && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>
            編集
          </button>
          <button
            role="tab"
            aria-selected={tab === 'preview'}
            className={tab === 'preview' ? 'active' : ''}
            onClick={() => setTab('preview')}
          >
            プレビュー
          </button>
        </div>
      )}
      <div className={wide ? 'split' : 'single'}>
        {editor}
        {preview}
      </div>
      {!wide && tab === 'edit' && focused && <EditorToolbar editor={editorRef} />}

      {draftPrompt && (
        <Modal
          title="下書きがあります"
          actions={[
            { label: '破棄する', onClick: () => { void db.deleteDraft(draftKey); setDraftPrompt(null); } },
            { label: '復元する', kind: 'primary', onClick: () => restoreDraft(draftPrompt) },
          ]}
        >
          <p>{new Date(draftPrompt.savedAt).toLocaleString('ja-JP')} に自動保存された、保存前の下書きがあります。復元しますか？</p>
          {draftPrompt.baseSha !== form.baseSha && (
            <p className="error">下書きを書いた後に、サーバー側の記事が更新されています。復元して保存すると競合の確認が出ます。</p>
          )}
        </Modal>
      )}

      {conflict && (
        <Modal
          title="サーバー側の内容と競合しました"
          onClose={() => setConflict(null)}
          actions={[
            { label: 'キャンセル', onClick: () => setConflict(null) },
            { label: 'サーバー側を読み込み直す', onClick: () => void reloadFromServer() },
            {
              label: '自分の内容で上書き',
              kind: 'danger',
              onClick: () => {
                const op = conflict;
                setConflict(null);
                void run(op, true);
              },
            },
          ]}
        >
          <p>この記事は、編集を始めた後に別の場所（ほかの端末や Obsidian）で変更されています。</p>
          <ul>
            <li>サーバー側を読み込み直す：自分の変更はクリップボードにコピーされます。</li>
            <li>自分の内容で上書き：サーバー側の変更は失われます。</li>
          </ul>
        </Modal>
      )}

      {renameAsk && oldTitle && (
        <Modal
          title="タイトルの変更"
          onClose={() => setRenameAsk(false)}
          actions={[
            { label: 'キャンセル', onClick: () => setRenameAsk(false) },
            {
              label: '旧タイトルを別名に加えるだけ',
              onClick: () => {
                setRenameAsk(false);
                void run({ kind: 'rename', mode: 'alias' });
              },
            },
            {
              label: `リンクを書き換える（${rewriteCount} 件）`,
              kind: 'primary',
              onClick: () => {
                setRenameAsk(false);
                void run({ kind: 'rename', mode: 'rewrite' });
              },
            },
          ]}
        >
          <p>
            「{oldTitle}」→「{form.title}」に変更します。
          </p>
          <p>ほかの記事にある [[{oldTitle}]] へのリンクを新しいタイトルに書き換えますか？ 書き換えと名前の変更は 1 つのコミットにまとめて保存されます。</p>
        </Modal>
      )}

      {discardAsk && (
        <Modal
          title="変更を破棄しますか？"
          onClose={() => setDiscardAsk(false)}
          actions={[
            { label: '編集を続ける', onClick: () => setDiscardAsk(false) },
            { label: '破棄する', kind: 'danger', onClick: leave },
          ]}
        >
          <p>保存していない変更と下書きは削除されます。</p>
        </Modal>
      )}
    </main>
  );
}

function fromDraft(d: db.Draft, base: FormState): FormState {
  return {
    path: base.path,
    title: d.title,
    fm: {
      ...base.fm,
      aliases: d.aliases,
      tags: d.tags,
      status: (STATUSES as string[]).includes(d.status) ? (d.status as Status) : base.fm.status,
      summary: d.summary,
    },
    body: d.body,
    baseSha: d.baseSha,
  };
}
