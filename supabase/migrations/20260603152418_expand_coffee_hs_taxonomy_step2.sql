alter table public.dim_hs_code
    add column if not exists processing_stage text not null default 'unknown'
        check (processing_stage in ('green', 'roasted', 'extract', 'preparation', 'byproduct', 'substitute', 'unknown')),
    add column if not exists decaf_status text not null default 'unknown'
        check (decaf_status in ('non_decaf', 'decaf', 'not_applicable', 'unknown')),
    add column if not exists species_variety text not null default 'unknown'
        check (species_variety in ('arabica', 'robusta', 'other', 'unknown')),
    add column if not exists code_level text not null default 'HS6'
        check (code_level in ('HS6', 'HS8', 'HS10', 'tariffline')),
    add column if not exists parent_hs6 char(6)
        check (parent_hs6 is null or parent_hs6 ~ '^[0-9]{6}$'),
    add column if not exists is_internationally_comparable boolean not null default true;

update public.dim_hs_code
set
    processing_stage = case
        when analysis_bucket in ('coffee_raw_core', 'coffee_decaf_raw') then 'green'
        when analysis_bucket in ('coffee_roasted', 'coffee_roasted_decaf') then 'roasted'
        when analysis_bucket = 'coffee_instant' then 'extract'
        when analysis_bucket = 'coffee_byproduct' then 'byproduct'
        else processing_stage
    end,
    decaf_status = case
        when hs6 in ('090111', '090121') then 'non_decaf'
        when hs6 in ('090112', '090122') then 'decaf'
        when hs6 in ('090190', '210111', '210112') then 'not_applicable'
        else decaf_status
    end,
    species_variety = case
        when hs8_vn = '09011120' or national_code = '0901.11.20' then 'arabica'
        when hs8_vn = '09011130' or national_code = '0901.11.30' then 'robusta'
        when hs8_vn = '09011190' or national_code = '0901.11.90' then 'other'
        else species_variety
    end,
    code_level = case
        when hs10_vn is not null then 'HS10'
        when hs8_vn is not null then 'HS8'
        when national_code is not null and country_scope <> 'INT' then 'tariffline'
        else 'HS6'
    end,
    parent_hs6 = hs6,
    is_internationally_comparable = (country_scope = 'INT' and hs8_vn is null and hs10_vn is null and national_code is null);

