-- ============================================================================
--  Language Trainer · Supabase · Фаза 8 — честный LWW: контент/прогресс + guard-триггеры
--  Скрипт идемпотентен: можно выполнять повторно без ошибок.
--  Как выполнить: Supabase → SQL Editor → New query → вставить всё целиком → Run.
--  Секретов/паролей здесь нет — только структура базы.
--
--  Что делает:
--   1. Добавляет колонку prog_at (прогресс SRS: коробка, счётчики, повторы) у карточек.
--      updated_at остаётся «возрастом контента» (слово/перевод/теги/звезда/аудио).
--      У старых строк prog_at = 0 = «возраст неизвестен» — такой прогресс никогда
--      не побеждает сторону с положительной меткой при авто-мерже.
--   2. Три guard-триггера: БД физически не принимает запись с таймстампом МЕНЬШЕ
--      хранимого. Это страховка от старого/багнутого клиента, который мог
--      перештамповать свою старую базу и затереть свежие данные другого устройства.
-- ============================================================================

-- ---------- 1. Колонка прогресса у карточек ----------
alter table public.cards add column if not exists prog_at bigint not null default 0;

-- ---------- 2. Guard: карточки (две метки — контент и прогресс) ----------
create or replace function public.cards_guard_lww()
returns trigger
language plpgsql
as $$
declare r record;
begin
  select id, user_id, lang, data, updated_at, prog_at
    into r from public.cards where id = new.id;
  if found then
    -- оба таймстампа входящей записи старее хранимых: запись отбрасываем целиком
    if coalesce(new.updated_at, 0) < coalesce(r.updated_at, 0)
       and coalesce(new.prog_at, 0) < coalesce(r.prog_at, 0) then
      new.id := r.id; new.user_id := r.user_id; new.lang := r.lang;
      new.data := r.data; new.updated_at := r.updated_at; new.prog_at := r.prog_at;
      return new;
    end if;
    -- иначе каждая метка независимо клампется к хранимой (не откатывается назад)
    if coalesce(new.updated_at, 0) < coalesce(r.updated_at, 0) then new.updated_at := r.updated_at; end if;
    if coalesce(new.prog_at, 0)   < coalesce(r.prog_at, 0)   then new.prog_at   := r.prog_at;   end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_guard_lww_t on public.cards;
create trigger cards_guard_lww_t
  before insert or update on public.cards
  for each row execute function public.cards_guard_lww();

-- ---------- 3. Guard: настройки (один таймстамп) ----------
create or replace function public.user_settings_guard_lww()
returns trigger
language plpgsql
as $$
declare r record;
begin
  select user_id, data, updated_at into r from public.user_settings where user_id = new.user_id;
  if found then
    if coalesce(new.updated_at, 0) < coalesce(r.updated_at, 0) then
      new.data := r.data; new.updated_at := r.updated_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_settings_guard_lww_t on public.user_settings;
create trigger user_settings_guard_lww_t
  before insert or update on public.user_settings
  for each row execute function public.user_settings_guard_lww();

-- ---------- 4. Guard: статистика (один таймстамп, на язык) ----------
create or replace function public.user_stats_guard_lww()
returns trigger
language plpgsql
as $$
declare r record;
begin
  select user_id, lang, data, updated_at
    into r from public.user_stats where user_id = new.user_id and lang = new.lang;
  if found then
    if coalesce(new.updated_at, 0) < coalesce(r.updated_at, 0) then
      new.data := r.data; new.updated_at := r.updated_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_stats_guard_lww_t on public.user_stats;
create trigger user_stats_guard_lww_t
  before insert or update on public.user_stats
  for each row execute function public.user_stats_guard_lww();

-- ============================================================================
--  КОНЕЦ Фазы 8. Клиент (index.html) шлёт upsert'ы с {updated_at, prog_at};
--  защита от затирания старым клиентом лежит здесь, на уровне БД.
-- ============================================================================