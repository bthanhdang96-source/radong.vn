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
  and unit = 'USD/FEU'
  and normalized_value_usd_per_feu is not null
group by 1, 2, 3, 4, 5, 6
order by month_start desc, index_name, route_name;

create or replace view public.vw_coffee_freight_logistics_review_queue
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
  and (
    data_quality_flag in (
        'needs_human_review',
        'index_points_not_usd',
        'suspicious_value',
        'low_relevance_to_coffee',
        'possible_duplicate'
    )
    or unit = 'USD/TEU'
    or lower(notes) like '%teu-to-feu conversion is approximate%'
    or lower(notes) like '%manual_seed_needs_review%'
    or observation_date < current_date - interval '45 days'
  )
order by
    case
        when data_quality_flag = 'needs_human_review' then 1
        when lower(notes) like '%manual_seed_needs_review%' then 2
        when unit = 'USD/TEU' then 3
        when data_quality_flag = 'index_points_not_usd' then 4
        when data_quality_flag = 'suspicious_value' then 5
        else 6
    end,
    observation_date desc,
    confidence_score asc;

grant select on public.vw_freight_proxy_monthly to anon, authenticated;
grant select on public.vw_coffee_freight_logistics_review_queue to anon, authenticated;
