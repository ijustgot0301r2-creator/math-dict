import { Navigate, Route, Routes } from 'react-router-dom';
import { loadSettings } from './lib/settings';
import SettingsPage from './pages/SettingsPage';

function Home() {
  return <main className="page"><p>準備中</p></main>;
}

export default function App() {
  const settings = loadSettings();
  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/" element={settings ? <Home /> : <Navigate to="/settings" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
