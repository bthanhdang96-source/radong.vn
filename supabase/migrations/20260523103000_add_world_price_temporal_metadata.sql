alter table public.world_prices
    add column if not exists observed_on date,
    add column if not exists crawl_recorded_at timestamptz,
    add column if not exists data_granularity text not null default 'unknown',
    add column if not exists temporal_coverage text not null default 'unknown',
    add column if not exists benchmark_type text not null default 'unknown',
    add column if not exists source_id text not null default 'legacy',
    add column if not exists source_license_note text,
    add column if not exists quality_grade text,
    add column if not exists contract_symbol text not null default '',
    add column if not exists source_observation_label text;

update public.world_prices
set
    observed_on = coalesce(observed_on, recorded_at::date),
    crawl_recorded_at = coalesce(crawl_recorded_at, recorded_at),
    data_granularity = coalesce(nullif(data_granularity, ''), raw_payload ->> 'dataGranularity', 'unknown'),
    temporal_coverage = coalesce(nullif(temporal_coverage, ''), raw_payload ->> 'temporalCoverage', 'unknown'),
    benchmark_type = coalesce(nullif(benchmark_type, ''), raw_payload ->> 'benchmarkType', 'unknown'),
    source_id = coalesce(nullif(source_id, ''), raw_payload ->> 'sourceId', 'legacy'),
    source_license_note = coalesce(source_license_note, raw_payload ->> 'sourceLicenseNote'),
    quality_grade = coalesce(quality_grade, raw_payload ->> 'qualityGrade'),
    contract_symbol = coalesce(nullif(contract_symbol, ''), raw_payload ->> 'contractSymbol', ''),
    source_observation_label = coalesce(source_observation_label, raw_payload ->> 'sourceObservationLabel');

alter table public.world_prices
    alter column observed_on set not null,
    alter column crawl_recorded_at set not null;

do $$
begin
    alter table public.world_prices
        add constraint chk_world_prices_data_granularity
        check (data_granularity in ('daily', 'weekly', 'monthly', 'period', 'as_published', 'unknown'));
exception
    when duplicate_object then null;
end $$;

do $$
begin
    alter table public.world_prices
        add constraint chk_world_prices_temporal_coverage
        check (temporal_coverage in ('exchange_session', 'calendar_day', 'report_period', 'calendar_week', 'calendar_month', 'as_published', 'unknown'));
exception
    when duplicate_object then null;
end $$;

do $$
begin
    alter table public.world_prices
        add constraint chk_world_prices_benchmark_type
        check (benchmark_type in ('indicator', 'futures', 'spot_export_benchmark', 'monthly_index', 'api', 'unknown'));
exception
    when duplicate_object then null;
end $$;

create unique index if not exists idx_world_prices_source_observed_unique
    on public.world_prices (source_id, commodity_slug, benchmark_type, observed_on, contract_symbol);

create index if not exists idx_world_prices_granularity_observed
    on public.world_prices (data_granularity, observed_on desc);

comment on column public.world_prices.recorded_at is
    'Legacy crawl timestamp. New writes should use crawl_recorded_at for crawl time and observed_on/data_granularity for source observation time.';
comment on column public.world_prices.observed_on is
    'Actual market/report date represented by the price. This is not necessarily the crawl date.';
comment on column public.world_prices.crawl_recorded_at is
    'Timestamp when the crawler/API job retrieved the observation.';
comment on column public.world_prices.data_granularity is
    'Temporal granularity of the world price: daily, weekly, monthly, period, as_published, or unknown.';
comment on column public.world_prices.temporal_coverage is
    'How to interpret observed_on: exchange_session, calendar_day, report_period, calendar_week, calendar_month, as_published, or unknown.';
comment on column public.world_prices.benchmark_type is
    'Benchmark class such as indicator, futures, spot_export_benchmark, monthly_index, or api.';

drop view if exists public.latest_world_prices_public;

create or replace view public.latest_world_prices_public
with (security_invoker = true) as
select distinct on (commodity_slug)
    id,
    recorded_at,
    observed_on,
    crawl_recorded_at,
    commodity_id,
    commodity_slug,
    exchange,
    price_raw as price_usd,
    price_unit_raw as price_unit,
    price_usd_kg,
    price_vnd_kg,
    exchange_rate,
    case when data_granularity = 'daily' then change_1d end as change_1d,
    case when data_granularity = 'daily' then change_1d_pct end as change_1d_pct,
    case when data_granularity = 'daily' then change_1w_pct end as change_1w_pct,
    volume,
    open_interest,
    data_granularity,
    temporal_coverage,
    benchmark_type,
    source_id,
    source_license_note,
    quality_grade,
    contract_symbol,
    source_observation_label,
    source_url,
    raw_payload
