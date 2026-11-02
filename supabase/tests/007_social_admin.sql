-- Test della migrazione 007. Esegui dopo 001-004 + 007 (vedi README / harness):
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/007_social_admin.sql
-- Ogni controllo solleva un'eccezione se fallisce; in coda stampa "TUTTI I TEST 007 OK".
\set ON_ERROR_STOP on
create schema if not exists t;
grant usage on schema t to authenticated, anon;

create or replace function t.eq(p_name text, p_got anyelement, p_exp anyelement) returns void language plpgsql as $$
begin
  if p_got is distinct from p_exp then raise exception 'FALLITO [%]: atteso %, ottenuto %', p_name, p_exp, p_got; end if;
  raise notice 'ok  %', p_name;
end $$;

-- Verifica che p_sql fallisca con un messaggio che contiene p_msg
create or replace function t.fails(p_name text, p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_msg) in lower(sqlerrm)) = 0 then
      raise exception 'FALLITO [%]: errore diverso dall''atteso (%): %', p_name, p_msg, sqlerrm;
    end if;
    raise notice 'ok  % (%)', p_name, sqlerrm;
    return;
  end;
  raise exception 'FALLITO [%]: doveva fallire con "%"', p_name, p_msg;
end $$;

create or replace function t.as_user(p_id uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_id::text, false); end $$;

grant execute on all functions in schema t to authenticated, anon;

-- ── Utenti e lega ────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001', 'owner@x', '{"username":"owner"}'),
 ('00000000-0000-0000-0000-000000000002', 'coadm@x', '{"username":"coadm"}'),
 ('00000000-0000-0000-0000-000000000003', 'player@x', '{"username":"player"}'),
 ('00000000-0000-0000-0000-000000000004', 'outsider@x', '{"username":"outsider"}'),
 ('00000000-0000-0000-0000-000000000005', 'super@x', '{"username":"super"}'),
 ('00000000-0000-0000-0000-000000000006', 'friend@x', '{"username":"friend"}');
update public.profiles set is_superadmin = true where username = 'super';

set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000001');
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;
insert into ctx select 'L1', public.create_league('Lega Uno')::text;
insert into ctx select 'code1', code from public.leagues where id = (select v::uuid from ctx where k = 'L1');
select public.add_professors((select v::uuid from ctx where k = 'L1'),
  '[{"name":"Prof Rossi","subject":"Mate","cost":10},{"name":"Prof Verdi","subject":"Storia","cost":12},{"name":"Prof Bianchi","subject":"Arte","cost":8}]');
insert into ctx select 'P1', id::text from public.professors where name = 'Prof Rossi';
insert into ctx select 'P2', id::text from public.professors where name = 'Prof Verdi';
insert into ctx select 'P3', id::text from public.professors where name = 'Prof Bianchi';

select t.as_user('00000000-0000-0000-0000-000000000002'); select public.join_league((select v from ctx where k = 'code1'));
select t.as_user('00000000-0000-0000-0000-000000000003'); select public.join_league((select v from ctx where k = 'code1'));
select t.as_user('00000000-0000-0000-0000-000000000006'); select public.join_league((select v from ctx where k = 'code1'));
select t.as_user('00000000-0000-0000-0000-000000000001');
select public.set_member_role((select v::uuid from ctx where k = 'L1'), '00000000-0000-0000-0000-000000000002', 'coadmin');

-- ── A. Permessi dei co-admin ─────────────────────────────────────
select t.eq('default perms', (select coadmin_perms from public.leagues where id = (select v::uuid from ctx where k = 'L1')),
            '{"events":true,"members":false,"missions":true}'::jsonb);
select t.as_user('00000000-0000-0000-0000-000000000002');
select t.eq('coadmin add_events (consentito)',
  public.add_events((select v::uuid from ctx where k='L1'), jsonb_build_array(jsonb_build_object('professor_id',(select v from ctx where k='P1'),'event_key','assenza'))), 1);
select t.fails('coadmin remove_member (negato)',
  format('select public.remove_member(%L, %L)', (select v from ctx where k='L1'), '00000000-0000-0000-0000-000000000006'), 'Permesso negato');
