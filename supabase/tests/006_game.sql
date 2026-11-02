-- Test di 006_game.sql (psql). Eseguire dopo 001..004 + 006 su un DB di prova:
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/006_game.sql
-- Ogni controllo che fallisce fa terminare lo script con un errore.
\set ON_ERROR_STOP on
\set QUIET on

create schema if not exists t;
grant usage on schema t to authenticated;

create or replace function t.as_user(u uuid) returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', u::text, false); set role authenticated; end $$;
create or replace function t.as_admin() returns void language plpgsql as $$ begin reset role; end $$;
create or replace function t.eq(a anyelement, b anyelement, msg text) returns void language plpgsql as $$
begin if a is distinct from b then raise exception 'FAIL %: atteso %, ottenuto %', msg, b, a; end if; end $$;
create or replace function t.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL %', msg; end if; end $$;
-- esegue sql e si aspetta un errore che contenga pat
create or replace function t.err(q text, pat text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm ilike '%' || pat || '%' then return; end if;
    raise exception 'FAIL errore diverso da quello atteso (%): %', pat, sqlerrm;
  end;
  raise exception 'FAIL atteso errore "%" ma la query è riuscita: %', pat, q;
end $$;
create or replace function t.notifs(u uuid, ty text) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = u and type = ty $$;
grant execute on all functions in schema t to authenticated;

-- ── Setup: 3 utenti, una lega, 6 prof, 3 squadre ─────────────────
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'u1@t', '{"username":"owner1"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'u2@t', '{"username":"gamer2"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'u3@t', '{"username":"gamer3"}');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

select t.as_user('00000000-0000-0000-0000-0000000000a1');
insert into ctx select 'league', public.create_league('Lega Test')::text;
select public.add_professors((select v::uuid from ctx where k = 'league'),
  '[{"name":"Prof Uno","subject":"Mat","cost":10},{"name":"Prof Due","subject":"Ita","cost":10},{"name":"Prof Tre","subject":"Sto","cost":10},
    {"name":"Prof Quattro","subject":"Fis","cost":10},{"name":"Prof Cinque","subject":"Art","cost":10},{"name":"Prof Sei","subject":"Ing","cost":10}]'::jsonb);
select t.as_admin();
insert into ctx select 'code', code from public.leagues;
insert into ctx select 'p' || n, id::text from (select row_number() over (order by name) n, id from public.professors) x;
select t.as_user('00000000-0000-0000-0000-0000000000a2'); select public.join_league((select v from ctx where k = 'code'));
select t.as_user('00000000-0000-0000-0000-0000000000a3'); select public.join_league((select v from ctx where k = 'code'));

reset role;
create or replace function t.l() returns uuid language sql as $$ select v::uuid from ctx where k = 'league' $$;
create or replace function t.p(n int) returns uuid language sql as $$ select v::uuid from ctx where k = 'p' || n $$;
create or replace function t.team(u uuid) returns uuid language sql as $$ select id from public.teams where owner_id = u and league_id = t.l() $$;
create or replace function t.u(n int) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-0000000000a' || n)::uuid $$;
grant execute on all functions in schema t to authenticated;
grant select on ctx to authenticated;

select t.as_user(t.u(1)); select public.create_team(t.l(), 'Alpha', array[t.p(1), t.p(2)]);
select t.as_user(t.u(2)); select public.create_team(t.l(), 'Beta',  array[t.p(3), t.p(4)]);
select t.as_user(t.u(3)); select public.create_team(t.l(), 'Gamma', array[t.p(5)]);

-- ═════ 1. Punteggi per periodo, trend, timeline ═════
select t.as_user(t.u(1));
select public.add_events(t.l(), jsonb_build_array(
  jsonb_build_object('professor_id', t.p(1), 'event_key', 'assenza'),    -- +15 a Alpha
  jsonb_build_object('professor_id', t.p(3), 'event_key', 'ritardo')));  -- +10 a Beta
select t.as_admin();
-- un evento vecchio di 3 giorni: +100 a Prof Uno
insert into public.events (league_id, professor_id, event_key, label, kind, pts, created_at)
values (t.l(), t.p(1), 'vecchio', 'Evento di 3 giorni fa', 'bm', 100, now() - interval '3 days');
select t.as_user(t.u(1));
select t.eq((select score from public.team_scores_between(t.l()) where team_id = t.team(t.u(1))), 115, 'totale Alpha');
select t.eq((select score from public.team_scores_between(t.l(), now() - interval '1 day') where team_id = t.team(t.u(1))), 15, 'Alpha ultime 24h');
select t.eq((select score from public.team_scores_between(t.l(), null, now() - interval '1 day') where team_id = t.team(t.u(1))), 100, 'Alpha 24h fa (trend)');
select t.eq((select team_id from public.team_scores_between(t.l()) limit 1), t.team(t.u(1)), 'Alpha prima in classifica');
select t.eq((select team_id from public.team_scores_between(t.l(), null, now() - interval '1 day') limit 1), t.team(t.u(1)), 'Alpha prima anche 24h fa');
select t.ok((select count(distinct day) from public.league_points_timeline(t.l()) where team_id = t.team(t.u(1))) >= 2, 'timeline con almeno 2 giorni');
select t.eq((select sum(pts) from public.league_points_timeline(t.l()) where team_id = t.team(t.u(1)))::int, 115, 'timeline somma = totale');
-- un non membro non vede nulla (RLS)
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a9', 'u9@t', '{"username":"outsider9"}');
select t.as_user(t.u(9));
select t.eq((select count(*) from public.team_scores_between(t.l()))::int, 0, 'non membro: classifica vuota');
select t.err($$select public.periodic_missions(t.l())$$, 'Permesso negato');
select t.err($$select public.resolve_duels(t.l())$$, 'Permesso negato');

-- ═════ 2. Sfide 1 contro 1 ═════
select t.as_user(t.u(1));
select t.err($$select public.propose_duel(t.l(), t.u(1))$$, 'te stesso');
select t.err($$select public.propose_duel(t.l(), t.u(9))$$, 'non ha una squadra');
insert into ctx select 'duel', public.propose_duel(t.l(), t.u(2))::text;
select t.err($$select public.propose_duel(t.l(), t.u(2))$$, 'già una sfida aperta');
select t.as_user(t.u(2));
select t.err($$select public.propose_duel(t.l(), t.u(1))$$, 'già una sfida aperta');   -- anche in direzione opposta
select t.as_user(t.u(3));
select t.err($$select public.respond_duel((select v::uuid from ctx where k='duel'), true)$$, 'Solo lo sfidato');
select t.as_admin();
select t.eq(t.notifs(t.u(2), 'duel_proposed'), 1, 'notifica duel_proposed');
select t.as_user(t.u(2));
select t.eq(public.respond_duel((select v::uuid from ctx where k='duel'), true), 'active', 'sfida accettata');
select t.err($$select public.respond_duel((select v::uuid from ctx where k='duel'), true)$$, 'non più valida');
select t.as_admin();
select t.eq(t.notifs(t.u(1), 'duel_accepted'), 1, 'notifica duel_accepted');
-- eventi durante la sfida: Alpha +25, Beta +15
select t.as_user(t.u(1));
select public.add_events(t.l(), jsonb_build_array(
  jsonb_build_object('professor_id', t.p(1), 'event_key', 'liberi'),
  jsonb_build_object('professor_id', t.p(3), 'event_key', 'assenza')));
select t.eq((select challenger_pts from public.duel_live_points(t.l())), 25, 'punti live sfidante');
select t.eq((select opponent_pts from public.duel_live_points(t.l())), 15, 'punti live sfidato');
select t.eq(public.resolve_duels(t.l()), 0, 'sfida non ancora scaduta');
select t.as_admin();
update public.duels set ends_at = now() where id = (select v::uuid from ctx where k='duel');
select t.as_user(t.u(1));
select t.eq(public.resolve_duels(t.l()), 1, 'sfida risolta');
select t.eq((select status from public.duels where id = (select v::uuid from ctx where k='duel')), 'finished', 'stato finished');
select t.eq((select winner_team from public.duels where id = (select v::uuid from ctx where k='duel')), t.team(t.u(1)), 'vince Alpha');
select t.eq((select count(*) from public.events where team_id = t.team(t.u(1)) and event_key = 'duel_win' and pts = 25)::int, 1, 'premio +25 al vincitore');
select t.eq((select count(*) from public.events where team_id = t.team(t.u(2)) and event_key = 'duel_win')::int, 0, 'nessun premio allo sconfitto');
select t.eq(public.resolve_duels(t.l()), 0, 'risoluzione idempotente');
select t.as_admin();
select t.eq(t.notifs(t.u(1), 'duel_finished'), 1, 'notifica fine a sfidante');
select t.eq(t.notifs(t.u(2), 'duel_finished'), 1, 'notifica fine a sfidato');
-- annulla / rifiuta / limite di 3 attive
select t.as_user(t.u(1));
insert into ctx select 'duel2', public.propose_duel(t.l(), t.u(3))::text;
select public.cancel_duel((select v::uuid from ctx where k='duel2'));
select t.eq((select status from public.duels where id = (select v::uuid from ctx where k='duel2')), 'cancelled', 'sfida annullata');
insert into ctx select 'duel3', public.propose_duel(t.l(), t.u(3))::text;
select t.as_user(t.u(3));
select t.eq(public.respond_duel((select v::uuid from ctx where k='duel3'), false), 'declined', 'sfida rifiutata');
select t.as_admin();
select t.eq(t.notifs(t.u(1), 'duel_declined'), 1, 'notifica duel_declined');
-- una richiesta pending vecchia di 48h scade
select t.as_user(t.u(1));
insert into ctx select 'duel4', public.propose_duel(t.l(), t.u(3))::text;
select t.as_admin();
update public.duels set created_at = now() - interval '49 hours' where id = (select v::uuid from ctx where k='duel4');
select t.as_user(t.u(3));
select t.eq(public.respond_duel((select v::uuid from ctx where k='duel4'), true), 'cancelled', 'pending scaduta dopo 48h');
-- scrittura diretta vietata
select t.err($$insert into public.duels (league_id, challenger_team, opponent_team, challenger_user, opponent_user) values (t.l(), t.team(t.u(1)), t.team(t.u(3)), t.u(1), t.u(3))$$, 'permission denied');

-- ═════ 3. Missioni a rotazione ═════
select t.as_user(t.u(1));
select t.eq((select count(*) from public.periodic_missions(t.l()) where period = 'daily')::int, 3, '3 missioni giornaliere attive');
select t.eq((select count(*) from public.periodic_missions(t.l()) where period = 'weekly')::int, 2, '2 missioni settimanali attive');
select t.eq((select count(*) from public.periodic_missions(t.l()) where key in ('d_pts30','d_pts80'))::int, 1, 'una sola tra pts30/pts80');
select t.err($$select public.claim_periodic_mission(t.l(), 'chiave_inesistente')$$, 'non attiva');
-- Alpha oggi ha 15+25 = 40 punti di gioco: una missione da 80 (se attiva) non è riscuotibile
select t.ok(coalesce((select progress < target from public.periodic_missions(t.l()) where key = 'd_pts80'), true), 'd_pts80 non completata a 40 pt');
select t.err($$select public.claim_periodic_mission(t.l(), 'd_pts80')$$, 'non attiva')
  where not exists (select 1 from public.periodic_missions(t.l()) where key = 'd_pts80');
-- fase 1: tutte le missioni incomplete devono essere bloccate
do $$ declare m record; begin
  for m in select * from public.periodic_missions(t.l()) where progress < target loop
    begin perform public.claim_periodic_mission(t.l(), m.key); raise exception 'FAIL claim senza requisiti %', m.key;
    exception when others then if sqlerrm not ilike '%non ancora completata%' then raise; end if; end;
  end loop;
end $$;
-- porto Alpha a 140 pt oggi e scrivo in chat
select public.add_events(t.l(), jsonb_build_array(jsonb_build_object('professor_id', t.p(1), 'event_key', 'gita')));
select public.send_message(t.l(), 'ciao a tutti');
do $$
declare m record; claimed int := 0; blocked int := 0; r int; before_pts int; after_pts int;
begin
  for m in select * from public.periodic_missions(t.l()) loop
    if m.progress >= m.target then
      select score into before_pts from public.team_scores where team_id = t.team(t.u(1));
      r := public.claim_periodic_mission(t.l(), m.key);
      select score into after_pts from public.team_scores where team_id = t.team(t.u(1));
      if r <> m.reward or after_pts - before_pts <> m.reward then raise exception 'FAIL premio missione % (%/%)', m.key, r, after_pts - before_pts; end if;
      claimed := claimed + 1;
      begin perform public.claim_periodic_mission(t.l(), m.key); raise exception 'FAIL doppio claim consentito %', m.key;
      exception when others then if sqlerrm not ilike '%già riscossa%' then raise; end if; end;
    else
      begin perform public.claim_periodic_mission(t.l(), m.key); raise exception 'FAIL claim senza requisiti %', m.key;
      exception when others then if sqlerrm not ilike '%non ancora completata%' then raise; end if; end;
      blocked := blocked + 1;
    end if;
  end loop;
  if claimed < 1 then raise exception 'FAIL nessuna missione riscossa'; end if;
  raise notice 'missioni periodiche: % riscosse, % bloccate', claimed, blocked;
end $$;
select t.eq((select bool_and(claimed) from public.periodic_missions(t.l()) where progress >= target), true, 'flag claimed');
-- missioni disattivate → nessuna riga
select t.as_admin();
update public.leagues set missions_enabled = false where id = t.l();
select t.as_user(t.u(1));
select t.eq((select count(*) from public.periodic_missions(t.l()))::int, 0, 'missioni disattivate');
select t.as_admin();
update public.leagues set missions_enabled = true where id = t.l();

-- ═════ 4. Pronostici: squadra e serie ═════
select t.as_admin();
-- settimana corrente = W; costruisco W-21, W-14 (vinte e già chiuse), W-7 (da risolvere) per Alpha
do $$
declare w date := public._week_start();
begin
  insert into public.forecasts (league_id, user_id, week_start, professor_id, resolved, won) values
    (t.l(), t.u(1), w - 21, t.p(1), true, true),
    (t.l(), t.u(1), w - 14, t.p(1), true, true),
    (t.l(), t.u(1), w - 7,  t.p(1), false, null),
    -- Beta: salta una settimana (W-21 assente) → serie di 2, niente bonus serie
    (t.l(), t.u(2), w - 14, t.p(3), true, true),
    (t.l(), t.u(2), w - 7,  t.p(3), false, null);
  -- eventi della settimana W-7: Prof Uno +50, Prof Tre +20
  insert into public.events (league_id, professor_id, event_key, label, kind, pts, created_at) values
    (t.l(), t.p(1), 'x', 'Evento sett. scorsa', 'bm', 50, ((w - 7)::timestamp + interval '2 days 12 hours') at time zone 'Europe/Rome'),
    (t.l(), t.p(3), 'x', 'Evento sett. scorsa', 'bm', 20, ((w - 7)::timestamp + interval '2 days 12 hours') at time zone 'Europe/Rome');
  -- pronostico di squadra di Gamma: "Alpha farà più punti" nella settimana W-7
  insert into public.forecast_teams (league_id, user_id, week_start, team_id) values (t.l(), t.u(3), w - 7, t.team(t.u(1)));
  insert into public.forecast_teams (league_id, user_id, week_start, team_id) values (t.l(), t.u(2), w - 7, t.team(t.u(2)));
end $$;
select t.as_user(t.u(1));
select t.ok(public.resolve_forecasts(t.l()) >= 3, 'pronostici risolti (prof Alpha, prof Beta, squadra Gamma)');
select t.eq((select won from public.forecasts where user_id = t.u(1) and week_start = public._week_start() - 7), true, 'won Alpha');
select t.eq((select count(*) from public.events where team_id = t.team(t.u(1)) and event_key = 'forecast_bonus' and pts = 60)::int, 1, '+60 a Alpha');
select t.eq((select count(*) from public.events where team_id = t.team(t.u(1)) and event_key = 'forecast_streak' and pts = 20)::int, 1, 'bonus serie (3ª vittoria di fila) ad Alpha');
select t.eq((select count(*) from public.events where team_id = t.team(t.u(2)) and event_key = 'forecast_bonus')::int, 1, 'Beta ha vinto');
select t.eq((select count(*) from public.events where team_id = t.team(t.u(2)) and event_key = 'forecast_streak')::int, 0, 'Beta: serie di 2, nessun bonus');
select t.eq((select count(*) from public.events where team_id = t.team(t.u(3)) and event_key = 'forecast_team_bonus' and pts = 40)::int, 1, '+40 al pronostico di squadra giusto');
select t.eq((select won from public.forecast_teams where user_id = t.u(2) and week_start = public._week_start() - 7), false, 'pronostico di squadra sbagliato');
select t.eq(public.resolve_forecasts(t.l()), 0, 'resolve idempotente');
-- pronostico della settimana corrente
select t.as_user(t.u(2));
select public.make_team_forecast(t.l(), t.team(t.u(1)));
select t.err($$select public.make_team_forecast(t.l(), t.team(t.u(1)))$$, 'già fatto');
select t.as_user(t.u(9));
select t.err($$select public.make_team_forecast(t.l(), t.team(t.u(1)))$$, 'Crea prima una squadra');

-- ═════ 5. Preferiti, mercato e notifiche ═════
select t.as_user(t.u(2));
select t.eq(public.toggle_watch(t.p(1)), true, 'preferito aggiunto');
select t.eq((select count(*) from public.watchlist)::int, 1, 'watchlist visibile al proprietario');
select t.as_user(t.u(3));
select t.eq((select count(*) from public.watchlist)::int, 0, 'watchlist privata');
select t.err($$select public.toggle_watch(gen_random_uuid())$$, 'non trovato');
select t.as_admin();
-- punti da spendere a Beta e Gamma
insert into public.events (league_id, team_id, event_key, label, kind, pts) values
  (t.l(), t.team(t.u(2)), 'seed', 'Bonus di prova', 'other', 500), (t.l(), t.team(t.u(3)), 'seed', 'Bonus di prova', 'other', 500);
select t.as_user(t.u(1));
insert into ctx select 'listing', public.create_listing(t.l(), t.p(1), 'auction', 100)::text;
select t.as_admin();
select t.eq(t.notifs(t.u(2), 'watch_listing'), 1, 'preferito messo all''asta → notifica');
select t.eq(t.notifs(t.u(1), 'watch_listing'), 0, 'il venditore non riceve la propria notifica');
select t.as_user(t.u(2)); select public.place_bid((select v::uuid from ctx where k='listing'), 101);
select t.as_user(t.u(3)); select public.place_bid((select v::uuid from ctx where k='listing'), 150);
select t.as_admin();
select t.eq(t.notifs(t.u(2), 'outbid'), 1, 'rilancio → notifica a chi è stato superato');
select t.eq((select (payload->>'amount')::int from public.notifications where user_id = t.u(2) and type = 'outbid'), 150, 'payload outbid');
select t.eq(t.notifs(t.u(3), 'outbid'), 0, 'il nuovo miglior offerente non riceve outbid');
-- asta in scadenza
select t.as_user(t.u(1));
select t.eq(public.notify_ending_auctions(t.l()), 0, 'asta non ancora in scadenza');
select t.as_admin();
update public.market_listings set expires_at = now() + interval '30 minutes' where id = (select v::uuid from ctx where k='listing');
select t.as_user(t.u(1));
select t.eq(public.notify_ending_auctions(t.l()), 1, 'asta in scadenza notificata');
select t.eq(public.notify_ending_auctions(t.l()), 0, 'notifica una volta sola');
select t.as_admin();
select t.eq(t.notifs(t.u(1), 'auction_ending'), 1, 'auction_ending al venditore');
select t.eq(t.notifs(t.u(3), 'auction_ending'), 1, 'auction_ending al miglior offerente');
-- vetrina
insert into public.market_rotations (league_id, professor_id, price) values (t.l(), t.p(1), 450);
select t.eq((select count(*) from public.notifications where user_id = t.u(2) and type = 'watch_listing' and payload->>'kind' = 'rotation')::int, 1, 'vetrina → notifica ai preferiti');
select t.as_user(t.u(2));
select t.eq(public.toggle_watch(t.p(1)), false, 'preferito rimosso');
select t.err($$insert into public.watchlist (user_id, league_id, professor_id) values (t.u(2), t.l(), t.p(2))$$, 'permission denied');

-- ═════ 6. Scambi ═════
select t.as_admin();
delete from public.market_listings;  -- l'asta ha tolto Prof Uno ad Alpha: riparto da composizioni note
delete from public.team_professors;
update public.teams set captain_id = null;
insert into public.team_professors (team_id, professor_id) values
  (t.team(t.u(1)), t.p(1)), (t.team(t.u(1)), t.p(2)),
  (t.team(t.u(2)), t.p(3)), (t.team(t.u(2)), t.p(4)),
  (t.team(t.u(3)), t.p(5));
delete from public.notifications;
update public.teams set captain_id = t.p(1) where id = t.team(t.u(1));

-- 1 a 1 (chiamata a 4 argomenti, come prima)
select t.as_user(t.u(1));
insert into ctx select 'tr1', public.propose_trade(t.l(), t.u(2), t.p(1), t.p(3))::text;
select t.err($$select public.propose_trade(t.l(), t.u(2), t.p(5), t.p(3))$$, 'non validi');                      -- Prof Cinque non è suo
select t.err($$select public.propose_trade(t.l(), t.u(1), t.p(1), t.p(3))$$, 'te stesso');
select t.err($$select public.propose_trade(t.l(), t.u(2), t.p(1), t.p(3), t.p(1), null)$$, 'duplicati');
select t.as_admin(); select t.eq(t.notifs(t.u(2), 'trade_proposed'), 1, 'notifica trade_proposed');
select t.as_user(t.u(1)); select t.err($$select public.respond_trade((select v::uuid from ctx where k='tr1'), true)$$, 'Solo il destinatario');
select t.as_user(t.u(2));
select t.eq(public.respond_trade((select v::uuid from ctx where k='tr1'), true), 'accepted', 'scambio 1-1 accettato');
select t.eq((select array_agg(professor_id order by professor_id) from public.team_professors where team_id = t.team(t.u(1)))::text,
            (select array_agg(x order by x) from unnest(array[t.p(3), t.p(2)]) x)::text, 'Alpha ora ha Prof Tre + Prof Due');
select t.eq((select captain_id from public.teams where id = t.team(t.u(1))), null, 'il capitano uscito perde la fascia');
select t.as_admin(); select t.eq(t.notifs(t.u(1), 'trade_accepted'), 1, 'notifica trade_accepted');
-- 2 contro 1: Alpha (P3,P2) dà due prof a Gamma (P5)
select t.as_user(t.u(1));
insert into ctx select 'tr2', public.propose_trade(t.l(), t.u(3), t.p(3), t.p(5), t.p(2), null)::text;
select t.as_user(t.u(3));
select t.eq(public.respond_trade((select v::uuid from ctx where k='tr2'), true), 'accepted', 'scambio 2-1 accettato');
select t.eq((select array_agg(professor_id)::text from public.team_professors where team_id = t.team(t.u(1))), array[t.p(5)]::text, 'Alpha ha solo Prof Cinque');
select t.eq((select count(*) from public.team_professors where team_id = t.team(t.u(3)))::int, 2, 'Gamma ha 2 prof');
-- limite 4 prof: Beta ha 2 prof (P1,P4 dopo il primo scambio). Porto Gamma a 4 e provo 2-per-1 verso Gamma
select t.as_admin();
insert into public.team_professors (team_id, professor_id) values (t.team(t.u(3)), t.p(1)), (t.team(t.u(3)), t.p(6));
select t.as_user(t.u(2));   -- Beta (P1,P4) offre 2 e chiede 1 a Gamma (4 prof): Gamma finirebbe a 5
select t.err($$select public.propose_trade(t.l(), t.u(3), t.p(1), t.p(3), t.p(4), null)$$, 'supererebbe i 4');
-- controfferta
select t.as_user(t.u(1));
insert into ctx select 'tr3', public.propose_trade(t.l(), t.u(2), t.p(5), t.p(1))::text;   -- Alpha dà P5, chiede P1 a Beta
select t.as_admin(); delete from public.notifications where type like 'trade_%';
select t.as_user(t.u(1)); select t.err($$select public.counter_trade((select v::uuid from ctx where k='tr3'), array[t.p(4)], array[t.p(5)])$$, 'destinatario');
select t.as_user(t.u(2));
insert into ctx select 'tr3c', public.counter_trade((select v::uuid from ctx where k='tr3'), array[t.p(4)], array[t.p(5)])::text;
select t.eq((select status from public.trades where id = (select v::uuid from ctx where k='tr3')), 'countered', 'originale = countered');
select t.eq((select counter_of from public.trades where id = (select v::uuid from ctx where k='tr3c')), (select v::uuid from ctx where k='tr3'), 'counter_of');
select t.eq((select from_user from public.trades where id = (select v::uuid from ctx where k='tr3c')), t.u(2), 'la controfferta parte dal destinatario');
select t.as_admin();
select t.eq(t.notifs(t.u(1), 'trade_countered'), 1, 'notifica trade_countered');
select t.eq(t.notifs(t.u(1), 'trade_proposed'), 0, 'nessun trade_proposed duplicato per la controfferta');
select t.as_user(t.u(1));
select t.eq(public.respond_trade((select v::uuid from ctx where k='tr3c'), true), 'accepted', 'controfferta accettata');
select t.eq((select count(*) from public.team_professors where team_id = t.team(t.u(1)) and professor_id = t.p(4))::int, 1, 'Alpha riceve Prof Quattro');
-- rifiuto
select t.as_user(t.u(3));
insert into ctx select 'tr4', public.propose_trade(t.l(), t.u(2), t.p(6), t.p(5))::text;
select t.as_user(t.u(2));
select t.eq(public.respond_trade((select v::uuid from ctx where k='tr4'), false), 'rejected', 'scambio rifiutato');
select t.as_admin(); select t.eq(t.notifs(t.u(3), 'trade_rejected'), 1, 'notifica trade_rejected');
-- il prof non è più in squadra al momento dell'accettazione → errore (e nessuna modifica)
select t.as_user(t.u(3));
insert into ctx select 'tr5', public.propose_trade(t.l(), t.u(2), t.p(6), t.p(5))::text;
select t.as_admin(); delete from public.team_professors where team_id = t.team(t.u(3)) and professor_id = t.p(6);
select t.as_user(t.u(2));
select t.err($$select public.respond_trade((select v::uuid from ctx where k='tr5'), true)$$, 'non è più in squadra');

select t.as_admin();
\echo ✅ 006_game: tutti i test sono passati
