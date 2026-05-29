create table if not exists public.raw_domestic_coffee_prices (
    id bigserial primary key,
    dedupe_key text not null unique,
    source_name text not null,
    source_url text,
    fetched_at timestamptz not null default now(),
    price_date date not null,
    commodity_group text not null default 'coffee',
    commodity_slug text not null default 'ca-phe-robusta',
    location_name text,
    province text,
    province_code char(3),
    district text,
    price_type text not null default 'domestic_farmgate_or_local',
    price_raw text,
    price_value numeric,
    currency text not null default 'VND',
    unit text not null default 'kg',
    change_raw text,
    change_value numeric,
    confidence_score numeric(4, 3) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
    raw_payload jsonb not null default '{}'::jsonb,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.raw_fx_usd_vnd (
    id bigserial primary key,
    source_name text not null,
    source_url text,
    fetched_at timestamptz not null default now(),
    rate_date date not null,
    currency_pair text not null default 'USD/VND',
    rate_type text not null
        check (rate_type in ('cash_buy', 'transfer_buy', 'sell', 'central_rate')),
    rate_value numeric not null check (rate_value > 0),
    raw_payload jsonb not null default '{}'::jsonb,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (rate_date, currency_pair, rate_type, source_name)
);

create table if not exists public.fact_domestic_coffee_price_usd (
    id bigserial primary key,
    price_date date not null,
    commodity_group text not null default 'coffee',
    commodity_slug text not null default 'ca-phe-robusta',
    location_name text,
    province text,
    province_code char(3),
    district text,
    price_type text not null default 'domestic_farmgate_or_local',
    price_vnd_per_kg numeric,
    price_vnd_per_ton numeric,
    fx_source_name text,
    fx_rate_type text,
    fx_rate_date date,
    usd_vnd_rate numeric,
    domestic_price_usd_per_ton numeric,
    source_name text not null,
    source_url text,
    fetched_at timestamptz,
    data_quality_flag text not null
        check (
            data_quality_flag in (
                'ok',
                'missing_domestic_price',
                'missing_fx_rate',
                'invalid_domestic_price',
                'invalid_fx_rate',
                'suspicious_price_unit',
                'fx_filled_previous_available'
            )
        ),
    confidence_score numeric(4, 3) not null check (confidence_score >= 0 and confidence_score <= 1),
    notes text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (price_date, province_code, district, source_name, fx_rate_type)
);

create index if not exists idx_raw_domestic_coffee_prices_date
    on public.raw_domestic_coffee_prices (price_date desc, province_code, source_name);
create index if not exists idx_raw_fx_usd_vnd_date
    on public.raw_fx_usd_vnd (rate_date desc, rate_type, source_name);
create index if not exists idx_fact_domestic_coffee_price_usd_date
    on public.fact_domestic_coffee_price_usd (price_date desc, province_code, source_name);
create index if not exists idx_fact_domestic_coffee_price_usd_flag
    on public.fact_domestic_coffee_price_usd (data_quality_flag, price_date desc);

drop trigger if exists trg_raw_domestic_coffee_prices_updated_at on public.raw_domestic_coffee_prices;
create trigger trg_raw_domestic_coffee_prices_updated_at
before update on public.raw_domestic_coffee_prices
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_raw_fx_usd_vnd_updated_at on public.raw_fx_usd_vnd;
create trigger trg_raw_fx_usd_vnd_updated_at
before update on public.raw_fx_usd_vnd
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_fact_domestic_coffee_price_usd_updated_at on public.fact_domestic_coffee_price_usd;
create trigger trg_fact_domestic_coffee_price_usd_updated_at
before update on public.fact_domestic_coffee_price_usd
for each row
execute function public.sync_updated_at_column();

grant select on public.raw_domestic_coffee_prices to anon, authenticated;
grant select on public.raw_fx_usd_vnd to anon, authenticated;
grant select on public.fact_domestic_coffee_price_usd to anon, authenticated;
grant all privileges on public.raw_domestic_coffee_prices to service_role;
grant all privileges on public.raw_fx_usd_vnd to service_role;
grant all privileges on public.fact_domestic_coffee_price_usd to service_role;

alter table public.raw_domestic_coffee_prices enable row level security;
alter table public.raw_fx_usd_vnd enable row level security;
alter table public.fact_domestic_coffee_price_usd enable row level security;

drop policy if exists "public read domestic coffee raw prices" on public.raw_domestic_coffee_prices;
create policy "public read domestic coffee raw prices"
    on public.raw_domestic_coffee_prices
    for select
    using (true);

drop policy if exists "service manage domestic coffee raw prices" on public.raw_domestic_coffee_prices;
create policy "service manage domestic coffee raw prices"
    on public.raw_domestic_coffee_prices
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read usd vnd raw fx" on public.raw_fx_usd_vnd;
create policy "public read usd vnd raw fx"
    on public.raw_fx_usd_vnd
    for select
    using (true);

drop policy if exists "service manage usd vnd raw fx" on public.raw_fx_usd_vnd;
create policy "service manage usd vnd raw fx"
    on public.raw_fx_usd_vnd
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read domestic coffee price usd fact" on public.fact_domestic_coffee_price_usd;
create policy "public read domestic coffee price usd fact"
    on public.fact_domestic_coffee_price_usd
    for select
    using (true);

drop policy if exists "service manage domestic coffee price usd fact" on public.fact_domestic_coffee_price_usd;
create policy "service manage domestic coffee price usd fact"
    on public.fact_domestic_coffee_price_usd
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create or replace view public.vw_domestic_coffee_daily_avg
with (security_invoker = true) as
select
    price_date,
    avg(price_vnd_per_kg) as avg_price_vnd_per_kg,
    avg(domestic_price_usd_per_ton) as avg_domestic_price_usd_per_ton,
    min(price_vnd_per_kg) as min_price_vnd_per_kg,
    max(price_vnd_per_kg) as max_price_vnd_per_kg,
    count(distinct province_code) as province_count,
    count(*) as observations
from public.fact_domestic_coffee_price_usd
where data_quality_flag in ('ok', 'fx_filled_previous_available')
group by price_date;

create or replace view public.vw_domestic_coffee_latest_by_province
with (security_invoker = true) as
select *
from public.fact_domestic_coffee_price_usd
where price_date = (
    select max(price_date)
    from public.fact_domestic_coffee_price_usd
);

create or replace view public.vw_domestic_coffee_latest_preferred_by_province
with (security_invoker = true) as
select distinct on (province_code)
    *,
    case source_name
        when 'congthuong' then 100
        when 'nongnghiep' then 90
        when 'vietnambiz' then 80
        when 'banggianongsan' then 70
        else 50
    end as source_priority
from public.fact_domestic_coffee_price_usd
where data_quality_flag in ('ok', 'fx_filled_previous_available')
order by
    province_code,
    price_date desc,
    case source_name
        when 'congthuong' then 100
        when 'nongnghiep' then 90
        when 'vietnambiz' then 80
        when 'banggianongsan' then 70
        else 50
    end desc,
    fetched_at desc nulls last;

create or replace view public.vw_domestic_coffee_monthly_avg
with (security_invoker = true) as
select
    date_trunc('month', price_date)::date as month_start,
    to_char(date_trunc('month', price_date), 'YYYY-MM') as period_label,
    avg(price_vnd_per_kg) as avg_price_vnd_per_kg,
    avg(domestic_price_usd_per_ton) as avg_domestic_price_usd_per_ton,
    min(price_vnd_per_kg) as min_price_vnd_per_kg,
    max(price_vnd_per_kg) as max_price_vnd_per_kg,
    count(distinct province_code) as province_count,
    count(*) as observations
from public.fact_domestic_coffee_price_usd
where data_quality_flag in ('ok', 'fx_filled_previous_available')
group by 1, 2;

create or replace view public.vw_coffee_domestic_vs_export_unit_value
with (security_invoker = true) as
with export_summary as (
    select
        period_type,
        period_label,
        sum(export_value_usd) as total_export_value_usd,
        sum(export_quantity_ton) as total_export_quantity_ton,
        sum(export_value_usd) / nullif(sum(export_quantity_ton), 0) as avg_export_unit_value_usd_per_ton
    from public.fact_export_unit_value
    where hs6 = '090111'
    group by period_type, period_label
)
select
    d.period_label,
    d.avg_price_vnd_per_kg,
    d.avg_domestic_price_usd_per_ton,
    e.period_type as export_period_type,
    e.avg_export_unit_value_usd_per_ton,
    e.avg_export_unit_value_usd_per_ton - d.avg_domestic_price_usd_per_ton as export_vs_domestic_gap_usd_per_ton,
    100.0 * (
        e.avg_export_unit_value_usd_per_ton / nullif(d.avg_domestic_price_usd_per_ton, 0) - 1
    ) as export_vs_domestic_gap_pct,
    d.observations,
    'Directional benchmark only; not margin or profit.'::text as interpretation_note
from public.vw_domestic_coffee_monthly_avg d
join export_summary e
  on d.period_label = e.period_label;

grant select on public.vw_domestic_coffee_daily_avg to anon, authenticated;
grant select on public.vw_domestic_coffee_latest_by_province to anon, authenticated;
grant select on public.vw_domestic_coffee_latest_preferred_by_province to anon, authenticated;
grant select on public.vw_domestic_coffee_monthly_avg to anon, authenticated;
grant select on public.vw_coffee_domestic_vs_export_unit_value to anon, authenticated;
