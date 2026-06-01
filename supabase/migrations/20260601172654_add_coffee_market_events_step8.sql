create table if not exists public.raw_market_event_items (
    id bigserial primary key,
    fetched_at timestamptz not null default now(),
    source_name text,
    source_url text,
    published_at timestamptz,
    title_raw text,
    summary_raw text,
    body_excerpt text,
    language text,
    detected_commodity text,
    detected_countries jsonb not null default '[]'::jsonb,
    detected_event_type text,
    raw_payload jsonb not null default '{}'::jsonb,
    processing_status text not null default 'pending'
        check (processing_status in ('pending', 'parsed', 'rejected', 'needs_human_review')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (source_url, published_at, title_raw)
);

create table if not exists public.fact_market_event (
    id bigserial primary key,
    event_date date not null,
    published_at timestamptz,
    commodity_group text not null default 'coffee',
    country_or_region text,
    country_iso text,
    event_type text not null
        check (
            event_type in (
                'weather',
                'crop_outlook',
                'harvest',
                'export_policy',
                'import_policy',
                'regulation',
                'logistics',
                'inventory',
                'futures_market',
                'currency_fx',
                'demand_signal',
                'supply_signal',
                'trade_flow',
                'company_event',
                'macro',
                'other'
            )
        ),
    event_title text not null,
    event_summary text,
    expected_impact_direction text not null
        check (expected_impact_direction in ('bullish', 'bearish', 'neutral', 'unclear')),
    expected_impact_area text not null
        check (
            expected_impact_area in (
                'price',
                'supply',
                'demand',
                'logistics',
                'policy',
                'regulation',
                'fx',
                'inventory',
                'trade_flow',
                'market_sentiment',
                'other'
            )
        ),
    impact_score numeric(4, 2) not null check (impact_score >= -3 and impact_score <= 3),
    time_horizon text not null
        check (time_horizon in ('short_term', 'medium_term', 'long_term', 'unclear')),
    confidence_score numeric(4, 3) not null check (confidence_score >= 0 and confidence_score <= 1),
    source_name text not null,
    source_url text not null,
    source_reliability_score numeric(4, 3) not null check (source_reliability_score >= 0 and source_reliability_score <= 1),
    fetched_at timestamptz not null default now(),
    event_cluster_id text,
    duplicate_of text,
    data_quality_flag text not null
        check (
            data_quality_flag in (
                'ok',
                'missing_event_date',
                'missing_source_url',
                'missing_event_title',
                'low_reliability_source',
                'possible_duplicate',
                'unclear_impact',
                'not_coffee_specific',
                'stale_event',
                'needs_human_review',
                'invalid_event_type',
                'invalid_impact_direction',
                'invalid_impact_score'
            )
        ),
    entities jsonb not null default '{}'::jsonb,
    raw_payload jsonb not null default '{}'::jsonb,
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (event_date, commodity_group, country_or_region, event_type, source_url)
);

create index if not exists idx_raw_market_event_items_source_published
    on public.raw_market_event_items (source_name, published_at desc);
create index if not exists idx_raw_market_event_items_status
    on public.raw_market_event_items (processing_status, fetched_at desc);

create index if not exists idx_fact_market_event_date
    on public.fact_market_event (event_date desc);
create index if not exists idx_fact_market_event_type
    on public.fact_market_event (event_type, event_date desc);
create index if not exists idx_fact_market_event_country
    on public.fact_market_event (country_iso, event_date desc);
create index if not exists idx_fact_market_event_quality
    on public.fact_market_event (data_quality_flag, confidence_score desc, event_date desc);
create index if not exists idx_fact_market_event_brief
    on public.fact_market_event (commodity_group, data_quality_flag, confidence_score, event_date desc);

drop trigger if exists trg_raw_market_event_items_updated_at on public.raw_market_event_items;
create trigger trg_raw_market_event_items_updated_at
before update on public.raw_market_event_items
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_fact_market_event_updated_at on public.fact_market_event;
create trigger trg_fact_market_event_updated_at
before update on public.fact_market_event
for each row
execute function public.sync_updated_at_column();

grant all privileges on public.raw_market_event_items to service_role;
grant all privileges on public.fact_market_event to service_role;
grant usage, select on sequence public.raw_market_event_items_id_seq to service_role;
grant usage, select on sequence public.fact_market_event_id_seq to service_role;
grant select on public.fact_market_event to anon, authenticated;

alter table public.raw_market_event_items enable row level security;
alter table public.fact_market_event enable row level security;

drop policy if exists "service manage raw market event items" on public.raw_market_event_items;
create policy "service manage raw market event items"
    on public.raw_market_event_items
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read market event fact" on public.fact_market_event;
create policy "public read market event fact"
    on public.fact_market_event
    for select
    using (true);

drop policy if exists "service manage market event fact" on public.fact_market_event;
create policy "service manage market event fact"
    on public.fact_market_event
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create or replace view public.vw_coffee_market_events_recent
with (security_invoker = true) as
select
    event_date,
    published_at,
    country_or_region,
    country_iso,
    event_type,
    event_title,
    event_summary,
    expected_impact_direction,
    expected_impact_area,
    impact_score,
    time_horizon,
    confidence_score,
    source_name,
    source_url,
    source_reliability_score,
    event_cluster_id,
    duplicate_of,
    data_quality_flag,
    entities,
    notes
from public.fact_market_event
where commodity_group = 'coffee'
  and data_quality_flag = 'ok'
  and confidence_score >= 0.60
  and event_date >= current_date - interval '30 days'
order by event_date desc, abs(impact_score) desc, confidence_score desc;

create or replace view public.vw_coffee_policy_watch
with (security_invoker = true) as
select
    event_date,
    published_at,
    country_or_region,
    country_iso,
    event_type,
    event_title,
    event_summary,
    expected_impact_direction,
    expected_impact_area,
    impact_score,
    time_horizon,
    confidence_score,
    source_name,
    source_url,
    source_reliability_score,
    data_quality_flag,
    notes
from public.fact_market_event
where commodity_group = 'coffee'
  and event_type in ('export_policy', 'import_policy', 'regulation')
  and data_quality_flag = 'ok'
order by event_date desc, abs(impact_score) desc;

create or replace view public.vw_coffee_supply_risk_events
with (security_invoker = true) as
select
    event_date,
    published_at,
    country_or_region,
    country_iso,
    event_type,
    event_title,
    event_summary,
    expected_impact_direction,
    expected_impact_area,
    impact_score,
    time_horizon,
    confidence_score,
    source_name,
    source_url,
    source_reliability_score,
    data_quality_flag,
    notes
from public.fact_market_event
where commodity_group = 'coffee'
  and event_type in ('weather', 'crop_outlook', 'harvest', 'supply_signal')
  and data_quality_flag = 'ok'
order by event_date desc, abs(impact_score) desc;

create or replace view public.vw_coffee_market_event_brief_candidates
with (security_invoker = true) as
select
    event_date,
    published_at,
    country_or_region,
    country_iso,
    event_type,
    event_title,
    event_summary,
    expected_impact_direction,
    expected_impact_area,
    impact_score,
    time_horizon,
    confidence_score,
    source_name,
    source_url,
    source_reliability_score,
    entities,
    notes
from public.fact_market_event
where commodity_group = 'coffee'
  and data_quality_flag = 'ok'
  and confidence_score >= 0.60
  and source_reliability_score >= 0.60
  and event_date >= current_date - interval '14 days'
order by abs(impact_score) desc, confidence_score desc, event_date desc;

create or replace view public.vw_coffee_market_event_qc_summary
with (security_invoker = true) as
select
    commodity_group,
    event_type,
    expected_impact_direction,
    data_quality_flag,
    count(*) as event_count,
    max(event_date) as latest_event_date
from public.fact_market_event
where commodity_group = 'coffee'
group by commodity_group, event_type, expected_impact_direction, data_quality_flag
order by event_count desc, latest_event_date desc;

grant select on public.vw_coffee_market_events_recent to anon, authenticated;
grant select on public.vw_coffee_policy_watch to anon, authenticated;
grant select on public.vw_coffee_supply_risk_events to anon, authenticated;
grant select on public.vw_coffee_market_event_brief_candidates to anon, authenticated;
grant select on public.vw_coffee_market_event_qc_summary to anon, authenticated;
