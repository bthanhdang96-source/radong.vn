set check_function_bodies = off;

drop view if exists public.latest_daily_price_summary;
drop view if exists public.latest_world_prices_public;

drop materialized view if exists public.price_chain_summary;
drop materialized view if exists public.latest_observation_details;
drop materialized view if exists public.daily_price_summary;
drop materialized view if exists public.regional_price_map;
drop materialized view if exists public.commodity_trends;
drop materialized view if exists public.weekly_price_history;

drop function if exists public.get_price_context_for_ai(text, text);
drop function if exists public.get_recent_median(int, text, int);
drop function if exists public.get_recent_median(int, text, text, int);
drop function if exists public.refresh_curated_views();
drop function if exists private.refresh_curated_views();

alter table public.commodities
    add column if not exists hs_code_export varchar(10),
    add column if not exists world_exchange text,
    add column if not exists world_price_unit text,
    add column if not exists world_to_kg_factor double precision;

update public.commodities
set
    hs_code_export = coalesce(hs_code_export, case slug
        when 'ca-phe-robusta' then '0901.11'
        when 'coffee-robusta' then '0901.11'
        when 'coffee-arabica' then '0901.12'
        when 'gao-noi-dia' then '1006.30'
        when 'rice-5pct' then '1006.30'
        when 'rice-25pct' then '1006.30'
        when 'rice-thai' then '1006.30'
        when 'ho-tieu' then '0904.11'
        when 'pepper-black' then '0904.11'
        when 'cashew' then '0801.31'
        when 'ca-tra' then '0301.99'
        when 'pangasius' then '0304.62'
        when 'shrimp' then '0306.17'
        when 'rubber-rss3' then '4001.10'
        when 'rubber-tsr20' then '4001.22'
        when 'corn' then '1005.90'
        when 'soybeans' then '1201.90'
        when 'sugar' then '1701.14'
        else hs_code
    end),
    world_exchange = coalesce(world_exchange, case slug
        when 'ca-phe-robusta' then 'ICE_LIFFE'
        when 'coffee-robusta' then 'ICE_LIFFE'
        when 'coffee-arabica' then 'ICE_US'
        when 'cocoa' then 'ICE_US'
        when 'rice-5pct' then 'WB'
        when 'rice-25pct' then 'WB'
        when 'rice-thai' then 'WB'
        when 'wheat' then 'CBOT'
        when 'corn' then 'CBOT'
        when 'soybeans' then 'CBOT'
        when 'rubber-rss3' then 'SGX'
        when 'rubber-tsr20' then 'SGX'
        when 'sugar' then 'ICE_US'
        when 'cotton' then 'ICE_US'
        when 'tea-avg' then 'WB'
        when 'palm-oil' then 'WB'
        when 'soybean-oil' then 'WB'
        when 'coconut-oil' then 'WB'
        when 'sunflower-oil' then 'WB'
        when 'groundnut-oil' then 'WB'
        when 'shrimp' then 'WB'
        when 'pangasius' then 'WB'
        when 'urea' then 'WB'
        when 'dap' then 'WB'
        else world_exchange
    end),
    world_price_unit = coalesce(world_price_unit, case slug
        when 'ca-phe-robusta' then 'USD/kg'
        when 'coffee-robusta' then 'USD/kg'
        when 'coffee-arabica' then 'USD/kg'
        when 'cocoa' then 'USD/kg'
        when 'rice-5pct' then 'USD/MT'
        when 'rice-25pct' then 'USD/MT'
        when 'rice-thai' then 'USD/MT'
        when 'wheat' then 'USD/MT'
        when 'corn' then 'USD/MT'
        when 'soybeans' then 'USD/MT'
        when 'cassava' then 'USD/MT'
        when 'pepper-black' then 'USD/kg'
        when 'cashew' then 'USD/kg'
        when 'rubber-rss3' then 'USD/kg'
        when 'rubber-tsr20' then 'USD/kg'
        when 'sugar' then 'USD/kg'
        when 'cotton' then 'USD/kg'
        when 'tea-avg' then 'USD/kg'
        when 'palm-oil' then 'USD/MT'
        when 'soybean-oil' then 'USD/MT'
        when 'coconut-oil' then 'USD/MT'
        when 'sunflower-oil' then 'USD/MT'
        when 'groundnut-oil' then 'USD/MT'
        when 'shrimp' then 'USD/kg'
        when 'pangasius' then 'USD/kg'
        when 'tuna' then 'USD/MT'
        when 'orange-juice' then 'USD/kg'
        when 'urea' then 'USD/MT'
        when 'dap' then 'USD/MT'
        else world_price_unit
    end),
    world_to_kg_factor = coalesce(world_to_kg_factor, case slug
        when 'ca-phe-robusta' then 1.0
        when 'coffee-robusta' then 1.0
        when 'coffee-arabica' then 1.0
        when 'cocoa' then 1.0
        when 'rice-5pct' then 0.001
        when 'rice-25pct' then 0.001
        when 'rice-thai' then 0.001
        when 'wheat' then 0.001
        when 'corn' then 0.001
        when 'soybeans' then 0.001
        when 'cassava' then 0.001
        when 'pepper-black' then 1.0
        when 'cashew' then 1.0
        when 'rubber-rss3' then 1.0
        when 'rubber-tsr20' then 1.0
        when 'sugar' then 1.0
        when 'cotton' then 1.0
        when 'tea-avg' then 1.0
        when 'palm-oil' then 0.001
        when 'soybean-oil' then 0.001
        when 'coconut-oil' then 0.001
        when 'sunflower-oil' then 0.001
        when 'groundnut-oil' then 0.001
        when 'shrimp' then 1.0
        when 'pangasius' then 1.0
        when 'tuna' then 0.001
        when 'orange-juice' then 1.0
        when 'urea' then 0.001
        when 'dap' then 0.001
        else world_to_kg_factor
    end);

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'raw_crawl_logs'
          and column_name = 'source'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'raw_crawl_logs'
          and column_name = 'source_name'
    ) then
        alter table public.raw_crawl_logs rename column source to source_name;
    end if;
