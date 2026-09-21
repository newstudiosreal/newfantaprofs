-- FantaProf V2 — 004 mercato, power-up, missioni, pronostici, Hall of Fame
-- Le operazioni che muovono punti (acquisti, aste, scudi, bonus) vivono qui,
-- sul server: il client non può inventarsi né punti né professori.

-- ── Colonne aggiuntive ───────────────────────────────────────────
alter table public.leagues  add column missions_enabled boolean not null default true;
alter table public.teams    add column name_fx text check (name_fx in ('glitch','neon','rainbow'));
alter table public.profiles add column avatar_url text check (avatar_url is null or char_length(avatar_url) <= 200);

-- ── Missioni ─────────────────────────────────────────────────────
create table public.missions (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  label        text not null check (char_length(label) between 2 and 60),
  description  text not null default '' check (char_length(description) <= 200),
  type         text not null check (type in ('auto_pos','auto_pts','auto_trades','manual')),
  condition    int  check (condition is null or condition between 1 and 100000),
  reward       text not null check (reward in ('pts','badge')),
  reward_pts   int  check (reward_pts is null or reward_pts between 1 and 500),
  reward_badge text check (reward_badge is null or char_length(reward_badge) <= 30),
  reward_label text not null default '',
  created_at   timestamptz not null default now(),
  check ((type = 'manual') = (condition is null)),
  check ((reward = 'pts' and reward_pts is not null) or (reward = 'badge' and reward_badge is not null))
);
create index on public.missions (league_id);

create table public.mission_claims (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  mission_id  uuid not null references public.missions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  note        text not null default '' check (char_length(note) <= 200),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  auto        boolean not null default false,
  created_at  timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null
);
create index on public.mission_claims (league_id, status);
create unique index mission_claims_one_open on public.mission_claims (mission_id, user_id)
  where status in ('pending','approved');

-- ── Mercato ──────────────────────────────────────────────────────
create table public.market_listings (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references public.leagues(id) on delete cascade,
  professor_id   uuid not null references public.professors(id) on delete cascade,
  seller_id      uuid not null references public.profiles(id) on delete cascade,
  seller_team_id uuid references public.teams(id) on delete set null,
  type           text not null check (type in ('direct','auction')),
  price          int check (price is null or price between 50 and 1000),        -- annuncio diretto
  min_bid        int check (min_bid is null or min_bid between 50 and 1000),    -- asta
  current_bid    int,
  current_bidder uuid references public.profiles(id) on delete set null,
  status         text not null default 'open'
                 check (status in ('open','sold','expired','unsold','cancelled')),
  sold_to        uuid references public.profiles(id) on delete set null,
  sold_for       int,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  check ((type = 'direct' and price is not null) or (type = 'auction' and min_bid is not null and expires_at is not null))
);
create index on public.market_listings (league_id, status);

-- Vetrina rotante (offerte speciali a rotazione ogni 48h)
create table public.market_rotations (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  professor_id uuid not null references public.professors(id) on delete cascade,
  price        int not null check (price between 400 and 600),
  bought_by    uuid references public.profiles(id) on delete set null,
  batch_at     timestamptz not null default now()
);
create index on public.market_rotations (league_id);

-- Power-up (scudo, moltiplicatore)
create table public.powerups (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('shield','multiplier')),
  expires_at timestamptz,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.powerups (team_id) where used_at is null;

