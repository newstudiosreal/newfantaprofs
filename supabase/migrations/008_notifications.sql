-- FantaProf V2 — 008 altre notifiche
-- Risposta a un tuo messaggio in chat di lega, nuovo sondaggio, nuova news, cambio modalità app (manutenzione/estate/online).
-- Le notifiche per i messaggi privati (type 'dm') esistono già nel database.
-- Richiede la 007 (usa public._c_notify, che non fa mai fallire l'azione di chi scrive).
-- Idempotente: si può rieseguire.

-- ── Risposta a un messaggio in chat di lega ─────────────────────
create or replace function public._trg_chat_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_parent uuid; v_from text;
begin
  if new.reply_to is null then return new; end if;
  select author_id into v_parent from public.messages where id = new.reply_to;
  if v_parent is null or v_parent = new.author_id then return new; end if;
  select username::text into v_from from public.profiles where id = new.author_id;
  perform public._c_notify(v_parent, 'chat_reply',
    jsonb_build_object('league_id', new.league_id, 'message_id', new.id, 'from', coalesce(v_from, ''), 'preview', left(new.body, 80)));
  return new;
end $$;
drop trigger if exists trg_chat_reply on public.messages;
create trigger trg_chat_reply after insert on public.messages
  for each row when (new.reply_to is not null) execute function public._trg_chat_reply();

-- ── Nuovo sondaggio nella lega ───────────────────────────────────
create or replace function public._trg_poll_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_from text;
begin
  select username::text into v_from from public.profiles where id = new.author_id;
  for r in select user_id from public.league_members where league_id = new.league_id and user_id <> new.author_id loop
    perform public._c_notify(r.user_id, 'poll_new',
      jsonb_build_object('league_id', new.league_id, 'poll_id', new.id, 'question', new.question, 'from', coalesce(v_from, '')));
  end loop;
  return new;
end $$;
do $$ begin
  if to_regclass('public.polls') is not null then
    drop trigger if exists trg_poll_new on public.polls;
    create trigger trg_poll_new after insert on public.polls for each row execute function public._trg_poll_new();
  end if;
end $$;

-- ── Nuova news ───────────────────────────────────────────────────
create or replace function public._trg_news_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where banned_until is null or banned_until <= now() loop
    perform public._c_notify(r.id, 'news', jsonb_build_object('announcement_id', new.id, 'title', new.title));
  end loop;
  return new;
end $$;
drop trigger if exists trg_news_new on public.announcements;
create trigger trg_news_new after insert on public.announcements for each row execute function public._trg_news_new();

-- ── Cambio modalità app (normale / estate / manutenzione) ────────
create or replace function public._trg_app_mode() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_old text; v_new text;
begin
  v_new := new.value #>> '{}';
  v_old := case when tg_op = 'UPDATE' then old.value #>> '{}' else 'normal' end;
  if v_new is not distinct from v_old then return new; end if;
  for r in select id from public.profiles loop
    perform public._c_notify(r.id, 'app_mode', jsonb_build_object('mode', coalesce(v_new, 'normal')));
  end loop;
  return new;
end $$;
drop trigger if exists trg_app_mode on public.settings;
create trigger trg_app_mode after insert or update on public.settings
  for each row when (new.key = 'app_mode') execute function public._trg_app_mode();

-- Le funzioni trigger non sono chiamabili dal client.
revoke execute on function public._trg_chat_reply(), public._trg_poll_new(), public._trg_news_new(), public._trg_app_mode() from public, anon, authenticated;
