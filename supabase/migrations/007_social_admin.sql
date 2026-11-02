-- FantaProf V2 — 007 admin di lega, chat, community, tecnica
-- Permessi dei co-admin, annulla registrazione, proposte dei giocatori, risposte/reazioni/messaggio fissato,
-- sondaggi, follow, filtro parole, notifiche push, errori client, statistiche pubbliche, realtime.
-- Idempotente: si può rieseguire. Non dipende dalle migrazioni 005/006.

-- ── Helper interni ───────────────────────────────────────────────
-- Notifica sicura: non fa mai fallire l'azione chiamante se la tabella non è come previsto.
create or replace function public._c_notify(p_user uuid, p_type text, p_payload jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or to_regclass('public.notifications') is null then return; end if;
  begin
    execute 'insert into public.notifications (user_id, type, payload) values ($1, $2, $3)' using p_user, p_type, p_payload;
  exception when others then null;
  end;
end $$;

-- Registro audit (se la tabella esiste nel database): colonne admin_id, action, target_type, target_id, details.
create or replace function public._c_audit(p_action text, p_target_type text, p_target_id text, p_details jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.audit_logs') is null then return; end if;
  begin
    execute format('insert into public.audit_logs (admin_id, action, target_type, target_id, details) values (%L, %L, %L, %L, %L)',
                   auth.uid(), p_action, p_target_type, p_target_id, p_details::text);
  exception when others then null;
  end;
end $$;

-- ── A. Permessi dei co-admin ─────────────────────────────────────
alter table public.leagues add column if not exists coadmin_perms jsonb not null
  default '{"events":true,"members":false,"missions":true}';

create or replace function public.has_league_perm(p_league uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin()
      or exists (select 1 from public.leagues l where l.id = p_league and l.owner_id = auth.uid())
      or exists (select 1 from public.league_members m join public.leagues l on l.id = m.league_id
                  where m.league_id = p_league and m.user_id = auth.uid() and m.role = 'coadmin'
                    and coalesce((l.coadmin_perms ->> p_perm)::boolean, false))
$$;

create or replace function public.set_coadmin_perms(p_league uuid, p_perms jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v_new jsonb := '{}';
begin
  perform public.assert_active(p_league);
  if not (public.is_superadmin() or exists (select 1 from public.leagues where id = p_league and owner_id = auth.uid())) then
    raise exception 'Solo il proprietario può gestire i permessi dei co-admin' using errcode = '42501';
  end if;
  if jsonb_typeof(p_perms) <> 'object' then raise exception 'Permessi non validi'; end if;
  foreach k in array array['events','members','missions'] loop
    if p_perms ? k then
      if jsonb_typeof(p_perms -> k) <> 'boolean' then raise exception 'Permessi non validi'; end if;
      v_new := v_new || jsonb_build_object(k, (p_perms ->> k)::boolean);
    else
      v_new := v_new || jsonb_build_object(k, false);
    end if;
  end loop;
  update public.leagues set coadmin_perms = v_new where id = p_league;
end $$;

-- Funzioni di 003/004 ricreate: cambia solo il controllo permessi (is_league_admin → has_league_perm).
create or replace function public.add_events(p_league uuid, p_events jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_lg public.leagues; v_def jsonb; v_kind text; v_pts int; v_max int; v_prof uuid; n int := 0;
  t record; v_contrib int; v_pu uuid; v_label text; v_ev uuid;
begin
  perform public.assert_active(p_league);
  if not public.has_league_perm(p_league, 'events') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 or jsonb_array_length(p_events) > 100 then
    raise exception 'Lista eventi non valida';
  end if;
  select * into v_lg from public.leagues where id = p_league;
  for r in select * from jsonb_array_elements(p_events) loop
    v_prof := (r->>'professor_id')::uuid;
    if not exists (select 1 from public.professors where id = v_prof and league_id = p_league) then
      raise exception 'Professore non valido per questa lega';
    end if;
    v_def := null;
    select d, 'bm' into v_def, v_kind from jsonb_array_elements(v_lg.bonus || v_lg.malus) d where d->>'id' = r->>'event_key' limit 1;
    if v_def is null then
      select d, 'premio' into v_def, v_kind from jsonb_array_elements(v_lg.premi) d where d->>'id' = r->>'event_key' limit 1;
    end if;
    if v_def is null then raise exception 'Evento "%" non presente nel catalogo della lega', r->>'event_key'; end if;
    v_pts := (v_def->>'pts')::int;
    v_max := nullif(v_def->>'maxPerWeek', 'null')::int;
    v_label := v_def->>'label';
    if v_kind = 'premio' and v_max is not null then
      if (select count(*) from public.events
           where league_id = p_league and event_key = r->>'event_key' and professor_id = v_prof
             and created_at >= date_trunc('week', now())) >= v_max then
        raise exception 'Limite settimanale raggiunto per "%" su questo prof', v_label;
      end if;
    end if;
    insert into public.events (league_id, professor_id, event_key, label, kind, pts, created_by)
    values (p_league, v_prof, r->>'event_key', v_label, v_kind, v_pts, auth.uid());
    n := n + 1;

    -- Power-up delle squadre che hanno questo prof
    for t in select tm.id as team_id, (tm.captain_id = v_prof) as cap
               from public.teams tm join public.team_professors tp on tp.team_id = tm.id
              where tm.league_id = p_league and tp.professor_id = v_prof loop
      v_contrib := v_pts * case when t.cap then 2 else 1 end;
      v_pu := null;
      if v_pts < 0 then
        select id into v_pu from public.powerups
         where team_id = t.team_id and kind = 'shield' and used_at is null and (expires_at is null or expires_at > now())
         order by created_at limit 1 for update skip locked;
        if v_pu is not null then
          update public.powerups set used_at = now() where id = v_pu;
          perform public._team_event(p_league, t.team_id, 'shield_used', '🛡️ Scudo: bloccato "' || v_label || '"', 'shop', -v_contrib, auth.uid());
        end if;
      elsif v_pts > 0 then
        select id into v_pu from public.powerups
         where team_id = t.team_id and kind = 'multiplier' and used_at is null
         order by created_at limit 1 for update skip locked;
        if v_pu is not null then
          update public.powerups set used_at = now() where id = v_pu;
          perform public._team_event(p_league, t.team_id, 'multiplier_used', '⚡ Moltiplicatore: "' || v_label || '"', 'shop', v_contrib, auth.uid());
        end if;
      end if;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.delete_event(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lg uuid;
begin
  select league_id into v_lg from public.events where id = p_event;
  if v_lg is null then raise exception 'Evento non trovato'; end if;
  perform public.assert_active(v_lg);
  if not public.has_league_perm(v_lg, 'events') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  delete from public.events where id = p_event;
end $$;

create or replace function public.add_custom_event(p_league uuid, p_kind text, p_label text, p_pts int)
returns void language plpgsql security definer set search_path = public as $$
declare v_id text := 'c_' || substr(replace(gen_random_uuid()::text,'-',''), 1, 8);
begin
  perform public.assert_active(p_league);
  if not public.has_league_perm(p_league, 'events') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if p_kind not in ('bonus','malus') then raise exception 'Tipo non valido'; end if;
  if p_pts is null or p_pts = 0 or p_pts < -500 or p_pts > 500 then raise exception 'Punti non validi (±500)'; end if;
  if (p_kind = 'bonus' and p_pts < 0) or (p_kind = 'malus' and p_pts > 0) then
    raise exception 'Il segno dei punti non corrisponde al tipo';
  end if;
  if p_kind = 'bonus' then
    update public.leagues set bonus = bonus || jsonb_build_array(jsonb_build_object('id', v_id, 'label', public.clean_text(p_label, 2, 80, 'Nome evento'), 'pts', p_pts)) where id = p_league;
  else
    update public.leagues set malus = malus || jsonb_build_array(jsonb_build_object('id', v_id, 'label', public.clean_text(p_label, 2, 80, 'Nome evento'), 'pts', p_pts)) where id = p_league;
  end if;
end $$;

create or replace function public.remove_catalog_event(p_league uuid, p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  if not public.has_league_perm(p_league, 'events') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.leagues set
    bonus = coalesce((select jsonb_agg(d) from jsonb_array_elements(bonus) d where d->>'id' <> p_key), '[]'),
    malus = coalesce((select jsonb_agg(d) from jsonb_array_elements(malus) d where d->>'id' <> p_key), '[]')
  where id = p_league;
end $$;

create or replace function public.remove_member(p_league uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  if not public.has_league_perm(p_league, 'members') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if exists (select 1 from public.leagues where id = p_league and owner_id = p_user) then
    raise exception 'Non puoi rimuovere il proprietario';
  end if;
  delete from public.teams where league_id = p_league and owner_id = p_user;
  delete from public.league_members where league_id = p_league and user_id = p_user;
end $$;

create or replace function public.add_mission(p_league uuid, p_label text, p_desc text, p_reward_pts int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.assert_active(p_league);
  if not public.has_league_perm(p_league, 'missions') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if (select count(*) from public.missions where league_id = p_league) >= 40 then raise exception 'Troppe missioni'; end if;
  if p_reward_pts is null or p_reward_pts < 1 or p_reward_pts > 500 then raise exception 'Premio non valido (1-500 pt)'; end if;
  insert into public.missions (league_id, label, description, type, reward, reward_pts, reward_label)
  values (p_league, public.clean_text(p_label, 2, 60, 'Titolo missione'), public.clean_text(coalesce(p_desc,' '), 0, 200, 'Descrizione'),
          'manual', 'pts', p_reward_pts, '+' || p_reward_pts || ' pt bonus')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_mission(p_mission uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lg uuid;
begin
  select league_id into v_lg from public.missions where id = p_mission;
  if v_lg is null then return; end if;
  perform public.assert_active(v_lg);
  if not public.has_league_perm(v_lg, 'missions') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  delete from public.missions where id = p_mission;
end $$;

create or replace function public.set_missions_enabled(p_league uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  if not public.has_league_perm(p_league, 'missions') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.leagues set missions_enabled = p_enabled where id = p_league;
end $$;

create or replace function public.review_claim(p_claim uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.mission_claims; m public.missions;
begin
  select * into c from public.mission_claims where id = p_claim for update;
  if not found then raise exception 'Richiesta non trovata'; end if;
  perform public.assert_active(c.league_id);
  if not public.has_league_perm(c.league_id, 'missions') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if c.status <> 'pending' then raise exception 'Richiesta già gestita'; end if;
  update public.mission_claims set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid() where id = c.id;
  if p_approve then
    select * into m from public.missions where id = c.mission_id;
    perform public._apply_reward(c.league_id, c.user_id, m);
  end if;
end $$;

-- ── B. Annulla l'ultima registrazione di eventi ──────────────────
create or replace function public.undo_last_events(p_league uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_last timestamptz; v_n int;
begin
  perform public.assert_active(p_league);
  if not public.has_league_perm(p_league, 'events') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  select max(created_at) into v_last from public.events where league_id = p_league and created_by = auth.uid();
  if v_last is null then raise exception 'Nessuna registrazione da annullare'; end if;
  -- Elimina il batch (stessa transazione o entro 5 s) inclusi gli effetti automatici di scudo/moltiplicatore.
  delete from public.events where league_id = p_league and created_by = auth.uid()
     and created_at >= v_last - interval '5 seconds';
  get diagnostics v_n = row_count;
  -- Ripristina i power-up consumati dallo stesso batch.
  update public.powerups set used_at = null
   where league_id = p_league and used_at >= v_last - interval '5 seconds' and used_at <= v_last + interval '5 seconds';
  perform public._c_audit('undo_events', 'league', p_league::text, jsonb_build_object('count', v_n));
  return v_n;
end $$;

-- ── C. Proposte dei giocatori ────────────────────────────────────
create table if not exists public.event_proposals (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  professor_id uuid not null references public.professors(id) on delete cascade,
  event_key   text not null,
  note        text not null default '' check (char_length(note) <= 140),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists event_proposals_league on public.event_proposals (league_id, status, created_at desc);
alter table public.event_proposals enable row level security;
grant select on public.event_proposals to authenticated;
drop policy if exists event_proposals_read on public.event_proposals;
create policy event_proposals_read on public.event_proposals for select to authenticated
  using (public.is_league_member(league_id) and (proposer_id = auth.uid() or public.has_league_perm(league_id, 'events')));

create or replace function public.propose_event(p_league uuid, p_prof uuid, p_event_key text, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_lg public.leagues; v_id uuid; v_label text; v_pname text; r record;
begin
  perform public.assert_active(p_league);
  if not exists (select 1 from public.league_members where league_id = p_league and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  select * into v_lg from public.leagues where id = p_league;
  select name into v_pname from public.professors where id = p_prof and league_id = p_league;
  if v_pname is null then raise exception 'Professore non valido per questa lega'; end if;
  select d ->> 'label' into v_label from jsonb_array_elements(v_lg.bonus || v_lg.malus || v_lg.premi) d where d ->> 'id' = p_event_key limit 1;
  if v_label is null then raise exception 'Evento non presente nel catalogo della lega'; end if;
  if (select count(*) from public.event_proposals where league_id = p_league and proposer_id = auth.uid() and status = 'pending') >= 5 then
    raise exception 'Hai già 5 proposte in attesa: aspetta che l''admin le valuti';
  end if;
  if exists (select 1 from public.event_proposals where league_id = p_league and proposer_id = auth.uid()
              and status = 'pending' and professor_id = p_prof and event_key = p_event_key) then
    raise exception 'Hai già proposto questo evento per questo professore';
  end if;
  insert into public.event_proposals (league_id, proposer_id, professor_id, event_key, note)
  values (p_league, auth.uid(), p_prof, p_event_key, public.clean_text(coalesce(p_note, ' '), 0, 140, 'Nota'))
  returning id into v_id;
  -- Avvisa chi può approvare (proprietario e co-admin con permesso)
  for r in
    select l.owner_id as uid from public.leagues l where l.id = p_league
    union
    select m.user_id from public.league_members m join public.leagues l on l.id = m.league_id
     where m.league_id = p_league and m.role = 'coadmin' and coalesce((l.coadmin_perms ->> 'events')::boolean, false)
  loop
    if r.uid <> auth.uid() then
      perform public._c_notify(r.uid, 'proposal_new', jsonb_build_object('league_id', p_league, 'proposal_id', v_id, 'professor', v_pname, 'event', v_label));
    end if;
  end loop;
  return v_id;
end $$;

create or replace function public.review_proposal(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare p public.event_proposals; v_label text;
begin
  select * into p from public.event_proposals where id = p_id for update;
  if not found then raise exception 'Proposta non trovata'; end if;
  perform public.assert_active(p.league_id);
  if not public.has_league_perm(p.league_id, 'events') then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if p.status <> 'pending' then raise exception 'Proposta già gestita'; end if;
  if p_approve then
    -- I punti passano dalla stessa logica della registrazione normale (limiti, scudi, moltiplicatori…)
    perform public.add_events(p.league_id, jsonb_build_array(jsonb_build_object('professor_id', p.professor_id, 'event_key', p.event_key)));
  end if;
  update public.event_proposals set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now() where id = p.id;
  select d ->> 'label' into v_label from public.leagues l, jsonb_array_elements(l.bonus || l.malus || l.premi) d
   where l.id = p.league_id and d ->> 'id' = p.event_key limit 1;
  perform public._c_notify(p.proposer_id, case when p_approve then 'proposal_approved' else 'proposal_rejected' end,
    jsonb_build_object('league_id', p.league_id, 'proposal_id', p.id, 'event', v_label));
end $$;

-- ── F. Chat: risposte, reazioni, messaggio fissato ───────────────
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists pinned_at timestamptz;
alter table public.messages add column if not exists pinned_by uuid references public.profiles(id) on delete set null;
create unique index if not exists messages_one_pinned on public.messages (league_id) where pinned_at is not null;

-- La vecchia firma (uuid, text) verrebbe lasciata come overload ambiguo: la sostituisco.
drop function if exists public.send_message(uuid, text);
create or replace function public.send_message(p_league uuid, p_body text, p_reply_to uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.assert_active(p_league);
  if not exists (select 1 from public.league_members where league_id = p_league and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  if p_reply_to is not null and not exists (select 1 from public.messages where id = p_reply_to and league_id = p_league) then
    raise exception 'Il messaggio a cui rispondi non esiste più';
  end if;
  if (select count(*) from public.messages where author_id = auth.uid() and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Stai scrivendo troppo in fretta';
  end if;
  insert into public.messages (league_id, author_id, body, reply_to)
  values (p_league, auth.uid(), public.clean_text(p_body, 1, 500, 'Messaggio'), p_reply_to) returning id into v_id;
  return v_id;
end $$;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (emoji in ('👍','❤️','😂','😮','🔥','👏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_msg on public.message_reactions (message_id);
alter table public.message_reactions enable row level security;
grant select on public.message_reactions to authenticated;
drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_league_member(m.league_id)));

create or replace function public.toggle_reaction(p_msg uuid, p_emoji text)
returns boolean language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_msg;
  if not found then raise exception 'Messaggio non trovato'; end if;
  perform public.assert_active(m.league_id);
  if not exists (select 1 from public.league_members where league_id = m.league_id and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  if p_emoji not in ('👍','❤️','😂','😮','🔥','👏') then raise exception 'Reazione non valida'; end if;
  if exists (select 1 from public.message_reactions where message_id = p_msg and user_id = auth.uid() and emoji = p_emoji) then
    delete from public.message_reactions where message_id = p_msg and user_id = auth.uid() and emoji = p_emoji;
    return false;
  end if;
  insert into public.message_reactions (message_id, user_id, emoji) values (p_msg, auth.uid(), p_emoji);
  return true;
end $$;

create or replace function public.pin_message(p_msg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_msg;
  if not found then raise exception 'Messaggio non trovato'; end if;
  perform public.assert_active(m.league_id);
  if not public.is_league_admin(m.league_id) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.messages set pinned_at = null, pinned_by = null where league_id = m.league_id and pinned_at is not null;
  update public.messages set pinned_at = now(), pinned_by = auth.uid() where id = p_msg;
end $$;

create or replace function public.unpin_message(p_msg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_msg;
  if not found then return; end if;
  perform public.assert_active(m.league_id);
  if not public.is_league_admin(m.league_id) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.messages set pinned_at = null, pinned_by = null where id = p_msg;
end $$;

-- ── F2. Sondaggi rapidi ──────────────────────────────────────────
create table if not exists public.polls (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  question   text not null check (char_length(question) between 2 and 120),
  options    jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 5),
  closes_at  timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists polls_league on public.polls (league_id, created_at desc);
create table if not exists public.poll_votes (
  poll_id    uuid not null references public.polls(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  option_idx int  not null check (option_idx between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
grant select on public.polls, public.poll_votes to authenticated;
drop policy if exists polls_read on public.polls;
create policy polls_read on public.polls for select to authenticated using (public.is_league_member(league_id));
drop policy if exists poll_votes_read on public.poll_votes;
create policy poll_votes_read on public.poll_votes for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and public.is_league_member(p.league_id)));

create or replace function public.create_poll(p_league uuid, p_question text, p_options jsonb, p_hours int default 24)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_opts jsonb := '[]'; o jsonb; t text;
begin
  perform public.assert_active(p_league);
  if not exists (select 1 from public.league_members where league_id = p_league and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 72 then raise exception 'Durata non valida (1-72 ore)'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 or jsonb_array_length(p_options) > 5 then
    raise exception 'Servono da 2 a 5 opzioni';
  end if;
  for o in select * from jsonb_array_elements(p_options) loop
    if jsonb_typeof(o) <> 'string' then raise exception 'Opzioni non valide'; end if;
    t := public.clean_text(o #>> '{}', 1, 40, 'Opzione');
    if v_opts @> to_jsonb(t) then raise exception 'Le opzioni devono essere diverse'; end if;
    v_opts := v_opts || to_jsonb(t);
  end loop;
  if (select count(*) from public.polls where league_id = p_league and author_id = auth.uid() and closes_at > now()) >= 2 then
    raise exception 'Hai già 2 sondaggi aperti';
  end if;
  insert into public.polls (league_id, author_id, question, options, closes_at)
  values (p_league, auth.uid(), public.clean_text(p_question, 2, 120, 'Domanda'), v_opts, now() + make_interval(hours => p_hours))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.vote_poll(p_poll uuid, p_idx int)
returns void language plpgsql security definer set search_path = public as $$
declare p public.polls;
begin
  select * into p from public.polls where id = p_poll;
  if not found then raise exception 'Sondaggio non trovato'; end if;
  perform public.assert_active(p.league_id);
  if not exists (select 1 from public.league_members where league_id = p.league_id and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  if p.closes_at <= now() then raise exception 'Sondaggio chiuso'; end if;
  if p_idx is null or p_idx < 0 or p_idx >= jsonb_array_length(p.options) then raise exception 'Opzione non valida'; end if;
  begin
    insert into public.poll_votes (poll_id, user_id, option_idx) values (p_poll, auth.uid(), p_idx);
  exception when unique_violation then
    raise exception 'Hai già votato: il voto non si può cambiare';
  end;
end $$;

create or replace function public.delete_poll(p_poll uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.polls;
begin
  select * into p from public.polls where id = p_poll;
  if not found then return; end if;
  perform public.assert_active(p.league_id);
  if p.author_id <> auth.uid() and not public.is_league_admin(p.league_id) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  delete from public.polls where id = p_poll;
end $$;

-- Sondaggi della lega con risultati aggregati e il mio voto (le preferenze degli altri non sono esposte per nome).
create or replace function public.league_polls(p_league uuid)
returns table (id uuid, author_id uuid, question text, options jsonb, closes_at timestamptz, created_at timestamptz,
               counts int[], total int, my_vote int)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sessione scaduta: accedi di nuovo' using errcode = '28000'; end if;
  if not public.is_league_member(p_league) then raise exception 'Non fai parte di questa lega' using errcode = '42501'; end if;
  return query
    select p.id, p.author_id, p.question, p.options, p.closes_at, p.created_at,
           (select array_agg(coalesce(c.n, 0)::int order by g.i)
              from generate_series(0, jsonb_array_length(p.options) - 1) g(i)
              left join (select option_idx, count(*) n from public.poll_votes v where v.poll_id = p.id group by option_idx) c on c.option_idx = g.i),
           (select count(*)::int from public.poll_votes v where v.poll_id = p.id),
           (select v.option_idx from public.poll_votes v where v.poll_id = p.id and v.user_id = auth.uid())
      from public.polls p
     where p.league_id = p_league and p.created_at > now() - interval '7 days'
     order by p.created_at desc limit 20;
end $$;

-- ── G. Segui un giocatore ────────────────────────────────────────
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
create index if not exists follows_followed on public.follows (followed_id);
alter table public.follows enable row level security;
grant select on public.follows to authenticated;
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated
  using (follower_id = auth.uid() or followed_id = auth.uid());

create or replace function public.toggle_follow(p_target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active();
  if p_target = auth.uid() then raise exception 'Non puoi seguire te stesso'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then raise exception 'Utente non trovato'; end if;
  if exists (select 1 from public.follows where follower_id = auth.uid() and followed_id = p_target) then
    delete from public.follows where follower_id = auth.uid() and followed_id = p_target;
    return false;
  end if;
  if (select count(*) from public.follows where follower_id = auth.uid()) >= 200 then raise exception 'Puoi seguire al massimo 200 giocatori'; end if;
  insert into public.follows (follower_id, followed_id) values (auth.uid(), p_target);
  return true;
end $$;

-- Contatori pubblici (solo numeri) e stato "lo seguo?" per un utente.
create or replace function public.follow_stats(p_user uuid)
returns table (following int, followers int, i_follow boolean)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from public.follows where follower_id = p_user),
         (select count(*)::int from public.follows where followed_id = p_user),
         exists (select 1 from public.follows where follower_id = auth.uid() and followed_id = p_user)
   where auth.uid() is not null
$$;

-- Elenco di chi seguo / chi mi segue.
create or replace function public.my_follows()
returns table (user_id uuid, username citext, avatar text, avatar_url text, verified boolean, direction text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar, p.avatar_url, p.verified, 'following'::text
    from public.follows f join public.profiles p on p.id = f.followed_id where f.follower_id = auth.uid()
  union all
  select p.id, p.username, p.avatar, p.avatar_url, p.verified, 'follower'::text
    from public.follows f join public.profiles p on p.id = f.follower_id where f.followed_id = auth.uid()
$$;

-- Attività recenti dei giocatori che seguo, SOLO nelle leghe in cui sono membro anch'io.
create or replace function public.follow_feed()
returns table (at timestamptz, kind text, text text, league_id uuid, user_id uuid)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sessione scaduta: accedi di nuovo' using errcode = '28000'; end if;
  -- Mercato (acquisti e vendite registrati come eventi di squadra)
  return query
    select e.created_at, 'mercato'::text, (p.username || ' · ' || e.label)::text, e.league_id, t.owner_id
      from public.events e
      join public.teams t on t.id = e.team_id
      join public.profiles p on p.id = t.owner_id
     where e.event_key in ('market_buy', 'market_sell')
       and t.owner_id in (select followed_id from public.follows where follower_id = auth.uid())
       and e.league_id in (select league_id from public.league_members where user_id = auth.uid());
  -- Scambi accettati
  return query
    select tr.created_at, 'scambio'::text,
           (pa.username || ' e ' || pb.username || ' hanno concluso uno scambio: ' || fp.name || ' ⇄ ' || tp.name)::text,
           tr.league_id, case when tr.from_user in (select followed_id from public.follows where follower_id = auth.uid()) then tr.from_user else tr.to_user end
      from public.trades tr
      join public.profiles pa on pa.id = tr.from_user join public.profiles pb on pb.id = tr.to_user
      join public.professors fp on fp.id = tr.from_prof join public.professors tp on tp.id = tr.to_prof
     where tr.status = 'accepted'
       and (tr.from_user in (select followed_id from public.follows where follower_id = auth.uid())
         or tr.to_user in (select followed_id from public.follows where follower_id = auth.uid()))
       and tr.league_id in (select league_id from public.league_members where user_id = auth.uid());
  -- Risultati di fine stagione (tabella creata dalla migrazione di stagione, se presente)
  if to_regclass('public.season_results') is not null then
    begin
      return query execute $q$
        select r.created_at, 'stagione'::text,
               (r.username || ' ha chiuso la stagione ' || r.season_num || ' al ' || r.rank || '° posto con ' || r.score || ' pt')::text,
               r.league_id, r.owner_id
          from public.season_results r
         where r.owner_id in (select followed_id from public.follows where follower_id = auth.uid())
           and r.league_id in (select league_id from public.league_members where user_id = auth.uid())$q$;
    exception when others then null;
    end;
  end if;
  -- Sfide concluse (tabella creata dalla migrazione di gioco, se presente)
  if to_regclass('public.duels') is not null then
    begin
      return query execute $q$
        select d.ends_at, 'sfida'::text,
               (pa.username || ' ha sfidato ' || pb.username || ' (sfida conclusa)')::text,
               d.league_id, d.challenger_user
          from public.duels d
          join public.profiles pa on pa.id = d.challenger_user join public.profiles pb on pb.id = d.opponent_user
         where d.status = 'finished'
           and (d.challenger_user in (select followed_id from public.follows where follower_id = auth.uid())
             or d.opponent_user in (select followed_id from public.follows where follower_id = auth.uid()))
           and d.league_id in (select league_id from public.league_members where user_id = auth.uid())$q$;
    exception when others then null;
    end;
  end if;
end $$;

-- Wrapper: ordina e limita (le RETURN QUERY sopra non garantiscono l'ordine globale).
create or replace function public.follow_feed_recent(p_limit int default 50)
returns table (at timestamptz, kind text, text text, league_id uuid, user_id uuid)
language sql stable security definer set search_path = public as $$
  select * from public.follow_feed() f order by f.at desc nulls last limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- ── H. Filtro parole vietate ─────────────────────────────────────
create table if not exists public.banned_words (
  word       citext primary key check (char_length(word) between 2 and 40),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.banned_words enable row level security;   -- nessuna policy: solo funzioni admin

create or replace function public._norm_text(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'àáâãäåèéêëìíîïòóôõöùúûüçñ0134578@$', 'aaaaaaeeeeiiiiooooouuuucnoieastbas'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.contains_banned(p_text text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.banned_words b
     where position(' ' || public._norm_text(b.word::text) || ' ' in ' ' || public._norm_text(p_text) || ' ') > 0
       and public._norm_text(b.word::text) <> ''
  )
$$;

create or replace function public._trg_banned()
returns trigger language plpgsql security definer set search_path = public as $$
declare i int; v text;
begin
  for i in 0 .. TG_NARGS - 1 loop
    v := to_jsonb(NEW) ->> TG_ARGV[i];
    if v is not null and public.contains_banned(v) then
      raise exception 'Il messaggio contiene parole non consentite' using errcode = 'P0001';
    end if;
  end loop;
  return NEW;
end $$;

drop trigger if exists banned_messages on public.messages;
create trigger banned_messages before insert or update of body on public.messages
  for each row execute function public._trg_banned('body');
drop trigger if exists banned_polls on public.polls;
create trigger banned_polls before insert or update of question, options on public.polls
  for each row execute function public._trg_banned('question', 'options');
drop trigger if exists banned_proposals on public.event_proposals;
create trigger banned_proposals before insert or update of note on public.event_proposals
  for each row execute function public._trg_banned('note');
-- Messaggi privati: la tabella esiste nel database reale ma non nelle migrazioni del repo.
do $$
begin
  if to_regclass('public.direct_messages') is not null then
    execute 'drop trigger if exists banned_dm on public.direct_messages';
    execute 'create trigger banned_dm before insert or update of body on public.direct_messages
             for each row execute function public._trg_banned(''body'')';
  end if;
end $$;

create or replace function public.admin_add_banned_word(p_word text)
returns void language plpgsql security definer set search_path = public as $$
declare w text := lower(btrim(coalesce(p_word, '')));
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if char_length(w) < 2 or char_length(w) > 40 then raise exception 'Parola non valida (2-40 caratteri)'; end if;
  insert into public.banned_words (word, created_by) values (w, auth.uid()) on conflict do nothing;
  perform public._c_audit('banned_word_add', 'banned_word', w, '{}'::jsonb);
end $$;

create or replace function public.admin_remove_banned_word(p_word text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  delete from public.banned_words where word = p_word;
  perform public._c_audit('banned_word_remove', 'banned_word', p_word, '{}'::jsonb);
end $$;

create or replace function public.admin_list_banned_words()
returns table (word citext, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  return query select b.word, b.created_at from public.banned_words b order by b.word;
end $$;

-- ── J. Notifiche push ────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) <= 1000),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;  -- nessuna policy: la legge solo la Edge Function (service role)

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active();
  if p_endpoint !~ '^https://' then raise exception 'Endpoint non valido'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
  -- massimo 10 dispositivi per utente: tiene i più recenti
  delete from public.push_subscriptions where user_id = auth.uid() and id not in (
    select id from public.push_subscriptions where user_id = auth.uid() order by created_at desc limit 10);
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sessione scaduta: accedi di nuovo' using errcode = '28000'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

-- ── K. Errori dal client ─────────────────────────────────────────
create table if not exists public.client_errors (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  message    text not null check (char_length(message) <= 500),
  stack      text check (stack is null or char_length(stack) <= 2000),
  url        text check (url is null or char_length(url) <= 300),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_created on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;  -- nessuna policy: solo funzioni

create or replace function public.report_client_error(p_message text, p_stack text default null, p_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ua text;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta: accedi di nuovo' using errcode = '28000'; end if;
  if (select count(*) from public.client_errors where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Troppe segnalazioni: riprova più tardi';
  end if;
  begin v_ua := left(current_setting('request.headers', true)::json ->> 'user-agent', 300); exception when others then v_ua := null; end;
  insert into public.client_errors (user_id, message, stack, url, user_agent)
  values (auth.uid(), left(coalesce(nullif(btrim(p_message), ''), '(senza messaggio)'), 500), left(p_stack, 2000), left(p_url, 300), v_ua);
end $$;

create or replace function public.admin_list_client_errors(p_limit int default 100)
returns table (id uuid, user_id uuid, username citext, message text, stack text, url text, user_agent text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  return query select e.id, e.user_id, p.username, e.message, e.stack, e.url, e.user_agent, e.created_at
    from public.client_errors e left join public.profiles p on p.id = e.user_id
   order by e.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 300);
end $$;

create or replace function public.admin_delete_client_error(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  delete from public.client_errors where id = p_id;
end $$;

-- ── L. Statistiche pubbliche (solo conteggi aggregati) ───────────
create or replace function public.public_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'leagues', (select count(*) from public.leagues where not suspended),
    'players', (select count(*) from public.profiles),
    'events',  (select count(*) from public.events))
$$;

-- ── I. Realtime ──────────────────────────────────────────────────
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['events','teams','team_professors','messages','message_reactions','trades','market_listings',
                             'notifications','polls','poll_votes','event_proposals','duels','leagues','league_members'] loop
      if to_regclass('public.' || t) is not null
         and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Tabelle senza policy: nessun accesso diretto dal client (Supabase concede di default privilegi ampi su public).
revoke all on public.push_subscriptions, public.client_errors, public.banned_words from anon, authenticated;

-- ── Permessi di esecuzione (solo le funzioni nuove/ricreate) ─────
do $$
declare f text;
begin
  foreach f in array array[
    'public.has_league_perm(uuid, text)', 'public.set_coadmin_perms(uuid, jsonb)',
    'public.add_events(uuid, jsonb)', 'public.delete_event(uuid)', 'public.add_custom_event(uuid, text, text, int)',
    'public.remove_catalog_event(uuid, text)', 'public.remove_member(uuid, uuid)', 'public.add_mission(uuid, text, text, int)',
    'public.delete_mission(uuid)', 'public.set_missions_enabled(uuid, boolean)', 'public.review_claim(uuid, boolean)',
    'public.undo_last_events(uuid)', 'public.propose_event(uuid, uuid, text, text)', 'public.review_proposal(uuid, boolean)',
    'public.send_message(uuid, text, uuid)', 'public.toggle_reaction(uuid, text)', 'public.pin_message(uuid)', 'public.unpin_message(uuid)',
    'public.create_poll(uuid, text, jsonb, int)', 'public.vote_poll(uuid, int)', 'public.delete_poll(uuid)', 'public.league_polls(uuid)',
    'public.toggle_follow(uuid)', 'public.follow_stats(uuid)', 'public.my_follows()', 'public.follow_feed()', 'public.follow_feed_recent(int)',
    'public.contains_banned(text)', 'public.admin_add_banned_word(text)', 'public.admin_remove_banned_word(text)', 'public.admin_list_banned_words()',
    'public.save_push_subscription(text, text, text)', 'public.delete_push_subscription(text)',
    'public.report_client_error(text, text, text)', 'public.admin_list_client_errors(int)', 'public.admin_delete_client_error(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  -- Pubbliche: la landing mostra i numeri anche a chi non ha ancora un account
  revoke execute on function public.public_stats() from public;
  grant execute on function public.public_stats() to anon, authenticated;
  -- Interne e trigger: nessun accesso dal client
  revoke execute on function public._c_notify(uuid, text, jsonb), public._c_audit(text, text, text, jsonb),
    public._norm_text(text), public._trg_banned() from public, anon, authenticated;
end $$;
