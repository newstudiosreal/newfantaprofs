-- FantaProf V2 — 003 funzioni di gioco (unico punto di scrittura per il client)
-- Tutte le funzioni sono SECURITY DEFINER: validano identità, ruolo, budget e
-- proprietà dei dati lato server. Il client non può aggirarle.

-- ── Cataloghi eventi di default (presi dalla V1) ─────────────────
create or replace function public.default_catalog(p_kind text)
returns jsonb language sql immutable as $f$
  select case p_kind
    when 'bonus' then $j$[{"id":"assenza","label":"È assente","pts":15},{"id":"ritardo","label":"Arriva in ritardo","pts":10},{"id":"fine_prima","label":"Fa finire la lezione prima","pts":10},{"id":"no_lezione_5m","label":"Non inizia la lezione per 5 min","pts":10},{"id":"video","label":"Fa vedere un video","pts":15},{"id":"sostituto","label":"Viene sostituito da un collega","pts":20},{"id":"parla_collega","label":"Esce per parlare con un collega","pts":15},{"id":"lavagna","label":"Scrive alla lavagna","pts":5},{"id":"complimento","label":"Fa un complimento alla classe","pts":10},{"id":"lavoretti","label":"Fa fare attività in gruppo","pts":10},{"id":"interr_prog","label":"Interrogazione programmata","pts":8},{"id":"correzione","label":"Restituisce compiti in 3 giorni","pts":15},{"id":"liberi","label":"Ci lascia liberi in classe","pts":25},{"id":"ricreazione","label":"Allunga la ricreazione","pts":20},{"id":"interroga_sbagliato","label":"Interroga e poi dice \"ah no lascia stare\"","pts":20},{"id":"telefono","label":"Usa il telefono durante la lezione","pts":15},{"id":"sbaglia_data","label":"Sbaglia la data sulla lavagna","pts":10},{"id":"doppio_appello","label":"Fa l'appello due volte","pts":10},{"id":"storia_personale","label":"Racconta un aneddoto personale","pts":20},{"id":"lezione_diversa","label":"Fa lezione su un argomento a caso","pts":25},{"id":"canta","label":"Canta o canticchia","pts":35},{"id":"film_completo","label":"Fa vedere un film intero","pts":30},{"id":"monocromatico","label":"Vestito monocromatico","pts":25},{"id":"capelli","label":"Capelli appena tagliati","pts":40},{"id":"profumo","label":"Si sente il profumo","pts":15},{"id":"gita","label":"Organizza una gita","pts":100},{"id":"lim","label":"Cambia sfondo alla LIM","pts":150},{"id":"parolaccia","label":"Dice una parolaccia","pts":40},{"id":"cibo","label":"Porta qualcosa da mangiare","pts":80}]$j$::jsonb
    when 'malus' then $j$[{"id":"interrogazione","label":"Interrogazione a sorpresa","pts":-35},{"id":"verifica_sorpresa","label":"Dà una verifica non annunciata","pts":-50},{"id":"compito","label":"Assegna compiti per il giorno dopo","pts":-25},{"id":"verifiche","label":"Dimentica i compiti corretti","pts":-40},{"id":"ritardo_voto","label":"Mette il voto dopo 2 settimane","pts":-15},{"id":"interroga_tutti","label":"Interroga tutta la classe","pts":-45},{"id":"bagno","label":"Non manda in bagno","pts":-20},{"id":"nota","label":"Mette una nota","pts":-25},{"id":"nome","label":"Sbaglia il nome di uno studente","pts":-10},{"id":"litigio","label":"Litiga con uno studente","pts":-30},{"id":"battuta","label":"Fa una battuta imbarazzante","pts":-15},{"id":"cambia_posto","label":"Cambia i posti in classe","pts":-20},{"id":"spegne_lim","label":"Spegne la LIM a metà lezione","pts":-15},{"id":"ritira_cell","label":"Ritira i cellulari","pts":-10},{"id":"sequestra_cell","label":"Sequestra il cellulare e va in segreteria","pts":-35},{"id":"finestra","label":"Apre la finestra d'inverno","pts":-10},{"id":"rimanda","label":"Rimanda qualcuno","pts":-60},{"id":"chiama_genitori","label":"Chiama i genitori","pts":-50},{"id":"preside","label":"Manda dal preside","pts":-70}]$j$::jsonb
    when 'premi' then $j$[{"id":"lezione_spassosa","label":"🎭 Lezione Spassosa","pts":50,"maxPerWeek":2},{"id":"vestito_bello","label":"👗 Vestito più Bello della Sett.","pts":30,"maxPerWeek":1},{"id":"insuff_secchione","label":"😈 Insufficienza al Secchione","pts":5,"maxPerWeek":null},{"id":"otto_stupido","label":"🤡 8 allo Studente Impreparato","pts":8,"maxPerWeek":null},{"id":"mood_off","label":"😴 Giornata No — Lezione Vuota","pts":20,"maxPerWeek":1},{"id":"tutto_bene","label":"✨ Lezione Perfetta","pts":-15,"maxPerWeek":1}]$j$::jsonb
  end
