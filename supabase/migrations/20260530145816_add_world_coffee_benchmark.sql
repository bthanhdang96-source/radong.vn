create table if not exists public.fact_world_coffee_benchmark (
    id bigserial primary key,
    price_date date not null,
    commodity_group text not null default 'coffee',
    benchmark_name text not null,
    benchmark_type text not null
        check (benchmark_type in ('futures', 'spot_benchmark', 'monthly_commodity_price', 'indicator_price', 'proxy')),
    contract_code text,
    contract_month text,
    price_value numeric,
    currency text,
    unit text,
    price_usd_per_ton numeric,
    source_name text not null,
    source_url text,
    fetched_at timestamptz not null default now(),
    data_quality_flag text not null
        check (
            data_quality_flag in (
                'ok',
                'missing_price',
                'missing_currency',
                'missing_unit',
                'unsupported_unit',
                'missing_fx_conversion',
                'suspicious_price_low',
                'suspicious_price_high',
                'source_unavailable',
                'manual_review_required'
            )
        ),
    confidence_score numeric(4, 3) not null check (confidence_score >= 0 and confidence_score <= 1),
    notes text,
    raw_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (
        price_date,
        benchmark_name,
        benchmark_type,
        contract_code,
        contract_month,
        source_name
    )
);

create index if not exists idx_fact_world_coffee_benchmark_date
    on public.fact_world_coffee_benchmark (price_date desc, benchmark_name);
create index if not exists idx_fact_world_coffee_benchmark_type
    on public.fact_world_coffee_benchmark (benchmark_type, price_date desc);
create index if not exists idx_fact_world_coffee_benchmark_quality
    on public.fact_world_coffee_benchmark (data_quality_flag, price_date desc);

drop trigger if exists trg_fact_world_coffee_benchmark_updated_at on public.fact_world_coffee_benchmark;
create trigger trg_fact_world_coffee_benchmark_updated_at
before update on public.fact_world_coffee_benchmark
for each row
execute function public.sync_updated_at_column();

grant select on public.fact_world_coffee_benchmark to anon, authenticated;
grant all privileges on public.fact_world_coffee_benchmark to service_role;

alter table public.fact_world_coffee_benchmark enable row level security;

drop policy if exists "public read world coffee benchmark fact" on public.fact_world_coffee_benchmark;
create policy "public read world coffee benchmark fact"
    on public.fact_world_coffee_benchmark
    for select
    using (true);

drop policy if exists "service manage world coffee benchmark fact" on public.fact_world_coffee_benchmark;
create policy "service manage world coffee benchmark fact"
    on public.fact_world_coffee_benchmark
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create or replace view public.vw_world_coffee_benchmark_daily
with (security_invoker = true) as
select
    price_date,
    commodity_group,
    benchmark_name,
    benchmark_type,
    contract_code,
    contract_month,
    price_value,
    currency,
    unit,
    price_usd_per_ton,
    source_name,
    source_url,
    fetched_at,
    confidence_score,
    data_quality_flag,
    notes
from public.fact_world_coffee_benchmark
where commodity_group = 'coffee'
order by price_date desc, benchmark_name;

create or replace view public.vw_world_coffee_benchmark_monthly
with (security_invoker = true) as
select
    date_trunc('month', price_date)::date as month_start,
    to_char(date_trunc('month', price_date), 'YYYY-MM') as period_label,
    benchmark_name,
    benchmark_type,
    avg(price_usd_per_ton) as avg_price_usd_per_ton,
    min(price_usd_per_ton) as min_price_usd_per_ton,
    max(price_usd_per_ton) as max_price_usd_per_ton,
    count(*) as observations,
    min(confidence_score) as min_confidence_score,
    max(fetched_at) as fetched_at
from public.fact_world_coffee_benchmark
where commodity_group = 'coffee'
  and data_quality_flag = 'ok'
group by 1, 2, 3, 4
order by 1 desc, 3;

create or replace view public.vw_coffee_price_stack
with (security_invoker = true) as
with export_summary as (
    select
        period_label,
        sum(export_value_usd) as total_export_value_usd,
        sum(export_quantity_ton) as total_export_quantity_ton,
        sum(export_value_usd) / nullif(sum(export_quantity_ton), 0) as avg_export_unit_value_usd_per_ton
    from public.fact_export_unit_value
    where hs6 = '090111'
    group by period_label
),
domestic_summary as (
    select
        period_label,
        avg(avg_domestic_price_usd_per_ton) as avg_domestic_price_usd_per_ton,
        avg(avg_price_vnd_per_kg) as avg_domestic_price_vnd_per_kg
    from public.vw_domestic_coffee_monthly_avg
    group by period_label
),
benchmark_summary as (
    select distinct on (period_label)
        period_label,
        benchmark_name,
        benchmark_type,
        avg_price_usd_per_ton as avg_world_benchmark_usd_per_ton
    from public.vw_world_coffee_benchmark_monthly
    where benchmark_name ilike '%robusta%'
    order by
        period_label,
        case benchmark_type
            when 'indicator_price' then 1
            when 'monthly_commodity_price' then 2
            else 3
        end,
        benchmark_name
)
select
    coalesce(e.period_label, d.period_label, b.period_label) as period_label,
    e.avg_export_unit_value_usd_per_ton,
    d.avg_domestic_price_usd_per_ton,
    d.avg_domestic_price_vnd_per_kg,
    b.benchmark_name,
    b.benchmark_type,
    b.avg_world_benchmark_usd_per_ton,
    e.avg_export_unit_value_usd_per_ton - b.avg_world_benchmark_usd_per_ton as export_vs_benchmark_gap_usd_per_ton,
    100.0 * (
        e.avg_export_unit_value_usd_per_ton / nullif(b.avg_world_benchmark_usd_per_ton, 0) - 1
    ) as export_vs_benchmark_gap_pct,
    d.avg_domestic_price_usd_per_ton - b.avg_world_benchmark_usd_per_ton as domestic_vs_benchmark_gap_usd_per_ton,
    100.0 * (
        d.avg_domestic_price_usd_per_ton / nullif(b.avg_world_benchmark_usd_per_ton, 0) - 1
    ) as domestic_vs_benchmark_gap_pct,
    'Directional benchmark only; benchmark/futures indicators are not physical transaction prices, FOB prices, margins, or profit.'::text as interpretation_note
from export_summary e
full outer join domestic_summary d
  on e.period_label = d.period_label
full outer join benchmark_summary b
  on coalesce(e.period_label, d.period_label) = b.period_label
order by period_label desc;

grant select on public.vw_world_coffee_benchmark_daily to anon, authenticated;
grant select on public.vw_world_coffee_benchmark_monthly to anon, authenticated;
grant select on public.vw_coffee_price_stack to anon, authenticated;
