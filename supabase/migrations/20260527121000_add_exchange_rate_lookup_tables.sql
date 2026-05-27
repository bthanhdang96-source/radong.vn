create table if not exists public.exchange_rate_observations (
    id bigserial primary key,
    observed_on date not null,
    currency_code char(3) not null
        check (currency_code ~ '^[A-Z]{3}$'),
    currency_name text not null,
    base_currency char(3) not null default 'VND'
        check (base_currency = 'VND'),
    vnd_per_unit numeric(20, 8) not null
        check (vnd_per_unit > 0),
    source_id text not null,
    source_url text not null,
    source_license_note text not null,
    raw_payload jsonb not null default '{}'::jsonb,
    crawl_recorded_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (source_id, currency_code, observed_on)
);

create table if not exists public.exchange_rate_sync_runs (
    id uuid primary key default gen_random_uuid(),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running'
        check (status in ('running', 'success', 'partial', 'failed')),
    mode text not null
        check (mode in ('latest', 'backfill')),
    requested_days integer not null default 1
        check (requested_days >= 1 and requested_days <= 366),
    fetched_days integer not null default 0
        check (fetched_days >= 0),
    row_count integer not null default 0
        check (row_count >= 0),
    upsert_count integer not null default 0
        check (upsert_count >= 0),
    error_count integer not null default 0
        check (error_count >= 0),
    errors text[] not null default '{}',
    error_message text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_exchange_rate_observations_code_date
    on public.exchange_rate_observations (currency_code, observed_on desc);
create index if not exists idx_exchange_rate_observations_observed_on
    on public.exchange_rate_observations (observed_on desc);
create index if not exists idx_exchange_rate_sync_runs_started
    on public.exchange_rate_sync_runs (started_at desc);
create index if not exists idx_exchange_rate_sync_runs_status_started
    on public.exchange_rate_sync_runs (status, started_at desc);

drop trigger if exists trg_exchange_rate_observations_updated_at on public.exchange_rate_observations;
create trigger trg_exchange_rate_observations_updated_at
before update on public.exchange_rate_observations
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_exchange_rate_sync_runs_updated_at on public.exchange_rate_sync_runs;
create trigger trg_exchange_rate_sync_runs_updated_at
before update on public.exchange_rate_sync_runs
for each row
execute function public.sync_updated_at_column();

drop view if exists public.latest_exchange_rates_public;
create or replace view public.latest_exchange_rates_public
with (security_invoker = true) as
select distinct on (currency_code)
    id,
    observed_on,
    currency_code,
    currency_name,
    base_currency,
    vnd_per_unit,
    source_id,
    source_url,
    source_license_note,
    raw_payload,
    crawl_recorded_at,
    created_at,
    updated_at
from public.exchange_rate_observations
order by currency_code, observed_on desc, crawl_recorded_at desc, id desc;

grant select on public.exchange_rate_observations to anon, authenticated;
grant select on public.latest_exchange_rates_public to anon, authenticated;
grant all privileges on public.exchange_rate_observations to service_role;
grant all privileges on public.exchange_rate_sync_runs to service_role;

alter table public.exchange_rate_observations enable row level security;
alter table public.exchange_rate_sync_runs enable row level security;

drop policy if exists "public read exchange rate observations" on public.exchange_rate_observations;
create policy "public read exchange rate observations"
    on public.exchange_rate_observations
    for select
    using (true);

drop policy if exists "service manage exchange rate observations" on public.exchange_rate_observations;
create policy "service manage exchange rate observations"
    on public.exchange_rate_observations
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service manage exchange rate sync runs" on public.exchange_rate_sync_runs;
create policy "service manage exchange rate sync runs"
    on public.exchange_rate_sync_runs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
