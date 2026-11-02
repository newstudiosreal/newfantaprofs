import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase, usernameToEmail, USERNAME_RE } from '@/lib/supabase';
import { issueRecoveryCode } from '@/lib/api.account';
import type { Profile } from '@/lib/types';

interface AuthValue {
  /** true finché non si sa se c'è una sessione E, se c'è, finché non è stato caricato il suo profilo. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  banned: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** scope: 'local' (solo questo dispositivo), 'others' (tutti tranne questo), 'global' (tutti). */
  signOutScope: (scope: 'local' | 'others' | 'global') => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Codice di recupero appena generato alla registrazione: va mostrato una volta sola. */
  newRecoveryCode: string | null;
  ackRecoveryCode: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [booting, setBooting] = useState(isConfigured);
  // id utente per cui il caricamento del profilo è terminato (anche se la riga non esiste)
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const seq = useRef(0);

  /** Carica il profilo; con chiamate sovrapposte vale solo l'ultima (niente risposte vecchie che sovrascrivono). */
  const loadProfile = useCallback(async (uid: string | undefined): Promise<Profile | null> => {
    const my = ++seq.current;
    if (!uid) { setProfile(null); setProfileFor(null); return null; }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    const p = (data as Profile | null) ?? null;
    if (my === seq.current) { setProfile(p); setProfileFor(uid); }
    return p;
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (alive) setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      // fuori dal callback: evita deadlock con le chiamate supabase
      setTimeout(() => { void loadProfile(s?.user.id); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (username: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error) throw error;
    // Il profilo deve essere pronto prima di tornare alla pagina chiamante: niente schermata vuota.
    setSession(data.session);
    await loadProfile(data.session?.user.id);
  }, [loadProfile]);

  const signUp = useCallback(async (username: string, password: string) => {
    const u = username.trim();
    if (!USERNAME_RE.test(u)) throw new Error('Username non valido: 3-20 caratteri tra lettere, numeri e _.');
    if (password.length < 6) throw new Error('La password deve avere almeno 6 caratteri.');
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(u), password, options: { data: { username: u } },
    });
    if (error) throw error;
    if (!data.session) throw new Error('Registrazione creata ma il progetto richiede conferma email: disattivala in Authentication → Providers → Email.');
    setSession(data.session);
    await loadProfile(data.session.user.id);
    // Codice di recupero: mostrato una sola volta. Se fallisce, l'utente lo genera da Profilo → Sicurezza.
    try { setNewRecoveryCode(await issueRecoveryCode()); } catch { /* ripiego: banner in dashboard */ }
  }, [loadProfile]);

  const signOutScope = useCallback(async (scope: 'local' | 'others' | 'global') => {
    const { error } = await supabase.auth.signOut({ scope });
    if (error) throw error;
    if (scope !== 'others') { setProfile(null); setProfileFor(null); setSession(null); }
  }, []);
  const signOut = useCallback(() => signOutScope('local'), [signOutScope]);

  const changePassword = useCallback(async (password: string) => {
    if (password.length < 6) throw new Error('La password deve avere almeno 6 caratteri.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const uid = session?.user.id;
  const refreshProfile = useCallback(async () => { await loadProfile(uid); }, [loadProfile, uid]);
  const ackRecoveryCode = useCallback(() => setNewRecoveryCode(null), []);

  const loading = booting || (!!uid && profileFor !== uid);
  const banned = !!profile?.banned_until && new Date(profile.banned_until).getTime() > Date.now() && !profile.is_superadmin;

  const value = useMemo<AuthValue>(
    () => ({ loading, session, profile, banned, signIn, signUp, signOut, signOutScope, changePassword, refreshProfile, newRecoveryCode, ackRecoveryCode }),
    [loading, session, profile, banned, signIn, signUp, signOut, signOutScope, changePassword, refreshProfile, newRecoveryCode, ackRecoveryCode],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuori da AuthProvider');
  return v;
}
