import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { explain } from '@/lib/errors';
import { fmtPts } from '@/lib/format';
import { useToast } from '@/hooks/useToast';
import type { Profile } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { IconVerified } from './icons';

export function Button({ variant = 'default', size, block, className = '', ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost'; size?: 'sm' | 'lg'; block?: boolean }) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return <button type="button" {...p} className={cls} />;
}

/** Bottone che gestisce da solo loading, doppio click ed errori (mostrati come toast). */
export function ActionButton({ onAction, okMessage, children, disabled, ...p }:
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
    onAction: () => Promise<unknown>; okMessage?: string; variant?: 'default' | 'primary' | 'danger' | 'ghost'; size?: 'sm' | 'lg'; block?: boolean;
  }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  return (
    <Button {...p} disabled={disabled || busy} aria-busy={busy} onClick={async () => {
      if (busy) return;
      setBusy(true);
      try { await onAction(); if (okMessage) toast.ok(okMessage); }
      catch (e) { toast.error(explain(e)); }
      finally { if (mounted.current) setBusy(false); }
    }}>{busy ? '…' : children}</Button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <div className="hint">{hint}</div>}</label>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Chiudi">✕</Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, text, confirmLabel, danger, onConfirm, onClose }:
  { title: string; text: string; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<unknown>; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{text}</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <ActionButton variant={danger ? 'danger' : 'primary'} onAction={async () => { await onConfirm(); onClose(); }}>{confirmLabel}</ActionButton>
      </div>
    </Modal>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="stack" aria-busy="true" aria-label="Caricamento">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="errorbox" role="alert">
      <b>Non riesco a caricare i dati.</b>
      <p className="muted small" style={{ margin: '4px 0 12px' }}>{explain(error)}</p>
      {onRetry && <Button size="sm" onClick={onRetry}>Riprova</Button>}
    </div>
  );
}

export function Pts({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`pts ${value > 0 ? 'pos' : value < 0 ? 'neg' : ''} ${className}`}>{fmtPts(value)}</span>;
}

export const avatarSrc = (p?: Pick<Profile, 'avatar_url'> | null) =>
  p?.avatar_url ? supabase.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl : null;

export function Avatar({ profile, large }: { profile?: Pick<Profile, 'avatar' | 'avatar_url' | 'username'> | null; large?: boolean }) {
  const src = avatarSrc(profile);
  return (
    <span className={`avatar ${large ? 'avatar-lg' : ''}`} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" /> : (profile?.avatar || (profile?.username?.[0]?.toUpperCase() ?? '?'))}
    </span>
  );
}

/** Spunta blu di verifica: solo il segno, niente badge/cerchio bianco dietro. */
export function VerifiedMark({ profile, className = '' }: { profile?: Pick<Profile, 'verified'> | null; className?: string }) {
  if (!profile?.verified) return null;
  return <IconVerified className={`verified-mark ${className}`} />;
}

/** Nome utente con la spunta di verifica inline, pronto per essere riusato ovunque compare uno username. */
export function UserName({ profile, bold = true }: { profile?: Pick<Profile, 'username' | 'verified'> | null; bold?: boolean }) {
  if (!profile) return <span>?</span>;
  const name = bold ? <b>{profile.username}</b> : <span>{profile.username}</span>;
  return <span className="row" style={{ gap: 4, display: 'inline-flex' }}>{name}<VerifiedMark profile={profile} /></span>;
}

export function TeamName({ name, fx }: { name: string; fx?: string | null }) {
  return <span className={fx ? `fx-${fx}` : ''}>{name}</span>;
}

/** Selezione con testo: usa un <select> nativo, ottimo su mobile. */
export function Select({ value, onChange, children, ...p }:
  { value: string; onChange: (v: string) => void; children: ReactNode; id?: string; 'aria-label'?: string }) {
  return <select className="input" value={value} onChange={e => onChange(e.target.value)} {...p}>{children}</select>;
}
