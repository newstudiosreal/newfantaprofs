import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { fmtDateTime } from '@/lib/format';

export function SetupScreen() {
  return (
    <div className="setup-screen">
      <div className="card stack">
        <h1 style={{ fontSize: '2.6rem' }}>Configura Supabase</h1>
        <p className="muted">Mancano le variabili d'ambiente del database. Crea un file <code>.env.local</code> nella radice del progetto:</p>
        <pre className="code card-flat">{`VITE_SUPABASE_URL=https://TUO-PROGETTO.supabase.co\nVITE_SUPABASE_ANON_KEY=la-tua-anon-key`}</pre>
        <p className="muted small">Poi esegui i file in <code>supabase/migrations</code> nello SQL Editor e riavvia <code>npm run dev</code>. Su Vercel: Project Settings → Environment Variables.</p>
      </div>
    </div>
  );
}

export function ModeScreen({ mode }: { mode: 'estate' | 'maintenance' }) {
  const { session, signOut } = useAuth();
  return (
    <div className="setup-screen">
      <div className="card stack center">
        <div style={{ fontSize: '3rem' }}>{mode === 'estate' ? '🏖️' : '🛠️'}</div>
        <h1 style={{ fontSize: '2.6rem' }}>{mode === 'estate' ? 'FantaProf va in vacanza' : 'Torniamo subito'}</h1>
        <p className="muted">{mode === 'estate'
          ? 'La stagione è finita: i prof si riposano. Ci vediamo a settembre con la nuova stagione.'
          : 'Stiamo facendo manutenzione. Riprova tra qualche minuto.'}</p>
        {session ? <Button onClick={() => { void signOut(); }}>Esci</Button>
          : <Link to="/accedi" className="btn btn-sm">Sei un admin? Accedi</Link>}
      </div>
    </div>
  );
}

export function BannedScreen({ until }: { until: string }) {
  const { signOut } = useAuth();
  return (
    <div className="setup-screen">
      <div className="card stack center">
        <div style={{ fontSize: '3rem' }}>⛔</div>
        <h1 style={{ fontSize: '2.6rem' }}>Account sospeso</h1>
        <p className="muted">Il tuo account è sospeso fino al {fmtDateTime(until)}. Se pensi sia un errore, contatta gli admin di FantaProf.</p>
        <Button onClick={() => { void signOut(); }}>Esci</Button>
      </div>
    </div>
  );
}
