-- ============================================================================
--  Language Trainer · Supabase · Фаза 10 — составной ключ cards (user_id, id)
--  Скрипт идемпотентен: можно выполнять повторно без ошибок.
--  Как выполнить: Supabase → SQL Editor → New query → вставить всё целиком → Run.
--  Секретов/паролей здесь нет — только структура базы.
--
--  Зачем:
--   Клиент 1.9.13.1 начал назначать карточкам ДЕТЕРМИНИРОВАННЫЙ id = k+hash64(язык|слово).
--   Одно и то же слово у РАЗНЫХ аккаунтов теперь получает одинаковый id, а первичный
--   ключ cards был только id. ON CONFLICT(id) клиента при upsert лез в ЧУЖУЮ строку
--   другого пользователя, и RLS (auth.uid() = user_id) отбрасывал её с ошибкой
--   «new row violates row-level security policy (USING expression) for table "cards"».
--
--   Здесь первичный ключ становится СОСТАВНЫМ (user_id, id): у каждого пользователя
--   своё пространство id, чужой id больше не пересекается. RLS-политики не меняются
--   (они уже фильтруют по user_id); guard-триггер уточняется, чтобы читал СВОЮ строку
--   по user_id+id, а не по id глобально.
-- ============================================================================

-- ---------- 1. Снимаем старый первичный ключ (id) и ставим составной (user_id, id) ----------
alter table public.cards drop constraint if exists cards_pkey;
alter table public.cards add constraint cards_pkey primary key (user_id, id);

-- ---------- 2. Guard LWW: читать строку ТОЛЬКО своего пользователя (user_id + id) ----------
-- Раньше `where id = new.id` могло найти строку другого пользователя (совпавшие id)
-- и примерить её таймстампы к нашей записи. Теперь сверяемся ровно со своей строкой.
create or replace function public.cards_guard_lww()
returns trigger
language plpgsql
as $$
declare r record;
begin
  select id, user_id, lang, data, updated_at, prog_at
    into r from public.cards where user_id = new.user_id and id = new.id;
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

-- Триггер уже существует (Фаза 8); функцию пересоздали выше — этого достаточно.
-- Если на всякий случай триггер отсутствует, восстановим его:
drop trigger if exists cards_guard_lww_t on public.cards;
create trigger cards_guard_lww_t
  before insert or update on public.cards
  for each row execute function public.cards_guard_lww();

-- ---------- 3. Права ролей (подстраховка, не меняется) ----------
grant select, insert, update, delete on public.cards to authenticated;

-- ============================================================================
--  КОНЕЦ Фазы 10. Клиент (index.html) уже шлёт onConflict:'user_id,id'.
--  ВАЖНО: выполните этот скрипт ДО выкладки новой версии index.html на устройство —
--  иначе старый клиент с onConflict:'id' после смены ключа выдаст ошибку
--  «нет unique-ограничения». Порядок: SQL здесь → сразу выложить index.html 1.9.13.1.
-- ============================================================================
