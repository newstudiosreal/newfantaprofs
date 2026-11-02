import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Loading } from './components/ui';
import { RecoveryCodeModal } from './components/RecoveryCodeModal';
import { useAuth } from './hooks/useAuth';
import { getSetting } from './lib/api';
import { isConfigured } from './lib/supabase';
import { Landing } from './pages/Landing';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { Rules } from './pages/Rules';
import { News } from './pages/News';
import { ProfilePage } from './pages/ProfilePage';
import { JoinLeague } from './pages/JoinLeague';
import { RecoverPage } from './pages/RecoverPage';
import { ModeScreen, SetupScreen, BannedScreen } from './pages/SystemScreens';

const LeagueLayout = lazy(() => import('./pages/league/LeagueLayout'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const CommunityLayout = lazy(() => import('./pages/community/CommunityLayout'));

type Mode = 'normal' | 'estate' | 'maintenance';

function Protected({ children }: { children: JSX.Element }) {
  const { session, profile, loading, signOut } = useAuth();
  const loc = useLocation();
  if (loading) return <main className="page"><Loading /></main>;
  if (!session) return <Navigate to="/accedi" replace state={{ from: loc.pathname }} />;
  // Sessione valida ma profilo non leggibile: meglio un messaggio che una schermata vuota.
  if (!profile) return (
    <main className="page center">
      <h2>Profilo non disponibile</h2>
      <p className="muted">Non riusciamo a caricare il tuo profilo. Riprova tra poco.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Ricarica</button>
        <button className="btn" onClick={() => { void signOut(); }}>Esci</button>
      </div>
    </main>
  );
  return children;
}

function AppRoutes() {
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
          <Route index element={session ? (profile ? <Dashboard /> : <main className="page"><Loading /></main>) : <Landing />} />
          <Route path="accedi" element={session ? <Navigate to="/" replace /> : <AuthPage mode="login" />} />
          <Route path="registrati" element={session ? <Navigate to="/" replace /> : <AuthPage mode="register" />} />
          <Route path="recupera" element={session ? <Navigate to="/" replace /> : <RecoverPage />} />
          <Route path="unisciti/:code" element={<Protected><JoinLeague /></Protected>} />
          <Route path="regole" element={<Rules />} />
          <Route path="news" element={<News />} />
          <Route path="community/*" element={<Protected><CommunityLayout /></Protected>} />
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

export function App() {
  const { newRecoveryCode, ackRecoveryCode } = useAuth();
  return (
    <>
      <AppRoutes />
      {/* Fuori dalle route: sopravvive al passaggio dalla pagina di registrazione alla home */}
      {newRecoveryCode && <RecoveryCodeModal code={newRecoveryCode} onDone={ackRecoveryCode} />}
    </>
  );
}