-- Pronostici settimanali: quale dei tuoi prof farà più punti
create table public.forecasts (
  league_id    uuid not null references public.leagues(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  week_start   date not null,
  professor_id uuid not null references public.professors(id) on delete cascade,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (league_id, user_id, week_start)
);

-- ── RLS: sola lettura ai membri ──────────────────────────────────
alter table public.missions         enable row level security;
alter table public.mission_claims   enable row level security;
alter table public.market_listings  enable row level security;
alter table public.market_rotations enable row level security;
alter table public.powerups         enable row level security;
alter table public.forecasts        enable row level security;

grant select on public.missions, public.mission_claims, public.market_listings,
                public.market_rotations, public.powerups, public.forecasts to authenticated;

create policy missions_read  on public.missions for select to authenticated using (public.is_league_member(league_id));
create policy claims_read    on public.mission_claims for select to authenticated
  using (public.is_league_member(league_id) and (user_id = auth.uid() or public.is_league_admin(league_id)));
create policy listings_read  on public.market_listings for select to authenticated using (public.is_league_member(league_id));
create policy rotations_read on public.market_rotations for select to authenticated using (public.is_league_member(league_id));
create policy powerups_read  on public.powerups for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());
create policy forecasts_read on public.forecasts for select to authenticated
  using (user_id = auth.uid() or public.is_league_admin(league_id));

-- ── Helper interni ───────────────────────────────────────────────
create or replace function public._score(p_team uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select score from public.team_scores where team_id = p_team), 0)
$$;

