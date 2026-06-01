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
    notes,
    data_quality_flag
from public.fact_market_event
where commodity_group = 'coffee'
  and data_quality_flag = 'ok'
  and confidence_score >= 0.60
  and source_reliability_score >= 0.60
  and event_date >= current_date - interval '14 days'
order by abs(impact_score) desc, confidence_score desc, event_date desc;

grant select on public.vw_coffee_market_event_brief_candidates to anon, authenticated;
