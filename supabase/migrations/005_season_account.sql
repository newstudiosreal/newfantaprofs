-- FantaProf V2 — 005 fine stagione, archivio, codice di recupero password
-- Esegui dopo 004. Idempotente quanto possibile (create or replace / if not exists).
--
-- Nuova semantica della stagione
--   leagues.season_start = inizio della stagione CORRENTE (può essere nel FUTURO durante la pausa)
--   la stagione dura 30 giorni da season_start; è "finita" quando now() >= season_start + 30 giorni
--   alla chiusura: classifica archiviata in season_results, punti/mercato/scambi azzerati, squadre svuotate
--   dei professori (nome squadra, effetti e acquisti premium restano), season_num + 1 e nuova season_start
--   = vecchia + 33 giorni (30 di gioco + 3 di pausa), oppure now() se si chiude in ritardo o in anticipo.
--
-- Chiusura automatica anche senza che nessuno apra la lega (opzionale, da lanciare a mano nello SQL Editor):
--   select cron.schedule('fantaprof-close-seasons', '*/15 * * * *', $$select public.close_due_seasons()$$);
-- Senza pg_cron la chiusura scatta comunque alla prima apertura della lega dopo la scadenza (ensure_season).

-- ── Colonne ──────────────────────────────────────────────────────
alter table public.leagues add column if not exists season_num int not null default 1 check (season_num >= 1);
alter table public.leagues add column if not exists auto_season_end boolean not null default true;
alter table public.profiles add column if not exists username_changed_at timestamptz;

-- Allinea le leghe esistenti al nuovo significato (il numero mostrato oggi resta lo stesso).
do $$
begin
  if not exists (select 1 from public.settings where key = 'season_model') then
    update public.leagues
       set season_num   = floor(extract(epoch from (now() - season_start)) / 86400 / 33)::int + 1,
           season_start = season_start + (floor(extract(epoch from (now() - season_start)) / 86400 / 33)::int * interval '33 days')
     where season_start <= now();
    insert into public.settings (key, value) values ('season_model', '2');
  end if;
end $$;

