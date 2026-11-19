-- FantaProf V2 — 009 FantaProf Token
-- Ritrovamento casuale di un Token che dà diritto a UN prodotto gratuito tra quelli di Superadmin → Codici
-- (skin, pacchetti, badge, effetti nome, badge personalizzato, Lega Pro).
-- Riusa: public.settings (configurazione), public.entitlements (oggetti sbloccati), public.premium_codes
-- (ogni riscatto lascia una riga "usata" con meta.source = 'token', visibile in Codici), notifiche e audit della 007.
-- Richiede 001..003 e 007. Idempotente: si può rieseguire.

-- ── Configurazione (riga in public.settings, scrivibile solo dal SuperAdmin) ─────
-- Chiavi "eligible": skin:<id> · badge:<id> · name_fx:<id> · skin_bundle · badge_bundle · custom_badge · pro
insert into public.settings (key, value) values ('token_config', jsonb_build_object(
  'enabled', true, 'probability', 11, 'visits_required', 5, 'min_gap_minutes', 30,
  'eligible', jsonb_build_array('skin:dark_gold','skin:rosso','skin:blue','skin:verde','skin:pink','skin:electric',
                                'name_fx:glitch','name_fx:neon','name_fx:rainbow','badge:diamante','badge:alieno','custom_badge')
)) on conflict (key) do nothing;

-- ── Tabelle ──────────────────────────────────────────────────────
-- Contatori degli accessi validi: solo lato server, nessun accesso dal client.
create table if not exists public.token_progress (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  valid_visits  int not null default 0,
  total_visits  int not null default 0,
  checks        int not null default 0,
  last_visit_at timestamptz,
  updated_at    timestamptz not null default now()
);

-- Ogni Token trovato.
create table if not exists public.token_finds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'available' check (status in ('available','badge_pending','redeemed')),
  probability numeric(5,2) not null,            -- percentuale in vigore al momento del ritrovamento
  seen_at     timestamptz,                      -- quando l'utente ha visto l'animazione
  reward_key  text,
  code        text references public.premium_codes(code) on delete set null,
  redeemed_at timestamptz,
  found_at    timestamptz not null default now(),
  check (status <> 'redeemed' or (reward_key is not null and redeemed_at is not null))
);
-- Garanzia a livello di database: al massimo un Token non ancora riscattato per utente.
create unique index if not exists token_finds_one_open on public.token_finds (user_id) where status <> 'redeemed';
create index if not exists token_finds_user on public.token_finds (user_id, found_at desc);
create index if not exists token_finds_time on public.token_finds (found_at desc);

-- Richieste di badge personalizzato in attesa di approvazione.
create table if not exists public.token_badge_requests (
  id          uuid primary key default gen_random_uuid(),
  token_id    uuid not null references public.token_finds(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  text        text not null check (char_length(text) between 2 and 30),
  description text not null default '' check (char_length(description) <= 200),
  status      text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  final_text  text check (final_text is null or char_length(final_text) between 2 and 30),
  admin_note  text not null default '' check (char_length(admin_note) <= 200),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists token_badge_one_pending on public.token_badge_requests (token_id) where status = 'pending';
create index if not exists token_badge_status on public.token_badge_requests (status, created_at desc);
create index if not exists token_badge_user on public.token_badge_requests (user_id, created_at desc);

alter table public.token_progress       enable row level security;
alter table public.token_finds          enable row level security;
alter table public.token_badge_requests enable row level security;

revoke all on public.token_progress, public.token_finds, public.token_badge_requests from anon, authenticated;
grant select on public.token_finds, public.token_badge_requests to authenticated;

drop policy if exists token_finds_read on public.token_finds;
create policy token_finds_read on public.token_finds for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());
drop policy if exists token_badge_read on public.token_badge_requests;
create policy token_badge_read on public.token_badge_requests for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());
-- token_progress: nessuna policy → inaccessibile dal client.