$f$;

-- ── Guardie comuni ───────────────────────────────────────────────
create or replace function public.assert_active(p_league uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sessione scaduta: accedi di nuovo' using errcode = '28000'; end if;
  if public.is_banned() then raise exception 'Account sospeso' using errcode = '42501'; end if;
  if p_league is not null and not public.is_superadmin() then
    if exists (select 1 from public.leagues where id = p_league and suspended) then
      raise exception 'Lega sospesa' using errcode = '42501';
    end if;
  end if;
end $$;

create or replace function public.clean_text(p text, p_min int, p_max int, p_what text)
returns text language plpgsql immutable as $$
declare t text := btrim(regexp_replace(coalesce(p,''), '[\x01-\x1F\x7F<>]', '', 'g'));
begin
  if char_length(t) < p_min or char_length(t) > p_max then
    raise exception '% non valido (% - % caratteri)', p_what, p_min, p_max;
  end if;
  return t;
end $$;

-- ── Profilo ──────────────────────────────────────────────────────
create or replace function public.update_profile(p_avatar text, p_bio text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active();
  update public.profiles
     set avatar = public.clean_text(p_avatar, 1, 16, 'Avatar'),
         bio    = public.clean_text(coalesce(p_bio,' '), 0, 200, 'Bio')
   where id = auth.uid();
end $$;

-- ── Leghe ────────────────────────────────────────────────────────
create or replace function public.create_league(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; v_try int := 0;
begin
  perform public.assert_active();
  if (select count(*) from public.leagues where owner_id = auth.uid()) >= 10 then
    raise exception 'Hai raggiunto il limite di leghe create';
  end if;
  loop
    v_code := upper(substr(translate(replace(gen_random_uuid()::text,'-',''), 'abcdef', 'XYZWVU'), 1, 6));
    exit when v_code ~ '^[A-Z0-9]{6}$' and not exists (select 1 from public.leagues where code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'Impossibile generare il codice lega, riprova'; end if;
  end loop;
  insert into public.leagues (name, code, owner_id, bonus, malus, premi)
  values (public.clean_text(p_name, 2, 40, 'Nome lega'), v_code, auth.uid(),
          public.default_catalog('bonus'), public.default_catalog('malus'), public.default_catalog('premi'))
  returning id into v_id;
  insert into public.league_members (league_id, user_id, role) values (v_id, auth.uid(), 'coadmin');
  return v_id;
end $$;

create or replace function public.join_league(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_lg public.leagues;
begin
  perform public.assert_active();
  select * into v_lg from public.leagues where code = upper(btrim(p_code));
  if not found then raise exception 'Codice non trovato'; end if;
  if v_lg.suspended then raise exception 'Questa lega è stata sospesa'; end if;
  insert into public.league_members (league_id, user_id) values (v_lg.id, auth.uid())
  on conflict do nothing;
  return v_lg.id;
end $$;

create or replace function public.leave_league(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active();
  if exists (select 1 from public.leagues where id = p_league and owner_id = auth.uid()) then
    raise exception 'Il proprietario non può lasciare la lega: eliminala oppure trasferiscila';
  end if;
  delete from public.teams where league_id = p_league and owner_id = auth.uid();
  delete from public.league_members where league_id = p_league and user_id = auth.uid();
end $$;

create or replace function public.delete_league(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active();
  if not (public.is_superadmin() or exists (select 1 from public.leagues where id = p_league and owner_id = auth.uid())) then
    raise exception 'Solo il proprietario può eliminare la lega' using errcode = '42501';
  end if;
  delete from public.leagues where id = p_league;
end $$;

create or replace function public.set_member_role(p_league uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  if p_role not in ('member','coadmin') then raise exception 'Ruolo non valido'; end if;
  if not (public.is_superadmin() or exists (select 1 from public.leagues where id = p_league and owner_id = auth.uid())) then
    raise exception 'Solo il proprietario può gestire i co-admin' using errcode = '42501';
  end if;
  if exists (select 1 from public.leagues where id = p_league and owner_id = p_user) then
    raise exception 'Il proprietario ha già tutti i permessi';
  end if;
  update public.league_members set role = p_role where league_id = p_league and user_id = p_user;
end $$;

create or replace function public.remove_member(p_league uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if exists (select 1 from public.leagues where id = p_league and owner_id = p_user) then
    raise exception 'Non puoi rimuovere il proprietario';
  end if;
  delete from public.teams where league_id = p_league and owner_id = p_user;
  delete from public.league_members where league_id = p_league and user_id = p_user;
end $$;

-- ── Professori (solo admin di lega) ──────────────────────────────
create or replace function public.add_professors(p_league uuid, p_profs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; v_cost int;
begin
  perform public.assert_active(p_league);
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if jsonb_typeof(p_profs) <> 'array' or jsonb_array_length(p_profs) = 0 or jsonb_array_length(p_profs) > 50 then
    raise exception 'Lista professori non valida';
  end if;
  for r in select * from jsonb_array_elements(p_profs) loop
    v_cost := (r->>'cost')::int;
    if v_cost is null or v_cost < 1 or v_cost > 50 then
      raise exception 'Costo di "%" non valido (1-50)', r->>'name';
    end if;
    insert into public.professors (league_id, name, subject, cost)
    values (p_league, public.clean_text(r->>'name', 2, 40, 'Nome professore'),
            public.clean_text(coalesce(r->>'subject',' '), 0, 40, 'Materia'), v_cost);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.delete_professor(p_prof uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lg uuid;
begin
  select league_id into v_lg from public.professors where id = p_prof;
  if v_lg is null then raise exception 'Professore non trovato'; end if;
  perform public.assert_active(v_lg);
  if not public.is_league_admin(v_lg) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  delete from public.professors where id = p_prof;
end $$;

-- ── Squadra: max 4 prof, budget 50 crediti, tutto validato qui ───
create or replace function public.create_team(p_league uuid, p_name text, p_prof_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_cost int; v_found int; v_team uuid;
begin
  perform public.assert_active(p_league);
  if not exists (select 1 from public.league_members where league_id = p_league and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  if exists (select 1 from public.teams where league_id = p_league and owner_id = auth.uid()) then
    raise exception 'Hai già una squadra in questa lega';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_prof_ids, '{}')) x;
  if cardinality(v_ids) < 1 then raise exception 'Scegli almeno un professore'; end if;
  if cardinality(v_ids) > 4 then raise exception 'Puoi scegliere al massimo 4 professori'; end if;
  select count(*), coalesce(sum(cost), 0) into v_found, v_cost
    from public.professors where league_id = p_league and id = any(v_ids);
  if v_found <> cardinality(v_ids) then raise exception 'Professore non valido per questa lega'; end if;
  if v_cost > 50 then raise exception 'Budget superato (% / 50 crediti)', v_cost; end if;
  insert into public.teams (league_id, owner_id, name)
  values (p_league, auth.uid(), public.clean_text(p_name, 2, 30, 'Nome squadra'))
  returning id into v_team;
  insert into public.team_professors (team_id, professor_id) select v_team, unnest(v_ids);
  return v_team;
end $$;

create or replace function public.rename_team(p_team uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_lg uuid;
begin
  select league_id into v_lg from public.teams where id = p_team and owner_id = auth.uid();
  if v_lg is null then raise exception 'Squadra non trovata' using errcode = '42501'; end if;
  perform public.assert_active(v_lg);
  update public.teams set name = public.clean_text(p_name, 2, 30, 'Nome squadra') where id = p_team;
end $$;

create or replace function public.set_captain(p_team uuid, p_prof uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lg uuid;
begin
  select league_id into v_lg from public.teams where id = p_team and owner_id = auth.uid();
  if v_lg is null then raise exception 'Squadra non trovata' using errcode = '42501'; end if;
  perform public.assert_active(v_lg);
  if p_prof is not null and not exists (
       select 1 from public.team_professors where team_id = p_team and professor_id = p_prof) then
    raise exception 'Il capitano deve essere un professore della tua squadra';
  end if;
  update public.teams set captain_id = p_prof where id = p_team;
end $$;

-- ── Eventi: il punteggio arriva SEMPRE dal catalogo della lega ───
-- p_events = [{"professor_id": "...", "event_key": "assenza"}, ...]
create or replace function public.add_events(p_league uuid, p_events jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_lg public.leagues; v_def jsonb; v_kind text; v_pts int; v_max int; v_prof uuid; n int := 0;
begin
  perform public.assert_active(p_league);
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 or jsonb_array_length(p_events) > 100 then
    raise exception 'Lista eventi non valida';
  end if;
  select * into v_lg from public.leagues where id = p_league;
  for r in select * from jsonb_array_elements(p_events) loop
    v_prof := (r->>'professor_id')::uuid;
    if not exists (select 1 from public.professors where id = v_prof and league_id = p_league) then
      raise exception 'Professore non valido per questa lega';
    end if;
    select d, 'bm' into v_def, v_kind from jsonb_array_elements(v_lg.bonus || v_lg.malus) d where d->>'id' = r->>'event_key' limit 1;
    if v_def is null then
      select d, 'premio' into v_def, v_kind from jsonb_array_elements(v_lg.premi) d where d->>'id' = r->>'event_key' limit 1;
    end if;
    if v_def is null then raise exception 'Evento "%" non presente nel catalogo della lega', r->>'event_key'; end if;
    v_pts := (v_def->>'pts')::int;
    v_max := nullif(v_def->>'maxPerWeek', 'null')::int;
    if v_kind = 'premio' and v_max is not null then
      if (select count(*) from public.events
           where league_id = p_league and event_key = r->>'event_key'
             and created_at >= date_trunc('week', now())) >= v_max then
        raise exception 'Limite settimanale raggiunto per "%"', v_def->>'label';
      end if;
    end if;
    insert into public.events (league_id, professor_id, event_key, label, kind, pts, created_by)
    values (p_league, v_prof, r->>'event_key', v_def->>'label', v_kind, v_pts, auth.uid());
    n := n + 1;
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
  if not public.is_league_admin(v_lg) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  delete from public.events where id = p_event;
end $$;

-- ── Scambi ───────────────────────────────────────────────────────
create or replace function public.expire_trades()
returns void language sql security definer set search_path = public as $$
  update public.trades set status = 'expired' where status = 'pending' and expires_at < now();
$$;

create or replace function public.propose_trade(p_league uuid, p_to_user uuid, p_from_prof uuid, p_to_prof uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_mine uuid; v_theirs uuid; v_id uuid;
begin
  perform public.assert_active(p_league);
  if p_to_user = auth.uid() then raise exception 'Non puoi scambiare con te stesso'; end if;
  select id into v_mine   from public.teams where league_id = p_league and owner_id = auth.uid();
  select id into v_theirs from public.teams where league_id = p_league and owner_id = p_to_user;
  if v_mine is null or v_theirs is null then raise exception 'Squadra non trovata'; end if;
  if not exists (select 1 from public.team_professors where team_id = v_mine   and professor_id = p_from_prof)
  or not exists (select 1 from public.team_professors where team_id = v_theirs and professor_id = p_to_prof) then
    raise exception 'Professori non validi per lo scambio';
  end if;
  perform public.expire_trades();
  if (select count(*) from public.trades where league_id = p_league and from_user = auth.uid() and status = 'pending') >= 5 then
    raise exception 'Hai troppe proposte di scambio in attesa';
  end if;
  insert into public.trades (league_id, from_user, to_user, from_prof, to_prof)
  values (p_league, auth.uid(), p_to_user, p_from_prof, p_to_prof) returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_trade(p_trade uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare t public.trades; v_from_team uuid; v_to_team uuid;
begin
  perform public.expire_trades();
  select * into t from public.trades where id = p_trade for update;
  if not found then raise exception 'Scambio non trovato'; end if;
  perform public.assert_active(t.league_id);
  if t.to_user <> auth.uid() then raise exception 'Solo il destinatario può rispondere' using errcode = '42501'; end if;
  if t.status <> 'pending' then raise exception 'Scambio non più valido (%)', t.status; end if;
  if not p_accept then
    update public.trades set status = 'rejected' where id = t.id; return 'rejected';
  end if;
  select id into v_from_team from public.teams where league_id = t.league_id and owner_id = t.from_user;
  select id into v_to_team   from public.teams where league_id = t.league_id and owner_id = t.to_user;
  if not exists (select 1 from public.team_professors where team_id = v_from_team and professor_id = t.from_prof)
  or not exists (select 1 from public.team_professors where team_id = v_to_team   and professor_id = t.to_prof) then
    update public.trades set status = 'cancelled' where id = t.id;
    raise exception 'Uno dei professori non è più in squadra: scambio annullato';
  end if;
  -- Il capitano che esce di squadra perde la fascia
  update public.teams set captain_id = null where id = v_from_team and captain_id = t.from_prof;
  update public.teams set captain_id = null where id = v_to_team   and captain_id = t.to_prof;
  delete from public.team_professors where (team_id = v_from_team and professor_id = t.from_prof)
                                        or (team_id = v_to_team   and professor_id = t.to_prof);
  insert into public.team_professors (team_id, professor_id) values (v_from_team, t.to_prof), (v_to_team, t.from_prof)
  on conflict do nothing;
  update public.trades set status = 'accepted' where id = t.id;
  return 'accepted';
end $$;

create or replace function public.cancel_trade(p_trade uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active();
  update public.trades set status = 'cancelled'
   where id = p_trade and from_user = auth.uid() and status = 'pending';
  if not found then raise exception 'Scambio non annullabile'; end if;
end $$;

-- ── Chat ─────────────────────────────────────────────────────────
create or replace function public.send_message(p_league uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.assert_active(p_league);
  if not exists (select 1 from public.league_members where league_id = p_league and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  if (select count(*) from public.messages where author_id = auth.uid() and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Stai scrivendo troppo in fretta';
  end if;
  insert into public.messages (league_id, author_id, body)
  values (p_league, auth.uid(), public.clean_text(p_body, 1, 500, 'Messaggio')) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_message(p_msg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_msg;
  if not found then return; end if;
  perform public.assert_active(m.league_id);
  if m.author_id <> auth.uid() and not public.is_league_admin(m.league_id) then
    raise exception 'Permesso negato' using errcode = '42501';
  end if;
  delete from public.messages where id = p_msg;
end $$;

-- ── Codici premium ───────────────────────────────────────────────
create or replace function public.redeem_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare c public.premium_codes; v_lg uuid;
begin
  perform public.assert_active();
  -- Blocca la riga: un codice non può essere riscattato due volte
  select * into c from public.premium_codes where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'Codice non trovato'; end if;
  if c.used_by is not null then raise exception 'Codice già utilizzato'; end if;

  if c.type = 'pro' then
    v_lg := nullif(c.meta->>'lgId','')::uuid;
    if v_lg is null or not exists (select 1 from public.leagues where id = v_lg) then
      raise exception 'Codice Pro senza lega valida';
    end if;
    insert into public.entitlements (user_id, kind, ref) values (auth.uid(), 'pro', v_lg::text) on conflict do nothing;
  elsif c.type in ('skin','badge','name_fx') then
    if coalesce(c.meta->>'ref','') = '' then raise exception 'Codice non valido'; end if;
    insert into public.entitlements (user_id, kind, ref) values (auth.uid(), c.type, c.meta->>'ref') on conflict do nothing;
  elsif c.type = 'custom_badge' then
    if coalesce(c.meta->>'ref','') = '' then raise exception 'Badge non valido'; end if;
    insert into public.entitlements (user_id, kind, ref) values (auth.uid(), 'custom_badge', c.meta->>'ref') on conflict do nothing;
  elsif c.type = 'skin_bundle' then
    insert into public.entitlements (user_id, kind, ref)
      select auth.uid(), 'skin', s from unnest(array['dark_gold','rosso','blue','verde','pink','electric']) s on conflict do nothing;
  elsif c.type = 'badge_bundle' then
    insert into public.entitlements (user_id, kind, ref)
      select auth.uid(), 'badge', b from unnest(array['diamante','fondatore','og','leggenda','alieno']) b on conflict do nothing;
  end if;

  update public.premium_codes set used_by = auth.uid(), used_at = now() where code = c.code;
  return c.type;
end $$;

-- ── Funzioni SuperAdmin ──────────────────────────────────────────
create or replace function public.admin_create_code(p_type text, p_meta jsonb default '{}')
returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_prefix text;
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  v_prefix := case p_type when 'pro' then 'PRO' when 'skin' then 'SKN' when 'skin_bundle' then 'SKB'
                          when 'badge' then 'BDG' when 'badge_bundle' then 'BDB' when 'custom_badge' then 'CBG'
                          when 'name_fx' then 'NFX' else null end;
  if v_prefix is null then raise exception 'Tipo codice non valido'; end if;
  loop
    v_code := v_prefix || '-' || upper(substr(translate(replace(gen_random_uuid()::text,'-',''), 'abcdef', 'XYZWVU'), 1, 4))
                       || '-' || upper(substr(translate(replace(gen_random_uuid()::text,'-',''), 'abcdef', 'XYZWVU'), 1, 4));
    exit when not exists (select 1 from public.premium_codes where code = v_code);
  end loop;
  insert into public.premium_codes (code, type, meta, created_by) values (v_code, p_type, coalesce(p_meta,'{}'), auth.uid());
  return v_code;
end $$;

create or replace function public.admin_list_codes()
returns setof public.premium_codes language sql stable security definer set search_path = public as $$
  select * from public.premium_codes where public.is_superadmin() order by created_at desc
$$;

create or replace function public.admin_set_ban(p_user uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = p_user and is_superadmin) then
    raise exception 'Non puoi sospendere un superadmin';
  end if;
  update public.profiles set banned_until = p_until where id = p_user;
end $$;

create or replace function public.admin_set_league_suspended(p_league uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.leagues set suspended = p_suspended where id = p_league;
end $$;

-- ── Permessi di esecuzione ───────────────────────────────────────
-- Solo le funzioni di FantaProf (non quelle delle estensioni, es. citext): nessun accesso anonimo.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
revoke execute on function public.handle_new_user() from authenticated;
