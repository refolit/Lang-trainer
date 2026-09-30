-- ============================================================================
--  Language Trainer · Supabase · Фаза 2 — схема, RLS, сиды, триггеры
--  Скрипт идемпотентен: можно выполнять повторно без ошибок.
--  Как выполнить: Supabase → SQL Editor → New query → вставить всё целиком → Run.
--  Секретов/паролей здесь нет — только структура базы.
-- ============================================================================

-- ---------- 1. Справочник языков ----------
create table if not exists public.languages (
  code        text primary key,
  name        text not null,
  rtl         boolean not null default false,
  has_strokes boolean not null default false,
  sort_order  integer not null default 0
);

alter table public.languages enable row level security;

drop policy if exists "languages_select_all" on public.languages;
create policy "languages_select_all" on public.languages
  for select using (true);

insert into public.languages (code, name, rtl, has_strokes, sort_order) values
  ('zh', '中文',      false, true,  1),
  ('en', 'English',   false, false, 2),
  ('tr', 'Türkçe',    false, false, 3),
  ('ar', 'العربية',   true,  false, 4)
on conflict (code) do update set
  name        = excluded.name,
  rtl         = excluded.rtl,
  has_strokes = excluded.has_strokes,
  sort_order  = excluded.sort_order;

-- ---------- 2. Профили пользователей ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  ui_lang     text not null default 'ru',
  active_lang text not null default 'zh',
  updated_at  bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Триггер: профиль создаётся автоматически при регистрации
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. Карточки ----------
create table if not exists public.cards (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  lang       text not null default 'zh',
  data       jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists cards_user_idx      on public.cards (user_id);
create index if not exists cards_user_lang_idx on public.cards (user_id, lang);

alter table public.cards enable row level security;

drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards
  for select using (auth.uid() = user_id);
drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards
  for insert with check (auth.uid() = user_id);
drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own" on public.cards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "cards_delete_own" on public.cards;
create policy "cards_delete_own" on public.cards
  for delete using (auth.uid() = user_id);

-- ---------- 4. Настройки пользователя (глобальные, не на язык) ----------
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 5. Статистика (отдельная на каждый язык) ----------
create table if not exists public.user_stats (
  user_id    uuid not null references auth.users (id) on delete cascade,
  lang       text not null default 'zh',
  data       jsonb not null default '{}'::jsonb,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, lang)
);

alter table public.user_stats enable row level security;

drop policy if exists "user_stats_select_own" on public.user_stats;
create policy "user_stats_select_own" on public.user_stats
  for select using (auth.uid() = user_id);
drop policy if exists "user_stats_insert_own" on public.user_stats;
create policy "user_stats_insert_own" on public.user_stats
  for insert with check (auth.uid() = user_id);
drop policy if exists "user_stats_update_own" on public.user_stats;
create policy "user_stats_update_own" on public.user_stats
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_stats_delete_own" on public.user_stats;
create policy "user_stats_delete_own" on public.user_stats
  for delete using (auth.uid() = user_id);

-- ---------- 6. Каталог-пример (общий, клиенту — только чтение) ----------
create table if not exists public.catalog_items (
  id          text primary key,
  lang        text not null default 'zh',
  kind        text not null default 'word',
  text        text not null,
  pinyin      text,
  translation jsonb not null default '{}'::jsonb,
  tag         text,
  sort_order  integer not null default 0
);

alter table public.catalog_items enable row level security;

drop policy if exists "catalog_items_select_all" on public.catalog_items;
create policy "catalog_items_select_all" on public.catalog_items
  for select using (true);

-- Стартовые слова (китайский)
insert into public.catalog_items (id, lang, kind, text, pinyin, translation, tag, sort_order) values
  ('cat-zh-001', 'zh', 'word', '你好',   'nǐ hǎo',    '{"ru": "привет"}',         'greeting', 1),
  ('cat-zh-002', 'zh', 'word', '谢谢',   'xièxie',    '{"ru": "спасибо"}',        'polite',   2),
  ('cat-zh-003', 'zh', 'word', '再见',   'zàijiàn',   '{"ru": "до свидания"}',    'greeting', 3),
  ('cat-zh-004', 'zh', 'word', '我爱你', 'wǒ ài nǐ',  '{"ru": "я тебя люблю"}',   'phrase',   4),
  ('cat-zh-005', 'zh', 'word', '中国',   'Zhōngguó',  '{"ru": "Китай"}',          'noun',     5),
  ('cat-zh-006', 'zh', 'word', '汉语',   'Hànyǔ',     '{"ru": "китайский язык"}', 'noun',     6),
  ('cat-zh-007', 'zh', 'word', '学习',   'xuéxí',     '{"ru": "учиться"}',        'verb',     7),
  ('cat-zh-008', 'zh', 'word', '老师',   'lǎoshī',    '{"ru": "учитель"}',        'noun',     8)
on conflict (id) do update set
  lang        = excluded.lang,
  kind        = excluded.kind,
  text        = excluded.text,
  pinyin      = excluded.pinyin,
  translation = excluded.translation,
  tag         = excluded.tag,
  sort_order  = excluded.sort_order;

-- ---------- 7. Права ролей (подстраховка) ----------
grant select on public.languages, public.catalog_items to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.cards, public.user_settings, public.user_stats to authenticated;

-- ============================================================================
--  КОНЕЦ основной схемы. Секцию Storage (bucket `recordings`) сюда НЕ включаем:
--  она трогает системную таблицу storage.objects — её выполняем отдельным
--  запросом из файла supabase/phase2-storage.sql, либо просто создаём bucket
--  в UI: Storage → New bucket → имя `recordings`, галочку «public» снять.
-- ============================================================================