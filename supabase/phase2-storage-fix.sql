-- ============================================================================
--  Language Trainer · Supabase · Фаза 6.1 — ЧИНКА аудио в Storage `recordings`
--  (правки от 07.10.26: аудио не скачивалось на смартфон)
--
--  ПРИЧИНА: у bucket не было SELECT-политики. createSignedUrl идёт под вашим
--  пользователем через Storage API → RLS → без SELECT получалось 403 даже
--  у владельца, поэтому файл не качался на других устройствах.
--
--  СКРИПТ ИДЕМПОТЕНТЕН: можно выполнять повторно сколько угодно раз —
--  ничего не ломается. Выполнять ЦЕЛИКОМ, одним запросом, в SQL Editor.
--  После него (в том же окне) можно прогнать блок «ПРОВЕРКА» внизу.
-- ============================================================================

-- 1) Bucket есть и ПУБЛИЧНЫЙ (если его нет — создастся; если есть — только флаг public).
update storage.buckets set public = true where id = 'recordings';
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', true)
on conflict (id) do update set public = true;

-- 2) SELECT-политика (ГЛАВНАЯ ЧИНКА): чтение своего файла по первому сегменту пути = auth.uid().
--    Без неё createSignedUrl отвечает 403 и mp3 не скачивается на других устройствах.
drop policy if exists "recordings_select_own" on storage.objects;
create policy "recordings_select_own" on storage.objects
  for select using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);

-- 3) Остальные политики — как в phase2-storage.sql (повторяем на случай, если их не было).
drop policy if exists "recordings_insert_own" on storage.objects;
create policy "recordings_insert_own" on storage.objects
  for insert with check (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]
                        and storage.extension(name) = 'mp3');

drop policy if exists "recordings_update_own" on storage.objects;
create policy "recordings_update_own" on storage.objects
  for update using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "recordings_delete_own" on storage.objects;
create policy "recordings_delete_own" on storage.objects
  for delete using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
--  ПРОВЕРКА (выполняется ОТДЕЛЬНО, ПОСЛЕ основного блока):
--
--  1) bucket существует и public = true:
--
--      select id, name, public from storage.buckets where id = 'recordings';
--
--     В ответе одна строка: id = recordings, public = true.
--
--  2) все 4 политики на storage.objects на месте (select/insert/update/delete):
--
--      select policyname, cmd
--      from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--        and policyname like 'recordings%'
--      order by policyname;
--
--     В ответе 4 строки: recordings_select_own (SELECT), recordings_insert_own (INSERT),
--     recordings_update_own (UPDATE), recordings_delete_own (DELETE).
-- ============================================================================