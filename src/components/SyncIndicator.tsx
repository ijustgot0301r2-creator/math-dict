import { useVault, useVaultApi } from '../lib/useVault';

const LABEL = { idle: '未同期', syncing: '同期中', ok: '最新', offline: 'オフライン', error: 'エラー' } as const;

export default function SyncIndicator() {
  const vault = useVaultApi();
  const s = useVault();
  const text =
    s.status === 'syncing' && s.progress ? `同期中 ${s.progress.done}/${s.progress.total}` : LABEL[s.status];
  return (
    <div className={`sync sync-${s.status}`} title={s.error ?? undefined}>
      <span className="sync-dot" aria-hidden />
      <span className="sync-label">{text}</span>
      <button
        className="icon"
        onClick={() => void vault.sync()}
        disabled={s.status === 'syncing'}
        aria-label="同期し直す"
        title="同期し直す"
      >
        ↻
      </button>
    </div>
  );
}
