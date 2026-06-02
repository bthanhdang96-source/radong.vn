create table if not exists public.raw_freight_logistics_proxy (
    id bigserial primary key,
    fetched_at timestamptz not null default now(),
    source_name text not null,
    source_url text not null,
    source_id text,
    observation_date date,
    index_name text,
    proxy_type text,
    route_name text,
    origin_region text,
    destination_region text,
    freight_value numeric,
    currency text,
    unit text,
    relevance_to_coffee text,
    relevance_notes text,
    notes text,
    raw_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (source_name, source_url, observation_date, index_name, route_name)
);

create table if not exists public.fact_freight_logistics_proxy (
    id bigserial primary key,
    observation_date date not null,
    commodity_group text not null default 'coffee',
    index_name text not null,
    proxy_type text not null
        check (
            proxy_type in (
                'freight_index',
                'route_index',
                'port_congestion',
                'container_availability',
                'transit_disruption',
                'fuel_surcharge',
                'logistics_event',
                'other'
            )
        ),
    route_name text,
    origin_region text,
    destination_region text,
    freight_value numeric,
    currency text,
    unit text not null
        check (unit in ('USD/FEU', 'USD/TEU', 'index_points', 'days', 'text_event', 'unknown')),
    normalized_value_usd_per_feu numeric,
    wow_change_pct numeric,
    mom_change_pct numeric,
    yoy_change_pct numeric,
    relevance_to_coffee text not null
        check (relevance_to_coffee in ('high', 'medium', 'low', 'unclear')),
    relevance_notes text,
    source_name text not null,
    source_url text not null,
    fetched_at timestamptz not null default now(),
    data_quality_flag text not null
        check (
            data_quality_flag in (
                'ok',
                'missing_source_url',
                'missing_observation_date',
                'missing_unit',
                'unknown_unit',
                'index_points_not_usd',
                'possible_duplicate',
                'low_relevance_to_coffee',
                'suspicious_value',
                'needs_human_review'
            )
        ),
    confidence_score numeric(4, 3) not null check (confidence_score >= 0 and confidence_score <= 1),
    notes text not null default '',
    raw_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (observation_date, index_name, route_name, source_name)
);

create index if not exists idx_raw_freight_proxy_source_date
    on public.raw_freight_logistics_proxy (source_name, observation_date desc);
create index if not exists idx_fact_freight_proxy_date
    on public.fact_freight_logistics_proxy (observation_date desc);
create index if not exists idx_fact_freight_proxy_route
    on public.fact_freight_logistics_proxy (route_name, observation_date desc);
create index if not exists idx_fact_freight_proxy_quality
    on public.fact_freight_logistics_proxy (data_quality_flag, confidence_score desc, observation_date desc);
create index if not exists idx_fact_freight_proxy_month
    on public.fact_freight_logistics_proxy (commodity_group, proxy_type, observation_date desc);

drop trigger if exists trg_raw_freight_logistics_proxy_updated_at on public.raw_freight_logistics_proxy;
create trigger trg_raw_freight_logistics_proxy_updated_at
before update on public.raw_freight_logistics_proxy
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_fact_freight_logistics_proxy_updated_at on public.fact_freight_logistics_proxy;
create trigger trg_fact_freight_logistics_proxy_updated_at
before update on public.fact_freight_logistics_proxy
for each row
execute function public.sync_updated_at_column();

grant all privileges on public.raw_freight_logistics_proxy to service_role;
grant all privileges on public.fact_freight_logistics_proxy to service_role;
grant usage, select on sequence public.raw_freight_logistics_proxy_id_seq to service_role;
grant usage, select on sequence public.fact_freight_logistics_proxy_id_seq to service_role;
grant select on public.fact_freight_logistics_proxy to anon, authenticated;

alter table public.raw_freight_logistics_proxy enable row level security;
alter table public.fact_freight_logistics_proxy enable row level security;

drop policy if exists "service manage raw freight logistics proxy" on public.raw_freight_logistics_proxy;
create policy "service manage raw freight logistics proxy"
    on public.raw_freight_logistics_proxy
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read freight logistics proxy fact" on public.fact_freight_logistics_proxy;
create policy "public read freight logistics proxy fact"
    on public.fact_freight_logistics_proxy
    for select
    using (true);

