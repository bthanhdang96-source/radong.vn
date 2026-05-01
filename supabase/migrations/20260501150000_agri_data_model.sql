create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

create table if not exists public.commodities (
    id serial primary key,
    name_vi text not null,
    name_en text,
    slug text not null unique,
    hs_code varchar(10),
    category text not null,
    unit_default text not null default 'kg',
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.provinces (
    code varchar(3) primary key,
    name_vi text not null,
    name_en text,
    region text not null,
    lat double precision,
    lng double precision,
    is_major_agri boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.weather_cache (
    province_code varchar(3) primary key references public.provinces(code) on delete cascade,
    payload jsonb not null,
    fetched_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create table if not exists public.raw_crawl_logs (
    id bigserial primary key,
    source text not null,
    source_url text,
    html_snapshot text,
    raw_json jsonb,
    crawled_at timestamptz not null default now()
);

create table if not exists public.ingestion_errors (
    id bigserial primary key,
    failed_at timestamptz not null default now(),
    source text,
    error_type text not null,
    reason text,
    raw_payload jsonb
);

create table if not exists public.price_observations (
    id bigserial primary key,
    recorded_at timestamptz not null default now(),
    commodity_id integer not null references public.commodities(id),
    commodity_slug text not null,
    variety text,
    quality_grade text,
    province_code varchar(3) references public.provinces(code),
    market_type text not null default 'wholesale'
        check (market_type in ('farm_gate', 'wholesale', 'retail', 'export')),
    price_vnd numeric(12, 2) not null check (price_vnd > 0),
    unit text not null default 'kg',
    price_usd numeric(12, 4),
    source text not null,
    source_url text,
    confidence double precision not null default 0.7
        check (confidence >= 0.0 and confidence <= 1.0),
    flags text[] not null default '{}',
    is_verified boolean not null default false,
    raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.world_prices (
    id bigserial primary key,
    recorded_at timestamptz not null default now(),
    commodity_id integer not null references public.commodities(id),
    commodity_slug text not null,
    exchange text not null,
    price_usd numeric(12, 4) not null check (price_usd > 0),
    price_unit text not null,
    price_vnd_kg numeric(12, 2),
    source_url text,
    raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    province_code varchar(3) references public.provinces(code),
    role text not null default 'free'
        check (role in ('free', 'pro', 'b2b', 'admin')),
    commodity_follows text[] not null default '{}',
    created_at timestamptz not null default now()
);

create table if not exists public.price_alerts (
    id bigserial primary key,
    user_id uuid not null references public.user_profiles(id) on delete cascade,
    commodity_slug text not null,
    province_code varchar(3) references public.provinces(code),
    condition text not null check (condition in ('above', 'below', 'change_pct')),
    threshold_vnd numeric(12, 2),
    threshold_pct double precision,
    channel text not null default 'zalo' check (channel in ('zalo', 'email')),
    is_active boolean not null default true,
    last_triggered timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.crowdsource_submissions (
    id bigserial primary key,
    user_id uuid references public.user_profiles(id) on delete set null,
    submitted_at timestamptz not null default now(),
    commodity_slug text not null,
    price_raw text not null,
    unit_raw text not null,
    province_code varchar(3) references public.provinces(code),
    market_type text,
    note text,
    status text not null default 'pending'
        check (status in ('pending', 'accepted', 'rejected')),
    rejection_reason text,
    observation_id bigint references public.price_observations(id) on delete set null
);

create index if not exists idx_ingestion_errors_type_time
    on public.ingestion_errors (error_type, failed_at desc);
create index if not exists idx_ingestion_errors_source_time
    on public.ingestion_errors (source, failed_at desc);

create index if not exists idx_price_observations_commodity_time
    on public.price_observations (commodity_id, recorded_at desc);
create index if not exists idx_price_observations_slug_time
    on public.price_observations (commodity_slug, recorded_at desc);
create index if not exists idx_price_observations_province_time
    on public.price_observations (province_code, recorded_at desc);
create index if not exists idx_price_observations_confidence_time
    on public.price_observations (confidence, recorded_at desc);
create index if not exists idx_price_observations_market_type
    on public.price_observations (market_type, recorded_at desc);
create index if not exists idx_price_observations_flags
    on public.price_observations using gin (flags);

create index if not exists idx_world_prices_slug_time
    on public.world_prices (commodity_slug, recorded_at desc);

create or replace function public.sync_commodity_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    select slug into new.commodity_slug
    from public.commodities
    where id = new.commodity_id;

    return new;
end;
$$;

revoke all on function public.sync_commodity_slug() from public;

drop trigger if exists trg_sync_price_slug on public.price_observations;
create trigger trg_sync_price_slug
before insert or update of commodity_id
on public.price_observations
for each row
execute function public.sync_commodity_slug();

drop trigger if exists trg_sync_world_slug on public.world_prices;
create trigger trg_sync_world_slug
before insert or update of commodity_id
on public.world_prices
for each row
execute function public.sync_commodity_slug();

insert into public.commodities (name_vi, name_en, slug, hs_code, category, unit_default)
values
    ('Ca phe Robusta', 'Robusta Coffee', 'ca-phe-robusta', '0901.11', 'coffee', 'kg'),
    ('Ho tieu', 'Black Pepper', 'ho-tieu', '0904.11', 'spice', 'kg'),
    ('Heo hoi', 'Live Pig', 'heo-hoi', null, 'livestock', 'kg'),
    ('Lua gao DBSCL', 'Mekong Delta Rice', 'gao-noi-dia', '1006.30', 'rice', 'kg'),
    ('Coffee Robusta', 'Robusta Coffee', 'coffee-robusta', '0901.11', 'coffee', 'kg'),
    ('Coffee Arabica', 'Arabica Coffee', 'coffee-arabica', '0901.12', 'coffee', 'kg'),
    ('Cocoa', 'Cocoa', 'cocoa', '1801.00', 'coffee', 'kg'),
    ('Rice 5 pct broken', 'Rice 5% broken', 'rice-5pct', '1006.30', 'rice', 'kg'),
    ('Rice 25 pct broken', 'Rice 25% broken', 'rice-25pct', '1006.30', 'rice', 'kg'),
    ('Thai rice A1 super', 'Thai Rice A1 Super', 'rice-thai', '1006.30', 'rice', 'kg'),
    ('Wheat', 'Wheat', 'wheat', '1001.99', 'grain', 'kg'),
    ('Corn', 'Corn', 'corn', '1005.90', 'grain', 'kg'),
    ('Soybeans', 'Soybeans', 'soybeans', '1201.90', 'grain', 'kg'),
    ('Cassava', 'Cassava', 'cassava', '0714.10', 'grain', 'kg'),
    ('Black pepper global', 'Black Pepper', 'pepper-black', '0904.11', 'spice', 'kg'),
    ('Cashew', 'Cashew Nuts', 'cashew', '0801.31', 'nut', 'kg'),
    ('Rubber RSS3', 'Rubber RSS3', 'rubber-rss3', '4001.10', 'other', 'kg'),
    ('Rubber TSR20', 'Rubber TSR20', 'rubber-tsr20', '4001.22', 'other', 'kg'),
    ('Sugar', 'Sugar', 'sugar', '1701.14', 'other', 'kg'),
    ('Cotton', 'Cotton', 'cotton', '5201.00', 'other', 'kg'),
    ('Tea', 'Tea', 'tea-avg', '0902.40', 'other', 'kg'),
    ('Palm oil', 'Palm Oil', 'palm-oil', '1511.10', 'oil', 'kg'),
    ('Soybean oil', 'Soybean Oil', 'soybean-oil', '1507.90', 'oil', 'kg'),
    ('Coconut oil', 'Coconut Oil', 'coconut-oil', '1513.11', 'oil', 'kg'),
    ('Sunflower oil', 'Sunflower Oil', 'sunflower-oil', '1512.19', 'oil', 'kg'),
    ('Groundnut oil', 'Groundnut Oil', 'groundnut-oil', '1508.90', 'oil', 'kg'),
    ('Shrimp', 'Shrimp', 'shrimp', '0306.17', 'seafood', 'kg'),
    ('Pangasius', 'Pangasius Fillet', 'pangasius', '0304.62', 'seafood', 'kg'),
    ('Tuna', 'Tuna', 'tuna', '0304.87', 'seafood', 'kg'),
    ('Orange juice', 'Orange Juice FC', 'orange-juice', '2009.11', 'other', 'kg'),
    ('Urea', 'Urea', 'urea', '3102.10', 'other', 'kg'),
    ('DAP fertilizer', 'DAP Fertilizer', 'dap', '3105.30', 'other', 'kg'),
    ('Lumber', 'Lumber', 'lumber', '4407.11', 'other', 'kg')
on conflict (slug) do update
set
    name_vi = excluded.name_vi,
    name_en = excluded.name_en,
    hs_code = excluded.hs_code,
    category = excluded.category,
    unit_default = excluded.unit_default,
    is_active = true;

insert into public.provinces (code, name_vi, name_en, region, lat, lng, is_major_agri)
values
    ('AGI', 'An Giang', 'An Giang', 'south', 10.5216, 105.1259, true),
    ('BRV', 'Ba Ria - Vung Tau', 'Ba Ria - Vung Tau', 'south', 10.5417, 107.2429, false),
    ('BNI', 'Bac Ninh', 'Bac Ninh', 'north', 21.1214, 106.1111, false),
    ('BPC', 'Binh Phuoc', 'Binh Phuoc', 'south', 11.7512, 106.7235, true),
    ('CMA', 'Ca Mau', 'Ca Mau', 'south', 9.1769, 105.1500, true),
    ('CTO', 'Can Tho', 'Can Tho', 'south', 10.0341, 105.7224, true),
    ('CBG', 'Cao Bang', 'Cao Bang', 'north', 22.6667, 106.2500, false),
    ('DNG', 'Da Nang', 'Da Nang', 'central', 16.0544, 108.2022, false),
    ('DLK', 'Dak Lak', 'Dak Lak', 'highland', 12.7100, 108.2378, true),
    ('DNO', 'Dak Nong', 'Dak Nong', 'highland', 12.0046, 107.6878, true),
    ('DBI', 'Dien Bien', 'Dien Bien', 'north', 21.3856, 103.0230, false),
    ('DNI', 'Dong Nai', 'Dong Nai', 'south', 11.0686, 107.1676, true),
    ('DTP', 'Dong Thap', 'Dong Thap', 'south', 10.4938, 105.6882, true),
    ('GLA', 'Gia Lai', 'Gia Lai', 'highland', 13.9810, 108.0000, true),
    ('HNI', 'Ha Noi', 'Ha Noi', 'north', 21.0278, 105.8342, false),
    ('HTI', 'Ha Tinh', 'Ha Tinh', 'central', 18.3559, 105.8877, false),
    ('HPG', 'Hai Phong', 'Hai Phong', 'north', 20.8449, 106.6881, false),
    ('HUE', 'Hue', 'Hue', 'central', 16.4637, 107.5909, false),
    ('HYN', 'Hung Yen', 'Hung Yen', 'north', 20.8526, 106.0169, false),
    ('KHO', 'Khanh Hoa', 'Khanh Hoa', 'central', 12.2585, 109.0526, false),
    ('LCH', 'Lai Chau', 'Lai Chau', 'north', 22.3862, 103.4703, false),
    ('LDO', 'Lam Dong', 'Lam Dong', 'highland', 11.9465, 108.4419, true),
    ('LSN', 'Lang Son', 'Lang Son', 'north', 21.8537, 106.7615, false),
    ('LCA', 'Lao Cai', 'Lao Cai', 'north', 22.4809, 103.9755, false),
    ('NAN', 'Nghe An', 'Nghe An', 'central', 19.2342, 104.9200, true),
    ('NBI', 'Ninh Binh', 'Ninh Binh', 'north', 20.2506, 105.9745, false),
    ('PTO', 'Phu Tho', 'Phu Tho', 'north', 21.2684, 105.2046, false),
    ('QNG', 'Quang Ngai', 'Quang Ngai', 'central', 15.1214, 108.8044, false),
    ('QNI', 'Quang Ninh', 'Quang Ninh', 'north', 21.0064, 107.2925, false),
    ('QTR', 'Quang Tri', 'Quang Tri', 'central', 16.7500, 107.1856, false),
    ('SLA', 'Son La', 'Son La', 'north', 21.3256, 103.9188, false),
    ('TNN', 'Tay Ninh', 'Tay Ninh', 'south', 11.3352, 106.1099, true),
    ('TNG', 'Thai Nguyen', 'Thai Nguyen', 'north', 21.5672, 105.8252, false),
    ('THO', 'Thanh Hoa', 'Thanh Hoa', 'central', 19.8067, 105.7852, true),
    ('HCM', 'TP. Ho Chi Minh', 'Ho Chi Minh City', 'south', 10.7769, 106.7009, false),
    ('TQG', 'Tuyen Quang', 'Tuyen Quang', 'north', 21.7767, 105.2280, false),
    ('VLO', 'Vinh Long', 'Vinh Long', 'south', 10.2538, 105.9722, true)
on conflict (code) do update
set
    name_vi = excluded.name_vi,
    name_en = excluded.name_en,
    region = excluded.region,
    lat = excluded.lat,
    lng = excluded.lng,
    is_major_agri = excluded.is_major_agri;

create or replace function public.get_recent_median(
    p_commodity_id int,
    p_province_code text,
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
      and coalesce(province_code, '') = coalesce(p_province_code, '')
      and recorded_at >= now() - make_interval(days => p_days)
      and confidence >= 0.5;
end;
$$;

revoke all on function public.get_recent_median(int, text, int) from public;

create or replace function public.count_records_last_hour()
returns table (count bigint)
language plpgsql
set search_path = public, pg_temp
as $$
begin
    return query
    select count(*)
    from public.price_observations
    where recorded_at >= now() - interval '1 hour';
end;
$$;

revoke all on function public.count_records_last_hour() from public;

drop materialized view if exists public.daily_price_summary;
create materialized view public.daily_price_summary as
select
    date_trunc('day', recorded_at) as date,
    commodity_id,
    commodity_slug,
    province_code,
    market_type,
    avg(price_vnd) as avg_price,
    min(price_vnd) as min_price,
    max(price_vnd) as max_price,
    percentile_cont(0.5) within group (order by price_vnd) as median_price,
    count(*) as observation_count,
    avg(confidence) as avg_confidence,
    array_agg(distinct source) as sources
from public.price_observations
where confidence >= 0.5
group by 1, 2, 3, 4, 5;

create unique index if not exists idx_daily_price_summary_unique
    on public.daily_price_summary (date, commodity_slug, province_code, market_type);
create index if not exists idx_daily_price_summary_slug_date
    on public.daily_price_summary (commodity_slug, date desc);
create index if not exists idx_daily_price_summary_province_date
    on public.daily_price_summary (province_code, date desc);

drop materialized view if exists public.regional_price_map;
create materialized view public.regional_price_map as
select
    current_date as date,
    commodity_slug,
    province_code,
    avg(price_vnd) as avg_price,
    avg(price_vnd) / avg(avg(price_vnd)) over (partition by commodity_slug) as vs_national_avg,
    count(*) as data_points
from public.price_observations
where recorded_at >= now() - interval '3 days'
  and confidence >= 0.5
  and province_code is not null
group by commodity_slug, province_code;

create index if not exists idx_regional_price_map_slug
    on public.regional_price_map (commodity_slug);

drop materialized view if exists public.commodity_trends;
create materialized view public.commodity_trends as
with recent as (
    select
        commodity_slug,
        avg(case when recorded_at >= now() - interval '7 days' then price_vnd end) as avg_7d,
        avg(case when recorded_at >= now() - interval '14 days'
                 and recorded_at < now() - interval '7 days'
                 then price_vnd end) as avg_prev_7d,
        avg(case when recorded_at >= now() - interval '30 days' then price_vnd end) as avg_30d,
        avg(case when recorded_at >= now() - interval '60 days'
                 and recorded_at < now() - interval '30 days'
                 then price_vnd end) as avg_prev_30d,
        stddev(price_vnd) as price_stddev,
        count(*) as total_observations
    from public.price_observations
    where recorded_at >= now() - interval '60 days'
      and confidence >= 0.5
    group by commodity_slug
)
select
    commodity_slug,
    avg_7d,
    avg_30d,
    case when avg_prev_7d > 0
         then round(((avg_7d - avg_prev_7d) / avg_prev_7d * 100)::numeric, 2)
         else null end as trend_7d_pct,
    case when avg_prev_30d > 0
         then round(((avg_30d - avg_prev_30d) / avg_prev_30d * 100)::numeric, 2)
         else null end as trend_30d_pct,
    case when avg_30d > 0
         then round((price_stddev / avg_30d * 100)::numeric, 2)
         else null end as volatility_pct,
    total_observations,
    now() as updated_at
from recent;

create unique index if not exists idx_commodity_trends_slug
    on public.commodity_trends (commodity_slug);

drop materialized view if exists public.weekly_price_history;
create materialized view public.weekly_price_history as
select
    date_trunc('week', recorded_at) as week,
    commodity_slug,
    province_code,
    avg(price_vnd) as avg_price,
    min(price_vnd) as min_price,
    max(price_vnd) as max_price,
    percentile_cont(0.5) within group (order by price_vnd) as median_price,
    count(*) as observation_count
from public.price_observations
where confidence >= 0.5
group by 1, 2, 3;

create index if not exists idx_weekly_price_history_slug_week
    on public.weekly_price_history (commodity_slug, week desc);
create index if not exists idx_weekly_price_history_province_week
    on public.weekly_price_history (province_code, week desc);

drop materialized view if exists public.latest_observation_details;
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
    market_type,
    price_vnd,
    unit,
    price_usd,
    source,
    source_url,
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
select *
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
    price_usd,
    price_unit,
    price_vnd_kg,
    source_url,
    raw_payload
from public.world_prices
order by commodity_slug, recorded_at desc, id desc;

drop function if exists public.refresh_curated_views();

create or replace function private.refresh_curated_views()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    refresh materialized view public.daily_price_summary;
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

alter table public.commodities enable row level security;
alter table public.provinces enable row level security;
alter table public.weather_cache enable row level security;
alter table public.price_observations enable row level security;
alter table public.world_prices enable row level security;
alter table public.user_profiles enable row level security;
alter table public.price_alerts enable row level security;
alter table public.crowdsource_submissions enable row level security;
alter table public.raw_crawl_logs enable row level security;
alter table public.ingestion_errors enable row level security;

drop policy if exists "public read commodities" on public.commodities;
create policy "public read commodities"
    on public.commodities
    for select
    using (true);

drop policy if exists "public read provinces" on public.provinces;
create policy "public read provinces"
    on public.provinces
    for select
    using (true);

drop policy if exists "service weather cache" on public.weather_cache;
create policy "service weather cache"
    on public.weather_cache
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read price" on public.price_observations;
create policy "public read price"
    on public.price_observations
    for select
    using (confidence >= 0.5);

drop policy if exists "service write price" on public.price_observations;
create policy "service write price"
    on public.price_observations
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read world prices" on public.world_prices;
create policy "public read world prices"
    on public.world_prices
    for select
    using (true);

drop policy if exists "service write world prices" on public.world_prices;
create policy "service write world prices"
    on public.world_prices
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "users own profile" on public.user_profiles;
create policy "users own profile"
    on public.user_profiles
    for all
    using (auth.uid() is not null and auth.uid() = id)
    with check (auth.uid() is not null and auth.uid() = id);

drop policy if exists "users own alerts" on public.price_alerts;
create policy "users own alerts"
    on public.price_alerts
    for all
    using (auth.uid() is not null and auth.uid() = user_id)
    with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users own crowdsource submissions" on public.crowdsource_submissions;
create policy "users own crowdsource submissions"
    on public.crowdsource_submissions
    for all
    using (auth.uid() is not null and auth.uid() = user_id)
    with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "service raw crawl logs" on public.raw_crawl_logs;
create policy "service raw crawl logs"
    on public.raw_crawl_logs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service ingestion errors" on public.ingestion_errors;
create policy "service ingestion errors"
    on public.ingestion_errors
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        if not exists (select 1 from cron.job where jobname = 'refresh-daily-price-summary') then
            perform cron.schedule(
                'refresh-daily-price-summary',
                '*/30 * * * *',
                'refresh materialized view concurrently public.daily_price_summary'
            );
        end if;

        if not exists (select 1 from cron.job where jobname = 'refresh-regional-price-map') then
            perform cron.schedule(
                'refresh-regional-price-map',
                '0 * * * *',
                'refresh materialized view concurrently public.regional_price_map'
            );
        end if;

        if not exists (select 1 from cron.job where jobname = 'refresh-commodity-trends') then
            perform cron.schedule(
                'refresh-commodity-trends',
                '5 * * * *',
                'refresh materialized view concurrently public.commodity_trends'
            );
        end if;

        if not exists (select 1 from cron.job where jobname = 'refresh-weekly-history') then
            perform cron.schedule(
                'refresh-weekly-history',
                '0 1 * * *',
                'refresh materialized view concurrently public.weekly_price_history'
            );
        end if;

        if not exists (select 1 from cron.job where jobname = 'refresh-latest-observation-details') then
            perform cron.schedule(
                'refresh-latest-observation-details',
                '*/15 * * * *',
                'refresh materialized view concurrently public.latest_observation_details'
            );
        end if;
    end if;
end;
$$;
