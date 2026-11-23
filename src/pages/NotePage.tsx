import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Backlinks from '../components/Backlinks';
import MarkdownView from '../components/MarkdownView';
import Modal from '../components/Modal';
import { toast } from '../components/Toast';
import { ConflictError } from '../lib/appVault';
import { parseNote, STATUSES, STATUS_LABEL, type Status } from '../lib/frontmatter';
import { renderMarkdown } from '../lib/markdown';
import { normalizeKey } from '../lib/normalize';
import { useRenderEnv } from '../lib/useRenderEnv';
import { useVault, useVaultApi } from '../lib/useVault';
import { errorMessage } from '../lib/vault';

export default function NotePage() {
  const { title: rawTitle = '' } = useParams();
  const [params] = useSearchParams();
  const anchor = params.get('a');
  const navigate = useNavigate();
  const vault = useVaultApi();
  const snap = useVault();
  const resolved = snap.index.resolver.resolve(rawTitle) ?? rawTitle;
  const entry = snap.index.byTitle.get(normalizeKey(resolved));
  const note = entry ? snap.notes.get(entry.path) : undefined;
  const env = useRenderEnv(entry?.title);
  const html = useMemo(() => (note ? renderMarkdown(parseNote(note.content).body, env) : ''), [note, env]);
  const [busy, setBusy] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState(false);

  useEffect(() => {
    if (!anchor) window.scrollTo(0, 0);
  }, [rawTitle, anchor]);

  if (!entry || !note) {
    if (!snap.loaded || snap.status === 'syncing')
      return (
        <main className="page">
          <p className="hint">読み込み中…</p>
        </main>
      );
    return (
      <main className="page">
        <h1>「{rawTitle}」は未作成です</h1>
        <Link className="button primary" to={`/new?title=${encodeURIComponent(rawTitle)}`}>
          この名前で新規作成
        </Link>
      </main>
    );
  }

  const backlinkCount = snap.index.backlinks.get(entry.title)?.length ?? 0;

  async function changeStatus(status: Status) {
    if (!note) return;
    setBusy(true);
    try {
      await vault.setStatus(note.path, status);
      toast(`ステータスを「${STATUS_LABEL[status]}」にしました`);
    } catch (e) {
      if (e instanceof ConflictError) {
        toast('サーバー側で更新されていたため変更できませんでした。同期してからやり直してください', true);
        void vault.sync();
      } else toast(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!note || !entry) return;
    setDeleteAsk(false);
    setBusy(true);
    try {
      await vault.deleteNote(note.path, note.sha);
      toast(
        backlinkCount
          ? `「${entry.title}」を削除しました。${backlinkCount} 件の記事にあるこの記事へのリンクは、未作成リンクとして表示されます`
          : `「${entry.title}」を削除しました`,
      );
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof ConflictError) {
        toast('サーバー側で更新されていたため削除できませんでした。同期してからやり直してください', true);
        void vault.sync();
      } else toast(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page note">
      <header className="note-header">
        <div className="note-title-row">
          <h1>{entry.title}</h1>
          <div className="note-actions">
            <Link className="button" to={`/edit/${encodeURIComponent(entry.title)}`}>
              編集
            </Link>
            <button className="danger-outline" onClick={() => setDeleteAsk(true)} disabled={busy || !snap.online}>
              削除
            </button>
          </div>
        </div>
        <div className="note-meta">
          <select
            className={`status-select badge badge-${entry.status}`}
            value={entry.status}
            disabled={busy || !snap.online}
            onChange={(e) => void changeStatus(e.target.value as Status)}
            aria-label="ステータス"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {entry.aliases.length > 0 && <span className="aliases">別名: {entry.aliases.join('、')}</span>}
        </div>
        {entry.tags.length > 0 && (
          <div className="tags">
            {entry.tags.map((t) => (
              <Link key={t} className="tag" to={`/?tag=${encodeURIComponent(t)}`}>
                #{t}
              </Link>
            ))}
          </div>
        )}
      </header>
      <MarkdownView html={html} anchor={anchor} />
      <Backlinks title={entry.title} />

      {deleteAsk && (
        <Modal
          title="記事を削除しますか？"
          onClose={() => setDeleteAsk(false)}
          actions={[
            { label: 'キャンセル', onClick: () => setDeleteAsk(false) },
            { label: '削除する', kind: 'danger', onClick: () => void remove() },
          ]}
        >
          <p>「{entry.title}」を GitHub から削除します（Git の履歴には残ります）。</p>
          {backlinkCount > 0 && (
            <p>
              この記事は {backlinkCount} 件の記事から参照されています。削除後、それらのリンクは未作成リンク（赤い破線）として表示されます。
            </p>
          )}
        </Modal>
      )}
    </main>
  );
}
