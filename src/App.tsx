import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Loading } from './components/ui';
import { useAuth } from './hooks/useAuth';
import { getSetting } from './lib/api';
import { isConfigured } from './lib/supabase';
import { Landing } from './pages/Landing';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { Rules } from './pages/Rules';
import { News } from './pages/News';
import { HallOfFame } from './pages/HallOfFame';
import { ProfilePage } from './pages/ProfilePage';
import { ModeScreen, SetupScreen, BannedScreen } from './pages/SystemScreens';

const LeagueLayout = lazy(() => import('./pages/league/LeagueLayout'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));

type Mode = 'normal' | 'estate' | 'maintenance';

function Protected({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <main className="page"><Loading /></main>;
  if (!session) return <Navigate to="/accedi" replace state={{ from: loc.pathname }} />;
  return children;
}

export function App() {
  const { session, profile, loading, banned } = useAuth();
  const { pathname } = useLocation();
  const [mode, setMode] = useState<Mode>('normal');

  useEffect(() => {
    if (!isConfigured) return;
    getSetting<Mode>('app_mode', 'normal').then(setMode).catch(() => setMode('normal'));
  }, []);

  if (!isConfigured) return <SetupScreen />;
  if (loading) return <main className="page"><Loading /></main>;
  if (banned && profile) return <BannedScreen until={profile.banned_until!} />;
  if (mode !== 'normal' && !profile?.is_superadmin) {
    // Il login resta raggiungibile: serve ai SuperAdmin per rientrare durante manutenzione/estate.
    return pathname === '/accedi' && !session ? <main className="page"><AuthPage mode="login" /></main> : <ModeScreen mode={mode} />;
  }

  return (
    <Suspense fallback={<main className="page"><Loading /></main>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={session ? <Dashboard /> : <Landing />} />
          <Route path="accedi" element={session ? <Navigate to="/" replace /> : <AuthPage mode="login" />} />
          <Route path="registrati" element={session ? <Navigate to="/" replace /> : <AuthPage mode="register" />} />
          <Route path="regole" element={<Rules />} />
          <Route path="news" element={<News />} />
          <Route path="hof" element={<Protected><HallOfFame /></Protected>} />
          <Route path="profilo" element={<Protected><ProfilePage /></Protected>} />
          <Route path="profilo/:username" element={<Protected><ProfilePage /></Protected>} />
          <Route path="leghe/:leagueId/*" element={<Protected><LeagueLayout /></Protected>} />
          <Route path="admin" element={<Protected>{profile?.is_superadmin ? <SuperAdmin /> : <Navigate to="/" replace />}</Protected>} />
          <Route path="*" element={<main className="page center"><h1>404</h1><p className="muted">Pagina non trovata.</p></main>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
