create or replace view public.vw_coffee_mirror_gap_monthly_review
with (security_invoker = true) as
with export_side as (
    select
        period_type,
        period_start,
        period_label,
        partner_country,
        partner_iso,
        export_value_usd,
        export_quantity_ton,
        export_unit_value_usd_per_ton,
        unit_value_flag as export_unit_value_flag,
        confidence_score as export_confidence_score,
        hs6
    from public.fact_export_unit_value
    where period_type = 'M'
      and reporter_iso = 'VNM'
      and flow = 'Export'
      and commodity_group = 'coffee'
      and analysis_bucket = 'coffee_raw_core'
      and hs6 = '090111'
      and lower(partner_country) not like '%world%'
),
import_side as (
    select
        period_type,
        period_start,
        period_label,
        importer_country,
        importer_iso,
        import_value_usd,
        import_quantity_ton,
        import_unit_value_usd_per_ton,
        unit_value_flag as import_unit_value_flag,
        confidence_score as import_confidence_score,
        hs6
    from public.fact_mirror_import_unit_value
    where period_type = 'M'
      and origin_iso = 'VNM'
      and flow = 'Import'
      and commodity_group = 'coffee'
      and analysis_bucket = 'coffee_raw_core'
      and hs6 = '090111'
      and lower(importer_country) not like '%world%'
),
joined as (
    select
        coalesce(e.period_type, m.period_type) as period_type,
        coalesce(e.period_start, m.period_start) as period_start,
        coalesce(e.period_label, m.period_label) as period_label,
        coalesce(e.partner_country, m.importer_country) as market_country,
        coalesce(e.partner_iso, m.importer_iso) as market_iso,
        e.export_value_usd as vietnam_export_value_usd,
        e.export_quantity_ton as vietnam_export_quantity_ton,
        e.export_unit_value_usd_per_ton as vietnam_export_unit_value_usd_per_ton,
        e.export_unit_value_flag as vietnam_export_unit_value_flag,
        m.import_value_usd as partner_import_value_usd,
        m.import_quantity_ton as partner_import_quantity_ton,
        m.import_unit_value_usd_per_ton as partner_import_unit_value_usd_per_ton,
        m.import_unit_value_flag as partner_import_unit_value_flag,
        m.import_value_usd - e.export_value_usd as value_gap_usd,
        m.import_quantity_ton - e.export_quantity_ton as quantity_gap_ton,
        m.import_unit_value_usd_per_ton - e.export_unit_value_usd_per_ton as unit_value_gap_usd_per_ton,
        100.0 * (
            m.import_unit_value_usd_per_ton / nullif(e.export_unit_value_usd_per_ton, 0) - 1
        ) as mirror_gap_pct,
        100.0 * (
            m.import_quantity_ton / nullif(e.export_quantity_ton, 0) - 1
        ) as quantity_gap_pct,
        least(e.export_confidence_score, m.import_confidence_score) as confidence_score
    from export_side e
    full join import_side m
      on e.period_type = m.period_type
     and e.period_label = m.period_label
     and e.partner_iso = m.importer_iso
     and e.hs6 = m.hs6
)
select
    period_type,
    period_start,
    period_label,
    market_country,
    market_iso,
    vietnam_export_value_usd,
    vietnam_export_quantity_ton,
    vietnam_export_unit_value_usd_per_ton,
    vietnam_export_unit_value_flag,
    partner_import_value_usd,
    partner_import_quantity_ton,
    partner_import_unit_value_usd_per_ton,
    partner_import_unit_value_flag,
    value_gap_usd,
    quantity_gap_ton,
    unit_value_gap_usd_per_ton,
    mirror_gap_pct,
    case
        when vietnam_export_unit_value_usd_per_ton is null then 'missing_export_unit_value'
        when partner_import_unit_value_usd_per_ton is null then 'missing_import_unit_value'
        when vietnam_export_quantity_ton is null or partner_import_quantity_ton is null then 'missing_quantity'
        when vietnam_export_quantity_ton < 10 or partner_import_quantity_ton < 10 then 'low_volume'
        when abs(mirror_gap_pct) > 50 then 'large_mirror_gap'
        when abs(quantity_gap_pct) > 50 then 'large_quantity_gap'
        else 'ok'
    end as mirror_gap_flag,
    confidence_score,
    'Mirror gap compares Vietnam export unit value with partner-reported import unit value; differences can reflect CIF/FOB, freight, insurance, timing, reporting, or classification effects.'::text as interpretation_note,
    'Monthly mirror gap is review-only; do not mix with annual rows or interpret as margin/profit.'::text as monthly_review_note
from joined
order by period_start desc, market_country;

create or replace view public.vw_coffee_mirror_gap_monthly_summary
with (security_invoker = true) as
select
    period_type,
    period_label,
    min(period_start) as period_start,
    count(*) as markets_compared,
    count(*) filter (where partner_import_unit_value_usd_per_ton is not null) as markets_with_import_mirror,
    count(*) filter (where vietnam_export_unit_value_usd_per_ton is not null) as markets_with_export_unit_value,
    count(*) filter (where mirror_gap_flag = 'ok') as ok_markets,
    count(*) filter (where mirror_gap_flag = 'missing_export_unit_value') as missing_export_unit_value_markets,
    count(*) filter (where mirror_gap_flag = 'missing_import_unit_value') as missing_import_unit_value_markets,
    count(*) filter (where mirror_gap_flag = 'large_quantity_gap') as large_quantity_gap_markets,
    count(*) filter (where mirror_gap_flag = 'large_mirror_gap') as large_mirror_gap_markets,
    avg(mirror_gap_pct) filter (where mirror_gap_flag = 'ok') as avg_mirror_gap_pct,
    'Monthly mirror gap is review-only; annual benchmark views remain the default.'::text as monthly_review_note
from public.vw_coffee_mirror_gap_monthly_review
group by period_type, period_label
order by period_start desc;

grant select on public.vw_coffee_mirror_gap_monthly_review to anon, authenticated;
grant select on public.vw_coffee_mirror_gap_monthly_summary to anon, authenticated;
