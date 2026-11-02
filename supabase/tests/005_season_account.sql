-- Test 005: fine stagione, archivio, rebuild squadra, Hall of Fame, codice di recupero.
-- Esegui su un DB con 001..005 applicate:  psql -v ON_ERROR_STOP=1 -f supabase/tests/005_season_account.sql
\set ON_ERROR_STOP 1
create schema if not exists t;
grant usage on schema t to public;
create or replace function t.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;
create or replace function t.ok(c boolean, m text) returns void language plpgsql as $$ begin if c is not true then raise exception 'FALLITO: %', m; end if; end $$;
-- esegue sql come utente autenticato e verifica che fallisca con un messaggio che contiene p_like
create or replace function t.expect_error(u uuid, q text, p_like text) returns void language plpgsql as $$
declare ok boolean := false; m text;
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
  begin execute q; exception when others then ok := true; m := sqlerrm; end;
  execute 'reset role';
  if not ok then raise exception 'ATTESO ERRORE ma ok: %', q; end if;
  if m not ilike '%' || p_like || '%' then raise exception 'errore diverso dal previsto (%): %', p_like, m; end if;
end $$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','owner1@x.app','{"username":"owner1"}'),
 ('00000000-0000-0000-0000-0000000000a2','user2@x.app','{"username":"user2"}'),
 ('00000000-0000-0000-0000-0000000000a3','user3@x.app','{"username":"user3"}');

-- ── Setup lega ───────────────────────────────────────────────────
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_league('Lega Test') as lg \gset
select code as lcode from public.leagues where id = :'lg' \gset
select public.add_professors(:'lg', '[{"name":"Prof Uno","subject":"Mat","cost":10},{"name":"Prof Due","subject":"Ita","cost":10},{"name":"Prof Tre","subject":"Sto","cost":10},{"name":"Prof Quattro","subject":"Fis","cost":10}]'::jsonb);
reset role;
select id as p1 from public.professors where name='Prof Uno' \gset
select id as p2 from public.professors where name='Prof Due' \gset
select id as p3 from public.professors where name='Prof Tre' \gset
select id as p4 from public.professors where name='Prof Quattro' \gset
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a2'); select public.join_league(:'lcode');
select t.as_user('00000000-0000-0000-0000-0000000000a3'); select public.join_league(:'lcode');
select t.as_user('00000000-0000-0000-0000-0000000000a1'); select public.create_team(:'lg', 'Team Uno', array[:'p1', :'p2']::uuid[]);
select t.as_user('00000000-0000-0000-0000-0000000000a2'); select public.create_team(:'lg', 'Team Due', array[:'p1']::uuid[]);
select t.as_user('00000000-0000-0000-0000-0000000000a3'); select public.create_team(:'lg', 'Team Tre', array[:'p3']::uuid[]);
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.add_events(:'lg', jsonb_build_array(
  jsonb_build_object('professor_id', :'p1', 'event_key', 'assenza'),
  jsonb_build_object('professor_id', :'p1', 'event_key', 'ritardo'),
  jsonb_build_object('professor_id', :'p3', 'event_key', 'nota')));
reset role;

-- premium dell'utente 2 + effetto nome
insert into public.entitlements (user_id, kind, ref) values ('00000000-0000-0000-0000-0000000000a2', 'name_fx', 'neon'), ('00000000-0000-0000-0000-0000000000a2','skin','x');
update public.teams set name_fx = 'neon' where name = 'Team Due';

do $$ begin
  assert (select score from public.team_scores where name='Team Uno') = 25, 'punti Team Uno';
  assert (select score from public.team_scores where name='Team Tre') = -25, 'punti Team Tre';
  assert (select season_num from public.leagues where code = (select code from public.leagues limit 1)) >= 1;
end $$;

-- ── Stagione non finita: ensure_season non fa nulla ──────────────
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a2');
select public.ensure_season(:'lg') as closed \gset
reset role;
do $$ begin assert (select count(*) from public.season_results) = 0, 'nessun archivio prima della scadenza'; end $$;
select t.expect_error('00000000-0000-0000-0000-0000000000a1', format('select public.close_season(%L)', :'lg'), 'non è ancora finita');