from public.world_prices
where (
    data_granularity = 'daily'
    and observed_on >= current_date - interval '10 days'
) or (
    data_granularity in ('weekly', 'as_published')
    and observed_on >= current_date - interval '60 days'
) or (
    data_granularity = 'monthly'
    and observed_on >= current_date - interval '400 days'
) or data_granularity = 'unknown'
order by
    commodity_slug,
    case data_granularity
        when 'daily' then 5
        when 'as_published' then 4
        when 'weekly' then 3
        when 'monthly' then 2
        else 1
    end desc,
    observed_on desc,
    crawl_recorded_at desc,
    id desc;

grant select on public.latest_world_prices_public to anon, authenticated;

drop materialized view if exists public.price_chain_summary;

create materialized view public.price_chain_summary as
with domestic_latest as (
    select distinct on (commodity_slug, price_type)
        commodity_slug,
        price_type,
        price_vnd,
        price_usd,
        province_code,
        source_name,
        source_type,
        recorded_at,
        confidence
    from public.price_observations
    where confidence >= 0.5
      and (
        (price_type = 'export' and recorded_at >= now() - interval '45 days')
        or
        (price_type <> 'export' and recorded_at >= now() - interval '7 days')
      )
    order by commodity_slug, price_type, recorded_at desc, id desc
),
world_latest as (
    select distinct on (commodity_slug)
        commodity_slug,
        exchange,
        price_usd_kg,
        price_vnd_kg,
        case when data_granularity = 'daily' then change_1d_pct end as change_1d_pct,
        case when data_granularity = 'daily' then change_1w_pct end as change_1w_pct,
        observed_on,
        crawl_recorded_at,
        data_granularity,
        benchmark_type
    from public.world_prices
    where (
        data_granularity = 'daily'
        and observed_on >= current_date - interval '10 days'
    ) or (
        data_granularity in ('weekly', 'as_published')
        and observed_on >= current_date - interval '60 days'
    ) or (
        data_granularity = 'monthly'
        and observed_on >= current_date - interval '400 days'
    )
    order by
        commodity_slug,
        case data_granularity
            when 'daily' then 5
            when 'as_published' then 4
            when 'weekly' then 3
            when 'monthly' then 2
            else 1
        end desc,
        observed_on desc,
        crawl_recorded_at desc,
        id desc
)
select
    d.commodity_slug,
    max(case when d.price_type = 'farm_gate' then d.price_vnd end) as farm_gate_vnd,
    max(case when d.price_type = 'wholesale' then d.price_vnd end) as wholesale_vnd,
    max(case when d.price_type = 'retail' then d.price_vnd end) as retail_vnd,
    max(case when d.price_type = 'export' then d.price_vnd end) as export_vnd,
    max(case when d.price_type = 'export' then d.price_usd end) as export_usd,
    w.exchange as world_exchange,
    w.price_usd_kg as world_usd_kg,
    w.price_vnd_kg as world_vnd_kg,
    w.change_1d_pct as world_change_1d_pct,
    w.change_1w_pct as world_change_1w_pct,
    w.crawl_recorded_at as world_updated_at,
    case
        when max(case when d.price_type = 'farm_gate' then d.price_vnd end) > 0
         and max(case when d.price_type = 'retail' then d.price_vnd end) > 0
        then round(
            (
                max(case when d.price_type = 'retail' then d.price_vnd end) -
                max(case when d.price_type = 'farm_gate' then d.price_vnd end)
            ) /
            max(case when d.price_type = 'farm_gate' then d.price_vnd end) * 100,
            1
        )
    end as retail_vs_farmgate_pct,
    case
        when max(case when d.price_type = 'farm_gate' then d.price_vnd end) > 0
         and max(case when d.price_type = 'export' then d.price_vnd end) > 0
        then round(
            (
                max(case when d.price_type = 'export' then d.price_vnd end) -
                max(case when d.price_type = 'farm_gate' then d.price_vnd end)
            ) /
            max(case when d.price_type = 'farm_gate' then d.price_vnd end) * 100,
            1
        )
    end as export_vs_farmgate_pct,
    max(d.recorded_at) as domestic_updated_at,
    now() as summary_updated_at
from domestic_latest d
left join world_latest w on w.commodity_slug = d.commodity_slug
group by
    d.commodity_slug,
    w.exchange,
    w.price_usd_kg,
    w.price_vnd_kg,
    w.change_1d_pct,
    w.change_1w_pct,
    w.crawl_recorded_at;

create unique index if not exists idx_price_chain_summary_slug
    on public.price_chain_summary (commodity_slug);

select public.refresh_curated_views();
