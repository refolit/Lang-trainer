-- ============================================================================
--  Language Trainer · Supabase · Фаза 9 — журнал синхронизаций (админ-статистика)
--  Скрипт идемпотентен: можно выполнять повторно без ошибок.
--  Как выполнить: Supabase → SQL Editor → New query → вставить всё целиком → Run.
--  Секретов/паролей здесь нет — только структура базы.
--
--  Что делает:
--   1. Таблица public.sync_log — по одной строке за каждый успешный doSync() клиента:
--      сколько карточек ушло в облако (push) и пришло (pull), отдельно по ЧАСТЯМ
--      (контент / прогресс), сколько конфликтов и в чью пользу, с какого устройства
--      и какой версии приложения. Время — серверное (часы устройств не участвуют).
--   2. Функция public.db_stats() (SECURITY DEFINER, только чтение) — агрегат для
--      экрана «Синхронизация»: число карточек, слов по языкам, примерный размер БД
--      (таблица cards + user_settings + user_stats). Вызывается клиентом как один rpc().
--
--  Доступ по RLS: каждый видит только СВОЙ журнал и СВОИ агрегаты (auth.uid() = user_id).
--  Отдельного «роль admin» не нужно: владелец аккаунта читает собственные данные.
-- ============================================================================

-- ---------- 1. Журнал синхронизаций ----------
create table if not exists public.sync_log (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null references auth.users (id) on delete cascade,
  ts                    timestamptz not null default now(),
  device_id             text not null default '',
  device_label          text not null default '',
  app_version           text not null default '',
  started_at            bigint not null default 0,   -- epoch-ms на устройстве (справочно)
  duration_ms           bigint not null default 0,

  -- сколько карточек ушло/пришло целиком (для краткого статуса)
  cards_pushed          integer not null default 0,
  cards_pulled          integer not null default 0,

  -- направления по частям: контент (слова/переводы/аудио) и прогресс (SRS)
  content_push          integer not null default 0,
  content_pull          integer not null default 0,
  progress_push         integer not null default 0,
  progress_pull         integer not null default 0,

  -- конфликты и в чью пользу решены
  conflict_content       integer not null default 0,
  conflict_progress      integer not null default 0,
  conflict_content_local integer not null default 0,
  conflict_content_cloud integer not null default 0,
  conflict_progress_local integer not null default 0,
  conflict_progress_cloud integer not null default 0,

  created_at            timestamptz not null default now()
);

create index if not exists sync_log_user_idx on public.sync_log (user_id, ts desc);

alter table public.sync_log enable row level security;

drop policy if exists "sync_log_select_own" on public.sync_log;
create policy "sync_log_select_own" on public.sync_log
  for select using (auth.uid() = user_id);
drop policy if exists "sync_log_insert_own" on public.sync_log;
create policy "sync_log_insert_own" on public.sync_log
  for insert with check (auth.uid() = user_id);
-- удалять журнал может только владелец (кнопка «Очистить всё» при желании)
drop policy if exists "sync_log_delete_own" on public.sync_log;
create policy "sync_log_delete_own" on public.sync_log
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.sync_log to authenticated;

-- ---------- 2. Агрегат db_stats() для экрана «Синхронизация» ----------
-- Возвращает jsonb: {cards, by_lang{lang→n}, db_bytes, sync_count}.
-- db_bytes — грубая оценка занятого места: octet_length(jsonb) по таблицам пользователя.
-- Аудио в Storage считается отдельно в клиенте (там есть rpc со storage), поэтому
-- здесь НЕ трогаем storage.objects — оно доступно только из Dashboard/Edge, не через RLS.
create or replace function public.db_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare out jsonb;
begin
  select jsonb_build_object(
    'cards',      (select count(*)::int from public.cards where user_id = auth.uid()),
    'by_lang',    coalesce((
                    select jsonb_object_agg(lang, n) from (
                      select lang, count(*)::int as n
                      from public.cards
                      where user_id = auth.uid()
                      group by lang
                      order by lang
                    ) t
                  ), '{}'::jsonb),
    'db_bytes',   (
                    coalesce((select sum(octet_length(data::text))::bigint from public.cards where user_id = auth.uid()), 0)
                  + coalesce((select octet_length(data::text)::bigint from public.user_settings where user_id = auth.uid()), 0)
                  + coalesce((select sum(octet_length(data::text))::bigint from public.user_stats where user_id = auth.uid()), 0)
                  ),
    'sync_count', (select count(*)::int from public.sync_log where user_id = auth.uid())
  ) into out;
  return out;
end;
$$;

grant execute on function public.db_stats() to authenticated;
grant execute on function public.db_stats() to anon;

-- ============================================================================
--  КОНЕЦ Фазы 9. Клиент: после каждого doSync() делает INSERT в sync_log;
--  экран «Ещё → Синхронизация» читает последние 30 строк журнала и вызывает
--  rpc('db_stats') для верхнего агрегата.
-- ============================================================================