-- FantaProf V2 — 006 gioco: classifica per periodo, sfide 1 contro 1, missioni a rotazione,
-- pronostici (squadra + serie), scambi 2 contro 1 / controfferta, preferiti e notifiche di mercato.
-- Esegui dopo 004. Non dipende dalla 005. Tutte le scritture passano da funzioni security definer.

-- ═════════════════════════════════════════════════════════════════
-- Helper interni
-- ═════════════════════════════════════════════════════════════════
create or replace function public._notify(p_user uuid, p_type text, p_payload jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, payload) values (p_user, p_type, coalesce(p_payload, '{}'::jsonb))
$$;

-- Inizio del giorno / della settimana corrente (fuso Europe/Rome) come timestamptz
create or replace function public._day_start(p_at timestamptz default now())
returns timestamptz language sql stable as $$
  select date_trunc('day', p_at at time zone 'Europe/Rome') at time zone 'Europe/Rome'
$$;
create or replace function public._week_start_ts(p_at timestamptz default now())
returns timestamptz language sql stable as $$
  select (public._week_start(p_at)::timestamp) at time zone 'Europe/Rome'
$$;

-- Punti guadagnati da una squadra in un intervallo, con la stessa attribuzione di team_scores
-- (capitano ×2; eventi dei prof attualmente in squadra + eventi assegnati alla squadra).
-- p_game_only = true conta solo gli eventi di gioco (bonus/malus/premi): niente acquisti,
-- vendite, missioni o pronostici, così sfide e missioni non si alimentano da sole.
create or replace function public._team_pts_between(p_team uuid, p_from timestamptz, p_to timestamptz, p_game_only boolean default true)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when e.professor_id is not null and e.professor_id = t.captain_id then e.pts * 2 else e.pts end), 0)::int
    from public.teams t
    join public.events e on e.league_id = t.league_id
     and (e.team_id = t.id or e.professor_id in (select tp.professor_id from public.team_professors tp where tp.team_id = t.id))
     and (p_from is null or e.created_at >= p_from)
     and (p_to is null or e.created_at < p_to)
     and (not p_game_only or e.kind in ('bm', 'premio'))
   where t.id = p_team
$$;

