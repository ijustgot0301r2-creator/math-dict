import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GitHubClient } from '../lib/github';
import { loadSettingsDraft, saveSettings, type Settings } from '../lib/settings';
import { useVaultApi } from '../lib/useVault';

export default function SettingsPage() {
  const navigate = useNavigate();
  const vault = useVaultApi();
  const [params] = useSearchParams();
  const [form, setForm] = useState<Settings>(loadSettingsDraft);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value.trim() });

  async function test() {
    if (!form.owner || !form.repo || !form.branch || !form.token) {
      setMsg({ ok: false, text: 'すべての項目を入力してください' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await new GitHubClient(form).testConnection();
      saveSettings(form);
      setMsg({ ok: true, text: r.empty ? '接続できました（リポジトリは空です）' : '接続できました' });
      void vault.reconfigure();
      navigate('/');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '接続に失敗しました' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page settings">
      <h1>設定</h1>
      {params.get('reason') === 'auth' && (
        <p className="error">トークンが無効か期限切れです。新しいトークンを入力して接続テストをしてください。</p>
      )}
      <p className="hint">
        記事を保存する GitHub リポジトリと、そのリポジトリだけを対象にした fine-grained Personal Access Token（Contents: Read and
        write）を入力してください。入力内容はこの端末のブラウザ（localStorage）にだけ保存されます。
      </p>
      <label>
        owner
        <input value={form.owner} onChange={set('owner')} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <label>
        repo
        <input value={form.repo} onChange={set('repo')} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <label>
        branch
        <input value={form.branch} onChange={set('branch')} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <label>
        token
        <input type="password" value={form.token} onChange={set('token')} autoComplete="off" />
      </label>
      <button className="primary" onClick={test} disabled={busy}>
        {busy ? '接続中…' : '接続テスト'}
      </button>
      {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
    </main>
  );
}