insert into public.dim_hs_code (
    commodity_group,
    commodity_name,
    product_form,
    hs2,
    hs4,
    hs6,
    hs8_vn,
    hs10_vn,
    country_scope,
    national_code,
    national_code_system,
    partner_market_group,
    hs_description_en,
    hs_description_vi,
    analysis_bucket,
    include_in_mvp,
    data_priority,
    standard_unit,
    conversion_to_ton,
    source_name,
    source_url,
    source_type,
    source_checked_at,
    hs_version,
    valid_from,
    valid_to,
    confidence_score,
    notes,
    processing_stage,
    decaf_status,
    species_variety,
    code_level,
    parent_hs6,
    is_internationally_comparable
)
values
    (
        'coffee', 'Coffee', 'Not roasted not decaffeinated',
        '09', '0901', '090111', null, null,
        'INT', null, null, null,
        'Coffee; not roasted or decaffeinated',
        'Ca phe chua rang chua khu caffeine',
        'coffee_raw_core', true, 'P0', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090111',
        'official_un', '2026-06-03T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.95,
        'Core green coffee benchmark at HS6 level; does not separate Robusta and Arabica globally',
        'green', 'non_decaf', 'unknown', 'HS6', '090111', true
    ),
    (
        'coffee', 'Coffee', 'Not roasted decaffeinated',
        '09', '0901', '090112', null, null,
        'INT', null, null, null,
        'Coffee; decaffeinated, not roasted',
        'Ca phe chua rang da khu caffeine',
        'coffee_decaf_raw', true, 'P1', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090112',
        'official_un', '2026-06-03T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.92,
        'Green decaffeinated coffee; keep separate from non-decaf green coffee benchmarks',
        'green', 'decaf', 'unknown', 'HS6', '090112', true
    ),
    (
        'coffee', 'Coffee', 'Roasted not decaffeinated',
        '09', '0901', '090121', null, null,
        'INT', null, null, null,
        'Coffee; roasted, not decaffeinated',
        'Ca phe rang chua khu caffeine',
        'coffee_roasted', true, 'P1', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090121',
        'official_un', '2026-06-03T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.90,
        'Roasted coffee; never aggregate with green coffee unit value',
        'roasted', 'non_decaf', 'unknown', 'HS6', '090121', true
    ),
    (
        'coffee', 'Coffee', 'Roasted decaffeinated',
        '09', '0901', '090122', null, null,
        'INT', null, null, null,
        'Coffee; roasted, decaffeinated',
        'Ca phe rang da khu caffeine',
        'coffee_roasted_decaf', true, 'P2', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090122',
        'official_un', '2026-06-03T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.88,
        'Roasted decaffeinated coffee; keep separate from green coffee benchmarks',
        'roasted', 'decaf', 'unknown', 'HS6', '090122', true
    ),
    (
        'coffee', 'Coffee', 'Coffee husks skins substitutes',
        '09', '0901', '090190', null, null,
        'INT', null, null, null,
        'Coffee; husks and skins, coffee substitutes containing coffee in any proportion',
        'Vo cafe va chat thay the co chua cafe',
        'coffee_byproduct', true, 'P2', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090190',
        'official_un', '2026-06-03T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.86,
        'Byproduct/substitute bucket; keep separate from raw and processed coffee unit values',
        'byproduct', 'not_applicable', 'unknown', 'HS6', '090190', true
    ),
    (
        'coffee', 'Coffee', 'Coffee extracts concentrates',
        '21', '2101', '210111', null, null,
        'INT', null, null, null,
        'Extracts, essences and concentrates; of coffee, and preparations with a basis of these extracts, essences or concentrates or with a basis of coffee',
        'Chiet xuat tinh chat co dac tu cafe va che pham nen cafe',
        'coffee_instant', true, 'P1', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/210111',
        'official_un', '2026-06-03T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.92,
        'Processed coffee extracts/concentrates; never aggregate with green coffee unit value',
        'extract', 'not_applicable', 'unknown', 'HS6', '210111', true
    ),
    (
        'coffee', 'Coffee', 'Coffee preparations',
        '21', '2101', '210112', null, null,
        'INT', null, null, null,
        'Preparations with a basis of extracts, essences or concentrates or with a basis of coffee',
        'Che pham nen chiet xuat tinh chat co dac hoac nen cafe',
        'coffee_preparation', true, 'P1', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/210112',
        'official_un', '2026-06-03T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.90,
        'Processed coffee preparations; keep separate from extracts and green coffee',
        'preparation', 'not_applicable', 'unknown', 'HS6', '210112', true
    )
on conflict (hs6, hs8_vn, hs10_vn, country_scope, national_code, analysis_bucket)
do update
set
    product_form = excluded.product_form,
    hs_description_en = excluded.hs_description_en,
    hs_description_vi = excluded.hs_description_vi,
    include_in_mvp = excluded.include_in_mvp,
    data_priority = excluded.data_priority,
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    source_type = excluded.source_type,
    source_checked_at = excluded.source_checked_at,
    hs_version = excluded.hs_version,
    valid_from = excluded.valid_from,
    valid_to = excluded.valid_to,
    confidence_score = excluded.confidence_score,
    notes = excluded.notes,
    processing_stage = excluded.processing_stage,
    decaf_status = excluded.decaf_status,
    species_variety = excluded.species_variety,
    code_level = excluded.code_level,
    parent_hs6 = excluded.parent_hs6,
    is_internationally_comparable = excluded.is_internationally_comparable,
    updated_at = now();

update public.dim_hs_code
set notes = concat_ws('; ', nullif(notes, ''), 'National tariff detail; not a global HS6 Robusta/Arabica split'),
    code_level = 'HS8',
    parent_hs6 = '090111',
    is_internationally_comparable = false,
    processing_stage = 'green',
    decaf_status = 'non_decaf',
    species_variety = case
        when hs8_vn = '09011120' or national_code = '0901.11.20' then 'arabica'
        when hs8_vn = '09011130' or national_code = '0901.11.30' then 'robusta'
        when hs8_vn = '09011190' or national_code = '0901.11.90' then 'other'
        else species_variety
    end,
    updated_at = now()
where country_scope = 'VNM'
  and hs6 = '090111'
  and (hs8_vn in ('09011120', '09011130', '09011190') or national_code in ('0901.11.20', '0901.11.30', '0901.11.90'));

create index if not exists idx_dim_hs_code_parent_hs6
    on public.dim_hs_code (parent_hs6);
create index if not exists idx_dim_hs_code_stage
    on public.dim_hs_code (processing_stage, decaf_status);
create index if not exists idx_dim_hs_code_code_level
    on public.dim_hs_code (code_level, is_internationally_comparable);

