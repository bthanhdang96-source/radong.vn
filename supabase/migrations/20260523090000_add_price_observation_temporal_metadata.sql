alter table public.price_observations
    add column if not exists data_granularity text not null default 'point_in_time',
    add column if not exists temporal_coverage text not null default 'observation_time',
    add column if not exists period_type text,
    add column if not exists period_code text,
    add column if not exists period_label text,
    add column if not exists period_year integer,
    add column if not exists period_month integer,
    add column if not exists period_number integer,
    add column if not exists period_start_date date,
    add column if not exists period_end_date date,
    add column if not exists aggregation_method text,
    add column if not exists geographic_scope text not null default 'market_or_region',
    add column if not exists source_detail text;

do $$
begin
    alter table public.price_observations
        add constraint chk_price_observations_data_granularity
        check (data_granularity in ('point_in_time', 'daily', 'period', 'monthly', 'unknown'));
exception
    when duplicate_object then null;
end $$;

do $$
begin
    alter table public.price_observations
        add constraint chk_price_observations_temporal_coverage
        check (temporal_coverage in ('observation_time', 'calendar_day', 'report_period', 'calendar_month', 'unknown'));
exception
    when duplicate_object then null;
end $$;

do $$
begin
    alter table public.price_observations
        add constraint chk_price_observations_geographic_scope
        check (geographic_scope in ('market_or_region', 'province', 'national', 'world', 'unknown'));
exception
    when duplicate_object then null;
end $$;

comment on column public.price_observations.recorded_at is
    'Timestamp when the observation was crawled/recorded by the system. For aggregate sources, use data_granularity and period_* columns to interpret the actual reporting period.';
comment on column public.price_observations.data_granularity is
    'Temporal granularity of the price value: point_in_time, daily, period, monthly, or unknown.';
comment on column public.price_observations.temporal_coverage is
    'How the value should be interpreted in time: observation_time, calendar_day, report_period, calendar_month, or unknown.';
comment on column public.price_observations.aggregation_method is
    'Method used to derive the value, for example unit_value_from_aggregate_quantity_value for customs export reports.';

with parsed as (
    select
        id,
        regexp_match(
            lower(coalesce(raw_payload #>> '{extra,reportCode}', raw_payload ->> 'periodCode', period_code, '')),
            '^([0-9]{4})-t([0-9]{1,2})-k([0-9]{1,2})$'
        ) as matched
    from public.price_observations
    where source_name = 'customs'
      and price_type = 'export'
),
period_parts as (
    select
        id,
        (matched)[1]::integer as report_year,
        (matched)[2]::integer as report_month,
        (matched)[3]::integer as report_number
    from parsed
    where matched is not null
)
update public.price_observations target
set
    data_granularity = 'period',
    temporal_coverage = 'report_period',
    period_type = coalesce(target.period_type, 'customs_semimonthly'),
    period_code = coalesce(
        target.period_code,
        target.raw_payload #>> '{extra,reportCode}',
        concat(period_parts.report_year, '-t', period_parts.report_month, '-k', period_parts.report_number)
    ),
    period_label = coalesce(
        target.period_label,
        concat('Ky ', period_parts.report_number, ' thang ', period_parts.report_month, ' nam ', period_parts.report_year)
    ),
    period_year = coalesce(target.period_year, period_parts.report_year),
    period_month = coalesce(target.period_month, period_parts.report_month),
    period_number = coalesce(target.period_number, period_parts.report_number),
    period_start_date = coalesce(
        target.period_start_date,
        make_date(period_parts.report_year, period_parts.report_month, case when period_parts.report_number = 1 then 1 else 16 end)
    ),
    period_end_date = coalesce(
        target.period_end_date,
        case
            when period_parts.report_number = 1 then make_date(period_parts.report_year, period_parts.report_month, 15)
            else (make_date(period_parts.report_year, period_parts.report_month, 1) + interval '1 month - 1 day')::date
        end
    ),
    aggregation_method = coalesce(target.aggregation_method, 'unit_value_from_aggregate_quantity_value'),
    geographic_scope = 'national',
    source_detail = coalesce(target.source_detail, 'customs_export_pdf_aggregate'),
    raw_payload = coalesce(target.raw_payload, '{}'::jsonb) || jsonb_build_object(
        'dataGranularity', 'period',
        'temporalCoverage', 'report_period',
        'periodType', coalesce(target.period_type, 'customs_semimonthly'),
        'periodCode', coalesce(target.period_code, target.raw_payload #>> '{extra,reportCode}'),
        'periodLabel', coalesce(target.period_label, concat('Ky ', period_parts.report_number, ' thang ', period_parts.report_month, ' nam ', period_parts.report_year)),
        'periodYear', coalesce(target.period_year, period_parts.report_year),
        'periodMonth', coalesce(target.period_month, period_parts.report_month),
        'periodNumber', coalesce(target.period_number, period_parts.report_number),
        'periodStartDate', coalesce(target.period_start_date, make_date(period_parts.report_year, period_parts.report_month, case when period_parts.report_number = 1 then 1 else 16 end))::text,
        'periodEndDate', coalesce(
            target.period_end_date,
            case
                when period_parts.report_number = 1 then make_date(period_parts.report_year, period_parts.report_month, 15)
                else (make_date(period_parts.report_year, period_parts.report_month, 1) + interval '1 month - 1 day')::date
            end
        )::text,
        'aggregationMethod', 'unit_value_from_aggregate_quantity_value',
        'geographicScope', 'national',
        'sourceDetail', 'customs_export_pdf_aggregate'
    )
from period_parts
where target.id = period_parts.id;

create index if not exists idx_price_observations_temporal_metadata
    on public.price_observations (data_granularity, temporal_coverage, period_end_date desc);

create index if not exists idx_price_observations_customs_period
    on public.price_observations (source_name, price_type, period_type, period_end_date desc)
    where source_name = 'customs' and price_type = 'export';

create or replace view public.customs_export_observations_public
with (security_invoker = true) as
select
    id,
    recorded_at as crawled_at,
    commodity_slug,
    article_title as report_title,
    source_url as report_url,
    price_vnd as unit_value_vnd_per_kg,
    price_usd as unit_value_usd_per_kg,
    nullif(raw_payload #>> '{extra,priceUsdPerTon}', '')::numeric as unit_value_usd_per_ton,
    nullif(raw_payload #>> '{extra,quantityTon}', '')::numeric as quantity_ton,
    nullif(raw_payload #>> '{extra,valueUsd}', '')::numeric as value_usd,
    nullif(raw_payload #>> '{extra,cumulativeQuantityTon}', '')::numeric as cumulative_quantity_ton,
    nullif(raw_payload #>> '{extra,cumulativeValueUsd}', '')::numeric as cumulative_value_usd,
    data_granularity,
    temporal_coverage,
    period_type,
    period_code,
    period_label,
    period_year,
    period_month,
    period_number,
    period_start_date,
    period_end_date,
    aggregation_method,
    geographic_scope,
    source_detail,
    raw_payload
from public.price_observations
where source_name = 'customs'
  and price_type = 'export';

grant select on public.customs_export_observations_public to anon, authenticated;
