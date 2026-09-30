-- ============================================================================
--  Language Trainer · Supabase · Фаза 2 (часть 2) — Storage bucket `recordings`
--  Выполнять ОТДЕЛЬНЫМ запросом, ПОСЛЕ того как прошёл supabase/phase2.sql.
--  Либо вместо этого создать bucket в UI: Storage → New bucket → имя
--  `recordings`, галочку «public» снять — тогда этот файл можно не запускать.
--  Секция идемпотентна: повторный запуск не ломает ничего.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

drop policy if exists "recordings_select_own" on storage.objects;
create policy "recordings_select_own" on storage.objects
  for select using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "recordings_insert_own" on storage.objects;
create policy "recordings_insert_own" on storage.objects
  for insert with check (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "recordings_update_own" on storage.objects;
create policy "recordings_update_own" on storage.objects
  for update using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "recordings_delete_own" on storage.objects;
create policy "recordings_delete_own" on storage.objects
  for delete using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);