-- ── Helper interni ───────────────────────────────────────────────
create or replace function public._token_valid_keys() returns text[] language sql immutable as $$
  select array['skin:dark_gold','skin:rosso','skin:blue','skin:verde','skin:pink','skin:electric',
               'badge:diamante','badge:fondatore','badge:og','badge:leggenda','badge:alieno',
               'name_fx:glitch','name_fx:neon','name_fx:rainbow','skin_bundle','badge_bundle','custom_badge','pro']
$$;

-- Numero casuale uniforme in [0,1) da una sorgente crittografica (gen_random_uuid).
create or replace function public._token_rand() returns double precision language sql volatile as $$
  select (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint)::double precision / 4294967296.0
$$;

-- Configurazione normalizzata: qualunque valore malformato in settings viene riportato a valori sicuri.
create or replace function public._token_cfg() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_el jsonb;
begin
  select value into v from public.settings where key = 'token_config';
  if v is null or jsonb_typeof(v) <> 'object' then v := '{}'::jsonb; end if;
  if jsonb_typeof(v -> 'eligible') = 'array' then
    select coalesce(jsonb_agg(distinct k), '[]'::jsonb) into v_el
      from jsonb_array_elements_text(v -> 'eligible') k where k = any (public._token_valid_keys());
  else
    v_el := '[]'::jsonb;
  end if;
  return jsonb_build_object(
    'enabled',         case when jsonb_typeof(v -> 'enabled') = 'boolean' then (v ->> 'enabled')::boolean else false end,
    'probability',     case when jsonb_typeof(v -> 'probability') = 'number' then least(100, greatest(0, (v ->> 'probability')::numeric)) else 11 end,
    'visits_required', case when jsonb_typeof(v -> 'visits_required') = 'number' then least(1000, greatest(1, floor((v ->> 'visits_required')::numeric)::int)) else 5 end,
    'min_gap_minutes', case when jsonb_typeof(v -> 'min_gap_minutes') = 'number' then least(1440, greatest(0, floor((v ->> 'min_gap_minutes')::numeric)::int)) else 30 end,
    'eligible',        v_el);
end $$;

