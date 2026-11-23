import { Link, Outlet } from 'react-router-dom';
import PreviewLayer from './PreviewLayer';
import SearchBox from './SearchBox';
import SyncIndicator from './SyncIndicator';
import { useVault } from '../lib/useVault';

export default function Layout() {
  const s = useVault();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          数学用語辞書
        </Link>
        <div className="topbar-search">
          <SearchBox />
        </div>
        <SyncIndicator />
        <Link to="/settings" className="icon-link" aria-label="設定" title="設定">
          ⚙
        </Link>
      </header>
      {s.status === 'error' && s.error && <div className="banner error">同期エラー: {s.error}</div>}
      <Outlet />
      <PreviewLayer />
    </div>
  );
}
