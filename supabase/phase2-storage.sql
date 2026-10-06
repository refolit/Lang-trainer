-- ============================================================================
--  Language Trainer · Supabase · Фаза 2 (часть 2, Фаза 6) — Storage bucket `recordings`
--  Выполнять ОТДЕЛЬНЫМ запросом, ПОСЛЕ того как прошёл supabase/phase2.sql.
--  Либо вместо этого создать bucket в UI: Storage → New bucket → имя
--  `recordings`, галочку «Public bucket» ВКЛЮЧИТЬ — тогда этот файл можно не запускать.
--  Секция идемпотентна: повторный запуск не ломает ничего.
--
--  МОДЕЛЬ (вариант C, Фаза 6): аудио НЕ приватное (это сгенерированные mp3
--  произношения, не голос пользователя), поэтому bucket ПУБЛИЧНЫЙ для чтения —
--  постоянный URL без подписи, проигрывание работает мгновенно и без лишнего
--  сетевого круга. Запись/удаление — только владельцу папки `user_id/...`.
-- ============================================================================

-- Фаза 2 создавала bucket как private. Фаза 6 переводит его в public:
update storage.buckets set public = true where id = 'recordings';
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', true)
on conflict (id) do update set public = true;

-- Политики записи/удаления: только владелец (первый сегмент пути = auth.uid()).
-- Чтение даёт флаг public выше (постоянный URL без подписи). НО select-политика владельцу
-- нужна и для запасного пути createSignedUrl (клиент пробует подписанный URL, если bucket
-- вдруг остался приватным): без select-политики createSignedUrl отвечает 403.
drop policy if exists "recordings_select_own" on storage.objects;
create policy "recordings_select_own" on storage.objects
  for select using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);
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