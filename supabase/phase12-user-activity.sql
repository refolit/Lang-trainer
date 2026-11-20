-- ============================================================================
-- Language Trainer · Supabase · Фаза 12 — мониторинг активности пользователей
-- Идемпотентный скрипт. Выполнить целиком в Supabase SQL Editor после phase11-admin.sql.
-- ============================================================================

create table if not exists public.user_activity_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  event_type   text not null check (event_type in (
    'app_open','session_start','activity',
    'sync_started','sync_completed','sync_changed','sync_error'
  )),
  occurred_at  timestamptz not null default now(),
  device_id    text not null default '',
  device_label text not null default '',
  app_version  text not null default '',
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists user_activity_events_user_time_idx
  on public.user_activity_events (user_id, occurred_at desc);
create index if not exists user_activity_events_type_time_idx
  on public.user_activity_events (event_type, occurred_at desc);

alter table public.user_activity_events enable row level security;

drop policy if exists "activity_select_own_or_admin" on public.user_activity_events;
create policy "activity_select_own_or_admin" on public.user_activity_events
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "activity_insert_own" on public.user_activity_events;
create policy "activity_insert_own" on public.user_activity_events
  for insert with check (auth.uid() = user_id);

grant select, insert on public.user_activity_events to authenticated;
grant usage, select on sequence public.user_activity_events_id_seq to authenticated;

-- Realtime доставляет строки только подписчику, которому RLS разрешает SELECT.
do $$
begin
  alter publication supabase_realtime add table public.user_activity_events;
exception
  when duplicate_object then null;
end $$;

create or replace function public.admin_activity_summary()
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
    select jsonb_agg(row_to_json(x) order by coalesce(x.last_seen_at, to_timestamp(0)) desc)
    from (
      select p.id, p.email, p.name,
        max(e.occurred_at) as last_seen_at,
        max(e.occurred_at) filter (where e.event_type = 'activity') as last_activity_at,
        max(e.occurred_at) filter (where e.event_type like 'sync_%') as last_sync_at,
        count(*) filter (where e.occurred_at >= now() - interval '1 day')::int as events_today,
        count(*) filter (where e.occurred_at >= now() - interval '7 days')::int as events_7d,
        count(*) filter (where e.event_type = 'session_start' and e.occurred_at >= now() - interval '30 days')::int as sessions_30d
      from public.profiles p
      left join public.user_activity_events e on e.user_id = p.id
      group by p.id, p.email, p.name
    ) x
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_activity_summary() to authenticated;

create or replace function public.admin_activity_events(p_limit integer default 50, p_before timestamptz default null)
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
  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.occurred_at desc)
    from (
      select e.id, e.user_id, coalesce(nullif(p.name,''), p.email, '(без имени)') as user_name,
        p.email, e.event_type, e.occurred_at, e.device_label, e.app_version, e.metadata
      from public.user_activity_events e
      left join public.profiles p on p.id=e.user_id
      where p_before is null or e.occurred_at < p_before
      order by e.occurred_at desc
      limit p_limit
    ) x
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_activity_events(integer, timestamptz) to authenticated;

-- ==========================================================================
-- КОНЕЦ Фазы 12
-- ============================================================================
