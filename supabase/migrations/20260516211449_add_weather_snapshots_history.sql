create table if not exists public.weather_snapshots (
    id bigserial primary key,
    province_code varchar(3) not null references public.provinces(code) on delete cascade,
    snapshot_date date not null,
    fetched_at timestamptz not null default now(),
    payload jsonb not null,
    created_at timestamptz not null default now(),
    unique (province_code, fetched_at)
);

create index if not exists weather_snapshots_province_fetched_at_idx
    on public.weather_snapshots (province_code, fetched_at desc);

create index if not exists weather_snapshots_province_snapshot_date_idx
    on public.weather_snapshots (province_code, snapshot_date, fetched_at desc);

alter table public.weather_snapshots enable row level security;

drop policy if exists "public read weather cache" on public.weather_cache;
create policy "public read weather cache"
    on public.weather_cache
    for select
    using (true);

drop policy if exists "service weather cache" on public.weather_cache;
create policy "service weather cache"
    on public.weather_cache
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read weather snapshots" on public.weather_snapshots;
create policy "public read weather snapshots"
    on public.weather_snapshots
    for select
    using (true);

drop policy if exists "service weather snapshots" on public.weather_snapshots;
create policy "service weather snapshots"
    on public.weather_snapshots
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

grant select on public.weather_cache to anon, authenticated;
grant select on public.weather_snapshots to anon, authenticated;