create or replace function public._my_team(p_league uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from public.teams where league_id = p_league and owner_id = auth.uid();
  if v is null then raise exception 'Crea prima una squadra in questa lega'; end if;
  return v;
end $$;

-- Toglie un prof dalla squadra (e la fascia di capitano se serve)
create or replace function public._drop_prof(p_team uuid, p_prof uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_professors where team_id = p_team and professor_id = p_prof;
  update public.teams set captain_id = null where id = p_team and captain_id = p_prof;
end $$;

-- Aggiunge un prof alla squadra rispettando il limite di 4
create or replace function public._give_prof(p_team uuid, p_prof uuid, p_drop uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if exists (select 1 from public.team_professors where team_id = p_team and professor_id = p_prof) then
    raise exception 'Questo professore è già nella tua squadra';
  end if;
  select count(*) into n from public.team_professors where team_id = p_team;
  if n >= 4 then
    if p_drop is null or not exists (select 1 from public.team_professors where team_id = p_team and professor_id = p_drop) then
      raise exception 'Hai già 4 professori: scegli quale eliminare' using errcode = 'P0001', hint = 'NEED_DROP';
    end if;
    perform public._drop_prof(p_team, p_drop);
  end if;
  insert into public.team_professors (team_id, professor_id) values (p_team, p_prof);
end $$;

create or replace function public._team_event(p_league uuid, p_team uuid, p_key text, p_label text, p_kind text, p_pts int, p_by uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.events (league_id, team_id, event_key, label, kind, pts, created_by)
  values (p_league, p_team, p_key, p_label, p_kind, p_pts, p_by)
$$;

-- ── Scadenza aste ────────────────────────────────────────────────
create or replace function public.expire_market(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.market_listings
     set status = case when current_bidder is null then 'unsold' else 'expired' end
   where league_id = p_league and type = 'auction' and status = 'open' and expires_at < now();
end $$;

-- ── Annunci: vendita diretta o asta (12h) ────────────────────────
create or replace function public.create_listing(p_league uuid, p_prof uuid, p_type text, p_amount int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_id uuid;
begin
  perform public.assert_active(p_league);
  v_team := public._my_team(p_league);
  if p_type not in ('direct','auction') then raise exception 'Tipo annuncio non valido'; end if;
  if p_amount is null or p_amount < 50 or p_amount > 1000 then raise exception 'Importo non valido (50-1000 pt)'; end if;
  if not exists (select 1 from public.team_professors where team_id = v_team and professor_id = p_prof) then
    raise exception 'Il professore non è nella tua squadra';
  end if;
  if (select count(*) from public.team_professors where team_id = v_team) <= 1 then
    raise exception 'Non puoi vendere il tuo ultimo professore';
  end if;
  perform public._drop_prof(v_team, p_prof);
  insert into public.market_listings (league_id, professor_id, seller_id, seller_team_id, type, price, min_bid, current_bid, expires_at)
  values (p_league, p_prof, auth.uid(), v_team, p_type,
          case when p_type = 'direct' then p_amount end,
          case when p_type = 'auction' then p_amount end,
          case when p_type = 'auction' then p_amount end,
          case when p_type = 'auction' then now() + interval '12 hours' end)
  returning id into v_id;
  return v_id;
end $$;

-- Ritira un annuncio (o recupera un prof invenduto): il prof torna in squadra
create or replace function public.reclaim_listing(p_listing uuid, p_drop uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.market_listings;
begin
  select * into l from public.market_listings where id = p_listing for update;
  if not found or l.seller_id <> auth.uid() then raise exception 'Annuncio non trovato' using errcode = '42501'; end if;
  perform public.assert_active(l.league_id);
  perform public.expire_market(l.league_id);
  select * into l from public.market_listings where id = p_listing;
  if not (
       (l.status = 'open' and (l.type = 'direct' or l.current_bidder is null))
    or  l.status = 'unsold'
    or (l.status = 'expired' and l.expires_at < now() - interval '48 hours')
  ) then raise exception 'Questo annuncio non si può ritirare ora'; end if;
  if l.seller_team_id is null then raise exception 'Squadra del venditore non trovata'; end if;
  perform public._give_prof(l.seller_team_id, l.professor_id, p_drop);
  update public.market_listings set status = 'cancelled' where id = l.id;
end $$;

-- Pagamento + trasferimento (usato da acquisto diretto, aste, vetrina, jolly)
create or replace function public._settle_sale(l public.market_listings, p_buyer_team uuid, p_price int, p_drop uuid, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if public._score(p_buyer_team) < p_price then raise exception 'Punti insufficienti (servono % pt)', p_price; end if;
  select name into v_name from public.professors where id = l.professor_id;
  perform public._give_prof(p_buyer_team, l.professor_id, p_drop);
  perform public._team_event(l.league_id, p_buyer_team, 'market_buy', '🛒 Acquisto mercato: ' || v_name, 'shop', -p_price, auth.uid());
  if l.seller_team_id is not null then
    perform public._team_event(l.league_id, l.seller_team_id, 'market_sell', '💰 Vendita mercato: ' || v_name, 'shop', p_price, l.seller_id);
  end if;
  update public.market_listings set status = 'sold', sold_to = auth.uid(), sold_for = p_price where id = l.id;
end $$;

create or replace function public.buy_listing(p_listing uuid, p_drop uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.market_listings; v_team uuid;
begin
  select * into l from public.market_listings where id = p_listing for update;
  if not found then raise exception 'Annuncio non trovato'; end if;
  perform public.assert_active(l.league_id);
  if not exists (select 1 from public.league_members where league_id = l.league_id and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  v_team := public._my_team(l.league_id);
  if l.type <> 'direct' or l.status <> 'open' then raise exception 'Annuncio non disponibile'; end if;
  if l.seller_id = auth.uid() then raise exception 'Non puoi comprare un tuo annuncio'; end if;
  perform public._settle_sale(l, v_team, l.price, p_drop, 'annuncio');
end $$;

create or replace function public.place_bid(p_listing uuid, p_amount int)
returns void language plpgsql security definer set search_path = public as $$
declare l public.market_listings; v_team uuid;
begin
  select * into l from public.market_listings where id = p_listing for update;
  if not found then raise exception 'Asta non trovata'; end if;
  perform public.assert_active(l.league_id);
  v_team := public._my_team(l.league_id);
  if l.type <> 'auction' or l.status <> 'open' or l.expires_at < now() then raise exception 'Asta chiusa'; end if;
  if l.seller_id = auth.uid() then raise exception 'Non puoi offrire sulla tua asta'; end if;
  if l.current_bidder = auth.uid() then raise exception 'Sei già il miglior offerente'; end if;
  if p_amount is null or p_amount <= l.current_bid or p_amount > 1000 then
    raise exception 'Offerta minima: % pt', l.current_bid + 1;
  end if;
  if public._score(v_team) < p_amount then raise exception 'Punti insufficienti'; end if;
  update public.market_listings set current_bid = p_amount, current_bidder = auth.uid() where id = l.id;
end $$;

-- Il vincitore ritira il prof e paga
create or replace function public.claim_auction(p_listing uuid, p_drop uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.market_listings; v_team uuid;
begin
  select * into l from public.market_listings where id = p_listing for update;
  if not found then raise exception 'Asta non trovata'; end if;
  perform public.assert_active(l.league_id);
  perform public.expire_market(l.league_id);
  select * into l from public.market_listings where id = p_listing;
  if l.type <> 'auction' or l.status <> 'expired' or l.current_bidder is distinct from auth.uid() then
    raise exception 'Nessun prof da ritirare';
  end if;
  v_team := public._my_team(l.league_id);
  perform public._settle_sale(l, v_team, l.current_bid, p_drop, 'asta');
end $$;

-- ── Vetrina rotante ──────────────────────────────────────────────
create or replace function public.refresh_rotating_market(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_league_member(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if exists (select 1 from public.market_rotations where league_id = p_league and batch_at > now() - interval '48 hours') then
    return;
  end if;
  delete from public.market_rotations where league_id = p_league;
  insert into public.market_rotations (league_id, professor_id, price)
  select p_league, id, 400 + floor(random() * 201)::int
    from public.professors where league_id = p_league order by random() limit 2;
end $$;

create or replace function public.buy_rotating(p_slot uuid, p_drop uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.market_rotations; v_team uuid; v_name text;
begin
  select * into s from public.market_rotations where id = p_slot for update;
  if not found then raise exception 'Offerta non trovata'; end if;
  perform public.assert_active(s.league_id);
  if not exists (select 1 from public.league_members where league_id = s.league_id and user_id = auth.uid()) then
    raise exception 'Non fai parte di questa lega' using errcode = '42501';
  end if;
  v_team := public._my_team(s.league_id);
  if s.bought_by is not null then raise exception 'Offerta già acquistata'; end if;
  if s.batch_at < now() - interval '48 hours' then raise exception 'Offerta scaduta'; end if;
  if public._score(v_team) < s.price then raise exception 'Punti insufficienti (servono % pt)', s.price; end if;
  select name into v_name from public.professors where id = s.professor_id;
  perform public._give_prof(v_team, s.professor_id, p_drop);
  perform public._team_event(s.league_id, v_team, 'rotating_buy', '🔄 Vetrina: ' || v_name, 'shop', -s.price, auth.uid());
  update public.market_rotations set bought_by = auth.uid() where id = s.id;
end $$;

-- ── Negozio: scudo, moltiplicatore, jolly ────────────────────────
create or replace function public.buy_item(p_league uuid, p_item text, p_drop uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_price int; v_l public.market_listings; v_score int;
begin
  perform public.assert_active(p_league);
  v_team := public._my_team(p_league);
  v_price := case p_item when 'shield' then 120 when 'multiplier' then 200 when 'joker' then 150 end;
  if v_price is null then raise exception 'Oggetto non valido'; end if;
  v_score := public._score(v_team);
  if v_score < v_price then raise exception 'Punti insufficienti (servono % pt)', v_price; end if;

  if p_item = 'joker' then
    perform public.expire_market(p_league);
    select * into v_l from public.market_listings
     where league_id = p_league and type = 'direct' and status = 'open' and seller_id <> auth.uid()
       and price <= v_score - v_price
     order by random() limit 1 for update;
    if not found then raise exception 'Nessun prof acquistabile sul mercato per il Jolly'; end if;
    perform public._team_event(p_league, v_team, 'shop_joker', '🎲 Jolly — prof casuale', 'shop', -v_price, auth.uid());
    perform public._settle_sale(v_l, v_team, v_l.price, p_drop, 'jolly');
    return (select name from public.professors where id = v_l.professor_id);
  end if;

  if (select count(*) from public.powerups where team_id = v_team and kind = p_item and used_at is null
        and (expires_at is null or expires_at > now())) >= 3 then
    raise exception 'Ne hai già 3 inutilizzati';
  end if;
  perform public._team_event(p_league, v_team, 'shop_' || p_item,
          case p_item when 'shield' then '🛡️ Acquisto: Scudo' else '⚡ Acquisto: Moltiplicatore' end,
          'shop', -v_price, auth.uid());
  insert into public.powerups (league_id, team_id, user_id, kind, expires_at)
  values (p_league, v_team, auth.uid(), p_item, case when p_item = 'shield' then now() + interval '24 hours' end);
  return p_item;
end $$;

-- ── Eventi con scudo/moltiplicatore (sostituisce la versione di 003) ─
-- Novità rispetto alla V1: scudo e moltiplicatore agiscono SOLO sulla squadra che
-- li possiede (in V1 il valore modificato finiva applicato a tutte le squadre).
create or replace function public.add_events(p_league uuid, p_events jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_lg public.leagues; v_def jsonb; v_kind text; v_pts int; v_max int; v_prof uuid; n int := 0;
  t record; v_contrib int; v_pu uuid; v_label text; v_ev uuid;
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

-- ── Cataloghi personalizzati e missioni (admin di lega) ──────────
create or replace function public.add_custom_event(p_league uuid, p_kind text, p_label text, p_pts int)
returns void language plpgsql security definer set search_path = public as $$
declare v_id text := 'c_' || substr(replace(gen_random_uuid()::text,'-',''), 1, 8);
begin
  perform public.assert_active(p_league);
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
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
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.leagues set
    bonus = coalesce((select jsonb_agg(d) from jsonb_array_elements(bonus) d where d->>'id' <> p_key), '[]'),
    malus = coalesce((select jsonb_agg(d) from jsonb_array_elements(malus) d where d->>'id' <> p_key), '[]')
  where id = p_league;
end $$;

create or replace function public.default_missions()
returns jsonb language sql immutable as $f$ select $j$[{"id":"ms_first_blood","label":"🩸 Primo Sangue","description":"Arriva tra i primi 3 in classifica","type":"auto_pos","condition":3,"reward":"pts","reward_pts":30,"reward_badge":null,"reward_label":"+30 pt bonus"},{"id":"ms_top1","label":"👑 Re della Lega","description":"Arriva primo in classifica","type":"auto_pos","condition":1,"reward":"pts","reward_pts":80,"reward_badge":null,"reward_label":"+80 pt bonus"},{"id":"ms_100pts","label":"💯 Centurione","description":"Raggiungi 100 punti totali","type":"auto_pts","condition":100,"reward":"pts","reward_pts":20,"reward_badge":null,"reward_label":"+20 pt bonus"},{"id":"ms_300pts","label":"🚀 Stratosfera","description":"Raggiungi 300 punti totali","type":"auto_pts","condition":300,"reward":"pts","reward_pts":50,"reward_badge":null,"reward_label":"+50 pt bonus"},{"id":"ms_trader","label":"🔄 Mercante","description":"Completa 3 scambi","type":"auto_trades","condition":3,"reward":"badge","reward_pts":null,"reward_badge":"🔄 Mercante","reward_label":"Badge esclusivo"},{"id":"ms_screenshot","label":"📸 Prova sul Campo","description":"Manda uno screenshot di un evento assurdo all'admin","type":"manual","condition":null,"reward":"pts","reward_pts":25,"reward_badge":null,"reward_label":"+25 pt bonus"},{"id":"ms_predict","label":"🔮 Indovino","description":"Indovina quale prof farà qualcosa prima che succeda","type":"manual","condition":null,"reward":"pts","reward_pts":40,"reward_badge":null,"reward_label":"+40 pt bonus"},{"id":"ms_streak","label":"🔥 Settimana di Fuoco","description":"Registra almeno un evento ogni giorno per 5 giorni","type":"manual","condition":null,"reward":"pts","reward_pts":35,"reward_badge":null,"reward_label":"+35 pt bonus"}]$j$::jsonb $f$;

create or replace function public._seed_missions(p_league uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.missions (league_id, label, description, type, condition, reward, reward_pts, reward_badge, reward_label)
  select p_league, m->>'label', m->>'description', m->>'type', (m->>'condition')::int, m->>'reward',
         (m->>'reward_pts')::int, m->>'reward_badge', coalesce(m->>'reward_label','')
    from jsonb_array_elements(public.default_missions()) m
$$;

-- create_league ora crea anche le missioni di default
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
    exit when not exists (select 1 from public.leagues where code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'Impossibile generare il codice lega, riprova'; end if;
  end loop;
  insert into public.leagues (name, code, owner_id, bonus, malus, premi)
  values (public.clean_text(p_name, 2, 40, 'Nome lega'), v_code, auth.uid(),
          public.default_catalog('bonus'), public.default_catalog('malus'), public.default_catalog('premi'))
  returning id into v_id;
  insert into public.league_members (league_id, user_id, role) values (v_id, auth.uid(), 'coadmin');
  perform public._seed_missions(v_id);
  return v_id;
end $$;

create or replace function public.set_missions_enabled(p_league uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.leagues set missions_enabled = p_enabled where id = p_league;
end $$;

create or replace function public.add_mission(p_league uuid, p_label text, p_desc text, p_reward_pts int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.assert_active(p_league);
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
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
  if not public.is_league_admin(v_lg) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  delete from public.missions where id = p_mission;
end $$;

create or replace function public._apply_reward(p_league uuid, p_user uuid, m public.missions)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  if m.reward = 'pts' then
    select id into v_team from public.teams where league_id = p_league and owner_id = p_user;
    if v_team is not null then
      perform public._team_event(p_league, v_team, 'mission_reward', '🎯 Missione: ' || m.label, 'mission', m.reward_pts, null);
    end if;
  else
    insert into public.entitlements (user_id, kind, ref) values (p_user, 'custom_badge', m.reward_badge) on conflict do nothing;
  end if;
end $$;

create or replace function public.claim_mission(p_mission uuid, p_note text default '')
returns text language plpgsql security definer set search_path = public as $$
declare m public.missions; v_team uuid; v_score int; v_pos int; v_trades int; v_ok boolean;
begin
  select * into m from public.missions where id = p_mission;
  if not found then raise exception 'Missione non trovata'; end if;
  perform public.assert_active(m.league_id);
  if not exists (select 1 from public.leagues where id = m.league_id and missions_enabled) then
    raise exception 'Le missioni sono disattivate in questa lega';
  end if;
  v_team := public._my_team(m.league_id);
  if exists (select 1 from public.mission_claims where mission_id = m.id and user_id = auth.uid() and status in ('pending','approved')) then
    raise exception 'Missione già richiesta o completata';
  end if;
  if m.type = 'manual' then
    insert into public.mission_claims (league_id, mission_id, user_id, note, status)
    values (m.league_id, m.id, auth.uid(), public.clean_text(coalesce(p_note,' '), 0, 200, 'Nota'), 'pending');
    return 'pending';
  end if;
  v_score := public._score(v_team);
  if m.type = 'auto_pts' then
    v_ok := v_score >= m.condition;
  elsif m.type = 'auto_trades' then
    select count(*) into v_trades from public.trades
     where league_id = m.league_id and status = 'accepted' and auth.uid() in (from_user, to_user);
    v_ok := v_trades >= m.condition;
  else
    select 1 + count(*) into v_pos from public.team_scores where league_id = m.league_id and score > v_score;
    v_ok := v_pos <= m.condition;
  end if;
  if not v_ok then raise exception 'Requisiti non ancora soddisfatti'; end if;
  insert into public.mission_claims (league_id, mission_id, user_id, status, auto) values (m.league_id, m.id, auth.uid(), 'approved', true);
  perform public._apply_reward(m.league_id, auth.uid(), m);
  return 'approved';
end $$;

create or replace function public.review_claim(p_claim uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.mission_claims; m public.missions;
begin
  select * into c from public.mission_claims where id = p_claim for update;
  if not found then raise exception 'Richiesta non trovata'; end if;
  perform public.assert_active(c.league_id);
  if not public.is_league_admin(c.league_id) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  if c.status <> 'pending' then raise exception 'Richiesta già gestita'; end if;
  update public.mission_claims set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid() where id = c.id;
  if p_approve then
    select * into m from public.missions where id = c.mission_id;
    perform public._apply_reward(c.league_id, c.user_id, m);
  end if;
end $$;

-- ── Pronostici (lun-dom, fuso Europe/Rome) ───────────────────────
create or replace function public._week_start(p_at timestamptz default now())
returns date language sql immutable as $$ select date_trunc('week', p_at at time zone 'Europe/Rome')::date $$;

create or replace function public.make_forecast(p_league uuid, p_prof uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  perform public.assert_active(p_league);
  v_team := public._my_team(p_league);
  if not exists (select 1 from public.team_professors where team_id = v_team and professor_id = p_prof) then
    raise exception 'Il pronostico deve riguardare un prof della tua squadra';
  end if;
  begin
    insert into public.forecasts (league_id, user_id, week_start, professor_id)
    values (p_league, auth.uid(), public._week_start(), p_prof);
  exception when unique_violation then
    raise exception 'Hai già fatto il pronostico di questa settimana';
  end;
end $$;

create or replace function public.resolve_forecasts(p_league uuid)
returns int language plpgsql security definer set search_path = public as $$
declare f record; v_team uuid; v_from timestamptz; v_to timestamptz; v_best int; v_mine int; n int := 0;
begin
  if not public.is_league_member(p_league) then raise exception 'Permesso negato' using errcode = '42501'; end if;
  for f in select * from public.forecasts
            where league_id = p_league and not resolved and week_start < public._week_start() for update loop
    v_from := (f.week_start::timestamp) at time zone 'Europe/Rome';
    v_to   := ((f.week_start + 7)::timestamp) at time zone 'Europe/Rome';
    select id into v_team from public.teams where league_id = p_league and owner_id = f.user_id;
    if v_team is not null then
      select coalesce(max(s), 0) into v_best from (
        select coalesce(sum(e.pts), 0) s from public.team_professors tp
          left join public.events e on e.professor_id = tp.professor_id and e.created_at >= v_from and e.created_at < v_to
         where tp.team_id = v_team group by tp.professor_id) x;
      select coalesce(sum(e.pts), 0) into v_mine from public.events e
       where e.professor_id = f.professor_id and e.created_at >= v_from and e.created_at < v_to;
      if v_best > 0 and v_mine = v_best then
        perform public._team_event(p_league, v_team, 'forecast_bonus',
          '🔮 Pronostico giusto! (' || coalesce((select name from public.professors where id = f.professor_id), '?') || ')',
          'forecast', 60, null);
        n := n + 1;
      end if;
    end if;
    update public.forecasts set resolved = true where league_id = f.league_id and user_id = f.user_id and week_start = f.week_start;
  end loop;
  return n;
end $$;

-- ── Stile squadra e profilo ──────────────────────────────────────
create or replace function public.set_team_fx(p_team uuid, p_fx text)
returns void language plpgsql security definer set search_path = public as $$
declare v_lg uuid;
begin
  select league_id into v_lg from public.teams where id = p_team and owner_id = auth.uid();
  if v_lg is null then raise exception 'Squadra non trovata' using errcode = '42501'; end if;
  perform public.assert_active(v_lg);
  if p_fx is not null and not exists (select 1 from public.entitlements where user_id = auth.uid() and kind = 'name_fx' and ref = p_fx) then
    raise exception 'Effetto non sbloccato';
  end if;
  update public.teams set name_fx = p_fx where id = p_team;
end $$;

create or replace function public.set_avatar_url(p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active();
  if p_url is not null and p_url !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,60}$') then
    raise exception 'Percorso avatar non valido';
  end if;
  update public.profiles set avatar_url = p_url where id = auth.uid();
end $$;

-- ── Hall of Fame globale ─────────────────────────────────────────
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
     group by t.id)
  select p.id, p.username, p.avatar, p.avatar_url, sum(pt.s)::int, count(*)::int
    from per_team pt join public.profiles p on p.id = pt.owner_id
   where auth.uid() is not null
   group by p.id order by 5 desc, 2 limit 100
$$;

create or replace function public.admin_reset_hof()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Permesso negato' using errcode = '42501'; end if;
  update public.settings set value = to_jsonb((extract(epoch from now()) * 1000)::bigint) where key = 'hof_since';
end $$;

-- ── Reset lega (nuova stagione) ──────────────────────────────────
create or replace function public.reset_league(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_active(p_league);
  if not (public.is_superadmin() or exists (select 1 from public.leagues where id = p_league and owner_id = auth.uid())) then
    raise exception 'Solo il proprietario può azzerare la lega' using errcode = '42501';
  end if;
  delete from public.events where league_id = p_league;
  delete from public.messages where league_id = p_league;
  delete from public.trades where league_id = p_league;
  delete from public.market_listings where league_id = p_league;
  delete from public.market_rotations where league_id = p_league;
  delete from public.powerups where league_id = p_league;
  delete from public.forecasts where league_id = p_league;
  delete from public.mission_claims where league_id = p_league;
  update public.leagues set season_start = now() where id = p_league;
end $$;

-- ── Annunci iniziali (dalla V1) ──────────────────────────────────
insert into public.announcements (title, body, tag, pinned)
select a->>'title', a->>'body', a->>'tag', (a->>'pinned')::boolean
  from jsonb_array_elements($j$[{"title":"🔧 Manutenzione completata","body":"Abbiamo risolto un bug che causava schermata nera dopo l'invio della squadra in una lega. Il problema è stato corretto e l'app torna a funzionare normalmente.\n\nSe riscontri ancora l'errore, prova a ricaricare la pagina (o svuotare la cache del browser). Grazie per la pazienza! ⚡","tag":"🆕 Update","pinned":true},{"title":"🏆 Fantaprof è tornato!","body":"FANTAPROF È UFFICIALMENTE RIAPERTO.\n\nLa nuova stagione 2K26 è finalmente iniziata. 🎉\n\n⚡ Nuova stagione\n🎯 Nuove sfide\n🔥 Nuove strategie\n🏆 Una nuova corsa alla vittoria\n\nPrepara la tua squadra, scegli i tuoi prof e prova a conquistare il primo posto.\n\nLa stagione 2K26 è appena iniziata.\n\n🚀 BENVENUTI NELLA NUOVA STAGIONE DI FANTAPROF.","tag":"🏆 STAGIONE 2K26","pinned":false}]$j$::jsonb) a;

-- ── Storage avatar (solo se il progetto ha Storage) ──────────────
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 262144, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy avatars_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy avatars_update on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy avatars_delete on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- ── Permessi ─────────────────────────────────────────────────────
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
revoke execute on function public._score(uuid), public._my_team(uuid), public._drop_prof(uuid, uuid),
  public._give_prof(uuid, uuid, uuid), public._team_event(uuid, uuid, text, text, text, int, uuid),
  public._settle_sale(public.market_listings, uuid, int, uuid, text), public._seed_missions(uuid),
  public._apply_reward(uuid, uuid, public.missions) from authenticated;

-- ── Vista: punti per professore (usata da Professori e dalla scheda storico) ─
create or replace view public.professor_scores with (security_invoker = true) as
select p.id as professor_id, p.league_id,
       coalesce(sum(e.pts), 0)::int as pts,
       count(e.id)::int as events
from public.professors p
left join public.events e on e.professor_id = p.id
group by p.id;
grant select on public.professor_scores to authenticated;