end $$;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'ingestion_errors'
          and column_name = 'source'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'ingestion_errors'
          and column_name = 'source_name'
    ) then
        alter table public.ingestion_errors rename column source to source_name;
    end if;
end $$;

drop index if exists public.idx_ingestion_errors_source_time;
create index if not exists idx_ingestion_errors_source_name_time
    on public.ingestion_errors (source_name, failed_at desc);

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'price_observations'
          and column_name = 'market_type'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'price_observations'
          and column_name = 'price_type'
    ) then
        alter table public.price_observations rename column market_type to price_type;
    end if;
end $$;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'price_observations'
          and column_name = 'source'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'price_observations'
          and column_name = 'source_name'
    ) then
        alter table public.price_observations rename column source to source_name;
    end if;
end $$;

alter table public.price_observations
    add column if not exists market_name text,
    add column if not exists country_code varchar(3) not null default 'VNM',
    add column if not exists exchange_rate numeric(10, 2),
    add column if not exists source_type text,
    add column if not exists article_title text;

alter table public.price_observations
    alter column price_vnd type numeric(14, 2),
    alter column price_vnd drop not null,
    alter column price_usd type numeric(10, 4);

update public.price_observations
set
    source_type = coalesce(source_type, case source_name
        when 'congthuong' then 'crawl_gov'
        when 'fallback' then 'api_partner'
        else 'crawl_news'
    end),
    exchange_rate = coalesce(
        exchange_rate,
        case
            when price_usd is not null and price_usd > 0 and price_vnd is not null and price_vnd > 0
                then round((price_vnd / price_usd)::numeric, 2)
            when price_usd is not null and price_usd > 0 and price_vnd is null
                then 25850
            else 25850
        end
    ),
    country_code = coalesce(nullif(country_code, ''), 'VNM');