-- ── Modalità manuale ─────────────────────────────────────────────
update public.leagues set season_start = now() - interval '31 days' where id = :'lg';
select t.expect_error('00000000-0000-0000-0000-0000000000a2', format('select public.set_season_auto(%L, false)', :'lg'), 'Permesso negato');
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a1'); select public.set_season_auto(:'lg', false);
select t.as_user('00000000-0000-0000-0000-0000000000a2'); select public.ensure_season(:'lg');
reset role;
do $$ begin assert (select count(*) from public.season_results) = 0, 'manuale: ensure_season non chiude'; end $$;
select t.expect_error('00000000-0000-0000-0000-0000000000a2', format('select public.close_season(%L)', :'lg'), 'Solo gli admin');
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a1'); select public.close_season(:'lg');
reset role;

do $$ declare l public.leagues; begin
  select * into l from public.leagues where code = (select code from public.leagues limit 1);
  assert l.season_num = 2, 'season_num incrementato';
  assert l.season_start > now() and l.season_start < now() + interval '3 days', 'nuova stagione dopo la pausa: ' || l.season_start;
  assert (select count(*) from public.season_results where season_num = 1) = 3, 'archiviate 3 squadre';
  assert (select rank from public.season_results where team_name = 'Team Uno') in (1, 2), 'rank Team Uno';
  assert (select rank from public.season_results where team_name = 'Team Tre') = 3, 'ultimo Team Tre';
  assert (select jsonb_array_length(professors) from public.season_results where team_name = 'Team Uno') = 2, 'professori archiviati';
  assert (select count(*) from public.teams) = 3, 'squadre mantenute';
  assert (select count(*) from public.team_professors) = 0, 'squadre svuotate';
  assert (select count(*) from public.events) = 0, 'eventi azzeratti';
  assert (select name_fx from public.teams where name='Team Due') = 'neon', 'effetto nome mantenuto';
  assert (select count(*) from public.entitlements) = 2, 'premium intatti';
  assert (select count(*) from public.notifications where type='season_closed') = 3, 'notifiche';
end $$;

-- ensure_season idempotente in pausa / dopo la chiusura
select public.ensure_season(:'lg') \gset
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a2'); select public.ensure_season(:'lg') as again \gset
reset role;
do $$ begin assert (select season_num from public.leagues limit 1) = 2, 'idempotente'; end $$;

-- ── rebuild_team ─────────────────────────────────────────────────
select t.expect_error('00000000-0000-0000-0000-0000000000a3', format('select public.rebuild_team((select id from public.teams where name=%L), array[%L,%L,%L,%L,%L]::uuid[])', 'Team Tre', :'p1', :'p2', :'p3', :'p4', gen_random_uuid()), 'massimo 4');
select t.expect_error('00000000-0000-0000-0000-0000000000a3', format('select public.rebuild_team((select id from public.teams where name=%L), array[%L]::uuid[])', 'Team Due', :'p1'), 'non trovata');
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a3');
select public.rebuild_team((select id from public.teams where name='Team Tre'), array[:'p2', :'p4']::uuid[]);
reset role;
do $$ begin assert (select count(*) from public.team_professors) = 2, 'rebuild ok'; end $$;
select t.expect_error('00000000-0000-0000-0000-0000000000a3', format('select public.rebuild_team((select id from public.teams where name=%L), array[%L]::uuid[])', 'Team Tre', :'p1'), 'già dei professori');

-- ── Modalità automatica ──────────────────────────────────────────
update public.leagues set season_start = now() - interval '31 days', auto_season_end = true where id = :'lg';
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a3'); select public.ensure_season(:'lg');
select public.ensure_season(:'lg');
reset role;
do $$ begin
  assert (select season_num from public.leagues limit 1) = 3, 'auto: chiusa una sola volta';
  assert (select count(*) from public.season_results where season_num = 2) = 1, 'solo la squadra ricostruita archiviata (le altre vuote e 0 pt)';