drop policy if exists "service manage freight logistics proxy fact" on public.fact_freight_logistics_proxy;
create policy "service manage freight logistics proxy fact"
    on public.fact_freight_logistics_proxy
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create or replace view public.vw_freight_proxy_monthly
with (security_invoker = true) as
select
    date_trunc('month', observation_date)::date as month_start,
    to_char(date_trunc('month', observation_date), 'YYYY-MM') as period_label,
    index_name,
    route_name,
    origin_region,
    destination_region,
    avg(normalized_value_usd_per_feu) as avg_usd_per_feu,
    min(normalized_value_usd_per_feu) as min_usd_per_feu,
    max(normalized_value_usd_per_feu) as max_usd_per_feu,
    count(*) as observations,
    max(source_name) as source_name,
    max(source_url) as source_url
from public.fact_freight_logistics_proxy
where commodity_group = 'coffee'
  and proxy_type in ('freight_index', 'route_index')
group by 1, 2, 3, 4, 5, 6
order by month_start desc, index_name, route_name;

create or replace view public.vw_coffee_logistics_context
with (security_invoker = true) as
select
    observation_date,
    index_name,
    proxy_type,
    route_name,
    origin_region,
    destination_region,
    freight_value,
    currency,
    unit,
    normalized_value_usd_per_feu,
    wow_change_pct,
    mom_change_pct,
    yoy_change_pct,
    relevance_to_coffee,
    relevance_notes,
    source_name,
    source_url,
    confidence_score,
    data_quality_flag,
    notes
from public.fact_freight_logistics_proxy
where commodity_group = 'coffee'
  and relevance_to_coffee in ('high', 'medium')
order by observation_date desc, confidence_score desc;

create or replace view public.vw_coffee_logistics_events
with (security_invoker = true) as
select
    observation_date,
    index_name,
    proxy_type,
    route_name,
    origin_region,
    destination_region,
    relevance_to_coffee,
    relevance_notes,
    source_name,
    source_url,
    confidence_score,
    data_quality_flag,
    notes
from public.fact_freight_logistics_proxy
where commodity_group = 'coffee'
  and proxy_type in ('port_congestion', 'container_availability', 'transit_disruption', 'fuel_surcharge', 'logistics_event')
order by observation_date desc, confidence_score desc;

create or replace view public.vw_coffee_freight_mirror_gap_context
with (security_invoker = true) as
with freight_monthly as (
    select
        date_trunc('month', observation_date)::date as month_start,
        to_char(date_trunc('month', observation_date), 'YYYY-MM') as period_label,
        index_name,
        route_name,
        origin_region,
        destination_region,
        avg(normalized_value_usd_per_feu) as avg_usd_per_feu,
        max(relevance_to_coffee) as relevance_to_coffee,
        max(data_quality_flag) as freight_quality_flag,
        max(source_name) as source_name,
        max(source_url) as source_url
    from public.fact_freight_logistics_proxy
    where commodity_group = 'coffee'
      and proxy_type in ('freight_index', 'route_index')
      and relevance_to_coffee in ('high', 'medium')
    group by 1, 2, 3, 4, 5, 6
),
mirror as (
    select
        date_trunc('month', period_start)::date as month_start,
        period_label,
        market_country,
        market_iso,
        mirror_gap_pct,
        mirror_gap_flag,
        confidence_score as mirror_confidence_score
    from public.vw_coffee_mirror_gap_by_market
)
select
    m.period_label,
    m.month_start,
    m.market_country,
    m.market_iso,
    m.mirror_gap_pct,
    m.mirror_gap_flag,
    f.index_name,
    f.route_name,
    f.origin_region,
    f.destination_region,
    f.avg_usd_per_feu,
    f.relevance_to_coffee,
    f.freight_quality_flag,
    least(coalesce(m.mirror_confidence_score, 0), case when f.freight_quality_flag = 'ok' then 0.80 else 0.55 end) as confidence_score,
    f.source_name,
    f.source_url,
    'Freight proxy and mirror gap are contextual signals only; this view does not prove freight caused a mirror gap.'::text as interpretation_note
from mirror m
join freight_monthly f
  on m.month_start = f.month_start
 and (
    (m.market_iso in ('DEU', 'ITA', 'BEL', 'ESP', 'NLD', 'FRA', 'GBR') and lower(coalesce(f.destination_region, '')) like '%europe%')
    or (m.market_iso = 'USA' and lower(coalesce(f.destination_region, '')) like '%north america%')
    or (m.market_iso in ('JPN', 'KOR') and lower(coalesce(f.destination_region, '')) like any (array['%northeast asia%', '%japan%', '%korea%']))
 );

grant select on public.vw_freight_proxy_monthly to anon, authenticated;
grant select on public.vw_coffee_logistics_context to anon, authenticated;
grant select on public.vw_coffee_logistics_events to anon, authenticated;
grant select on public.vw_coffee_freight_mirror_gap_context to anon, authenticated;