alter table public.price_observations
    alter column source_type set default 'crawl_news';

update public.price_observations
set source_type = 'crawl_news'
where source_type is null;

alter table public.price_observations
    alter column source_type set not null;

alter table public.price_observations
    drop constraint if exists chk_price_type,
    drop constraint if exists chk_export_has_usd,
    drop constraint if exists price_observations_market_type_check,
    drop constraint if exists price_observations_price_vnd_check,
    drop constraint if exists price_observations_price_usd_check;

alter table public.price_observations
    add constraint chk_price_type
    check (price_type in ('farm_gate', 'wholesale', 'retail', 'export'));

alter table public.price_observations
    add constraint chk_export_has_usd
    check (price_type <> 'export' or price_usd is not null);

alter table public.price_observations
    add constraint chk_price_observation_positive
    check (
        (price_vnd is null or price_vnd > 0)
        and (price_usd is null or price_usd > 0)
    );

drop index if exists public.idx_price_observations_market_type;
drop index if exists public.idx_price_observations_commodity_time;
drop index if exists public.idx_price_observations_slug_time;
drop index if exists public.idx_price_observations_province_time;
drop index if exists public.idx_price_observations_confidence_time;

create index if not exists idx_po_slug_type_time
    on public.price_observations (commodity_slug, price_type, recorded_at desc);
create index if not exists idx_po_province_slug_time
    on public.price_observations (province_code, commodity_slug, recorded_at desc);
create index if not exists idx_po_price_type_time
    on public.price_observations (price_type, recorded_at desc);
create index if not exists idx_po_source_type_time
    on public.price_observations (source_type, recorded_at desc);
create index if not exists idx_po_confidence
    on public.price_observations (confidence, recorded_at desc);

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'world_prices'
          and column_name = 'price_usd'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'world_prices'
          and column_name = 'price_raw'
    ) then
        alter table public.world_prices rename column price_usd to price_raw;
    end if;
end $$;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'world_prices'
          and column_name = 'price_unit'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'world_prices'
          and column_name = 'price_unit_raw'
    ) then
        alter table public.world_prices rename column price_unit to price_unit_raw;
    end if;
end $$;

alter table public.world_prices
    add column if not exists contract_month text,
    add column if not exists price_usd_kg numeric(10, 6),
    add column if not exists exchange_rate numeric(10, 2),
    add column if not exists change_1d numeric(10, 4),
    add column if not exists change_1d_pct numeric(6, 2),
    add column if not exists change_1w_pct numeric(6, 2),
    add column if not exists volume bigint,
    add column if not exists open_interest bigint;

alter table public.world_prices
    alter column price_raw type numeric(12, 4),
    alter column price_vnd_kg type numeric(14, 2);

update public.world_prices wp
set
    price_usd_kg = coalesce(
        wp.price_usd_kg,
        case
            when lower(wp.price_unit_raw) in ('usd/kg', 'usc/kg') then wp.price_raw
            when lower(wp.price_unit_raw) in ('usd/tan', 'usd/ton', 'usd/t', 'usd/mt') then wp.price_raw / 1000
            when lower(wp.price_unit_raw) = 'usd/cwt' then wp.price_raw * 0.022046
            when lower(wp.price_unit_raw) = 'usc/lb' then wp.price_raw * 0.022046
            when lower(wp.price_unit_raw) = 'usc/bushel' then wp.price_raw * coalesce(c.world_to_kg_factor, 1)
            when c.world_to_kg_factor is not null then wp.price_raw * c.world_to_kg_factor
            else wp.price_raw
        end
    ),
    exchange_rate = coalesce(
        wp.exchange_rate,
        case
            when wp.price_vnd_kg is not null and coalesce(wp.price_usd_kg, 0) > 0
                then round((wp.price_vnd_kg / wp.price_usd_kg)::numeric, 2)
            else 25850
        end
    )
from public.commodities c
where c.id = wp.commodity_id;

