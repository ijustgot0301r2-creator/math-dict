import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { vault } from './lib/appVault';
import { onAuthError } from './lib/github';
import { loadSettings } from './lib/settings';
import { VaultContext, useVault } from './lib/useVault';
import SettingsPage from './pages/SettingsPage';

function Home() {
  const s = useVault();
  return (
    <main className="page">
      <p>状態: {s.status} / 記事 {s.index.entries.length} 件</p>
    </main>
  );
}

export default function App() {
  const navigate = useNavigate();
  const settings = loadSettings();

  useEffect(() => {
    onAuthError(() => navigate('/settings?reason=auth'));
    void vault.init();
    const on = () => vault.setOnline(true);
    const off = () => vault.setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      onAuthError(null);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [navigate]);

  return (
    <VaultContext.Provider value={vault}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/" element={settings ? <Home /> : <Navigate to="/settings" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </VaultContext.Provider>
  );
}