select t.eq('coadmin add_mission (consentito)', (public.add_mission((select v::uuid from ctx where k='L1'), 'Missione test', 'x', 10)) is not null, true);
select t.fails('coadmin non può impostare permessi',
  format('select public.set_coadmin_perms(%L, %L::jsonb)', (select v from ctx where k='L1'), '{"events":true}'), 'Solo il proprietario');
select t.as_user('00000000-0000-0000-0000-000000000003');
select t.fails('membro add_events (negato)',
  format('select public.add_events(%L, %L::jsonb)', (select v from ctx where k='L1'),
         format('[{"professor_id":"%s","event_key":"assenza"}]', (select v from ctx where k='P1'))), 'Permesso negato');
select t.fails('membro add_custom_event (negato)', format('select public.add_custom_event(%L, ''bonus'', ''X Y'', 5)', (select v from ctx where k='L1')), 'Permesso negato');
select t.fails('membro set_missions_enabled (negato)', format('select public.set_missions_enabled(%L, false)', (select v from ctx where k='L1')), 'Permesso negato');

-- owner: chiude events e missions, apre members
select t.as_user('00000000-0000-0000-0000-000000000001');
select public.set_coadmin_perms((select v::uuid from ctx where k='L1'), '{"events":false,"members":true,"missions":false}');
select t.as_user('00000000-0000-0000-0000-000000000002');
select t.fails('coadmin add_events dopo revoca', format('select public.add_events(%L, %L::jsonb)', (select v from ctx where k='L1'),
  format('[{"professor_id":"%s","event_key":"assenza"}]', (select v from ctx where k='P1'))), 'Permesso negato');
select t.fails('coadmin add_custom_event dopo revoca', format('select public.add_custom_event(%L, ''bonus'', ''X Y'', 5)', (select v from ctx where k='L1')), 'Permesso negato');
select t.fails('coadmin remove_catalog_event dopo revoca', format('select public.remove_catalog_event(%L, ''assenza'')', (select v from ctx where k='L1')), 'Permesso negato');
select t.fails('coadmin add_mission dopo revoca', format('select public.add_mission(%L, ''Altra'', ''x'', 10)', (select v from ctx where k='L1')), 'Permesso negato');
select t.fails('coadmin set_missions_enabled dopo revoca', format('select public.set_missions_enabled(%L, false)', (select v from ctx where k='L1')), 'Permesso negato');
select t.fails('coadmin delete_mission dopo revoca',
  format('select public.delete_mission(%L)', (select id::text from public.missions where label = 'Missione test')), 'Permesso negato');
select t.fails('coadmin delete_event dopo revoca',
  format('select public.delete_event(%L)', (select id::text from public.events limit 1)), 'Permesso negato');
select public.remove_member((select v::uuid from ctx where k='L1'), '00000000-0000-0000-0000-000000000006');   -- ora consentito
select t.as_user('00000000-0000-0000-0000-000000000006');
select public.join_league((select v from ctx where k = 'code1'));   -- rientra
select t.as_user('00000000-0000-0000-0000-000000000001');
select t.fails('perms non validi', format('select public.set_coadmin_perms(%L, %L::jsonb)', (select v from ctx where k='L1'), '{"events":"si"}'), 'non validi');
select t.eq('owner add_events sempre consentito',
  public.add_events((select v::uuid from ctx where k='L1'), jsonb_build_array(jsonb_build_object('professor_id',(select v from ctx where k='P2'),'event_key','ritardo'))), 1);

-- ── B. Undo ultimo batch ─────────────────────────────────────────
reset role;
delete from public.events;   -- pulizia: solo i dati del test
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000001');
select public.add_events((select v::uuid from ctx where k='L1'),
  jsonb_build_array(jsonb_build_object('professor_id',(select v from ctx where k='P1'),'event_key','assenza'),
                    jsonb_build_object('professor_id',(select v from ctx where k='P2'),'event_key','assenza'),
                    jsonb_build_object('professor_id',(select v from ctx where k='P3'),'event_key','video')));