update public.world_prices
set
    price_usd_kg = coalesce(price_usd_kg, price_raw),
    exchange_rate = coalesce(exchange_rate, 25850),
    price_vnd_kg = coalesce(price_vnd_kg, round((coalesce(price_usd_kg, price_raw) * exchange_rate)::numeric, 2));

alter table public.world_prices
    alter column price_usd_kg set not null;

drop index if exists public.idx_world_prices_slug_time;
create index if not exists idx_wp_slug_exchange_time
    on public.world_prices (commodity_slug, exchange, recorded_at desc);
create index if not exists idx_wp_exchange_time
    on public.world_prices (exchange, recorded_at desc);
create index if not exists idx_wp_slug_time
    on public.world_prices (commodity_slug, recorded_at desc);

alter table public.user_profiles
    add column if not exists price_type_preference text[] not null default '{wholesale,export}';

alter table public.price_alerts
    add column if not exists price_type text not null default 'wholesale',
    add column if not exists threshold_usd numeric(10, 4);

alter table public.price_alerts
    alter column threshold_vnd type numeric(14, 2);

alter table public.price_alerts
    drop constraint if exists price_alerts_condition_check;

alter table public.price_alerts
    add constraint price_alerts_condition_check
    check (condition in ('above', 'below', 'change_pct', 'change_pct_up', 'change_pct_down'));

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'crowdsource_submissions'
          and column_name = 'market_type'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'crowdsource_submissions'
          and column_name = 'price_type'
    ) then
        alter table public.crowdsource_submissions rename column market_type to price_type;
    end if;
end $$;

alter table public.crowdsource_submissions
    add column if not exists market_name text;

update public.crowdsource_submissions
set price_type = coalesce(price_type, 'farm_gate');

create or replace function public.get_recent_median(
    p_commodity_id int,
    p_province_code text,
    p_price_type text default 'wholesale',
    p_days int default 7
)
returns table (median_price numeric)
language plpgsql
set search_path = public, pg_temp
as $$
begin
    return query
    select percentile_cont(0.5) within group (order by price_vnd)::numeric
    from public.price_observations
    where commodity_id = p_commodity_id
      and (province_code = p_province_code or province_code is null or p_province_code is null)
      and price_type = p_price_type
      and recorded_at >= now() - make_interval(days => p_days)
      and confidence >= 0.5
      and price_vnd is not null;
end;
$$;

revoke all on function public.get_recent_median(int, text, text, int) from public;

create or replace function public.get_recent_median(
    p_commodity_id int,
    p_province_code text,
    p_days int default 7
)
returns table (median_price numeric)
language sql
set search_path = public, pg_temp
as $$
    select *
    from public.get_recent_median(p_commodity_id, p_province_code, 'wholesale', p_days);
$$;

