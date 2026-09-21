import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Field } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { explain } from '@/lib/errors';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { signIn, signUp } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const register = mode === 'register';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (register) await signUp(username, password); else await signIn(username, password);
      nav((loc.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(explain(err));
    } finally { setBusy(false); }
  };

  return (
    <main className="page" style={{ maxWidth: 440 }}>
      <h1 style={{ fontSize: '3rem', marginBottom: 6 }}>{register ? 'Registrati' : 'Accedi'}</h1>
      <p className="muted">{register ? 'Crea il tuo account per entrare nella tua lega.' : 'Bentornato: rientra nella tua squadra.'}</p>
      <form className="card" onSubmit={submit} noValidate>
        <Field label="Username" hint={register ? '3-20 caratteri: lettere, numeri e _' : undefined}>
          <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" maxLength={20} required />
        </Field>
        <Field label="Password" hint={register ? 'Almeno 6 caratteri' : undefined}>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={register ? 'new-password' : 'current-password'} required />
        </Field>
        {error && <p role="alert" style={{ color: 'var(--neg)', fontWeight: 600 }}>{error}</p>}
        <Button type="submit" variant="primary" size="lg" block disabled={busy || !username || !password}>
          {busy ? 'Un attimo…' : register ? 'Crea account' : 'Accedi'}
        </Button>
      </form>
      <p className="center muted small" style={{ marginTop: 16 }}>
        {register ? <>Hai già un account? <Link to="/accedi" className="bold">Accedi</Link></>
          : <>Non hai un account? <Link to="/registrati" className="bold">Registrati</Link></>}
      </p>
    </main>
  );
}
