create table if not exists public.raw_un_comtrade_vietnam_coffee_exports (
    id bigserial primary key,
    sync_run_id uuid,
    source_name text not null default 'UN Comtrade',
    source_url text not null,
    fetched_at timestamptz not null default now(),
    query_params jsonb not null default '{}'::jsonb,
    type_code text not null,
    freq_code text not null,
    ref_period_id text,
    period text not null,
    reporter_code text not null,
    reporter_iso text not null,
    reporter_desc text not null,
    partner_code text not null,
    partner_iso text,
    partner_desc text not null,
    partner2_code text,
    partner2_iso text,
    partner2_desc text,
    flow_code text not null,
    flow_desc text not null,
    classification_code text,
    cmd_code text not null,
    cmd_desc text,
    customs_code text,
    customs_desc text,
    mos_code text,
    mot_code integer,
    mot_desc text,
    qty_unit_code text,
    qty_unit_abbr text,
    qty numeric,
    net_wgt_kg numeric,
    gross_wgt_kg numeric,
    trade_value_usd numeric,
    is_original_classification boolean,
    is_reported boolean,
    is_aggregate boolean,
    raw_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (period, reporter_code, partner_code, flow_code, cmd_code, source_name)
);

create table if not exists public.fact_vietnam_coffee_export_by_market (
    id bigserial primary key,
    period_type text not null check (period_type in ('A', 'M')),
    period_start date not null,
    period_label text not null,
    reporter_country text not null default 'Vietnam',
    reporter_iso text not null default 'VNM',
    partner_country text not null,
    partner_iso text,
    flow text not null default 'Export',
    commodity_group text not null default 'coffee',
    analysis_bucket text not null default 'coffee_raw_core',
    hs6 char(6) not null default '090111' check (hs6 ~ '^[0-9]{6}$'),
    hs_description text,
    quantity_raw numeric,
    quantity_unit_raw text,
    net_weight_kg numeric,
    quantity_ton numeric,
    value_usd numeric,
    source_name text not null default 'UN Comtrade',
    source_url text not null,
    fetched_at timestamptz not null,
    data_quality_flag text not null,
    confidence_score numeric(4, 3) not null check (confidence_score >= 0 and confidence_score <= 1),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (period_type, period_label, reporter_iso, partner_iso, flow, hs6, source_name)
);

