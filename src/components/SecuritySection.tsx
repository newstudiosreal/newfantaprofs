import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecoveryCodeModal } from '@/components/RecoveryCodeModal';
import { ActionButton, ConfirmModal, Field } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { changeUsername, hasRecoveryCode, issueRecoveryCode } from '@/lib/api.account';
import { fmtDate } from '@/lib/format';
import { USERNAME_RE } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const COOLDOWN_MS = 30 * 86_400_000;

/** Profilo → Sicurezza: password, codice di recupero, username, sessioni. */
export function SecuritySection({ profile }: { profile: Profile & { username_changed_at?: string | null } }) {
  const { signOut, signOutScope, changePassword, refreshProfile } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [newName, setNewName] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'regen' | 'all' | 'others' | null>(null);
  const has = useAsync(hasRecoveryCode, [profile.id]);

  const nextChange = profile.username_changed_at ? new Date(new Date(profile.username_changed_at).getTime() + COOLDOWN_MS) : null;
  const locked = !!nextChange && nextChange.getTime() > Date.now();

  return (
    <>
      <div className="section-title"><h2>Sicurezza</h2></div>
      <div className="card stack">
        <Field label="Nuova password" hint="Almeno 6 caratteri"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <div className="row">
          <ActionButton disabled={pw.length < 6} okMessage="Password cambiata" onAction={async () => { await changePassword(pw); setPw(''); }}>Cambia password</ActionButton>
          <ActionButton variant="danger" onAction={async () => { await signOut(); nav('/', { replace: true }); }}>Esci</ActionButton>
        </div>
      </div>

      <div className="card stack" style={{ marginTop: 12 }}>
        <h3>🔑 Codice di recupero</h3>
        <p className="muted small" style={{ margin: 0 }}>
          {has.data === false ? 'Non hai ancora un codice: senza, se dimentichi la password serve un SuperAdmin.'
            : 'Hai un codice di recupero attivo. Serve per reimpostare la password senza aiuto. Se l\'hai perso, generane uno nuovo.'}
        </p>
        <div>
          {has.data === false
            ? <ActionButton variant="primary" onAction={async () => { setCode(await issueRecoveryCode()); await has.reload(); }}>Genera il mio codice</ActionButton>
            : <ActionButton onAction={async () => { setConfirm('regen'); }}>Genera un nuovo codice</ActionButton>}
        </div>
      </div>

      <div className="card stack" style={{ marginTop: 12 }}>
        <h3>Cambia username</h3>
        <Field label="Nuovo username" hint={locked ? `Potrai cambiarlo di nuovo il ${fmtDate(nextChange!.toISOString())}` : '3-20 caratteri: lettere, numeri e _. Una volta ogni 30 giorni. Dopo il cambio accedi con il nuovo username.'}>
          <input className="input" value={newName} onChange={e => setNewName(e.target.value)} maxLength={20} autoCapitalize="none" disabled={locked} placeholder={profile.username} />
        </Field>
        <div>
          <ActionButton disabled={locked || !USERNAME_RE.test(newName.trim()) || newName.trim() === profile.username} okMessage="Username aggiornato"
            onAction={async () => { await changeUsername(newName); setNewName(''); await refreshProfile(); }}>Cambia username</ActionButton>
        </div>
      </div>

      <div className="card stack" style={{ marginTop: 12 }}>
        <h3>Dispositivi</h3>
        <p className="muted small" style={{ margin: 0 }}>Se hai usato un computer che non è tuo, esci da tutti i dispositivi.</p>
        <div className="row row-wrap">
          <ActionButton onAction={async () => { setConfirm('others'); }}>Esci dagli altri dispositivi</ActionButton>
          <ActionButton variant="danger" onAction={async () => { setConfirm('all'); }}>Esci da tutti i dispositivi</ActionButton>
        </div>
      </div>

      {code && <RecoveryCodeModal code={code} onDone={() => setCode(null)} />}
      {confirm === 'regen' && <ConfirmModal title="Generare un nuovo codice?" confirmLabel="Genera" text="Il codice attuale smette di funzionare. Il nuovo ti verrà mostrato una sola volta."
        onConfirm={async () => { setCode(await issueRecoveryCode()); await has.reload(); }} onClose={() => setConfirm(null)} />}
      {confirm === 'others' && <ConfirmModal title="Uscire dagli altri dispositivi?" confirmLabel="Esci dagli altri" text="Questo dispositivo resta collegato; tutti gli altri dovranno rifare l'accesso."
        onConfirm={async () => { await signOutScope('others'); }} onClose={() => setConfirm(null)} />}
      {confirm === 'all' && <ConfirmModal danger title="Uscire da tutti i dispositivi?" confirmLabel="Esci da tutti" text="Verrai disconnesso anche da questo dispositivo."
        onConfirm={async () => { await signOutScope('global'); nav('/', { replace: true }); }} onClose={() => setConfirm(null)} />}
    </>
  );
}
