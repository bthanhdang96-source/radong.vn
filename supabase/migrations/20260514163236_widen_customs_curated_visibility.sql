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

select public.refresh_curated_views();