-- ── Archivio stagioni ────────────────────────────────────────────
create table if not exists public.season_results (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  season_num  int  not null,
  rank        int  not null,
  team_id     uuid references public.teams(id) on delete set null,
  team_name   text not null,
  owner_id    uuid references public.profiles(id) on delete set null,
  username    text not null default '',
  score       int  not null,
  professors  jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
create unique index if not exists season_results_unique on public.season_results (league_id, season_num, owner_id);
create index if not exists season_results_league on public.season_results (league_id, season_num, rank);
alter table public.season_results enable row level security;
revoke all on public.season_results from anon, authenticated;
grant select on public.season_results to authenticated;
drop policy if exists season_results_read on public.season_results;
create policy season_results_read on public.season_results for select to authenticated
  using (public.is_league_member(league_id));

-- ── Chiusura stagione ────────────────────────────────────────────
create or replace function public._season_over(l public.leagues)
returns boolean language sql immutable as $$
  select now() >= l.season_start + interval '30 days'
$$;

create or replace function public._close_season(p_league uuid, p_force boolean)
returns void language plpgsql security definer set search_path = public as $$
declare l public.leagues; t text;
begin
  select * into l from public.leagues where id = p_league for update;
  if not found then return; end if;

  -- (a) archivio della classifica finale
  insert into public.season_results (league_id, season_num, rank, team_id, team_name, owner_id, username, score, professors)
  select p_league, l.season_num,
         (row_number() over (order by s.score desc, s.name))::int,
         s.team_id, s.name, s.owner_id, coalesce(p.username::text, ''), s.score,
         coalesce((select jsonb_agg(jsonb_build_object('name', pr.name, 'subject', pr.subject, 'cost', pr.cost,
                                                       'captain', pr.id = s.captain_id) order by pr.name)
                     from public.team_professors tp join public.professors pr on pr.id = tp.professor_id
                    where tp.team_id = s.team_id), '[]'::jsonb)
    from public.team_scores s
    left join public.profiles p on p.id = s.owner_id
   where s.league_id = p_league
     and (s.score <> 0 or exists (select 1 from public.team_professors tp where tp.team_id = s.team_id))
  on conflict (league_id, season_num, owner_id) do nothing;

  -- (b) azzera punti, mercato, scambi, power-up, pronostici, missioni
  delete from public.events          where league_id = p_league;
  delete from public.trades          where league_id = p_league;
  delete from public.market_listings where league_id = p_league;
  delete from public.market_rotations where league_id = p_league;
  delete from public.powerups        where league_id = p_league;
  delete from public.forecasts       where league_id = p_league;
  delete from public.mission_claims  where league_id = p_league;

  -- (c) squadre svuotate ma mantenute (nome e effetto nome restano)
  delete from public.team_professors where team_id in (select id from public.teams where league_id = p_league);
  update public.teams set captain_id = null where league_id = p_league;

  -- (d) tabelle di altre aree, se presenti (devono avere la colonna league_id)
  foreach t in array array['duels', 'periodic_claims', 'forecast_teams', 'event_proposals', 'polls'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where league_id = $1', t) using p_league;
    end if;
  end loop;

  -- (e) notifica ai membri
  insert into public.notifications (user_id, type, payload)
  select m.user_id, 'season_closed', jsonb_build_object('league_id', p_league, 'season_num', l.season_num)
    from public.league_members m where m.league_id = p_league;

  -- (f) nuova stagione
  update public.leagues
     set season_num = l.season_num + 1,
         season_start = case when p_force then now() else greatest(l.season_start + interval '33 days', now()) end
   where id = p_league;
end $$;

-- Chiusura "pigra": chiamata dal client all'apertura della lega. Idempotente.
create or replace function public.ensure_season(p_league uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare l public.leagues;
begin
  if auth.uid() is null or not public.is_league_member(p_league) then return false; end if;
  select * into l from public.leagues where id = p_league for update;   -- serializza le chiamate concorrenti
  if not found or l.suspended or not l.auto_season_end or not public._season_over(l) then return false; end if;
  perform public._close_season(p_league, false);
  return true;
end $$;

-- Chiusura manuale (admin): solo a stagione finita.
create or replace function public.close_season(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l public.leagues;
begin
  perform public.assert_active(p_league);
  if not public.is_league_admin(p_league) then raise exception 'Solo gli admin della lega possono chiudere la stagione' using errcode = '42501'; end if;
  select * into l from public.leagues where id = p_league for update;
  if not found then raise exception 'Lega non trovata'; end if;
  if not public._season_over(l) then raise exception 'La stagione non è ancora finita'; end if;
  perform public._close_season(p_league, false);
end $$;

-- Azzeramento anticipato: ora è una chiusura forzata (la nuova stagione parte subito).
create or replace function public.reset_league(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  if not (public.is_superadmin() or exists (select 1 from public.leagues where id = p_league and owner_id = auth.uid())) then
    raise exception 'Solo il proprietario può azzerare la lega' using errcode = '42501';
  end if;
  perform public._close_season(p_league, true);
end $$;

create or replace function public.set_season_auto(p_league uuid, p_auto boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.leagues set auto_season_end = coalesce(p_auto, true) where id = p_league;
end $$;

-- Per pg_cron / service_role: chiude tutte le stagioni scadute delle leghe in modalità automatica.
create or replace function public.close_due_seasons()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.leagues l where l.auto_season_end and not l.suspended and public._season_over(l) loop
    perform public._close_season(r.id, false);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Ricostruzione squadra (nuova stagione) ───────────────────────
create or replace function public.rebuild_team(p_team uuid, p_prof_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_lg uuid; v_ids uuid[]; v_cost int; v_found int;
begin
  select league_id into v_lg from public.teams where id = p_team and owner_id = auth.uid();
  if v_lg is null then raise exception 'Squadra non trovata' using errcode = '42501'; end if;
  perform public.assert_active(v_lg);
  if exists (select 1 from public.team_professors where team_id = p_team) then
    raise exception 'La squadra ha già dei professori';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_prof_ids, '{}')) x;
  if cardinality(v_ids) < 1 then raise exception 'Scegli almeno un professore'; end if;
  if cardinality(v_ids) > 4 then raise exception 'Puoi scegliere al massimo 4 professori'; end if;
  select count(*), coalesce(sum(cost), 0) into v_found, v_cost
    from public.professors where league_id = v_lg and id = any(v_ids);
  if v_found <> cardinality(v_ids) then raise exception 'Professore non valido per questa lega'; end if;
  if v_cost > 50 then raise exception 'Budget superato (% / 50 crediti)', v_cost; end if;
  insert into public.team_professors (team_id, professor_id) select p_team, unnest(v_ids);
  update public.teams set captain_id = null where id = p_team;
end $$;

-- ── Hall of Fame: classifiche live + stagioni archiviate ─────────
drop function if exists public.hall_of_fame();
create or replace function public.hall_of_fame()
returns table (user_id uuid, username citext, avatar text, avatar_url text, total int, leagues int)
language sql stable security definer set search_path = public as $$
  with since as (select to_timestamp(coalesce((select (value)::text::numeric from public.settings where key = 'hof_since'), 0) / 1000.0) as ts),
  per_team as (
    select t.owner_id, t.league_id,
           coalesce(sum(case when e.professor_id is not null and e.professor_id = t.captain_id then e.pts * 2 else e.pts end), 0)::int as s
      from public.teams t
      join public.leagues l on l.id = t.league_id and not l.suspended
      left join public.events e on e.league_id = t.league_id and e.created_at >= (select ts from since)
        and (e.team_id = t.id or e.professor_id in (select tp.professor_id from public.team_professors tp where tp.team_id = t.id))
     group by t.id),
  archived as (
    select sr.owner_id, sr.league_id, sr.score as s
      from public.season_results sr
      join public.leagues l on l.id = sr.league_id and not l.suspended
     where sr.owner_id is not null and sr.created_at >= (select ts from since)),
  allrows as (select * from per_team union all select * from archived)
  select p.id, p.username, p.avatar, p.avatar_url, sum(a.s)::int, count(distinct a.league_id)::int
    from allrows a join public.profiles p on p.id = a.owner_id
   where auth.uid() is not null
   group by p.id order by 5 desc, 2 limit 100
$$;

-- ── Codice di recupero password ──────────────────────────────────
create table if not exists public.recovery_codes (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  code_hash       text not null,
  created_at      timestamptz not null default now(),
  failed_attempts int  not null default 0,
  locked_until    timestamptz
);
alter table public.recovery_codes enable row level security;
revoke all on public.recovery_codes from anon, authenticated;   -- nessuna policy: solo le funzioni security definer

create or replace function public._gen_recovery_code()
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(12); s text := ''; i int;
begin
  for i in 0..11 loop
    s := s || substr(alpha, (get_byte(b, i) % 32) + 1, 1);
    if i in (3, 7) then s := s || '-'; end if;
  end loop;
  return s;
end $$;

create or replace function public._norm_recovery(p text)
returns text language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create or replace function public._store_recovery(p_user uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := public._gen_recovery_code();
begin
  insert into public.recovery_codes (user_id, code_hash)
  values (p_user, crypt(public._norm_recovery(v_code), gen_salt('bf')))
  on conflict (user_id) do update
     set code_hash = excluded.code_hash, created_at = now(), failed_attempts = 0, locked_until = null;
  return v_code;
end $$;

-- L'utente genera (o rigenera) il proprio codice: il vecchio smette di funzionare. Restituito in chiaro una sola volta.
create or replace function public.issue_recovery_code()
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.assert_active(null);
  return public._store_recovery(auth.uid());
end $$;

create or replace function public.has_recovery_code()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.recovery_codes where user_id = auth.uid())
$$;

-- Solo service_role (edge function recover-password). Ritorna null in ogni caso di fallimento,
-- senza distinguere utente inesistente / senza codice / codice errato / bloccato.
create or replace function public.recovery_verify(p_username citext, p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; rc public.recovery_codes; v_code text := public._norm_recovery(p_code); v_dummy text;
begin
  select id into v_user from public.profiles where username = p_username;
  if v_user is not null then select * into rc from public.recovery_codes where user_id = v_user for update; end if;
  if v_user is null or rc.user_id is null then
    v_dummy := crypt(v_code, gen_salt('bf'));   -- stesso costo di una verifica reale
    return null;
  end if;
  if rc.locked_until is not null and rc.locked_until > now() then return null; end if;
  if crypt(v_code, rc.code_hash) = rc.code_hash then
    update public.recovery_codes set failed_attempts = 0, locked_until = null where user_id = v_user;
    return v_user;
  end if;
  if rc.failed_attempts + 1 >= 5 then
    update public.recovery_codes set failed_attempts = 0, locked_until = now() + interval '15 minutes' where user_id = v_user;
  else
    update public.recovery_codes set failed_attempts = failed_attempts + 1 where user_id = v_user;
  end if;
  return null;
end $$;

-- Solo service_role: dopo un recupero riuscito il codice usato viene sostituito e l'utente ne riceve uno nuovo.
create or replace function public.recovery_rotate(p_user uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_code text;
begin
  v_code := public._store_recovery(p_user);
  insert into public.notifications (user_id, type, payload) values (p_user, 'recovery_used', '{}'::jsonb);
  return v_code;
end $$;

-- ── Permessi ─────────────────────────────────────────────────────
do $$
declare f text;
begin
  -- funzioni pubbliche per gli utenti loggati
  foreach f in array array[
    'ensure_season(uuid)', 'close_season(uuid)', 'reset_league(uuid)', 'set_season_auto(uuid, boolean)',
    'rebuild_team(uuid, uuid[])', 'hall_of_fame()', 'issue_recovery_code()', 'has_recovery_code()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- solo service_role
  foreach f in array array['close_due_seasons()', 'recovery_verify(citext, text)', 'recovery_rotate(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- interne
  foreach f in array array[
    '_season_over(public.leagues)', '_close_season(uuid, boolean)', '_gen_recovery_code()',
    '_norm_recovery(text)', '_store_recovery(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
