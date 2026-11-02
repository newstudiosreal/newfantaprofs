import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RecoveryCodeModal } from '@/components/RecoveryCodeModal';
import { Button, Field } from '@/components/ui';
import { recoverPassword } from '@/lib/api.account';
import { explain } from '@/lib/errors';

export function RecoverPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const r = await recoverPassword(username, code, password);
      if (r.new_code) setNewCode(r.new_code); else setDone(true);
    } catch (err) { setError(explain(err)); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <main className="page" style={{ maxWidth: 440 }}>
        <h1 style={{ fontSize: '3rem' }}>Fatto</h1>
        <p className="muted">Password aggiornata. Accedi e, da Profilo → Sicurezza, genera un nuovo codice di recupero.</p>
        <Button variant="primary" block onClick={() => nav('/accedi', { replace: true })}>Vai ad accedere</Button>
      </main>
    );
  }

  return (
    <main className="page" style={{ maxWidth: 440 }}>
      <h1 style={{ fontSize: '3rem', marginBottom: 6 }}>Recupera l'accesso</h1>
      <p className="muted">Inserisci il tuo username e il codice di recupero (XXXX-XXXX-XXXX) che hai salvato alla registrazione.</p>
      <form className="card" onSubmit={submit} noValidate>
        <Field label="Username"><input className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" maxLength={20} required /></Field>
        <Field label="Codice di recupero"><input className="input" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" maxLength={20} required /></Field>
        <Field label="Nuova password" hint="Almeno 6 caratteri"><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required /></Field>
        {error && <p role="alert" style={{ color: 'var(--neg)', fontWeight: 600 }}>{error}</p>}
        <Button type="submit" variant="primary" size="lg" block disabled={busy || !username || code.trim().length < 8 || password.length < 6}>
          {busy ? 'Un attimo…' : 'Reimposta password'}
        </Button>
      </form>
      <p className="center muted small" style={{ marginTop: 16 }}>
        Non hai più il codice? Chiedi a un SuperAdmin di reimpostarti la password. · <Link to="/accedi" className="bold">Torna ad accedere</Link>
      </p>
      {newCode && <RecoveryCodeModal code={newCode} title="Il tuo nuovo codice di recupero" onDone={() => { setNewCode(null); setDone(true); }} />}
    </main>
  );
}