revoke all on function public.get_recent_median(int, text, int) from public;

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
    where recorded_at >= now() - interval '7 days'
      and confidence >= 0.5
    order by commodity_slug, price_type, recorded_at desc, id desc
),
world_latest as (
    select distinct on (commodity_slug)
        commodity_slug,
        exchange,
        price_usd_kg,
        price_vnd_kg,
        change_1d_pct,
        change_1w_pct,
        recorded_at as world_updated_at
    from public.world_prices
    where recorded_at >= now() - interval '3 days'
    order by commodity_slug, recorded_at desc, id desc
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
    w.world_updated_at,
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
    w.world_updated_at;

create unique index if not exists idx_price_chain_summary_slug
    on public.price_chain_summary (commodity_slug);

create materialized view public.daily_price_summary as
select
    date_trunc('day', recorded_at) as date,
    commodity_id,
    commodity_slug,
    price_type,
    province_code,
    source_type,
    avg(price_vnd) as avg_price_vnd,
    min(price_vnd) as min_price_vnd,
    max(price_vnd) as max_price_vnd,
    percentile_cont(0.5) within group (order by price_vnd) as median_price_vnd,
    avg(price_usd) as avg_price_usd,
    count(*) as observation_count,
    avg(confidence) as avg_confidence,
    array_agg(distinct source_name) as sources
from public.price_observations
where confidence >= 0.5
  and price_vnd is not null
group by 1, 2, 3, 4, 5, 6;

create unique index if not exists idx_daily_price_summary_unique
    on public.daily_price_summary (date, commodity_slug, price_type, province_code, source_type);
create index if not exists idx_daily_price_summary_slug_type_date
    on public.daily_price_summary (commodity_slug, price_type, date desc);
create index if not exists idx_daily_price_summary_type_date
    on public.daily_price_summary (price_type, date desc);

create materialized view public.regional_price_map as
select
    current_date as date,
    commodity_slug,
    price_type,
    province_code,
    avg(price_vnd) as avg_price,
    round(
        avg(price_vnd) / avg(avg(price_vnd)) over (partition by commodity_slug, price_type) * 100,
        1
    ) as vs_national_avg_pct,
    count(*) as data_points,
    max(recorded_at) as latest_record
from public.price_observations
where recorded_at >= now() - interval '3 days'
  and confidence >= 0.5
  and province_code is not null
  and price_vnd is not null
group by commodity_slug, price_type, province_code;

create index if not exists idx_regional_price_map_slug_type
    on public.regional_price_map (commodity_slug, price_type);
create index if not exists idx_regional_price_map_province
    on public.regional_price_map (province_code);

create materialized view public.commodity_trends as
with calc as (
    select
        commodity_slug,
        price_type,
        avg(case when recorded_at >= now() - interval '7 days' then price_vnd end) as avg_7d,
        avg(case when recorded_at >= now() - interval '14 days'
                 and recorded_at < now() - interval '7 days' then price_vnd end) as avg_prev_7d,
        avg(case when recorded_at >= now() - interval '30 days' then price_vnd end) as avg_30d,
        avg(case when recorded_at >= now() - interval '60 days'
                 and recorded_at < now() - interval '30 days' then price_vnd end) as avg_prev_30d,
        stddev(case when recorded_at >= now() - interval '30 days' then price_vnd end) as stddev_30d,
        count(*) as total_obs
    from public.price_observations
    where recorded_at >= now() - interval '60 days'
      and confidence >= 0.5
      and price_vnd is not null
    group by commodity_slug, price_type
)
select
    commodity_slug,
    price_type,
    avg_7d,
    avg_30d,
    case when avg_prev_7d > 0
         then round(((avg_7d - avg_prev_7d) / avg_prev_7d * 100)::numeric, 2)
    end as trend_7d_pct,
    case when avg_prev_30d > 0
         then round(((avg_30d - avg_prev_30d) / avg_prev_30d * 100)::numeric, 2)
    end as trend_30d_pct,
    case when avg_30d > 0
         then round((stddev_30d / avg_30d * 100)::numeric, 2)
    end as volatility_pct,
    total_obs,
    now() as updated_at
from calc;

create unique index if not exists idx_commodity_trends_slug_type
    on public.commodity_trends (commodity_slug, price_type);

create materialized view public.weekly_price_history as
select
    date_trunc('week', recorded_at) as week,
    commodity_slug,
    price_type,
    province_code,
    avg(price_vnd) as avg_price,
    min(price_vnd) as min_price,
    max(price_vnd) as max_price,
    percentile_cont(0.5) within group (order by price_vnd) as median_price,
    count(*) as observation_count
from public.price_observations
where confidence >= 0.5
  and price_vnd is not null
group by 1, 2, 3, 4;

create index if not exists idx_weekly_price_history_slug_type_week
    on public.weekly_price_history (commodity_slug, price_type, week desc);
create index if not exists idx_weekly_price_history_province_week
    on public.weekly_price_history (province_code, week desc);

create materialized view public.latest_observation_details as
with latest_day as (
    select max(recorded_at::date) as observed_on
    from public.price_observations
    where confidence >= 0.5
)
select
    id,
    recorded_at,
    commodity_id,
    commodity_slug,
    variety,
    quality_grade,
    province_code,
    market_name,
    country_code,
    price_type as market_type,
    price_type,
    price_vnd,
    unit,
    price_usd,
    exchange_rate,
    source_name as source,
    source_name,
    source_type,
    source_url,
    article_title,
    confidence,
    flags,
    is_verified,
    raw_payload
from public.price_observations
where confidence >= 0.5
  and recorded_at::date = (select observed_on from latest_day);

create unique index if not exists idx_latest_observation_details_id
    on public.latest_observation_details (id);
create index if not exists idx_latest_observation_details_slug
    on public.latest_observation_details (commodity_slug, province_code);

create or replace view public.latest_daily_price_summary
with (security_invoker = true) as
select
    date,
    commodity_id,
    commodity_slug,
    province_code,
    price_type as market_type,
    price_type,
    source_type,
    avg_price_vnd as avg_price,
    min_price_vnd as min_price,
    max_price_vnd as max_price,
    median_price_vnd as median_price,
    avg_price_usd,
    observation_count,
    avg_confidence,
    sources
from public.daily_price_summary
where date = (select max(date) from public.daily_price_summary);

create or replace view public.latest_world_prices_public
with (security_invoker = true) as
select distinct on (commodity_slug)
    id,
    recorded_at,
    commodity_id,
    commodity_slug,
    exchange,
    price_raw as price_usd,
    price_unit_raw as price_unit,
    price_usd_kg,
    price_vnd_kg,
    exchange_rate,
    change_1d,
    change_1d_pct,
    change_1w_pct,
    volume,
    open_interest,
    source_url,
    raw_payload
from public.world_prices
order by commodity_slug, recorded_at desc, id desc;

create or replace function private.refresh_curated_views()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    refresh materialized view public.daily_price_summary;
    refresh materialized view public.price_chain_summary;
    refresh materialized view public.regional_price_map;
    refresh materialized view public.commodity_trends;
    refresh materialized view public.weekly_price_history;
    refresh materialized view public.latest_observation_details;
end;
$$;

revoke all on function private.refresh_curated_views() from public;
grant execute on function private.refresh_curated_views() to service_role;

create or replace function public.refresh_curated_views()
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
    select private.refresh_curated_views();
$$;

revoke all on function public.refresh_curated_views() from public;
grant execute on function public.refresh_curated_views() to service_role;

create or replace function public.get_price_context_for_ai(
    p_commodity_slug text,
    p_province_code text default null
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
    result json;
begin
    select json_build_object(
        'commodity', p_commodity_slug,
        'province', p_province_code,
        'farm_gate_vnd', pcs.farm_gate_vnd,
        'wholesale_vnd', pcs.wholesale_vnd,
        'retail_vnd', pcs.retail_vnd,
        'export_vnd', pcs.export_vnd,
        'export_usd', pcs.export_usd,
        'world_exchange', pcs.world_exchange,
        'world_usd_kg', pcs.world_usd_kg,
        'world_change_pct', pcs.world_change_1d_pct,
        'retail_vs_farmgate_pct', pcs.retail_vs_farmgate_pct,
        'trend_7d_pct', ct.trend_7d_pct,
        'volatility_pct', ct.volatility_pct,
        'updated_at', pcs.domestic_updated_at
    )
    into result
    from public.price_chain_summary pcs
    left join public.commodity_trends ct
        on ct.commodity_slug = pcs.commodity_slug
       and ct.price_type = 'wholesale'
    where pcs.commodity_slug = p_commodity_slug;

    return result;
end;
$$;

revoke all on function public.get_price_context_for_ai(text, text) from public;

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        if not exists (select 1 from cron.job where jobname = 'refresh-price-chain') then
            perform cron.schedule(
                'refresh-price-chain',
                '*/30 * * * *',
                'refresh materialized view concurrently public.price_chain_summary'
            );
        end if;
    end if;
end;
$$;
