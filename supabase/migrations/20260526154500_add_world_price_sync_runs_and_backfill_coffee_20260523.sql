create table if not exists public.world_price_sync_runs (
    id uuid primary key default gen_random_uuid(),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running'
        check (status in ('running', 'success', 'partial', 'failed')),
    force_refresh boolean not null default false,
    trigger text not null default 'unknown'
        check (trigger in ('scheduler', 'admin_api', 'manual', 'unknown')),
    item_count integer not null default 0 check (item_count >= 0),
    upsert_count integer not null default 0 check (upsert_count >= 0),
    provider_error_count integer not null default 0 check (provider_error_count >= 0),
    provider_errors text[] not null default '{}',
    error_message text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_world_price_sync_runs_started
    on public.world_price_sync_runs (started_at desc);
create index if not exists idx_world_price_sync_runs_status_started
    on public.world_price_sync_runs (status, started_at desc);

grant all privileges on public.world_price_sync_runs to service_role;

alter table public.world_price_sync_runs enable row level security;

drop policy if exists "service manage world price sync runs" on public.world_price_sync_runs;
create policy "service manage world price sync runs"
    on public.world_price_sync_runs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

with ico_base as (
    select distinct on (wp.commodity_slug)
        wp.commodity_id,
        wp.commodity_slug,
        wp.exchange,
        wp.contract_month,
        coalesce(wp.contract_symbol, '') as contract_symbol,
        wp.price_raw,
        wp.price_unit_raw,
        wp.price_usd_kg,
        wp.price_vnd_kg,
        wp.exchange_rate,
        wp.source_url,
        wp.data_granularity,
        wp.temporal_coverage,
        wp.benchmark_type,
        wp.source_license_note,
        wp.quality_grade,
        wp.source_observation_label,
        wp.raw_payload
    from public.world_prices wp
    where wp.source_id = 'ico_daily'
      and wp.data_granularity = 'daily'
      and wp.observed_on = date '2026-05-22'
      and wp.commodity_slug in ('coffee-robusta', 'coffee-arabica')
    order by wp.commodity_slug, wp.crawl_recorded_at desc, wp.id desc
)
insert into public.world_prices (
    recorded_at,
    observed_on,
    crawl_recorded_at,
    commodity_id,
    commodity_slug,
    exchange,
    contract_month,
    contract_symbol,
    price_raw,
    price_unit_raw,
    price_usd_kg,
    price_vnd_kg,
    exchange_rate,
    change_1d,
    change_1d_pct,
    change_1w_pct,
    volume,
    open_interest,
    source_url,
    data_granularity,
    temporal_coverage,
    benchmark_type,
    source_id,
    source_license_note,
    quality_grade,
    source_observation_label,
    raw_payload
)
select
    timestamptz '2026-05-23T00:00:00Z' as recorded_at,
    date '2026-05-23' as observed_on,
    timestamptz '2026-05-23T00:00:00Z' as crawl_recorded_at,
    base.commodity_id,
    base.commodity_slug,
    base.exchange,
    base.contract_month,
    base.contract_symbol,
    base.price_raw,
    base.price_unit_raw,
    base.price_usd_kg,
    base.price_vnd_kg,
    base.exchange_rate,
    0 as change_1d,
    0 as change_1d_pct,
    0 as change_1w_pct,
    null as volume,
    null as open_interest,
    base.source_url,
    'daily' as data_granularity,
    'calendar_day' as temporal_coverage,
    coalesce(nullif(base.benchmark_type, ''), 'indicator') as benchmark_type,
    'manual_backfill' as source_id,
    'Backfill carry-forward from ICO daily 2026-05-22 for calendar day 2026-05-23.' as source_license_note,
    base.quality_grade,
    format('Manual backfill ICO carry-forward %s', date '2026-05-23') as source_observation_label,
    jsonb_set(
        jsonb_set(
            jsonb_set(
                coalesce(base.raw_payload, '{}'::jsonb),
                '{observedOn}',
                to_jsonb('2026-05-23'::text),
                true
            ),
            '{crawlRecordedAt}',
            to_jsonb('2026-05-23T00:00:00.000Z'::text),
            true
        ),
        '{backfillNote}',
        to_jsonb('carry-forward from ico_daily observed_on 2026-05-22'::text),
        true
    ) as raw_payload
from ico_base base
on conflict (source_id, commodity_slug, benchmark_type, observed_on, contract_symbol)
do nothing;
