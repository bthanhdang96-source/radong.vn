create table if not exists public.fact_export_unit_value (
    id bigserial primary key,
    period_type text not null check (period_type in ('A', 'M')),
    period_start date not null,
    period_label text not null,
    reporter_country text not null default 'Vietnam',
    reporter_iso text not null default 'VNM',
    partner_country text not null,
    partner_iso text,
    flow text not null default 'Export',
    commodity_group text not null,
    analysis_bucket text not null,
    hs6 char(6) not null check (hs6 ~ '^[0-9]{6}$'),
    hs_description text,
    export_value_usd numeric,
    export_quantity_ton numeric,
    export_unit_value_usd_per_ton numeric,
    export_value_usd_yoy_pct numeric,
    export_quantity_ton_yoy_pct numeric,
    export_unit_value_yoy_pct numeric,
    export_value_usd_mom_pct numeric,
    export_quantity_ton_mom_pct numeric,
    export_unit_value_mom_pct numeric,
    market_share_by_value_pct numeric,
    market_share_by_quantity_pct numeric,
    unit_value_rank_by_period integer,
    value_rank_by_period integer,
    quantity_rank_by_period integer,
    data_quality_flag text,
    unit_value_flag text not null
        check (unit_value_flag in ('ok', 'missing_value', 'missing_quantity', 'zero_quantity', 'low_volume', 'invalid_unit_value')),
    confidence_score numeric(4, 3) not null check (confidence_score >= 0 and confidence_score <= 1),
    notes text not null,
    source_name text not null,
    source_url text not null,
    fetched_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (period_type, period_label, reporter_iso, partner_iso, flow, hs6, source_name)
);

create index if not exists idx_fact_export_unit_value_period
    on public.fact_export_unit_value (period_type, period_start desc);
create index if not exists idx_fact_export_unit_value_partner
    on public.fact_export_unit_value (partner_iso, period_start desc);
create index if not exists idx_fact_export_unit_value_hs6_rank
    on public.fact_export_unit_value (hs6, period_type, period_label, value_rank_by_period);
create index if not exists idx_fact_export_unit_value_flag
    on public.fact_export_unit_value (unit_value_flag, period_start desc);

drop trigger if exists trg_fact_export_unit_value_updated_at on public.fact_export_unit_value;
create trigger trg_fact_export_unit_value_updated_at
before update on public.fact_export_unit_value
for each row
execute function public.sync_updated_at_column();

grant select on public.fact_export_unit_value to anon, authenticated;
grant all privileges on public.fact_export_unit_value to service_role;

alter table public.fact_export_unit_value enable row level security;

drop policy if exists "public read export unit value fact" on public.fact_export_unit_value;
create policy "public read export unit value fact"
    on public.fact_export_unit_value
    for select
    using (true);

drop policy if exists "service manage export unit value fact" on public.fact_export_unit_value;
create policy "service manage export unit value fact"
    on public.fact_export_unit_value
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create or replace view public.vw_coffee_top_markets_by_value
with (security_invoker = true) as
select
    period_type,
    period_label,
    partner_country,
    partner_iso,
    export_value_usd,
    export_quantity_ton,
    export_unit_value_usd_per_ton,
    market_share_by_value_pct,
    value_rank_by_period,
    unit_value_flag,
    confidence_score,
    source_name,
    fetched_at
from public.fact_export_unit_value
where hs6 = '090111'
  and value_rank_by_period <= 10
  and unit_value_flag in ('ok', 'low_volume');

create or replace view public.vw_coffee_premium_markets
with (security_invoker = true) as
with period_median as (
    select
        period_type,
        period_label,
        percentile_cont(0.5) within group (
            order by export_unit_value_usd_per_ton
        ) as median_unit_value
    from public.fact_export_unit_value
    where hs6 = '090111'
      and export_quantity_ton >= 10
      and unit_value_flag = 'ok'
    group by period_type, period_label
)
select
    f.period_type,
    f.period_label,
    f.partner_country,
    f.partner_iso,
    f.export_value_usd,
    f.export_quantity_ton,
    f.export_unit_value_usd_per_ton,
    p.median_unit_value,
    100.0 * (f.export_unit_value_usd_per_ton / nullif(p.median_unit_value, 0) - 1) as premium_vs_median_pct,
    f.confidence_score,
    f.source_name,
    f.fetched_at
from public.fact_export_unit_value f
join period_median p
  on f.period_type = p.period_type
 and f.period_label = p.period_label
where f.hs6 = '090111'
  and f.export_quantity_ton >= 10
  and f.unit_value_flag = 'ok';

create or replace view public.vw_coffee_export_summary_by_period
with (security_invoker = true) as
select
    period_type,
    period_label,
    min(period_start) as period_start,
    sum(export_value_usd) as total_export_value_usd,
    sum(export_quantity_ton) as total_export_quantity_ton,
    sum(export_value_usd) / nullif(sum(export_quantity_ton), 0) as avg_export_unit_value_usd_per_ton,
    count(distinct partner_iso) as number_of_markets,
    min(source_name) as source_name,
    max(fetched_at) as fetched_at
from public.fact_export_unit_value
where hs6 = '090111'
group by period_type, period_label;

grant select on public.vw_coffee_top_markets_by_value to anon, authenticated;
grant select on public.vw_coffee_premium_markets to anon, authenticated;
grant select on public.vw_coffee_export_summary_by_period to anon, authenticated;

