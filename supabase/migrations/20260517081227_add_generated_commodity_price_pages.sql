create table if not exists public.generated_commodity_price_pages (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    commodity_slug text not null references public.commodities(slug) on delete cascade,
    category text,
    title text not null,
    excerpt text not null,
    answer_summary text not null,
    body_html text not null,
    body_text text not null,
    faq_json jsonb not null default '[]'::jsonb,
    seo_json jsonb not null default '{}'::jsonb,
    topic_tags text[] not null default '{}',
    thumbnail_url text,
    primary_price_type text not null
        check (primary_price_type in ('farm_gate', 'wholesale', 'retail', 'export')),
    render_mode text not null
        check (render_mode in ('regional_table', 'national_article')),
    headline_latest_price_vnd numeric(14, 2) not null,
    headline_latest_price_unit text not null default 'VND/kg',
    day_change_vnd numeric(14, 2) not null,
    day_change_pct numeric(8, 2) not null,
    change_7d_vnd numeric(14, 2) not null,
    change_7d_pct numeric(8, 2) not null,
    lowest_price_vnd numeric(14, 2) not null,
    highest_price_vnd numeric(14, 2) not null,
    price_spread_vnd numeric(14, 2) not null,
    location_count integer not null default 0 check (location_count >= 0),
    province_count integer not null default 0 check (province_count >= 0),
    region_label_count integer not null default 0 check (region_label_count >= 0),
    latest_observed_on date not null,
    national_scope_label text,
    region_rows_json jsonb not null default '[]'::jsonb,
    metrics_json jsonb not null default '{}'::jsonb,
    status text not null default 'draft'
        check (status in ('draft', 'published', 'stale')),
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (commodity_slug)
);

create table if not exists public.generated_commodity_price_page_snapshots (
    id uuid primary key default gen_random_uuid(),
    page_id uuid not null references public.generated_commodity_price_pages(id) on delete cascade,
    snapshot_date date not null,
    status text not null
        check (status in ('published', 'stale')),
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (page_id, snapshot_date)
);

create table if not exists public.generated_commodity_price_generation_runs (
    id uuid primary key default gen_random_uuid(),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running'
        check (status in ('running', 'success', 'partial', 'failed')),
    scope_filters jsonb not null default '{}'::jsonb,
    created_count integer not null default 0 check (created_count >= 0),
    updated_count integer not null default 0 check (updated_count >= 0),
    stale_count integer not null default 0 check (stale_count >= 0),
    skipped_count integer not null default 0 check (skipped_count >= 0),
    error_count integer not null default 0 check (error_count >= 0),
    errors_json jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_generated_commodity_price_pages_status_updated
    on public.generated_commodity_price_pages (status, updated_at desc);
create index if not exists idx_generated_commodity_price_pages_slug
    on public.generated_commodity_price_pages (slug);
create index if not exists idx_generated_commodity_price_pages_commodity
    on public.generated_commodity_price_pages (commodity_slug, updated_at desc);
create index if not exists idx_generated_commodity_price_pages_latest_observed
    on public.generated_commodity_price_pages (latest_observed_on desc);
create index if not exists idx_generated_commodity_price_pages_render_mode
    on public.generated_commodity_price_pages (render_mode, updated_at desc);

create index if not exists idx_generated_commodity_price_page_snapshots_page_date
    on public.generated_commodity_price_page_snapshots (page_id, snapshot_date desc);

create index if not exists idx_generated_commodity_price_generation_runs_status_started
    on public.generated_commodity_price_generation_runs (status, started_at desc);

drop trigger if exists trg_generated_commodity_price_pages_updated_at on public.generated_commodity_price_pages;
create trigger trg_generated_commodity_price_pages_updated_at
before update on public.generated_commodity_price_pages
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_generated_commodity_price_generation_runs_updated_at on public.generated_commodity_price_generation_runs;
create trigger trg_generated_commodity_price_generation_runs_updated_at
before update on public.generated_commodity_price_generation_runs
for each row
execute function public.sync_updated_at_column();

grant select on public.generated_commodity_price_pages to anon, authenticated;
grant all privileges on public.generated_commodity_price_pages to service_role;
grant all privileges on public.generated_commodity_price_page_snapshots to service_role;
grant all privileges on public.generated_commodity_price_generation_runs to service_role;

alter table public.generated_commodity_price_pages enable row level security;
alter table public.generated_commodity_price_page_snapshots enable row level security;
alter table public.generated_commodity_price_generation_runs enable row level security;

drop policy if exists "public read generated commodity price pages" on public.generated_commodity_price_pages;
create policy "public read generated commodity price pages"
    on public.generated_commodity_price_pages
    for select
    using (status = 'published');

drop policy if exists "service manage generated commodity price pages" on public.generated_commodity_price_pages;
create policy "service manage generated commodity price pages"
    on public.generated_commodity_price_pages
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service manage generated commodity price page snapshots" on public.generated_commodity_price_page_snapshots;
create policy "service manage generated commodity price page snapshots"
    on public.generated_commodity_price_page_snapshots
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service manage generated commodity price generation runs" on public.generated_commodity_price_generation_runs;
create policy "service manage generated commodity price generation runs"
    on public.generated_commodity_price_generation_runs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