-- ═════════════════════════════════════════════════════════════════
-- 1. Classifica per periodo, trend e andamento nel tempo
-- ═════════════════════════════════════════════════════════════════
-- Come la vista team_scores, ma limitata a un intervallo (null = senza limite).
-- SECURITY INVOKER: la RLS di teams/events limita ai membri della lega.
create or replace function public.team_scores_between(p_league uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (team_id uuid, owner_id uuid, name text, captain_id uuid, score int)
language sql stable set search_path = public as $$
  select t.id, t.owner_id, t.name::text, t.captain_id,
         coalesce(sum(case when e.professor_id is not null and e.professor_id = t.captain_id then e.pts * 2 else e.pts end), 0)::int
    from public.teams t
    left join public.events e on e.league_id = t.league_id
     and (p_from is null or e.created_at >= p_from)
     and (p_to is null or e.created_at < p_to)
     and (e.team_id = t.id or e.professor_id in (select tp.professor_id from public.team_professors tp where tp.team_id = t.id))
   where t.league_id = p_league
   group by t.id
   order by 5 desc, 3, 1
$$;

-- Somma giornaliera dei punti per squadra (giorni nel fuso Europe/Rome).
create or replace function public.league_points_timeline(p_league uuid)
returns table (day date, team_id uuid, pts int)
language sql stable set search_path = public as $$
  select (e.created_at at time zone 'Europe/Rome')::date, t.id,
         sum(case when e.professor_id is not null and e.professor_id = t.captain_id then e.pts * 2 else e.pts end)::int
    from public.teams t
    join public.events e on e.league_id = t.league_id
     and (e.team_id = t.id or e.professor_id in (select tp.professor_id from public.team_professors tp where tp.team_id = t.id))
   where t.league_id = p_league
   group by 1, 2
   order by 1, 2
$$;

-- ═════════════════════════════════════════════════════════════════
-- 2. Sfide 1 contro 1
-- ═════════════════════════════════════════════════════════════════
create table if not exists public.duels (
  id              uuid primary key default gen_random_uuid(),
  league_id       uuid not null references public.leagues(id) on delete cascade,
  challenger_team uuid not null references public.teams(id) on delete cascade,
  opponent_team   uuid not null references public.teams(id) on delete cascade,
  challenger_user uuid not null references public.profiles(id) on delete cascade,
  opponent_user   uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','active','declined','cancelled','finished')),
  created_at      timestamptz not null default now(),
  starts_at       timestamptz,
  ends_at         timestamptz,
  challenger_pts  int,
  opponent_pts    int,
  winner_team     uuid references public.teams(id) on delete set null,
  check (challenger_team <> opponent_team)
);
create index if not exists duels_league_status on public.duels (league_id, status);
create index if not exists duels_challenger on public.duels (challenger_user);
create index if not exists duels_opponent on public.duels (opponent_user);
-- una sola sfida aperta (in attesa o attiva) per coppia di squadre, in qualunque direzione
create unique index if not exists duels_pair_open on public.duels (least(challenger_team, opponent_team), greatest(challenger_team, opponent_team))
  where status in ('pending', 'active');

alter table public.duels enable row level security;
revoke all on public.duels from anon;
revoke insert, update, delete on public.duels from authenticated;
grant select on public.duels to authenticated;
drop policy if exists duels_read on public.duels;
create policy duels_read on public.duels for select to authenticated using (public.is_league_member(league_id));

create or replace function public._active_duels(p_user uuid, p_league uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.duels
   where league_id = p_league and status = 'active' and (challenger_user = p_user or opponent_user = p_user)
$$;

create or replace function public.propose_duel(p_league uuid, p_opponent_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_opp uuid; v_id uuid;
begin
  perform public.assert_active(p_league);
  if p_opponent_user = auth.uid() then raise exception 'Non puoi sfidare te stesso'; end if;
  select id into v_me  from public.teams where league_id = p_league and owner_id = auth.uid();
  select id into v_opp from public.teams where league_id = p_league and owner_id = p_opponent_user;
  if v_me is null then raise exception 'Crea prima una squadra in questa lega'; end if;
  if v_opp is null then raise exception 'Lo sfidato non ha una squadra in questa lega'; end if;
  update public.duels set status = 'cancelled' where league_id = p_league and status = 'pending' and created_at < now() - interval '48 hours';
  if exists (select 1 from public.duels where status in ('pending','active')
              and least(challenger_team, opponent_team) = least(v_me, v_opp) and greatest(challenger_team, opponent_team) = greatest(v_me, v_opp)) then
    raise exception 'Esiste già una sfida aperta tra queste due squadre';
  end if;
  if public._active_duels(auth.uid(), p_league) >= 3 then raise exception 'Hai già 3 sfide attive: aspetta che ne finisca una'; end if;
  insert into public.duels (league_id, challenger_team, opponent_team, challenger_user, opponent_user)
  values (p_league, v_me, v_opp, auth.uid(), p_opponent_user) returning id into v_id;
  perform public._notify(p_opponent_user, 'duel_proposed', jsonb_build_object('league_id', p_league, 'duel_id', v_id, 'from_user', auth.uid()));
  return v_id;
end $$;

create or replace function public.respond_duel(p_duel uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found then raise exception 'Sfida non trovata'; end if;
  perform public.assert_active(d.league_id);
  if d.opponent_user <> auth.uid() then raise exception 'Solo lo sfidato può rispondere' using errcode = '42501'; end if;
  if d.status <> 'pending' then raise exception 'Sfida non più valida (%)', d.status; end if;
  if d.created_at < now() - interval '48 hours' then
    update public.duels set status = 'cancelled' where id = d.id;
    return 'cancelled';
  end if;
  if not p_accept then
    update public.duels set status = 'declined' where id = d.id;
    perform public._notify(d.challenger_user, 'duel_declined', jsonb_build_object('league_id', d.league_id, 'duel_id', d.id, 'by_user', auth.uid()));
    return 'declined';
  end if;
  if public._active_duels(d.opponent_user, d.league_id) >= 3 then raise exception 'Hai già 3 sfide attive'; end if;
  if public._active_duels(d.challenger_user, d.league_id) >= 3 then raise exception 'Lo sfidante ha già 3 sfide attive'; end if;
  update public.duels set status = 'active', starts_at = now(), ends_at = now() + interval '7 days' where id = d.id;
  perform public._notify(d.challenger_user, 'duel_accepted', jsonb_build_object('league_id', d.league_id, 'duel_id', d.id, 'by_user', auth.uid()));
  return 'active';
end $$;

create or replace function public.cancel_duel(p_duel uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active();
  update public.duels set status = 'cancelled' where id = p_duel and challenger_user = auth.uid() and status = 'pending';
  if not found then raise exception 'Sfida non annullabile'; end if;
end $$;

-- Chiude le sfide scadute (7 giorni), assegna +25 pt al vincitore, scade le richieste vecchie. Lazy, chiamata dal client.
create or replace function public.resolve_duels(p_league uuid)
returns int language plpgsql security definer set search_path = public as $$
declare d public.duels; a int; b int; v_win uuid; n int := 0; v_cn text; v_on text;
begin
  if not public.is_league_member(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.duels set status = 'cancelled' where league_id = p_league and status = 'pending' and created_at < now() - interval '48 hours';
  for d in select * from public.duels where league_id = p_league and status = 'active' and ends_at <= now() order by ends_at for update loop
    a := public._team_pts_between(d.challenger_team, d.starts_at, d.ends_at, true);
    b := public._team_pts_between(d.opponent_team, d.starts_at, d.ends_at, true);
    v_win := case when a > b then d.challenger_team when b > a then d.opponent_team end;
    update public.duels set status = 'finished', challenger_pts = a, opponent_pts = b, winner_team = v_win where id = d.id;
    select name into v_cn from public.teams where id = d.challenger_team;
    select name into v_on from public.teams where id = d.opponent_team;
    if v_win is not null then
      perform public._team_event(d.league_id, v_win, 'duel_win',
        '⚔️ Sfida vinta contro ' || case when v_win = d.challenger_team then v_on else v_cn end, 'other', 25, null);
    end if;
    perform public._notify(d.challenger_user, 'duel_finished', jsonb_build_object('league_id', d.league_id, 'duel_id', d.id,
      'won', v_win = d.challenger_team, 'draw', v_win is null, 'mine', a, 'theirs', b));
    perform public._notify(d.opponent_user, 'duel_finished', jsonb_build_object('league_id', d.league_id, 'duel_id', d.id,
      'won', v_win = d.opponent_team, 'draw', v_win is null, 'mine', b, 'theirs', a));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Punteggio in tempo reale delle sfide attive
create or replace function public.duel_live_points(p_league uuid)
returns table (duel_id uuid, challenger_pts int, opponent_pts int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_league_member(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  return query
    select d.id, public._team_pts_between(d.challenger_team, d.starts_at, least(now(), d.ends_at), true),
                 public._team_pts_between(d.opponent_team,   d.starts_at, least(now(), d.ends_at), true)
      from public.duels d where d.league_id = p_league and d.status = 'active';
end $$;

-- ═════════════════════════════════════════════════════════════════
-- 3. Missioni a rotazione (giornaliere e settimanali)
-- ═════════════════════════════════════════════════════════════════
create table if not exists public.periodic_claims (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  mission_key  text not null,
  period_start date not null,
  created_at   timestamptz not null default now(),
  unique (league_id, user_id, mission_key, period_start)
);
alter table public.periodic_claims enable row level security;
revoke all on public.periodic_claims from anon;
revoke insert, update, delete on public.periodic_claims from authenticated;
grant select on public.periodic_claims to authenticated;
drop policy if exists periodic_claims_read on public.periodic_claims;
create policy periodic_claims_read on public.periodic_claims for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

-- Pool delle missioni: ogni giorno se ne attivano 3 su 6, ogni settimana 2 su 4 (finestra scorrevole).
create or replace function public._periodic_pool()
returns table (key text, period text, idx int, label text, description text, metric text, target int, reward int)
language sql immutable as $$
  select * from (values
    ('d_pts30',  'daily',  0, 'Giornata da 30',      'I tuoi prof guadagnano almeno 30 punti oggi',             'pts',         30, 10),
    ('d_chat',   'daily',  1, 'Fatti sentire',       'Scrivi almeno un messaggio nella chat della lega oggi',   'msgs',         1,  5),
    ('d_top3',   'daily',  2, 'Sul podio',           'Chiudi la giornata tra le prime 3 squadre',               'top3',         1, 10),
    ('d_pts80',  'daily',  3, 'Giornata da 80',      'I tuoi prof guadagnano almeno 80 punti oggi',             'pts',         80, 25),
    ('d_duel',   'daily',  4, 'Pronti a sfidare',    'Hai almeno una sfida attiva',                             'duel_active',  1, 10),
    ('d_shop',   'daily',  5, 'Giro di mercato',     'Compra o vendi un professore oggi',                       'shop',         1,  5),
    ('w_pts200', 'weekly', 0, 'Settimana da 200',    'I tuoi prof guadagnano almeno 200 punti questa settimana','pts',        200, 40),
    ('w_fore',   'weekly', 1, 'Il Veggente',         'Fai il pronostico della settimana',                       'forecast',     1, 20),
    ('w_trade',  'weekly', 2, 'Affare fatto',        'Concludi uno scambio questa settimana',                   'trades',       1, 30),
    ('w_duelwin','weekly', 3, 'Re della sfida',      'Vinci una sfida che finisce questa settimana',            'duel_win',     1, 40)
  ) v(key, period, idx, label, description, metric, target, reward)
$$;

create or replace function public._periodic_metric(p_league uuid, p_user uuid, p_team uuid, p_metric text, p_from timestamptz, p_to timestamptz)
returns int language plpgsql stable security definer set search_path = public as $$
declare v int := 0;
begin
  if p_metric = 'msgs' then
    select count(*) into v from public.messages where league_id = p_league and author_id = p_user and created_at >= p_from and created_at < p_to;
  elsif p_metric = 'forecast' then
    select count(*) into v from public.forecasts where league_id = p_league and user_id = p_user and week_start = public._week_start();
  elsif p_metric = 'trades' then
    select count(*) into v from public.trades where league_id = p_league and status = 'accepted' and (from_user = p_user or to_user = p_user)
       and coalesce(decided_at, created_at) >= p_from and coalesce(decided_at, created_at) < p_to;
  elsif p_metric = 'duel_active' then
    v := public._active_duels(p_user, p_league);
  elsif p_team is null then
    v := 0;
  elsif p_metric = 'pts' then
    v := greatest(0, public._team_pts_between(p_team, p_from, p_to, true));
  elsif p_metric = 'top3' then
    select case when (select count(*) from public.team_scores s where s.league_id = p_league
                       and s.score > (select s2.score from public.team_scores s2 where s2.team_id = p_team)) < 3 then 1 else 0 end into v;
  elsif p_metric = 'duel_win' then
    select count(*) into v from public.duels where league_id = p_league and status = 'finished' and winner_team = p_team and ends_at >= p_from and ends_at < p_to;
  elsif p_metric = 'shop' then
    select count(*) into v from public.events where league_id = p_league and team_id = p_team and kind = 'shop'
       and event_key in ('market_buy','market_sell','rotating_buy') and created_at >= p_from and created_at < p_to;
  end if;
  return coalesce(v, 0);
end $$;

create or replace function public.periodic_missions(p_league uuid)
returns table (key text, period text, label text, description text, target int, progress int, reward int, claimed boolean, period_start date, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_team uuid; v_dn int; v_wn int; v_d0 timestamptz; v_w0 timestamptz;
begin
  if not public.is_league_member(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if not coalesce((select missions_enabled from public.leagues where id = p_league), false) then return; end if;
  select id into v_team from public.teams where league_id = p_league and owner_id = auth.uid();
  v_dn := ((now() at time zone 'Europe/Rome')::date - date '2020-01-06');
  v_wn := floor(v_dn / 7.0)::int;
  v_d0 := public._day_start();
  v_w0 := public._week_start_ts();
  return query
    select p.key, p.period, p.label, p.description, p.target,
           least(p.target, public._periodic_metric(p_league, auth.uid(), v_team, p.metric,
             case p.period when 'daily' then v_d0 else v_w0 end,
             case p.period when 'daily' then v_d0 + interval '1 day' else v_w0 + interval '7 days' end))::int,
           p.reward,
           exists (select 1 from public.periodic_claims c where c.league_id = p_league and c.user_id = auth.uid() and c.mission_key = p.key
                    and c.period_start = case p.period when 'daily' then (v_d0 at time zone 'Europe/Rome')::date else public._week_start() end),
           case p.period when 'daily' then (v_d0 at time zone 'Europe/Rome')::date else public._week_start() end,
           case p.period when 'daily' then v_d0 + interval '1 day' else v_w0 + interval '7 days' end
      from public._periodic_pool() p
     where (p.period = 'daily'  and ((p.idx - (v_dn % 6) + 6) % 6) < 3)
        or (p.period = 'weekly' and ((p.idx - (v_wn % 4) + 4) % 4) < 2)
     order by p.period desc, p.idx;
end $$;

create or replace function public.claim_periodic_mission(p_league uuid, p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare m record; v_team uuid;
begin
  perform public.assert_active(p_league);
  v_team := public._my_team(p_league);
  select * into m from public.periodic_missions(p_league) pm where pm.key = p_key;
  if not found then raise exception 'Missione non attiva in questo momento'; end if;
  if m.claimed then raise exception 'Missione già riscossa'; end if;
  if m.progress < m.target then raise exception 'Missione non ancora completata (%/%)', m.progress, m.target; end if;
  begin
    insert into public.periodic_claims (league_id, user_id, mission_key, period_start) values (p_league, auth.uid(), p_key, m.period_start);
  exception when unique_violation then
    raise exception 'Missione già riscossa';
  end;
  perform public._team_event(p_league, v_team, 'periodic_' || p_key, '🎯 Missione: ' || m.label, 'mission', m.reward, auth.uid());
  return m.reward;
end $$;

-- ═════════════════════════════════════════════════════════════════
-- 4. Pronostici: serie di vittorie e pronostico di squadra
-- ═════════════════════════════════════════════════════════════════
alter table public.forecasts add column if not exists won boolean;

create table if not exists public.forecast_teams (
  league_id  uuid not null references public.leagues(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  team_id    uuid not null references public.teams(id) on delete cascade,
  resolved   boolean not null default false,
  won        boolean,
  created_at timestamptz not null default now(),
  primary key (league_id, user_id, week_start)
);
alter table public.forecast_teams enable row level security;
revoke all on public.forecast_teams from anon;
revoke insert, update, delete on public.forecast_teams from authenticated;
grant select on public.forecast_teams to authenticated;
drop policy if exists forecast_teams_read on public.forecast_teams;
create policy forecast_teams_read on public.forecast_teams for select to authenticated
  using (user_id = auth.uid() or public.is_league_admin(league_id));

create or replace function public.make_team_forecast(p_league uuid, p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  perform public._my_team(p_league);
  if not exists (select 1 from public.teams where id = p_team and league_id = p_league) then
    raise exception 'Squadra non trovata in questa lega';
  end if;
  begin
    insert into public.forecast_teams (league_id, user_id, week_start, team_id)
    values (p_league, auth.uid(), public._week_start(), p_team);
  exception when unique_violation then
    raise exception 'Hai già fatto il pronostico di squadra di questa settimana';
  end;
end $$;

-- Risolve i pronostici delle settimane concluse: prof (+60, serie +20 dalla 3ª vittoria di fila)
-- e squadra (+40). Restituisce il numero di pronostici azzeccati.
create or replace function public.resolve_forecasts(p_league uuid)
returns int language plpgsql security definer set search_path = public as $$
declare f record; ft record; v_team uuid; v_from timestamptz; v_to timestamptz; v_best int; v_mine int; n int := 0;
        v_won boolean; v_streak int; v_prev date; w record;
begin
  if not public.is_league_member(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  -- prof più "pesante" della mia squadra
  for f in select * from public.forecasts
            where league_id = p_league and not resolved and week_start < public._week_start() order by week_start for update loop
    v_from := (f.week_start::timestamp) at time zone 'Europe/Rome';
    v_to   := ((f.week_start + 7)::timestamp) at time zone 'Europe/Rome';
    v_won := false;
    select id into v_team from public.teams where league_id = p_league and owner_id = f.user_id;
    if v_team is not null then
      select coalesce(max(s), 0) into v_best from (
        select coalesce(sum(e.pts), 0) s from public.team_professors tp
          left join public.events e on e.professor_id = tp.professor_id and e.created_at >= v_from and e.created_at < v_to
         where tp.team_id = v_team group by tp.professor_id) x;
      select coalesce(sum(e.pts), 0) into v_mine from public.events e
       where e.professor_id = f.professor_id and e.created_at >= v_from and e.created_at < v_to;
      if v_best > 0 and v_mine = v_best then
        v_won := true;
        perform public._team_event(p_league, v_team, 'forecast_bonus',
          '🔮 Pronostico giusto! (' || coalesce((select name from public.professors where id = f.professor_id), '?') || ')',
          'forecast', 60, null);
        n := n + 1;
      end if;
    end if;
    update public.forecasts set resolved = true, won = v_won where league_id = f.league_id and user_id = f.user_id and week_start = f.week_start;
    -- serie di vittorie consecutive (settimane adiacenti, tutte con won = true)
    if v_won and v_team is not null then
      v_streak := 1; v_prev := f.week_start;
      for w in select week_start, won from public.forecasts where league_id = f.league_id and user_id = f.user_id and week_start < f.week_start order by week_start desc loop
        exit when w.won is distinct from true or w.week_start <> v_prev - 7;
        v_streak := v_streak + 1; v_prev := w.week_start;
      end loop;
      if v_streak >= 3 then
        perform public._team_event(p_league, v_team, 'forecast_streak', '🔥 Serie di ' || v_streak || ' pronostici giusti', 'forecast', 20, null);
      end if;
    end if;
  end loop;

  -- squadra che guadagnerà più punti nella settimana
  for ft in select * from public.forecast_teams
             where league_id = p_league and not resolved and week_start < public._week_start() order by week_start for update loop
    v_from := (ft.week_start::timestamp) at time zone 'Europe/Rome';
    v_to   := ((ft.week_start + 7)::timestamp) at time zone 'Europe/Rome';
    select coalesce(max(s), 0) into v_best from (
      select public._team_pts_between(t.id, v_from, v_to, true) s from public.teams t where t.league_id = p_league) x;
    v_mine := public._team_pts_between(ft.team_id, v_from, v_to, true);
    v_won := v_best > 0 and v_mine = v_best;
    select id into v_team from public.teams where league_id = p_league and owner_id = ft.user_id;
    if v_won and v_team is not null then
      perform public._team_event(p_league, v_team, 'forecast_team_bonus',
        '🔮 Pronostico di squadra giusto! (' || coalesce((select name from public.teams where id = ft.team_id), '?') || ')', 'forecast', 40, null);
      n := n + 1;
    end if;
    update public.forecast_teams set resolved = true, won = v_won where league_id = ft.league_id and user_id = ft.user_id and week_start = ft.week_start;
  end loop;
  return n;
end $$;

-- ═════════════════════════════════════════════════════════════════
-- 5. Scambi: fino a 2 prof per lato, controfferta
-- ═════════════════════════════════════════════════════════════════
alter table public.trades add column if not exists from_prof2 uuid references public.professors(id) on delete cascade;
alter table public.trades add column if not exists to_prof2   uuid references public.professors(id) on delete cascade;
alter table public.trades add column if not exists counter_of uuid references public.trades(id) on delete set null;
alter table public.trades add column if not exists decided_at timestamptz;
alter table public.trades drop constraint if exists trades_status_check;
alter table public.trades add constraint trades_status_check check (status in ('pending','accepted','rejected','cancelled','expired','countered'));
alter table public.trades drop constraint if exists trades_distinct_profs;
alter table public.trades add constraint trades_distinct_profs check (
  (from_prof2 is null or from_prof2 <> from_prof) and (to_prof2 is null or to_prof2 <> to_prof));

create or replace function public._check_trade(p_from_team uuid, p_to_team uuid, p_from_profs uuid[], p_to_profs uuid[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if (select count(*) from public.team_professors where team_id = p_from_team and professor_id = any(p_from_profs)) <> cardinality(p_from_profs)
  or (select count(*) from public.team_professors where team_id = p_to_team   and professor_id = any(p_to_profs))   <> cardinality(p_to_profs) then
    raise exception 'Professori non validi per lo scambio';
  end if;
  if (select count(*) from public.team_professors where team_id = p_from_team) - cardinality(p_from_profs) + cardinality(p_to_profs) > 4
  or (select count(*) from public.team_professors where team_id = p_to_team)   - cardinality(p_to_profs)   + cardinality(p_from_profs) > 4 then
    raise exception 'Con questo scambio una delle due squadre supererebbe i 4 professori';
  end if;
end $$;

create or replace function public._create_trade(p_league uuid, p_from_user uuid, p_to_user uuid, p_from_profs uuid[], p_to_profs uuid[], p_counter_of uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_from_team uuid; v_to_team uuid; v_id uuid;
begin
  if p_from_user = p_to_user then raise exception 'Non puoi scambiare con te stesso'; end if;
  if coalesce(cardinality(p_from_profs), 0) not between 1 and 2 or coalesce(cardinality(p_to_profs), 0) not between 1 and 2 then
    raise exception 'Uno scambio coinvolge da 1 a 2 professori per lato';
  end if;
  if (select count(distinct x) from unnest(p_from_profs) x) <> cardinality(p_from_profs)
  or (select count(distinct x) from unnest(p_to_profs) x) <> cardinality(p_to_profs) then
    raise exception 'Professori duplicati nello scambio';
  end if;
  select id into v_from_team from public.teams where league_id = p_league and owner_id = p_from_user;
  select id into v_to_team   from public.teams where league_id = p_league and owner_id = p_to_user;
  if v_from_team is null or v_to_team is null then raise exception 'Squadra non trovata'; end if;
  perform public._check_trade(v_from_team, v_to_team, p_from_profs, p_to_profs);
  perform public.expire_trades();
  if (select count(*) from public.trades where league_id = p_league and from_user = p_from_user and status = 'pending') >= 5 then
    raise exception 'Hai troppe proposte di scambio in attesa';
  end if;
  insert into public.trades (league_id, from_user, to_user, from_prof, to_prof, from_prof2, to_prof2, counter_of)
  values (p_league, p_from_user, p_to_user, p_from_profs[1], p_to_profs[1], p_from_profs[2], p_to_profs[2], p_counter_of)
  returning id into v_id;
  return v_id;
end $$;

-- Stessa firma di prima + due parametri facoltativi (le chiamate 1 a 1 non cambiano)
drop function if exists public.propose_trade(uuid, uuid, uuid, uuid);
create or replace function public.propose_trade(p_league uuid, p_to_user uuid, p_from_prof uuid, p_to_prof uuid,
                                                p_from_prof2 uuid default null, p_to_prof2 uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  return public._create_trade(p_league, auth.uid(), p_to_user,
    array_remove(array[p_from_prof, p_from_prof2], null), array_remove(array[p_to_prof, p_to_prof2], null), null);
end $$;

create or replace function public.respond_trade(p_trade uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare t public.trades; v_from_team uuid; v_to_team uuid; v_from uuid[]; v_to uuid[];
begin
  perform public.expire_trades();
  select * into t from public.trades where id = p_trade for update;
  if not found then raise exception 'Scambio non trovato'; end if;
  perform public.assert_active(t.league_id);
  if t.to_user <> auth.uid() then raise exception 'Solo il destinatario può rispondere' using errcode = '42501'; end if;
  if t.status <> 'pending' then raise exception 'Scambio non più valido (%)', t.status; end if;
  if not p_accept then
    update public.trades set status = 'rejected', decided_at = now() where id = t.id; return 'rejected';
  end if;
  v_from := array_remove(array[t.from_prof, t.from_prof2], null);
  v_to   := array_remove(array[t.to_prof, t.to_prof2], null);
  select id into v_from_team from public.teams where league_id = t.league_id and owner_id = t.from_user;
  select id into v_to_team   from public.teams where league_id = t.league_id and owner_id = t.to_user;
  if (select count(*) from public.team_professors where team_id = v_from_team and professor_id = any(v_from)) <> cardinality(v_from)
  or (select count(*) from public.team_professors where team_id = v_to_team   and professor_id = any(v_to))   <> cardinality(v_to) then
    update public.trades set status = 'cancelled' where id = t.id;
    raise exception 'Uno dei professori non è più in squadra: scambio annullato';
  end if;
  perform public._check_trade(v_from_team, v_to_team, v_from, v_to);
  -- Il capitano che esce di squadra perde la fascia
  update public.teams set captain_id = null where id = v_from_team and captain_id = any(v_from);
  update public.teams set captain_id = null where id = v_to_team   and captain_id = any(v_to);
  delete from public.team_professors where (team_id = v_from_team and professor_id = any(v_from))
                                        or (team_id = v_to_team   and professor_id = any(v_to));
  insert into public.team_professors (team_id, professor_id)
    select v_from_team, x from unnest(v_to) x
    union all select v_to_team, x from unnest(v_from) x
  on conflict do nothing;
  update public.trades set status = 'accepted', decided_at = now() where id = t.id;
  return 'accepted';
end $$;

-- Controfferta: il destinatario chiude la proposta e ne invia una inversa.
-- p_from_profs = prof che il destinatario DÀ (suoi); p_to_profs = prof che CHIEDE all'altro.
create or replace function public.counter_trade(p_trade uuid, p_from_profs uuid[], p_to_profs uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.trades; v_id uuid;
begin
  perform public.expire_trades();
  select * into t from public.trades where id = p_trade for update;
  if not found then raise exception 'Scambio non trovato'; end if;
  perform public.assert_active(t.league_id);
  if t.to_user <> auth.uid() then raise exception 'Solo il destinatario può fare una controfferta' using errcode = '42501'; end if;
  if t.status <> 'pending' then raise exception 'Scambio non più valido (%)', t.status; end if;
  update public.trades set status = 'countered', decided_at = now() where id = t.id;
  v_id := public._create_trade(t.league_id, auth.uid(), t.from_user, p_from_profs, p_to_profs, t.id);
  return v_id;
end $$;

-- ═════════════════════════════════════════════════════════════════
-- 6. Preferiti e notifiche
-- ═════════════════════════════════════════════════════════════════
create table if not exists public.watchlist (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  league_id    uuid not null references public.leagues(id) on delete cascade,
  professor_id uuid not null references public.professors(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, professor_id)
);
create index if not exists watchlist_prof on public.watchlist (professor_id);
alter table public.watchlist enable row level security;
revoke all on public.watchlist from anon;
revoke insert, update, delete on public.watchlist from authenticated;
grant select on public.watchlist to authenticated;
drop policy if exists watchlist_read on public.watchlist;
create policy watchlist_read on public.watchlist for select to authenticated using (user_id = auth.uid());

-- true = aggiunto, false = rimosso
create or replace function public.toggle_watch(p_prof uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_league uuid;
begin
  select league_id into v_league from public.professors where id = p_prof;
  if v_league is null then raise exception 'Professore non trovato'; end if;
  perform public.assert_active(v_league);
  if not exists (select 1 from public.league_members where league_id = v_league and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  if exists (select 1 from public.watchlist where user_id = auth.uid() and professor_id = p_prof) then
    delete from public.watchlist where user_id = auth.uid() and professor_id = p_prof;
    return false;
  end if;
  if (select count(*) from public.watchlist where user_id = auth.uid() and league_id = v_league) >= 30 then
    raise exception 'Puoi seguire al massimo 30 professori per lega';
  end if;
  insert into public.watchlist (user_id, league_id, professor_id) values (auth.uid(), v_league, p_prof);
  return true;
end $$;

alter table public.market_listings add column if not exists ending_notified boolean not null default false;

-- Trigger: professore preferito in vendita / in vetrina
create or replace function public._trg_watch_listing()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seller uuid;
begin
  if tg_argv[0] = 'listing' then v_seller := new.seller_id; end if;
  insert into public.notifications (user_id, type, payload)
  select w.user_id, 'watch_listing',
         jsonb_build_object('league_id', new.league_id, 'professor_id', new.professor_id, 'kind', tg_argv[0])
    from public.watchlist w
   where w.professor_id = new.professor_id
     and w.user_id is distinct from v_seller;
  return new;
end $$;

drop trigger if exists trg_watch_listing on public.market_listings;
create trigger trg_watch_listing after insert on public.market_listings
  for each row execute function public._trg_watch_listing('listing');
drop trigger if exists trg_watch_rotation on public.market_rotations;
create trigger trg_watch_rotation after insert on public.market_rotations
  for each row execute function public._trg_watch_listing('rotation');

-- Trigger: rilancio su un'asta
create or replace function public._trg_outbid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.current_bidder is not null and new.current_bidder is distinct from old.current_bidder then
    insert into public.notifications (user_id, type, payload)
    values (old.current_bidder, 'outbid',
            jsonb_build_object('league_id', new.league_id, 'professor_id', new.professor_id, 'listing_id', new.id, 'amount', new.current_bid));
  end if;
  return new;
end $$;
drop trigger if exists trg_outbid on public.market_listings;
create trigger trg_outbid after update of current_bidder on public.market_listings
  for each row execute function public._trg_outbid();

-- Aste che scadono entro un'ora: avvisa venditore e miglior offerente (una volta sola)
create or replace function public.notify_ending_auctions(p_league uuid)
returns int language plpgsql security definer set search_path = public as $$
declare l record; n int := 0;
begin
  if not public.is_league_member(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  for l in
    update public.market_listings set ending_notified = true
     where league_id = p_league and type = 'auction' and status = 'open' and not ending_notified
       and expires_at > now() and expires_at <= now() + interval '1 hour'
     returning id, professor_id, seller_id, current_bidder, current_bid, expires_at
  loop
    perform public._notify(l.seller_id, 'auction_ending', jsonb_build_object('league_id', p_league, 'listing_id', l.id, 'professor_id', l.professor_id, 'role', 'seller'));
    if l.current_bidder is not null then
      perform public._notify(l.current_bidder, 'auction_ending', jsonb_build_object('league_id', p_league, 'listing_id', l.id, 'professor_id', l.professor_id, 'role', 'bidder'));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Trigger: scambi
create or replace function public._trg_trade_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.counter_of is null then   -- le controfferte hanno già la notifica 'trade_countered'
    perform public._notify(new.to_user, 'trade_proposed', jsonb_build_object('league_id', new.league_id, 'trade_id', new.id, 'from_user', new.from_user));
  end if;
  return new;
end $$;
drop trigger if exists trg_trade_insert on public.trades;
create trigger trg_trade_insert after insert on public.trades
  for each row execute function public._trg_trade_insert();

create or replace function public._trg_trade_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new uuid;
begin
  select id into v_new from public.trades where counter_of = new.id limit 1;
  perform public._notify(new.from_user, 'trade_' || new.status,
    jsonb_build_object('league_id', new.league_id, 'trade_id', new.id, 'by_user', new.to_user, 'counter_trade_id', v_new));
  return new;
end $$;
drop trigger if exists trg_trade_status on public.trades;
create trigger trg_trade_status after update of status on public.trades
  for each row when (old.status = 'pending' and new.status in ('accepted', 'rejected', 'countered'))
  execute function public._trg_trade_status();

-- ═════════════════════════════════════════════════════════════════
-- Permessi: solo le funzioni pubbliche nuove sono richiamabili dal client
-- ═════════════════════════════════════════════════════════════════
do $$
declare f text;
begin
  -- pubbliche
  foreach f in array array[
    'public.team_scores_between(uuid, timestamptz, timestamptz)',
    'public.league_points_timeline(uuid)',
    'public.propose_duel(uuid, uuid)', 'public.respond_duel(uuid, boolean)', 'public.cancel_duel(uuid)',
    'public.resolve_duels(uuid)', 'public.duel_live_points(uuid)',
    'public.periodic_missions(uuid)', 'public.claim_periodic_mission(uuid, text)',
    'public.make_team_forecast(uuid, uuid)', 'public.resolve_forecasts(uuid)',
    'public.propose_trade(uuid, uuid, uuid, uuid, uuid, uuid)', 'public.respond_trade(uuid, boolean)',
    'public.counter_trade(uuid, uuid[], uuid[])',
    'public.toggle_watch(uuid)', 'public.notify_ending_auctions(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  -- interne / trigger: nessun accesso dal client
  foreach f in array array[
    'public._notify(uuid, text, jsonb)', 'public._day_start(timestamptz)', 'public._week_start_ts(timestamptz)',
    'public._team_pts_between(uuid, timestamptz, timestamptz, boolean)', 'public._active_duels(uuid, uuid)',
    'public._periodic_pool()', 'public._periodic_metric(uuid, uuid, uuid, text, timestamptz, timestamptz)',
    'public._check_trade(uuid, uuid, uuid[], uuid[])', 'public._create_trade(uuid, uuid, uuid, uuid[], uuid[], uuid)',
    'public._trg_watch_listing()', 'public._trg_outbid()', 'public._trg_trade_insert()', 'public._trg_trade_status()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
