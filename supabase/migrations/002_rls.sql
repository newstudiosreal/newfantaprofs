-- FantaProf V2 — 002 auth trigger, helper e RLS
-- Regola d'oro: dal client si LEGGE (con RLS) ma non si SCRIVE direttamente
-- nelle tabelle di gioco. Ogni modifica passa dalle funzioni in 003_functions.sql.

-- ── Creazione profilo alla registrazione ─────────────────────────
-- L'username arriva da raw_user_meta_data, MA il ruolo superadmin non viene
-- mai letto dal client: is_superadmin si imposta solo a mano via SQL.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Helper (security definer per evitare ricorsione nelle policy) ─
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_superadmin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_league_member(p_league uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin()
      or exists (select 1 from public.league_members m
                 where m.league_id = p_league and m.user_id = auth.uid())
$$;

create or replace function public.is_league_admin(p_league uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin()
      or exists (select 1 from public.leagues l
                 where l.id = p_league and l.owner_id = auth.uid())
      or exists (select 1 from public.league_members m
                 where m.league_id = p_league and m.user_id = auth.uid() and m.role = 'coadmin')
$$;

create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select banned_until > now() from public.profiles where id = auth.uid()), false)
$$;

-- ── Abilita RLS su tutto ─────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.entitlements    enable row level security;
alter table public.leagues         enable row level security;
alter table public.league_members  enable row level security;
alter table public.professors      enable row level security;
alter table public.teams           enable row level security;
alter table public.team_professors enable row level security;
alter table public.events          enable row level security;
alter table public.trades          enable row level security;
alter table public.messages        enable row level security;
alter table public.announcements   enable row level security;
alter table public.premium_codes   enable row level security;
alter table public.settings        enable row level security;

-- ── Nessuna scrittura diretta dal client, tranne dove indicato ───
revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke all on public.premium_codes from anon, authenticated;
grant select on all tables in schema public to authenticated;
revoke select on public.premium_codes from authenticated;
grant select on public.settings, public.announcements to anon;   -- serve alla schermata di accesso
grant insert, update, delete on public.announcements to authenticated; -- filtrato da RLS: solo superadmin
grant insert, update, delete on public.settings to authenticated;      -- filtrato da RLS: solo superadmin

-- ── Policy di lettura ────────────────────────────────────────────
-- Profili: username/avatar/bio sono pubblici tra utenti loggati (servono in classifica e chat).
create policy profiles_read on public.profiles for select to authenticated using (true);

create policy entitlements_read on public.entitlements for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin()
         or exists (select 1 from public.league_members a join public.league_members b
                    on a.league_id = b.league_id
                    where a.user_id = auth.uid() and b.user_id = entitlements.user_id));

create policy leagues_read on public.leagues for select to authenticated
  using (public.is_league_member(id));

create policy members_read on public.league_members for select to authenticated
  using (public.is_league_member(league_id));

create policy professors_read on public.professors for select to authenticated
  using (public.is_league_member(league_id));

create policy teams_read on public.teams for select to authenticated
  using (public.is_league_member(league_id));

create policy team_professors_read on public.team_professors for select to authenticated
  using (exists (select 1 from public.teams t
                 where t.id = team_professors.team_id and public.is_league_member(t.league_id)));

create policy events_read on public.events for select to authenticated
  using (public.is_league_member(league_id));

create policy trades_read on public.trades for select to authenticated
  using (public.is_league_member(league_id));

create policy messages_read on public.messages for select to authenticated
  using (public.is_league_member(league_id));

-- Annunci e impostazioni: lettura per tutti, scrittura solo superadmin
create policy announcements_read  on public.announcements for select using (true);
create policy announcements_write on public.announcements for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy settings_read  on public.settings for select using (true);
create policy settings_write on public.settings for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- premium_codes: nessuna policy per gli utenti → inaccessibile dal client.
-- Si usano solo redeem_code() e le funzioni admin (security definer).

-- La vista team_scores usa security_invoker: eredita le policy di teams/events.
grant select on public.team_scores to authenticated;