create or replace view public.vw_coffee_hs_scope
with (security_invoker = true) as
select
    commodity_group,
    commodity_name,
    product_form,
    hs2,
    hs4,
    hs6,
    hs8_vn,
    hs10_vn,
    parent_hs6,
    country_scope,
    national_code,
    national_code_system,
    partner_market_group,
    hs_description_en,
    hs_description_vi,
    analysis_bucket,
    processing_stage,
    decaf_status,
    species_variety,
    code_level,
    include_in_mvp,
    data_priority,
    standard_unit,
    conversion_to_ton,
    source_name,
    source_url,
    source_type,
    source_checked_at,
    hs_version,
    valid_from,
    valid_to,
    confidence_score,
    is_internationally_comparable,
    notes
from public.dim_hs_code
where commodity_group = 'coffee';

create or replace view public.vw_vietnam_coffee_export_by_product_market
with (security_invoker = true) as
select
    f.period_type,
    f.period_start,
    f.period_label,
    f.reporter_country,
    f.reporter_iso,
    f.partner_country,
    f.partner_iso,
    f.flow,
    f.commodity_group,
    f.analysis_bucket,
    f.hs6,
    f.hs_description,
    h.processing_stage,
    h.decaf_status,
    h.species_variety,
    h.code_level,
    h.parent_hs6,
    h.is_internationally_comparable,
    f.quantity_ton,
    f.value_usd,
    f.source_name,
    f.source_url,
    f.fetched_at,
    f.data_quality_flag,
    f.confidence_score,
    f.notes
from public.fact_vietnam_coffee_export_by_market f
left join public.vw_coffee_hs_scope h
  on h.hs6 = f.hs6
 and h.country_scope = 'INT'
 and h.code_level = 'HS6'
where f.commodity_group = 'coffee';

grant select on public.vw_coffee_hs_scope to anon, authenticated;
grant select on public.vw_vietnam_coffee_export_by_product_market to anon, authenticated;

create or replace view public.vw_coffee_top_markets_by_value
with (security_invoker = true) as
select
    period_type,
    period_label,
    partner_country,
    partner_iso,
    export_value_usd,
    export_quantity_ton,
    export_unit_value_usd_per_ton,
    market_share_by_value_pct,
    value_rank_by_period,
    unit_value_flag,
    confidence_score,
    source_name,
    fetched_at
from public.fact_export_unit_value
where analysis_bucket = 'coffee_raw_core'
  and hs6 = '090111'
  and value_rank_by_period <= 10
  and unit_value_flag in ('ok', 'low_volume');

create or replace view public.vw_coffee_premium_markets
with (security_invoker = true) as
with period_median as (
    select
        period_type,
        period_label,
        percentile_cont(0.5) within group (
            order by export_unit_value_usd_per_ton
        ) as median_unit_value
    from public.fact_export_unit_value
    where analysis_bucket = 'coffee_raw_core'
      and hs6 = '090111'
      and export_quantity_ton >= 10
      and unit_value_flag = 'ok'
    group by period_type, period_label
)
select
    f.period_type,
    f.period_label,
    f.partner_country,
    f.partner_iso,
    f.export_value_usd,
    f.export_quantity_ton,
    f.export_unit_value_usd_per_ton,
    p.median_unit_value,
    100.0 * (f.export_unit_value_usd_per_ton / nullif(p.median_unit_value, 0) - 1) as premium_vs_median_pct,
    f.confidence_score,
    f.source_name,
    f.fetched_at
from public.fact_export_unit_value f
join period_median p
  on f.period_type = p.period_type
 and f.period_label = p.period_label
where f.analysis_bucket = 'coffee_raw_core'
  and f.hs6 = '090111'
  and f.export_quantity_ton >= 10
  and f.unit_value_flag = 'ok';

create or replace view public.vw_coffee_export_summary_by_period
with (security_invoker = true) as
select
    period_type,
    period_label,
    min(period_start) as period_start,
    sum(export_value_usd) as total_export_value_usd,
    sum(export_quantity_ton) as total_export_quantity_ton,
    sum(export_value_usd) / nullif(sum(export_quantity_ton), 0) as avg_export_unit_value_usd_per_ton,
    count(distinct partner_iso) as number_of_markets,
    min(source_name) as source_name,
    max(fetched_at) as fetched_at
from public.fact_export_unit_value
where analysis_bucket = 'coffee_raw_core'
  and hs6 = '090111'
group by period_type, period_label;

grant select on public.vw_coffee_top_markets_by_value to anon, authenticated;
grant select on public.vw_coffee_premium_markets to anon, authenticated;
grant select on public.vw_coffee_export_summary_by_period to anon, authenticated;
