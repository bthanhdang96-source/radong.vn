create table if not exists public.export_registry_entries (
    id uuid primary key default gen_random_uuid(),
    registry_type text not null
        check (registry_type in ('production_area', 'packing_facility')),
    source_url text not null,
    source_page integer not null check (source_page > 0),
    source_position integer not null check (source_position > 0),
    source_row_number integer check (source_row_number > 0),
    name text not null,
    address text,
    phone text,
    market text,
    province text,
    district text,
    commune text,
    approval_periods jsonb not null default '[]'::jsonb
        check (jsonb_typeof(approval_periods) = 'array'),
    raw_payload jsonb not null default '{}'::jsonb,
    content_hash text not null,
    crawled_at timestamptz not null default now(),
    run_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (registry_type, content_hash)
);

create table if not exists public.export_registry_crawl_runs (
    id uuid primary key default gen_random_uuid(),
    registry_type text not null
        check (registry_type in ('production_area', 'packing_facility', 'all')),
    source_url text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running'
        check (status in ('running', 'success', 'partial', 'failed')),
    page_count integer not null default 0 check (page_count >= 0),
    item_count integer not null default 0 check (item_count >= 0),
    inserted_count integer not null default 0 check (inserted_count >= 0),
    updated_count integer not null default 0 check (updated_count >= 0),
    error_message text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.export_registry_entries
    drop constraint if exists export_registry_entries_run_id_fkey;

alter table public.export_registry_entries
    add constraint export_registry_entries_run_id_fkey
    foreign key (run_id)
    references public.export_registry_crawl_runs(id)
    on delete set null;

create index if not exists idx_export_registry_entries_type_updated
    on public.export_registry_entries (registry_type, updated_at desc);
create index if not exists idx_export_registry_entries_market
    on public.export_registry_entries (market);
create index if not exists idx_export_registry_entries_province
    on public.export_registry_entries (province);
create index if not exists idx_export_registry_entries_name
    on public.export_registry_entries using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(address, '')));
create index if not exists idx_export_registry_crawl_runs_type_started
    on public.export_registry_crawl_runs (registry_type, started_at desc);

drop trigger if exists trg_export_registry_entries_updated_at on public.export_registry_entries;
create trigger trg_export_registry_entries_updated_at
before update on public.export_registry_entries
for each row
execute function public.sync_updated_at_column();

grant select on public.export_registry_entries to anon, authenticated;
grant all privileges on public.export_registry_entries to service_role;
grant all privileges on public.export_registry_crawl_runs to service_role;

alter table public.export_registry_entries enable row level security;
alter table public.export_registry_crawl_runs enable row level security;

drop policy if exists "public read export registry entries" on public.export_registry_entries;
create policy "public read export registry entries"
    on public.export_registry_entries
    for select
    using (true);

drop policy if exists "service manage export registry entries" on public.export_registry_entries;
create policy "service manage export registry entries"
    on public.export_registry_entries
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service manage export registry crawl runs" on public.export_registry_crawl_runs;
create policy "service manage export registry crawl runs"
    on public.export_registry_crawl_runs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
