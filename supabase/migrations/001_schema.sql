-- FantaProf V2 — 001 schema
-- Sostituisce la vecchia tabella "store" (blob JSON) con tabelle relazionali.
-- Esegui per primo, nello SQL Editor di Supabase.

create extension if not exists citext;

-- ── Profili (uno per utente Supabase Auth) ───────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      citext not null unique
                check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar        text not null default '🎓' check (char_length(avatar) <= 16),
  bio           text not null default '' check (char_length(bio) <= 200),
  is_superadmin boolean not null default false,
  banned_until  timestamptz,
  created_at    timestamptz not null default now()
);

-- Oggetti premium sbloccati (skin, badge, effetti nome, Pro per lega)
create table public.entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('pro','skin','badge','name_fx','custom_badge')),
  ref        text not null,           -- id lega (pro) / id skin / id badge / id effetto / testo badge
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);

-- ── Leghe ────────────────────────────────────────────────────────
create table public.leagues (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 40),
  code         text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  suspended    boolean not null default false,
  season_start timestamptz not null default now(),
  bonus        jsonb not null default '[]',   -- catalogo eventi bonus  [{id,label,pts}]
  malus        jsonb not null default '[]',   -- catalogo eventi malus
  premi        jsonb not null default '[]',   -- catalogo premi settimanali
  created_at   timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('member','coadmin')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index on public.league_members (user_id);

-- Professori: catalogo per lega (nome, materia, costo in crediti)
create table public.professors (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 40),
  subject    text not null default '' check (char_length(subject) <= 40),
  cost       int  not null check (cost between 1 and 50),
  created_at timestamptz not null default now()
);
create index on public.professors (league_id);

-- ── Squadre ──────────────────────────────────────────────────────
create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 30),
  captain_id uuid references public.professors(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (league_id, owner_id)
);
create index on public.teams (league_id);

create table public.team_professors (
  team_id      uuid not null references public.teams(id) on delete cascade,
  professor_id uuid not null references public.professors(id) on delete cascade,
  primary key (team_id, professor_id)
);
create index on public.team_professors (professor_id);

-- ── Eventi / punteggi ────────────────────────────────────────────
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  professor_id uuid references public.professors(id) on delete cascade,
  team_id      uuid references public.teams(id) on delete cascade,
  event_key    text not null,
  label        text not null check (char_length(label) <= 120),
  kind         text not null default 'bm' check (kind in ('bm','premio','mission','forecast','shop','other')),
  pts          int  not null check (pts between -1000 and 1000),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (professor_id is not null or team_id is not null)
);
create index on public.events (league_id, created_at desc);
create index on public.events (professor_id);
create index on public.events (team_id);

-- ── Scambi ───────────────────────────────────────────────────────
create table public.trades (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  from_user    uuid not null references public.profiles(id) on delete cascade,
  to_user      uuid not null references public.profiles(id) on delete cascade,
  from_prof    uuid not null references public.professors(id) on delete cascade,
  to_prof      uuid not null references public.professors(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled','expired')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 hours',
  check (from_user <> to_user)
);
create index on public.trades (league_id, status);
create index on public.trades (from_user);
create index on public.trades (to_user);

-- ── Chat di lega ─────────────────────────────────────────────────
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index on public.messages (league_id, created_at);

-- ── News / annunci ───────────────────────────────────────────────
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) <= 120),
  body       text not null check (char_length(body) <= 4000),
  tag        text not null default '',
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Codici premium ───────────────────────────────────────────────
create table public.premium_codes (
  code       text primary key,
  type       text not null check (type in ('pro','skin','skin_bundle','badge','badge_bundle','name_fx','custom_badge')),
  meta       jsonb not null default '{}',
  used_by    uuid references public.profiles(id) on delete set null,
  used_at    timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── Impostazioni globali (modalità app, reset Hall of Fame…) ─────
create table public.settings (
  key   text primary key,
  value jsonb not null
);
insert into public.settings (key, value) values
  ('app_mode', '"normal"'),
  ('hof_since', '0');

-- ── Classifica: punteggio per squadra ────────────────────────────
-- Stessa regola della V1: contano gli eventi dei prof attualmente in squadra
-- e quelli assegnati direttamente alla squadra; il capitano vale doppio.
create view public.team_scores with (security_invoker = true) as
select t.id as team_id,
       t.league_id,
       t.owner_id,
       t.name,
       t.captain_id,
       coalesce(sum(case when e.professor_id is not null and e.professor_id = t.captain_id
                         then e.pts * 2 else e.pts end), 0)::int as score
from public.teams t
left join public.events e
  on e.league_id = t.league_id
 and (e.team_id = t.id
      or e.professor_id in (select tp.professor_id from public.team_professors tp where tp.team_id = t.id))
group by t.id;