end $$;
-- close_due_seasons (service_role)
update public.leagues set season_start = now() - interval '40 days' where id = :'lg';
set role service_role;
select public.close_due_seasons() as n \gset
reset role;
do $$ begin assert (select season_num from public.leagues limit 1) = 4, 'close_due_seasons'; assert (select season_start from public.leagues limit 1) <= now() + interval '1 second', 'chiusura in ritardo: parte subito'; end $$;
select t.expect_error('00000000-0000-0000-0000-0000000000a1', 'select public.close_due_seasons()', 'permission denied');

-- ── reset anticipato ─────────────────────────────────────────────
select t.expect_error('00000000-0000-0000-0000-0000000000a2', format('select public.reset_league(%L)', :'lg'), 'Solo il proprietario');
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a1'); select public.reset_league(:'lg');
reset role;
do $$ begin assert (select season_num from public.leagues limit 1) = 5, 'reset forzato'; end $$;

-- ── Hall of Fame (archivio) ──────────────────────────────────────
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a1');
create temp table hof as select * from public.hall_of_fame();
reset role;
do $$ begin
  assert (select total from hof where username = 'owner1') = 25, 'HoF owner1 da archivio';
  assert (select total from hof where username = 'user3') = -25, 'HoF user3 da archivio';
  assert (select leagues from hof where username = 'owner1') = 1;
end $$;

-- ── Codice di recupero ───────────────────────────────────────────
set role authenticated; select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.has_recovery_code() as had \gset
select public.issue_recovery_code() as rc \gset
select public.has_recovery_code() as has \gset
reset role;
select t.ok(:'rc' ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', 'formato codice');
select t.ok(:'had' = 'f' and :'has' = 't', 'has_recovery_code');
-- gli utenti non possono leggere l'hash né chiamare verify
select t.expect_error('00000000-0000-0000-0000-0000000000a2', 'select * from public.recovery_codes', 'permission denied');
select t.expect_error('00000000-0000-0000-0000-0000000000a2', $q$select public.recovery_verify('owner1', 'x')$q$, 'permission denied');

set role service_role;
select public.recovery_verify('owner1', 'AAAA-BBBB-CCCC') is null as w1 \gset
select public.recovery_verify('nessuno', :'rc') is null as w_unknown \gset
select public.recovery_verify('OWNER1', lower(replace(:'rc', '-', ' '))) as okid \gset
reset role;
select t.ok(:'w1' = 't' and :'w_unknown' = 't', 'codice errato/utente inesistente -> null');
select t.ok(:'okid' = '00000000-0000-0000-0000-0000000000a1', 'verifica ok normalizzata');

-- blocco dopo 5 errori
set role service_role;
select public.recovery_verify('owner1', 'ZZZZ-ZZZZ-ZZZZ') from generate_series(1, 5);
select public.recovery_verify('owner1', :'rc') is null as locked \gset
reset role;
select t.ok(:'locked' = 't', 'bloccato dopo 5 errori anche col codice giusto');
select t.ok((select locked_until > now() from public.recovery_codes limit 1), 'locked_until impostato');
update public.recovery_codes set locked_until = now() - interval '1 minute';
set role service_role;
select public.recovery_verify('owner1', :'rc') as okafter \gset
select public.recovery_rotate(:'okafter') as newrc \gset
select public.recovery_verify('owner1', :'rc') is null as oldfails \gset
select public.recovery_verify('owner1', :'newrc') as newworks \gset
reset role;
select t.ok(:'okafter' = '00000000-0000-0000-0000-0000000000a1', 'sbloccato dopo la scadenza');
select t.ok(:'newrc' <> :'rc' and :'oldfails' = 't', 'il vecchio codice non vale piu');
select t.ok(:'newworks' = '00000000-0000-0000-0000-0000000000a1', 'il nuovo codice vale');
select t.ok((select count(*) from public.notifications where type = 'recovery_used') = 1, 'notifica recovery_used');

select 'TUTTO OK 005' as risultato;
