create or replace view public.vw_coffee_market_event_review_queue
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
  and (
    data_quality_flag in ('needs_human_review', 'unclear_impact', 'missing_source_url', 'possible_duplicate')
    or (notes ilike '%Adapter source=%' and event_date >= current_date - interval '30 days')
  )
order by
    case data_quality_flag
        when 'needs_human_review' then 1
        when 'unclear_impact' then 2
        when 'missing_source_url' then 3
        when 'possible_duplicate' then 4
        else 5
    end,
    event_date desc,
    confidence_score desc;

grant select on public.vw_coffee_market_event_review_queue to anon, authenticated;
