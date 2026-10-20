-- ============================================================================
--  Language Trainer · Supabase · Фаза 11 — админ-панель (просмотр/правка чужих словарей)
--  Скрипт идемпотентен: можно выполнять повторно без ошибок.
--  Как выполнить: Supabase → SQL Editor → New query → вставить всё целиком → Run.
--  Секретов/паролей здесь нет — только структура базы и роль админа.
--
--  Что делает:
--   1. Таблица public.admins — список id админов (сейчас один — вы).
--   2. Функция public.is_admin() (SECURITY DEFINER) — true, если текущий пользователь админ.
--   3. Расширяет RLS: админ видит/добавляет/правит/удаляет чужие карточки (cards),
--      а также видит чужие профили (profiles), статистику (user_stats) и журнал (sync_log).
--   4. RPC-функции для экрана админа (обе с защитой is_admin()):
--        admin_users()        — список пользователей (email/имя/число карточек/синки/последний синк).
--        admin_user_cards(id) — все карточки выбранного пользователя.
--
--  ВАЖНО: в самом низу впишите СВОЙ uid (Supabase → Authentication → Users → «User UID»).
--  Ниже уже вписан uid автора — если он другой, замените строку в блоке «5. Админ».
-- ============================================================================

-- 0. Подстраховка: колонка имени в profiles (если ранее добавлялась вручную из Dashboard).
alter table public.profiles add column if not exists name text;

-- ---------- 1. Таблица админов ----------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- ---------- 2. is_admin(): SECURITY DEFINER — читает admins от имени владельца функции ----------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to anon;

-- ---------- 3. RLS: админ = владелец любой строки (is_admin() в каждой политике) ----------
-- cards — админ видит, добавляет, правит и удаляет чужие карточки.
drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards
  for insert with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own" on public.cards
  for update using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "cards_delete_own" on public.cards;
create policy "cards_delete_own" on public.cards
  for delete using (auth.uid() = user_id or public.is_admin());

-- profiles — админ видит чужие профили (имя + email).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- user_stats — админ видит чужую статистику (только чтение).
drop policy if exists "user_stats_select_own" on public.user_stats;
create policy "user_stats_select_own" on public.user_stats
  for select using (auth.uid() = user_id or public.is_admin());

-- sync_log — админ видит чужой журнал синхронизаций (только чтение).
drop policy if exists "sync_log_select_own" on public.sync_log;
create policy "sync_log_select_own" on public.sync_log
  for select using (auth.uid() = user_id or public.is_admin());

-- ---------- 4. RPC для админ-панели (обе защищены is_admin() внутри) ----------

-- 4.1 Список пользователей: id, email, имя, число карточек, всего синков, последний синк.
create or replace function public.admin_users()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(u)
    from (
      select
        p.id,
        p.email,
        p.name,
        count(distinct c.id)::int as cards,
        (select count(*)::int from public.sync_log s where s.user_id = p.id) as syncs,
        (select max(s.ts) from public.sync_log s where s.user_id = p.id) as last_sync_at,
        (select max(c2.updated_at) from public.cards c2 where c2.user_id = p.id) as last_card_at
      from public.profiles p
      left join public.cards c on c.user_id = p.id
      group by p.id, p.email, p.name
    ) u
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_users() to authenticated;

-- 4.2 Карточки выбранного пользователя (просмотр/правка его словаря).
create or replace function public.admin_user_cards(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(c)
    from (
      select id, lang, data, updated_at, prog_at
      from public.cards
      where user_id = target
    ) c
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_user_cards(uuid) to authenticated;

-- ---------- 5. Админ ----------
-- Замените UUID на свой, если он отличается. on conflict — безопасно выполнять повторно.
insert into public.admins (user_id) values ('a682f72d-2a1d-476b-8d6c-e1de5f1d4397')
on conflict (user_id) do nothing;

-- ============================================================================
--  КОНЕЦ Фазы 11. Порядок: выполните этот SQL ДО открытия вкладки «Синхронизация»
--  в новой версии приложения. Клиент вызывает is_admin()/admin_users()/
--  admin_user_cards(id) и пишет карточки напрямую в cards под user_id выбранного
--  пользователя (разрешено расширенной RLS выше).
-- ============================================================================