-- Il premio è ancora ottenibile da questo utente? (non già posseduto, lega Pro valida…)
create or replace function public._token_key_available(p_user uuid, p_key text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_kind text := split_part(p_key, ':', 1); v_ref text := split_part(p_key, ':', 2);
begin
  if not (p_key = any (public._token_valid_keys())) then return false; end if;
  if v_kind in ('skin','badge','name_fx') and p_key like '%:%' then
    return not exists (select 1 from public.entitlements where user_id = p_user and kind = v_kind and ref = v_ref);
  elsif p_key = 'skin_bundle' then
    return exists (select 1 from unnest(array['dark_gold','rosso','blue','verde','pink','electric']) s
                    where not exists (select 1 from public.entitlements where user_id = p_user and kind = 'skin' and ref = s));
  elsif p_key = 'badge_bundle' then
    return exists (select 1 from unnest(array['diamante','fondatore','og','leggenda','alieno']) b
                    where not exists (select 1 from public.entitlements where user_id = p_user and kind = 'badge' and ref = b));
  elsif p_key = 'custom_badge' then
    return true;
  elsif p_key = 'pro' then
    return exists (select 1 from public.leagues l where l.owner_id = p_user
                    and not exists (select 1 from public.entitlements e where e.user_id = p_user and e.kind = 'pro' and e.ref = l.id::text));
  end if;
  return false;
end $$;

-- Registra il riscatto nella tabella dei codici (riga già usata, source = token): resta visibile in Superadmin → Codici.
create or replace function public._token_log_code(p_user uuid, p_type text, p_meta jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  loop
    v_code := 'TKN-' || upper(substr(translate(replace(gen_random_uuid()::text,'-',''), 'abcdef', 'XYZWVU'), 1, 4))
                     || '-' || upper(substr(translate(replace(gen_random_uuid()::text,'-',''), 'abcdef', 'XYZWVU'), 1, 4));
    exit when not exists (select 1 from public.premium_codes where code = v_code);
  end loop;
  insert into public.premium_codes (code, type, meta, used_by, used_at, created_by)
  values (v_code, p_type, p_meta || jsonb_build_object('source', 'token'), p_user, now(), null);
  return v_code;
end $$;

-- ── Accesso valido + eventuale ritrovamento ─────────────────────
-- Il client lo chiama all'apertura dell'app; il server decide tutto: un accesso conta solo se sono passati
-- almeno min_gap_minutes dall'ultimo accesso contato, quindi refresh e ricaricamenti non valgono.
-- La riga di progresso è bloccata (FOR UPDATE): richieste simultanee si mettono in coda e non assegnano due Token.
create or replace function public.token_register_visit() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); cfg jsonb; p public.token_progress;
  v_found boolean := false; v_id uuid; v_open jsonb;
begin
  perform public.assert_active();
  cfg := public._token_cfg();
  insert into public.token_progress (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into p from public.token_progress where user_id = v_uid for update;

  if (cfg ->> 'enabled')::boolean
     and (p.last_visit_at is null or now() - p.last_visit_at >= make_interval(mins => (cfg ->> 'min_gap_minutes')::int)) then
    p.valid_visits := p.valid_visits + 1;
    p.total_visits := p.total_visits + 1;
    p.last_visit_at := now();
    if p.valid_visits >= (cfg ->> 'visits_required')::int then
      p.valid_visits := 0;
      -- chi ha già un Token da riscattare non ne trova un secondo
      if not exists (select 1 from public.token_finds where user_id = v_uid and status <> 'redeemed') then
        p.checks := p.checks + 1;
        if public._token_rand() * 100 < (cfg ->> 'probability')::numeric then
          insert into public.token_finds (user_id, probability) values (v_uid, (cfg ->> 'probability')::numeric) returning id into v_id;
          v_found := true;
          perform public._c_notify(v_uid, 'token_found', jsonb_build_object('token_id', v_id));
        end if;
      end if;
    end if;
    update public.token_progress set valid_visits = p.valid_visits, total_visits = p.total_visits, checks = p.checks,
           last_visit_at = p.last_visit_at, updated_at = now() where user_id = v_uid;
  end if;

  select jsonb_build_object('id', f.id, 'status', f.status, 'seen', f.seen_at is not null, 'found_at', f.found_at)
    into v_open from public.token_finds f where f.user_id = v_uid and f.status <> 'redeemed';
  return jsonb_build_object('found', v_found, 'open', v_open);
end $$;

create or replace function public.token_mark_seen(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active();
  update public.token_finds set seen_at = coalesce(seen_at, now()) where id = p_token and user_id = auth.uid();
end $$;

-- Premi che l'utente può scegliere ora: regole dell'admin ∩ disponibilità reale.
create or replace function public.token_reward_options(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); f public.token_finds; v_el jsonb; v_lg jsonb;
begin
  perform public.assert_active();
  select * into f from public.token_finds where id = p_token and user_id = v_uid;
  if not found or f.status = 'redeemed' then raise exception 'Token non disponibile'; end if;
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_el
    from jsonb_array_elements_text(public._token_cfg() -> 'eligible') k where public._token_key_available(v_uid, k);
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name), '[]'::jsonb) into v_lg
    from public.leagues l where l.owner_id = v_uid
     and not exists (select 1 from public.entitlements e where e.user_id = v_uid and e.kind = 'pro' and e.ref = l.id::text);
  return jsonb_build_object('status', f.status, 'eligible', v_el, 'pro_leagues', v_lg);
end $$;

-- ── Riscatto di un premio (tutto tranne il badge personalizzato) ──
create or replace function public.token_claim(p_token uuid, p_reward text, p_league uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); f public.token_finds; v_type text; v_ref text; v_code text; v_meta jsonb := '{}';
begin
  perform public.assert_active();
  select * into f from public.token_finds where id = p_token for update;       -- blocca: niente doppio riscatto
  if not found or f.user_id <> v_uid then raise exception 'Token non trovato'; end if;
  if f.status = 'redeemed' then raise exception 'Token già riscattato'; end if;
  if f.status = 'badge_pending' then raise exception 'Hai una richiesta di badge in attesa: aspetta la risposta o annullala'; end if;
  if p_reward = 'custom_badge' then raise exception 'Per il badge personalizzato invia una richiesta'; end if;
  if not (p_reward = any (public._token_valid_keys())) then raise exception 'Premio non valido'; end if;
  if not (public._token_cfg() -> 'eligible' ? p_reward) then raise exception 'Questo premio non è disponibile con il Token'; end if;
  if not public._token_key_available(v_uid, p_reward) then raise exception 'Hai già questo premio o non è più disponibile'; end if;

  v_type := case when p_reward like '%:%' then split_part(p_reward, ':', 1) else p_reward end;
  v_ref  := case when p_reward like '%:%' then split_part(p_reward, ':', 2) else null end;

  if v_type in ('skin','badge','name_fx') then
    insert into public.entitlements (user_id, kind, ref) values (v_uid, v_type, v_ref) on conflict do nothing;
    v_meta := jsonb_build_object('ref', v_ref);
  elsif v_type = 'skin_bundle' then
    insert into public.entitlements (user_id, kind, ref)
      select v_uid, 'skin', s from unnest(array['dark_gold','rosso','blue','verde','pink','electric']) s on conflict do nothing;
  elsif v_type = 'badge_bundle' then
    insert into public.entitlements (user_id, kind, ref)
      select v_uid, 'badge', b from unnest(array['diamante','fondatore','og','leggenda','alieno']) b on conflict do nothing;
  elsif v_type = 'pro' then
    if p_league is null or not exists (select 1 from public.leagues where id = p_league and owner_id = v_uid) then
      raise exception 'Scegli una lega di cui sei proprietario';
    end if;
    if exists (select 1 from public.entitlements where user_id = v_uid and kind = 'pro' and ref = p_league::text) then
      raise exception 'Questa lega è già Pro';
    end if;
    insert into public.entitlements (user_id, kind, ref) values (v_uid, 'pro', p_league::text);
    v_meta := jsonb_build_object('lgId', p_league::text);
  end if;

  v_code := public._token_log_code(v_uid, v_type, v_meta || jsonb_build_object('token_id', p_token::text));
  update public.token_finds set status = 'redeemed', reward_key = p_reward, code = v_code, redeemed_at = now() where id = p_token;
  perform public._c_notify(v_uid, 'token_redeemed', jsonb_build_object('token_id', p_token, 'reward', p_reward));
  return jsonb_build_object('reward', p_reward, 'code', v_code);
end $$;

-- ── Badge personalizzato: richiesta, annullamento, revisione ─────
create or replace function public.token_request_badge(p_token uuid, p_text text, p_description text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); f public.token_finds; v_text text; v_desc text; v_id uuid; v_name text; r record;
begin
  perform public.assert_active();
  select * into f from public.token_finds where id = p_token for update;
  if not found or f.user_id <> v_uid then raise exception 'Token non trovato'; end if;
  if f.status = 'redeemed' then raise exception 'Token già riscattato'; end if;
  if f.status = 'badge_pending' then raise exception 'Hai già una richiesta in attesa'; end if;
  if not (public._token_cfg() -> 'eligible' ? 'custom_badge') then raise exception 'Il badge personalizzato non è disponibile con il Token'; end if;

  v_text := public.clean_text(p_text, 2, 30, 'Testo del badge');
  v_desc := btrim(regexp_replace(coalesce(p_description, ''), '[\x01-\x1F\x7F<>]', '', 'g'));
  if char_length(v_desc) > 200 then raise exception 'Descrizione troppo lunga (massimo 200 caratteri)'; end if;
  if public.contains_banned(v_text || ' ' || v_desc) then raise exception 'Il testo contiene parole non consentite'; end if;

  insert into public.token_badge_requests (token_id, user_id, text, description) values (p_token, v_uid, v_text, v_desc) returning id into v_id;
  update public.token_finds set status = 'badge_pending' where id = p_token;
  select username::text into v_name from public.profiles where id = v_uid;
  for r in select id from public.profiles where is_superadmin loop
    perform public._c_notify(r.id, 'token_badge_request', jsonb_build_object('request_id', v_id, 'username', coalesce(v_name, ''), 'text', v_text));
  end loop;
  return v_id;
end $$;

create or replace function public.token_cancel_badge_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare q public.token_badge_requests;
begin
  perform public.assert_active();
  select * into q from public.token_badge_requests where id = p_request for update;
  if not found or q.user_id <> auth.uid() then raise exception 'Richiesta non trovata'; end if;
  if q.status <> 'pending' then raise exception 'La richiesta non è più in attesa'; end if;
  perform 1 from public.token_finds where id = q.token_id for update;
  update public.token_badge_requests set status = 'cancelled', reviewed_at = now() where id = p_request;
  update public.token_finds set status = 'available' where id = q.token_id and status = 'badge_pending';
end $$;

create or replace function public.token_admin_review_badge(p_request uuid, p_approve boolean, p_text text default null, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q public.token_badge_requests; f public.token_finds; v_final text; v_note text; v_code text;
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  select * into q from public.token_badge_requests where id = p_request for update;
  if not found then raise exception 'Richiesta non trovata'; end if;
  if q.status <> 'pending' then raise exception 'Richiesta già gestita'; end if;
  select * into f from public.token_finds where id = q.token_id for update;
  v_note := left(btrim(regexp_replace(coalesce(p_note, ''), '[\x01-\x1F\x7F<>]', '', 'g')), 200);

  if p_approve then
    v_final := public.clean_text(coalesce(nullif(btrim(p_text), ''), q.text), 2, 30, 'Testo del badge');
    if public.contains_banned(v_final) then raise exception 'Il testo contiene parole non consentite'; end if;
    insert into public.entitlements (user_id, kind, ref) values (q.user_id, 'custom_badge', v_final) on conflict do nothing;
    v_code := public._token_log_code(q.user_id, 'custom_badge', jsonb_build_object('ref', v_final, 'token_id', f.id::text));
    update public.token_badge_requests set status = 'approved', final_text = v_final, admin_note = v_note,
           reviewed_by = auth.uid(), reviewed_at = now() where id = p_request;
    update public.token_finds set status = 'redeemed', reward_key = 'custom_badge', code = v_code, redeemed_at = now() where id = f.id;
    perform public._c_notify(q.user_id, 'token_badge_approved', jsonb_build_object('request_id', p_request, 'text', v_final, 'edited', v_final <> q.text));
    perform public._c_audit('token_badge_approve', 'token_badge_request', p_request::text,
      jsonb_build_object('user_id', q.user_id, 'requested', q.text, 'final', v_final));
    return jsonb_build_object('status', 'approved', 'final_text', v_final);
  else
    update public.token_badge_requests set status = 'rejected', admin_note = v_note, reviewed_by = auth.uid(), reviewed_at = now() where id = p_request;
    update public.token_finds set status = 'available' where id = f.id and status = 'badge_pending';   -- il Token non va perso
    perform public._c_notify(q.user_id, 'token_badge_rejected', jsonb_build_object('request_id', p_request, 'note', v_note));
    perform public._c_audit('token_badge_reject', 'token_badge_request', p_request::text,
      jsonb_build_object('user_id', q.user_id, 'requested', q.text, 'note', v_note));
    return jsonb_build_object('status', 'rejected');
  end if;
end $$;

-- ── SuperAdmin: configurazione e statistiche ─────────────────────
create or replace function public.token_admin_get_config() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  return public._token_cfg();
end $$;

create or replace function public.token_admin_set_config(p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prob numeric; v_visits numeric; v_gap numeric; v_el jsonb; k text; v_new jsonb;
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if jsonb_typeof(p_config) <> 'object' then raise exception 'Configurazione non valida'; end if;
  if jsonb_typeof(p_config -> 'enabled') <> 'boolean' then raise exception 'Attivazione non valida'; end if;
  if jsonb_typeof(p_config -> 'probability') <> 'number' then raise exception 'Probabilità non valida'; end if;
  if jsonb_typeof(p_config -> 'visits_required') <> 'number' then raise exception 'Numero di accessi non valido'; end if;
  if jsonb_typeof(p_config -> 'min_gap_minutes') <> 'number' then raise exception 'Intervallo tra accessi non valido'; end if;
  if jsonb_typeof(p_config -> 'eligible') <> 'array' then raise exception 'Elenco premi non valido'; end if;
  v_prob := (p_config ->> 'probability')::numeric;
  v_visits := (p_config ->> 'visits_required')::numeric;
  v_gap := (p_config ->> 'min_gap_minutes')::numeric;
  if v_prob < 0 or v_prob > 100 then raise exception 'La probabilità deve essere tra 0 e 100'; end if;
  if v_visits < 1 or v_visits > 1000 or v_visits <> floor(v_visits) then raise exception 'Gli accessi richiesti devono essere un intero tra 1 e 1000'; end if;
  if v_gap < 0 or v_gap > 1440 or v_gap <> floor(v_gap) then raise exception 'L''intervallo deve essere un intero tra 0 e 1440 minuti'; end if;
  for k in select jsonb_array_elements_text(p_config -> 'eligible') loop
    if not (k = any (public._token_valid_keys())) then raise exception 'Premio non riconosciuto: %', k; end if;
  end loop;
  select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into v_el from jsonb_array_elements_text(p_config -> 'eligible') x;
  v_new := jsonb_build_object('enabled', (p_config ->> 'enabled')::boolean, 'probability', v_prob,
                              'visits_required', v_visits::int, 'min_gap_minutes', v_gap::int, 'eligible', v_el);
  insert into public.settings (key, value) values ('token_config', v_new) on conflict (key) do update set value = excluded.value;
  perform public._c_audit('token_config', 'settings', 'token_config', v_new);
  return v_new;
end $$;

create or replace function public.token_admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  select jsonb_build_object(
    'finds',          (select count(*) from public.token_finds),
    'open',           (select count(*) from public.token_finds where status = 'available'),
    'badge_pending',  (select count(*) from public.token_finds where status = 'badge_pending'),
    'redeemed',       (select count(*) from public.token_finds where status = 'redeemed'),
    'users_with',     (select count(distinct user_id) from public.token_finds),
    'requests_pending', (select count(*) from public.token_badge_requests where status = 'pending'),
    'valid_visits',   (select coalesce(sum(total_visits), 0) from public.token_progress),
    'checks',         (select coalesce(sum(checks), 0) from public.token_progress),
    'by_reward',      (select coalesce(jsonb_object_agg(reward_key, n), '{}'::jsonb)
                         from (select reward_key, count(*) n from public.token_finds where reward_key is not null group by reward_key) s)
  ) into v;
  return v;
end $$;

-- ── Permessi di esecuzione ───────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.token_register_visit()', 'public.token_mark_seen(uuid)', 'public.token_reward_options(uuid)',
    'public.token_claim(uuid, text, uuid)', 'public.token_request_badge(uuid, text, text)', 'public.token_cancel_badge_request(uuid)',
    'public.token_admin_review_badge(uuid, boolean, text, text)', 'public.token_admin_get_config()',
    'public.token_admin_set_config(jsonb)', 'public.token_admin_stats()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  -- Interne: nessun accesso dal client
  revoke execute on function public._token_valid_keys(), public._token_rand(), public._token_cfg(),
    public._token_key_available(uuid, text), public._token_log_code(uuid, text, jsonb) from public, anon, authenticated;
end $$;
