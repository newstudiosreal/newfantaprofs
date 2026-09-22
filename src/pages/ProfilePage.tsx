import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ActionButton, Avatar, Button, Empty, ErrorState, Field, Loading, VerifiedMark } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { getProfileByUsername, listEntitlements, redeemCode, setAvatarUrl, updateProfile } from '@/lib/api';
import { explain } from '@/lib/errors';
import { fmtDate } from '@/lib/format';
import { badgeLabel, NAME_FX, SKINS } from '@/lib/premium';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const EMOJIS = ['🎓', '📚', '🧠', '🦉', '🦊', '🐯', '🐼', '🦄', '🐸', '🐙', '🚀', '🔥', '⚡', '🌟', '👑', '🎯', '🎮', '🎧', '🍕', '☕', '⚽', '🏀', '🎸', '🌈'];

async function resizeToBlob(file: File, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Immagine non valida'))), 'image/jpeg', 0.85));
}

function Badges({ userId }: { userId: string }) {
  const { data } = useAsync(() => listEntitlements(userId), [userId]);
  const items = (data ?? []).filter(e => e.kind === 'badge' || e.kind === 'custom_badge' || e.kind === 'pro');
  const skins = (data ?? []).filter(e => e.kind === 'skin').length;
  const fx = (data ?? []).filter(e => e.kind === 'name_fx').length;
  if (!items.length && !skins && !fx) return null;
  return (
    <div className="row row-wrap" style={{ marginTop: 10 }}>
      {items.map(e => <span key={e.id} className="badge badge-accent">{e.kind === 'pro' ? '⚡ Pro' : badgeLabel(e.ref)}</span>)}
      {skins > 0 && <span className="badge">🎨 {skins} skin</span>}
      {fx > 0 && <span className="badge">✨ {fx} effetti</span>}
    </div>
  );
}

function OwnProfile({ profile }: { profile: Profile }) {
  const { signOut, changePassword, refreshProfile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [bio, setBio] = useState(profile.bio);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    try {
      if (!file.type.startsWith('image/')) throw new Error('Scegli un file immagine');
      const blob = await resizeToBlob(file);
      const path = `${profile.id}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      const old = profile.avatar_url;
      await setAvatarUrl(path);
      if (old) void supabase.storage.from('avatars').remove([old]);
      await refreshProfile();
      toast.ok('Foto aggiornata');
    } catch (e) { toast.error(explain(e)); }
  };

  return (
    <>
      <div className="card">
        <div className="row"><Avatar profile={profile} large />
          <div className="grow"><h2 style={{ fontSize: '2.2rem' }}><span className="profile-name">{profile.username}<VerifiedMark profile={profile} /></span></h2>
            <p className="muted small" style={{ margin: 0 }}>Iscritto dal {fmtDate(profile.created_at)}{profile.is_superadmin ? ' · SuperAdmin' : ''}</p></div></div>
        <Badges userId={profile.id} />
      </div>

      <div className="section-title"><h2>Avatar e bio</h2></div>
      <div className="card">
        <div className="row row-wrap" style={{ gap: 6 }}>
          {EMOJIS.map(e => (
            <ActionButton key={e} size="sm" variant={profile.avatar === e && !profile.avatar_url ? 'primary' : 'default'} aria-label={`Avatar ${e}`}
              onAction={async () => { await updateProfile(e, profile.bio); if (profile.avatar_url) await setAvatarUrl(null); await refreshProfile(); }}>{e}</ActionButton>
          ))}
        </div>
        <div className="row" style={{ margin: '12px 0' }}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <Button size="sm" onClick={() => fileRef.current?.click()}>Carica una foto</Button>
          {profile.avatar_url && <ActionButton size="sm" variant="ghost" onAction={async () => { await setAvatarUrl(null); await refreshProfile(); }}>Rimuovi foto</ActionButton>}
        </div>
        <Field label="Bio" hint="Massimo 200 caratteri"><textarea className="input" maxLength={200} value={bio} onChange={e => setBio(e.target.value)} /></Field>
        <ActionButton variant="primary" disabled={bio === profile.bio} okMessage="Profilo salvato" onAction={async () => { await updateProfile(profile.avatar, bio); await refreshProfile(); }}>Salva bio</ActionButton>
      </div>

      <div className="section-title"><h2>Codice premium</h2></div>
      <div className="card">
        <p className="muted small">Skin, badge, effetti nome e leghe Pro si sbloccano con un codice.</p>
        <div className="row"><input className="input" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXX-XXXX-XXXX" aria-label="Codice premium" autoCapitalize="characters" />
          <ActionButton variant="primary" disabled={code.trim().length < 6} onAction={async () => {
            const type = await redeemCode(code); setCode('');
            toast.ok(type === 'pro' ? 'Lega Pro sbloccata!' : 'Codice riscattato!'); await refreshProfile();
          }}>Riscatta</ActionButton></div>
        <p className="hint">Skin disponibili: {SKINS.slice(1).map(s => s.name).join(', ')} · Effetti: {NAME_FX.map(f => f.name).join(', ')}</p>
      </div>

      <div className="section-title"><h2>Sicurezza</h2></div>
      <div className="card">
        <Field label="Nuova password" hint="Almeno 6 caratteri"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <div className="row">
          <ActionButton disabled={pw.length < 6} okMessage="Password cambiata" onAction={async () => { await changePassword(pw); setPw(''); }}>Cambia password</ActionButton>
          <ActionButton variant="danger" onAction={async () => { await signOut(); nav('/', { replace: true }); }}>Esci</ActionButton>
        </div>
      </div>
    </>
  );
}

export function ProfilePage() {
  const { username } = useParams();
  const { profile } = useAuth();
  const other = useAsync(() => getProfileByUsername(username!), [username], { enabled: !!username && username.toLowerCase() !== profile?.username.toLowerCase() });
  const isOwn = !username || username.toLowerCase() === profile?.username.toLowerCase();

  return (
    <main className="page">
      {isOwn && profile && <OwnProfile profile={profile} />}
      {!isOwn && other.loading && <Loading rows={1} />}
      {!isOwn && other.error != null && <ErrorState error={other.error} onRetry={other.reload} />}
      {!isOwn && other.data === null && <Empty title="Utente non trovato">Controlla di aver scritto bene lo username.</Empty>}
      {!isOwn && other.data && (
        <div className="card">
          <div className="row"><Avatar profile={other.data} large />
            <div><h2 style={{ fontSize: '2.2rem' }}><span className="profile-name">{other.data.username}<VerifiedMark profile={other.data} /></span></h2><p className="muted small" style={{ margin: 0 }}>Iscritto dal {fmtDate(other.data.created_at)}</p></div></div>
          {other.data.bio && <p style={{ marginTop: 12 }}>{other.data.bio}</p>}
          <Badges userId={other.data.id} />
        </div>
      )}
    </main>
  );
}
