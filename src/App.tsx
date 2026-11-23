import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import ToastHost from './components/Toast';
import { vault } from './lib/appVault';
import { onAuthError } from './lib/github';
import { loadSettings } from './lib/settings';
import { VaultContext } from './lib/useVault';
import EditPage from './pages/EditPage';
import HomePage from './pages/HomePage';
import NotePage from './pages/NotePage';
import SettingsPage from './pages/SettingsPage';


function RequireSettings({ children }: { children: React.ReactNode }) {
  return loadSettings() ? <>{children}</> : <Navigate to="/settings" replace />;
}

// Remount the editor when the target changes so its state is re-initialised.
function EditRoute() {
  const { title } = useParams();
  return <EditPage key={title} isNew={false} />;
}

function NewRoute() {
  const { search } = useLocation();
  return <EditPage key={search} isNew />;
}

export default function App() {
  const navigate = useNavigate();

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
        <Route element={<Layout />}>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/" element={<RequireSettings><HomePage /></RequireSettings>} />
          <Route path="/note/:title" element={<RequireSettings><NotePage /></RequireSettings>} />
          <Route path="/edit/:title" element={<RequireSettings><EditRoute /></RequireSettings>} />
          <Route path="/new" element={<RequireSettings><NewRoute /></RequireSettings>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastHost />
    </VaultContext.Provider>
  );
}
