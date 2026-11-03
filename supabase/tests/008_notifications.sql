-- Test 008: notifiche per risposta in chat, sondaggio, news, modalità app. Da eseguire dopo 001..008.
\set ON_ERROR_STOP on
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','a@x','{"username":"alice"}'),
 ('00000000-0000-0000-0000-0000000000b1','b@x','{"username":"bob"}'),
 ('00000000-0000-0000-0000-0000000000c1','c@x','{"username":"carlo"}');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select public.create_league('Notif') as lid \gset
select code from public.leagues where id = :'lid' \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select public.join_league(:'code');
-- alice scrive, bob risponde → alice riceve chat_reply; bob che risponde a se stesso no
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select public.send_message(:'lid','ciao a tutti') as m1 \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select public.send_message(:'lid','ciao alice', :'m1'::uuid) as m2 \gset
select public.send_message(:'lid','mi rispondo da solo', :'m2'::uuid);
-- bob crea un sondaggio → alice sì, bob no, carlo (fuori lega) no
select public.create_poll(:'lid','Gita sabato?','["si","no"]'::jsonb, 24);
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.notifications where user_id='00000000-0000-0000-0000-0000000000a1' and type='chat_reply' and payload->>'from'='bob';
  if n <> 1 then raise exception 'chat_reply ad alice: atteso 1, trovato %', n; end if;
  select count(*) into n from public.notifications where user_id='00000000-0000-0000-0000-0000000000b1' and type='chat_reply';
  if n <> 0 then raise exception 'auto-risposta non deve notificare, trovato %', n; end if;
  select count(*) into n from public.notifications where type='poll_new' and user_id='00000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'poll_new ad alice: atteso 1, trovato %', n; end if;
  select count(*) into n from public.notifications where type='poll_new' and user_id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1');
  if n <> 0 then raise exception 'poll_new non deve andare ad autore/estranei, trovato %', n; end if;
  -- news: tutti e 3
  insert into public.announcements(title, body, tag) values ('Prova','corpo','Update');
  select count(*) into n from public.notifications where type='news';
  if n <> 3 then raise exception 'news: attese 3 notifiche, trovate %', n; end if;
  -- manutenzione: tutti, una sola volta; stesso valore = nessuna notifica
  update public.settings set value = '"maintenance"' where key='app_mode';
  select count(*) into n from public.notifications where type='app_mode' and payload->>'mode'='maintenance';
  if n <> 3 then raise exception 'app_mode maintenance: attese 3, trovate %', n; end if;
  update public.settings set value = '"maintenance"' where key='app_mode';
  select count(*) into n from public.notifications where type='app_mode';
  if n <> 3 then raise exception 'stesso valore non deve rinotificare, trovate %', n; end if;
  -- upsert come fa il client
  insert into public.settings(key,value) values ('app_mode','"normal"') on conflict (key) do update set value = excluded.value;
  select count(*) into n from public.notifications where type='app_mode' and payload->>'mode'='normal';
  if n <> 3 then raise exception 'ritorno online: attese 3, trovate %', n; end if;
end $$;
select 'TUTTI I TEST 008 OK' as risultato;