create table if not exists public.coffee_export_market_sync_runs (
    id uuid primary key default gen_random_uuid(),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running'
        check (status in ('running', 'success', 'partial', 'failed')),
    from_year integer not null,
    to_year integer not null,
    period_type text not null check (period_type in ('A', 'M')),
    source_name text not null default 'UN Comtrade',
    request_count integer not null default 0 check (request_count >= 0),
    raw_row_count integer not null default 0 check (raw_row_count >= 0),
    fact_row_count integer not null default 0 check (fact_row_count >= 0),
    verification_row_count integer not null default 0 check (verification_row_count >= 0),
    warning_count integer not null default 0 check (warning_count >= 0),
    error_message text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.coffee_export_market_verifications (
    id bigserial primary key,
    sync_run_id uuid references public.coffee_export_market_sync_runs(id) on delete set null,
    period_type text not null check (period_type in ('A', 'M')),
    period_label text not null,
    reporter_iso text not null default 'VNM',
    partner_iso text not null,
    partner_country text not null,
    hs6 char(6) not null default '090111' check (hs6 ~ '^[0-9]{6}$'),
    verification_type text not null
        check (verification_type in ('un_comtrade_mirror', 'official_partner_portal_reference')),
    source_name text not null,
    source_url text not null,
    mirror_value_usd numeric,
    mirror_quantity_ton numeric,
    reported_value_usd numeric,
    reported_quantity_ton numeric,
    value_gap_pct numeric(8, 3),
    quantity_gap_pct numeric(8, 3),
    verification_status text not null
        check (verification_status in ('ok', 'warning', 'missing', 'not_automated')),
    notes text,
    verified_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (period_type, period_label, reporter_iso, partner_iso, hs6, verification_type, source_name)
);

create index if not exists idx_raw_coffee_exports_period_partner
    on public.raw_un_comtrade_vietnam_coffee_exports (period, partner_iso);
create index if not exists idx_raw_coffee_exports_hs_flow
    on public.raw_un_comtrade_vietnam_coffee_exports (cmd_code, flow_code);
create index if not exists idx_raw_coffee_exports_fetched_at
    on public.raw_un_comtrade_vietnam_coffee_exports (fetched_at desc);

create index if not exists idx_fact_coffee_exports_period
    on public.fact_vietnam_coffee_export_by_market (period_type, period_start desc);
create index if not exists idx_fact_coffee_exports_partner
    on public.fact_vietnam_coffee_export_by_market (partner_iso, period_start desc);
create index if not exists idx_fact_coffee_exports_quality
    on public.fact_vietnam_coffee_export_by_market (data_quality_flag, period_start desc);

create index if not exists idx_coffee_export_sync_runs_started
    on public.coffee_export_market_sync_runs (started_at desc);
create index if not exists idx_coffee_export_sync_runs_status
    on public.coffee_export_market_sync_runs (status, started_at desc);

create index if not exists idx_coffee_export_verifications_period_partner
    on public.coffee_export_market_verifications (period_type, period_label, partner_iso);
create index if not exists idx_coffee_export_verifications_status
    on public.coffee_export_market_verifications (verification_status, verified_at desc);

drop trigger if exists trg_raw_coffee_exports_updated_at on public.raw_un_comtrade_vietnam_coffee_exports;
create trigger trg_raw_coffee_exports_updated_at
before update on public.raw_un_comtrade_vietnam_coffee_exports
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_fact_coffee_exports_updated_at on public.fact_vietnam_coffee_export_by_market;
create trigger trg_fact_coffee_exports_updated_at
before update on public.fact_vietnam_coffee_export_by_market
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_coffee_export_sync_runs_updated_at on public.coffee_export_market_sync_runs;
create trigger trg_coffee_export_sync_runs_updated_at
before update on public.coffee_export_market_sync_runs
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_coffee_export_verifications_updated_at on public.coffee_export_market_verifications;
create trigger trg_coffee_export_verifications_updated_at
before update on public.coffee_export_market_verifications
for each row
execute function public.sync_updated_at_column();

grant select on public.fact_vietnam_coffee_export_by_market to anon, authenticated;
grant select on public.coffee_export_market_verifications to anon, authenticated;

grant all privileges on public.raw_un_comtrade_vietnam_coffee_exports to service_role;
grant all privileges on public.fact_vietnam_coffee_export_by_market to service_role;
grant all privileges on public.coffee_export_market_sync_runs to service_role;
grant all privileges on public.coffee_export_market_verifications to service_role;

alter table public.raw_un_comtrade_vietnam_coffee_exports enable row level security;
alter table public.fact_vietnam_coffee_export_by_market enable row level security;
alter table public.coffee_export_market_sync_runs enable row level security;
alter table public.coffee_export_market_verifications enable row level security;

drop policy if exists "service manage raw coffee export rows" on public.raw_un_comtrade_vietnam_coffee_exports;
create policy "service manage raw coffee export rows"
    on public.raw_un_comtrade_vietnam_coffee_exports
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read coffee export fact" on public.fact_vietnam_coffee_export_by_market;
create policy "public read coffee export fact"
    on public.fact_vietnam_coffee_export_by_market
    for select
    using (true);

drop policy if exists "service manage coffee export fact" on public.fact_vietnam_coffee_export_by_market;
create policy "service manage coffee export fact"
    on public.fact_vietnam_coffee_export_by_market
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service manage coffee export sync runs" on public.coffee_export_market_sync_runs;
create policy "service manage coffee export sync runs"
    on public.coffee_export_market_sync_runs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read coffee export verifications" on public.coffee_export_market_verifications;
create policy "public read coffee export verifications"
    on public.coffee_export_market_verifications
    for select
    using (true);

drop policy if exists "service manage coffee export verifications" on public.coffee_export_market_verifications;
create policy "service manage coffee export verifications"
    on public.coffee_export_market_verifications
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
