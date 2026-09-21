import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase, usernameToEmail, USERNAME_RE } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

interface AuthValue {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  banned: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured);

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      // fuori dal callback: evita deadlock con le chiamate supabase
      setTimeout(() => { void loadProfile(s?.user.id); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (username: string, password: string) => {
    const u = username.trim();
    if (!USERNAME_RE.test(u)) throw new Error('Username non valido: 3-20 caratteri tra lettere, numeri e _.');
    if (password.length < 6) throw new Error('La password deve avere almeno 6 caratteri.');
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(u), password, options: { data: { username: u } },
    });
    if (error) throw error;
    if (!data.session) throw new Error('Registrazione creata ma il progetto richiede conferma email: disattivala in Authentication → Providers → Email.');
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); setProfile(null); }, []);

  const changePassword = useCallback(async (password: string) => {
    if (password.length < 6) throw new Error('La password deve avere almeno 6 caratteri.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session?.user.id]);

  const banned = !!profile?.banned_until && new Date(profile.banned_until).getTime() > Date.now() && !profile.is_superadmin;

  const value = useMemo<AuthValue>(
    () => ({ loading, session, profile, banned, signIn, signUp, signOut, changePassword, refreshProfile }),
    [loading, session, profile, banned, signIn, signUp, signOut, changePassword, refreshProfile],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuori da AuthProvider');
  return v;
}