select t.eq('3 eventi registrati', (select count(*)::int from public.events), 3);
select t.as_user('00000000-0000-0000-0000-000000000003');
select t.fails('membro undo (negato)', format('select public.undo_last_events(%L)', (select v from ctx where k='L1')), 'Permesso negato');
select t.as_user('00000000-0000-0000-0000-000000000001');
select t.eq('undo elimina il batch', public.undo_last_events((select v::uuid from ctx where k='L1')), 3);
select t.eq('eventi dopo undo', (select count(*)::int from public.events), 0);
select t.fails('undo senza nulla', format('select public.undo_last_events(%L)', (select v from ctx where k='L1')), 'Nessuna registrazione');

-- ── C. Proposte ──────────────────────────────────────────────────
select t.as_user('00000000-0000-0000-0000-000000000003');
insert into ctx select 'prop1', public.propose_event((select v::uuid from ctx where k='L1'), (select v::uuid from ctx where k='P1'), 'assenza', 'oggi in 3B')::text;
select t.fails('proposta duplicata', format('select public.propose_event(%L, %L, ''assenza'', '''')', (select v from ctx where k='L1'), (select v from ctx where k='P1')), 'già proposto');
select t.fails('evento fuori catalogo', format('select public.propose_event(%L, %L, ''inventato'', '''')', (select v from ctx where k='L1'), (select v from ctx where k='P1')), 'catalogo');
select t.fails('prof di altra lega/non valido', format('select public.propose_event(%L, %L, ''assenza'', '''')', (select v from ctx where k='L1'), gen_random_uuid()), 'non valido');
select public.propose_event((select v::uuid from ctx where k='L1'), (select v::uuid from ctx where k='P2'), 'assenza');
select public.propose_event((select v::uuid from ctx where k='L1'), (select v::uuid from ctx where k='P3'), 'assenza');
select public.propose_event((select v::uuid from ctx where k='L1'), (select v::uuid from ctx where k='P1'), 'ritardo');
select public.propose_event((select v::uuid from ctx where k='L1'), (select v::uuid from ctx where k='P2'), 'ritardo');
select t.fails('limite 5 pending', format('select public.propose_event(%L, %L, ''video'', '''')', (select v from ctx where k='L1'), (select v from ctx where k='P1')), '5 proposte');
select t.fails('membro non approva', format('select public.review_proposal(%L, true)', (select v from ctx where k='prop1')), 'Permesso negato');
select t.eq('il proponente vede solo le sue', (select count(*)::int from public.event_proposals), 5);
select t.as_user('00000000-0000-0000-0000-000000000006');
select t.eq('altro membro non vede proposte altrui', (select count(*)::int from public.event_proposals), 0);
select t.as_user('00000000-0000-0000-0000-000000000004');
select t.fails('outsider non propone', format('select public.propose_event(%L, %L, ''video'', '''')', (select v from ctx where k='L1'), (select v from ctx where k='P1')), 'Non fai parte');
select t.as_user('00000000-0000-0000-0000-000000000001');
select t.eq('notifiche agli admin', (select count(*)::int from public.notifications where type='proposal_new' and user_id='00000000-0000-0000-0000-000000000001'), 5);
select public.review_proposal((select v::uuid from ctx where k='prop1'), true);
select t.eq('approvazione → evento registrato', (select count(*)::int from public.events where event_key='assenza' and professor_id=(select v::uuid from ctx where k='P1')), 1);
select t.fails('già gestita', format('select public.review_proposal(%L, true)', (select v from ctx where k='prop1')), 'già gestita');
select t.eq('notifica al proponente', (select count(*)::int from public.notifications where type='proposal_approved' and user_id='00000000-0000-0000-0000-000000000003'), 1);
select public.review_proposal((select id from public.event_proposals where status='pending' limit 1), false);
select t.eq('notifica rifiuto', (select count(*)::int from public.notifications where type='proposal_rejected'), 1);

-- ── F. Chat: risposte, reazioni, pin ─────────────────────────────
select t.as_user('00000000-0000-0000-0000-000000000003');
insert into ctx select 'm1', public.send_message((select v::uuid from ctx where k='L1'), 'Ciao a tutti')::text;
select t.as_user('00000000-0000-0000-0000-000000000006');
insert into ctx select 'm2', public.send_message((select v::uuid from ctx where k='L1'), 'Ciao!', (select v::uuid from ctx where k='m1'))::text;
select t.eq('reply_to salvato', (select reply_to::text from public.messages where id = (select v::uuid from ctx where k='m2')), (select v from ctx where k='m1'));
select t.fails('reply a messaggio inesistente', format('select public.send_message(%L, ''x'', %L)', (select v from ctx where k='L1'), gen_random_uuid()), 'non esiste');
select t.eq('reazione on', public.toggle_reaction((select v::uuid from ctx where k='m1'), '🔥'), true);
select t.eq('reazione off', public.toggle_reaction((select v::uuid from ctx where k='m1'), '🔥'), false);
select t.fails('reazione non in whitelist', format('select public.toggle_reaction(%L, ''💩'')', (select v from ctx where k='m1')), 'non valida');
select public.toggle_reaction((select v::uuid from ctx where k='m1'), '👍');
select t.eq('reazione visibile ai membri', (select count(*)::int from public.message_reactions), 1);
select t.as_user('00000000-0000-0000-0000-000000000004');
select t.eq('outsider non vede reazioni', (select count(*)::int from public.message_reactions), 0);
select t.fails('outsider non reagisce', format('select public.toggle_reaction(%L, ''👍'')', (select v from ctx where k='m1')), 'Non fai parte');
select t.as_user('00000000-0000-0000-0000-000000000003');
select t.fails('membro non fissa', format('select public.pin_message(%L)', (select v from ctx where k='m1')), 'Permesso negato');
select t.as_user('00000000-0000-0000-0000-000000000001');
select public.pin_message((select v::uuid from ctx where k='m1'));
select public.pin_message((select v::uuid from ctx where k='m2'));
select t.eq('un solo messaggio fissato', (select count(*)::int from public.messages where pinned_at is not null), 1);
select t.eq('fissato è l''ultimo', (select id::text from public.messages where pinned_at is not null), (select v from ctx where k='m2'));
select public.unpin_message((select v::uuid from ctx where k='m2'));
select t.eq('nessun fissato', (select count(*)::int from public.messages where pinned_at is not null), 0);

-- ── F2. Sondaggi ─────────────────────────────────────────────────
select t.as_user('00000000-0000-0000-0000-000000000003');
insert into ctx select 'poll1', public.create_poll((select v::uuid from ctx where k='L1'), 'Chi vince?', '["Rossi","Verdi","Bianchi"]', 24)::text;
select t.fails('poll con 1 opzione', format('select public.create_poll(%L, ''Domanda?'', ''["Solo"]'', 24)', (select v from ctx where k='L1')), '2 a 5');
select t.fails('poll durata fuori range', format('select public.create_poll(%L, ''Domanda?'', ''["a","b"]'', 100)', (select v from ctx where k='L1')), 'Durata');
select t.fails('poll opzioni duplicate', format('select public.create_poll(%L, ''Domanda?'', ''["a","a"]'', 2)', (select v from ctx where k='L1')), 'diverse');
select public.create_poll((select v::uuid from ctx where k='L1'), 'Seconda?', '["si","no"]', 2);
select t.fails('max 2 aperti', format('select public.create_poll(%L, ''Terza?'', ''["si","no"]'', 2)', (select v from ctx where k='L1')), '2 sondaggi');
select public.vote_poll((select v::uuid from ctx where k='poll1'), 1);
select t.fails('voto unico', format('select public.vote_poll(%L, 0)', (select v from ctx where k='poll1')), 'già votato');
select t.fails('opzione fuori range', format('select public.vote_poll(%L, 9)', (select v from ctx where k='poll1')), 'non valida');
select t.as_user('00000000-0000-0000-0000-000000000006');
select public.vote_poll((select v::uuid from ctx where k='poll1'), 1);
select t.eq('conteggi', (select counts from public.league_polls((select v::uuid from ctx where k='L1')) where id = (select v::uuid from ctx where k='poll1')), array[0,2,0]);
select t.eq('mio voto', (select my_vote from public.league_polls((select v::uuid from ctx where k='L1')) where id = (select v::uuid from ctx where k='poll1')), 1);
select t.as_user('00000000-0000-0000-0000-000000000004');
select t.fails('outsider non legge i sondaggi', format('select * from public.league_polls(%L)', (select v from ctx where k='L1')), 'Non fai parte');
select t.fails('outsider non vota', format('select public.vote_poll(%L, 0)', (select v from ctx where k='poll1')), 'Non fai parte');
reset role;
update public.polls set closes_at = now() - interval '1 minute' where id = (select v::uuid from ctx where k='poll1');
set role authenticated; select t.as_user('00000000-0000-0000-0000-000000000001');
select t.fails('voto su sondaggio chiuso', format('select public.vote_poll(%L, 0)', (select v from ctx where k='poll1')), 'chiuso');

-- ── G. Follow e feed ─────────────────────────────────────────────
select t.as_user('00000000-0000-0000-0000-000000000006');
select t.eq('segui', public.toggle_follow('00000000-0000-0000-0000-000000000003'), true);
select t.fails('non segui te stesso', format('select public.toggle_follow(%L)', '00000000-0000-0000-0000-000000000006'), 'te stesso');
select t.eq('follow_stats', (select followers from public.follow_stats('00000000-0000-0000-0000-000000000003')), 1);
select t.eq('i_follow', (select i_follow from public.follow_stats('00000000-0000-0000-0000-000000000003')), true);
select t.eq('my_follows', (select count(*)::int from public.my_follows() where direction='following'), 1);
-- attività del seguito: scambio accettato (lega 1) + evento mercato in una lega NON condivisa
select t.as_user('00000000-0000-0000-0000-000000000003');
select public.create_team((select v::uuid from ctx where k='L1'), 'Team Player', array[(select v::uuid from ctx where k='P1')]);
select t.as_user('00000000-0000-0000-0000-000000000006');
select public.create_team((select v::uuid from ctx where k='L1'), 'Team Friend', array[(select v::uuid from ctx where k='P2')]);
reset role;
insert into public.events (league_id, team_id, event_key, label, kind, pts)
  select league_id, id, 'market_buy', '🛒 Acquisto mercato: Prof Rossi', 'shop', -10 from public.teams where name = 'Team Player';
-- seconda lega, a cui friend NON appartiene: l'attività di player lì non deve comparire
insert into public.leagues (id, name, code, owner_id) values ('11111111-1111-1111-1111-111111111111', 'Altra', 'ZZZZZZ', '00000000-0000-0000-0000-000000000003');
insert into public.league_members (league_id, user_id, role) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000003', 'coadmin');
insert into public.teams (id, league_id, owner_id, name) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000003', 'Segreta');
insert into public.events (league_id, team_id, event_key, label, kind, pts)
  values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'market_sell', '💰 Vendita mercato: Segreto', 'shop', 10);
set role authenticated; select t.as_user('00000000-0000-0000-0000-000000000006');
select t.eq('feed: attività condivisa visibile', (select count(*)::int from public.follow_feed() where kind='mercato' and text like '%Acquisto mercato: Prof Rossi%'), 1);
select t.eq('feed: nessun leak da lega non condivisa', (select count(*)::int from public.follow_feed() where text like '%Segreto%'), 0);
select t.eq('feed_recent ordinato/limitato', (select count(*)::int from public.follow_feed_recent(1)), 1);
select t.eq('segui di nuovo = smetti', public.toggle_follow('00000000-0000-0000-0000-000000000003'), false);
select t.eq('feed vuoto senza follow', (select count(*)::int from public.follow_feed()), 0);

-- ── H. Parole vietate ────────────────────────────────────────────
select t.as_user('00000000-0000-0000-0000-000000000003');
select t.fails('non-admin non aggiunge parole', 'select public.admin_add_banned_word(''pirla'')', 'Permesso negato');
select t.fails('non-admin non elenca', 'select * from public.admin_list_banned_words()', 'Permesso negato');
select t.as_user('00000000-0000-0000-0000-000000000005');
select public.admin_add_banned_word('Pirla');
select t.eq('lista', (select count(*)::int from public.admin_list_banned_words()), 1);
select t.as_user('00000000-0000-0000-0000-000000000003');
select t.fails('chat bloccata', format('select public.send_message(%L, ''sei un PIRLA!'')', (select v from ctx where k='L1')), 'non consentite');
select t.fails('chat bloccata con leet/accenti', format('select public.send_message(%L, ''p1rl@ tu'')', (select v from ctx where k='L1')), 'non consentite');
select t.eq('parola intera: "pirlare" passa', (public.send_message((select v::uuid from ctx where k='L1'), 'non pirlare'::text)) is not null, true);
select t.fails('sondaggio bloccato', format('select public.create_poll(%L, ''Chi è il pirla?'', ''["a","b"]'', 2)', (select v from ctx where k='L1')), 'non consentite');
select t.fails('proposta bloccata', format('select public.propose_event(%L, %L, ''video'', ''che pirla'')', (select v from ctx where k='L1'), (select v from ctx where k='P3')), 'non consentite');
select t.as_user('00000000-0000-0000-0000-000000000005');
select public.admin_remove_banned_word('pirla');
select t.eq('lista vuota', (select count(*)::int from public.admin_list_banned_words()), 0);

-- ── J. Push ──────────────────────────────────────────────────────
select t.as_user('00000000-0000-0000-0000-000000000003');
select public.save_push_subscription('https://push.example/abc', 'p256', 'authsecret');
select t.fails('endpoint non https', 'select public.save_push_subscription(''http://x'', ''a'', ''b'')', 'non valido');
select t.as_user('00000000-0000-0000-0000-000000000006');
select public.save_push_subscription('https://push.example/abc', 'p256b', 'auth2');   -- stesso dispositivo, altro utente
reset role;
select t.eq('subscription passata al nuovo utente', (select user_id::text from public.push_subscriptions where endpoint='https://push.example/abc'), '00000000-0000-0000-0000-000000000006');
set role authenticated; select t.as_user('00000000-0000-0000-0000-000000000003');
select public.delete_push_subscription('https://push.example/abc');   -- non sua: non deve cancellare
reset role;
select t.eq('delete di altri non agisce', (select count(*)::int from public.push_subscriptions), 1);
set role authenticated; select t.as_user('00000000-0000-0000-0000-000000000006');
select public.delete_push_subscription('https://push.example/abc');
reset role;
select t.eq('delete proprio', (select count(*)::int from public.push_subscriptions), 0);
set role authenticated;
select t.as_user('00000000-0000-0000-0000-000000000003');
select t.fails('client non legge le subscription', 'select * from public.push_subscriptions', 'permission denied');

-- ── K. Errori client ─────────────────────────────────────────────
select public.report_client_error('Boom', 'stack...', '/leghe/1');
select t.as_user('00000000-0000-0000-0000-000000000003');
do $$ begin for i in 1..19 loop perform public.report_client_error('e' || i); end loop; end $$;
select t.fails('rate limit 20/ora', 'select public.report_client_error(''uno di troppo'')', 'Troppe segnalazioni');
select t.fails('non-super non legge', 'select * from public.admin_list_client_errors()', 'Permesso negato');
select t.as_user('00000000-0000-0000-0000-000000000005');
select t.eq('super legge', (select count(*)::int >= 20 from public.admin_list_client_errors(300)), true);
set role anon; select set_config('request.jwt.claim.sub', '', false);
select t.fails('anon non segnala', 'select public.report_client_error(''x'')', 'permission denied');

-- ── L. Statistiche pubbliche ─────────────────────────────────────
select t.eq('public_stats come anon', (select (public.public_stats() ->> 'leagues')::int >= 1), true);
select t.eq('public_stats solo conteggi', (select array_agg(k order by k) from jsonb_object_keys(public.public_stats()) k), array['events','leagues','players']);
select t.fails('anon non vede funzioni interne', 'select public.contains_banned(''x'')', 'permission denied');
reset role;
select 'TUTTI I TEST 007 OK' as risultato;
