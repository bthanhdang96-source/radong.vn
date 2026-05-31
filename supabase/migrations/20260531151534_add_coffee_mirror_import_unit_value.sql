create table if not exists public.raw_un_comtrade_mirror_imports (
    id bigserial primary key,
    sync_run_id uuid,
    source_name text not null default 'UN Comtrade',
    source_url text not null,
    fetched_at timestamptz not null default now(),
    query_params jsonb not null default '{}'::jsonb,
    type_code text,
    freq_code text,
    ref_period_id text,
    period text,
    reporter_code text,
    reporter_iso text,
    reporter_desc text,
    partner_code text,
    partner_iso text,
    partner_desc text,
    flow_code text,
    flow_desc text,
    classification_code text,
    cmd_code text,
    cmd_desc text,
    qty_unit_code text,
    qty_unit_abbr text,
    qty numeric,
    net_wgt_kg numeric,
    gross_wgt_kg numeric,
    trade_value_usd numeric,
    is_original_classification boolean,
    is_reported boolean,
    is_aggregate boolean,
    raw_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (
        freq_code,
        period,
        reporter_code,
        partner_code,
        flow_code,
        cmd_code,
        source_name
    )
);

create table if not exists public.fact_mirror_import_unit_value (
    id bigserial primary key,
    period_type text not null check (period_type in ('A', 'M')),
    period_start date not null,
    period_label text not null,
    importer_country text not null,
    importer_iso text,
    origin_country text not null default 'Vietnam',
    origin_iso text not null default 'VNM',
    flow text not null default 'Import',
    commodity_group text not null default 'coffee',
    analysis_bucket text not null default 'coffee_raw_core',
    hs6 char(6) not null default '090111' check (hs6 ~ '^[0-9]{6}$'),
    hs_description text,
    import_value_usd numeric,
    import_quantity_raw numeric,
    import_quantity_unit_raw text,
    import_net_weight_kg numeric,
    import_quantity_ton numeric,
    import_unit_value_usd_per_ton numeric,
    source_name text not null,
    source_url text not null,
    fetched_at timestamptz not null,
    data_quality_flag text not null
        check (
            data_quality_flag in (
                'ok',
                'missing_value',
                'missing_quantity',
                'zero_or_invalid_quantity',
                'invalid_value',
                'low_volume',
                'aggregate_reporter',
                'aggregate_partner',
                'missing_or_unknown_quantity_unit'
            )
        ),
    unit_value_flag text not null
        check (
            unit_value_flag in (
                'ok',
                'missing_value',
                'missing_quantity',
                'zero_or_invalid_quantity',
                'invalid_value',
                'low_volume',
                'aggregate_reporter',
                'aggregate_partner',
                'missing_or_unknown_quantity_unit'
            )
        ),
    confidence_score numeric(4, 3) not null check (confidence_score >= 0 and confidence_score <= 1),
    notes text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (
        period_type,
        period_label,
        importer_iso,
        origin_iso,
        flow,
        hs6,
        source_name
    )
);

create index if not exists idx_raw_mirror_imports_period_reporter
    on public.raw_un_comtrade_mirror_imports (freq_code, period, reporter_iso);
create index if not exists idx_raw_mirror_imports_partner
    on public.raw_un_comtrade_mirror_imports (partner_iso, period);
create index if not exists idx_raw_mirror_imports_hs_flow
    on public.raw_un_comtrade_mirror_imports (cmd_code, flow_code);
create index if not exists idx_raw_mirror_imports_fetched
    on public.raw_un_comtrade_mirror_imports (fetched_at desc);

create index if not exists idx_fact_mirror_import_period
    on public.fact_mirror_import_unit_value (period_type, period_start desc);
create index if not exists idx_fact_mirror_import_importer
    on public.fact_mirror_import_unit_value (importer_iso, period_start desc);
create index if not exists idx_fact_mirror_import_hs6
    on public.fact_mirror_import_unit_value (hs6, period_type, period_label);
create index if not exists idx_fact_mirror_import_flag
    on public.fact_mirror_import_unit_value (unit_value_flag, period_start desc);

drop trigger if exists trg_raw_mirror_imports_updated_at on public.raw_un_comtrade_mirror_imports;
create trigger trg_raw_mirror_imports_updated_at
before update on public.raw_un_comtrade_mirror_imports
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_fact_mirror_import_unit_value_updated_at on public.fact_mirror_import_unit_value;
create trigger trg_fact_mirror_import_unit_value_updated_at
before update on public.fact_mirror_import_unit_value
for each row
execute function public.sync_updated_at_column();

grant select on public.fact_mirror_import_unit_value to anon, authenticated;
grant all privileges on public.raw_un_comtrade_mirror_imports to service_role;
grant all privileges on public.fact_mirror_import_unit_value to service_role;
grant usage, select on sequence public.raw_un_comtrade_mirror_imports_id_seq to service_role;
grant usage, select on sequence public.fact_mirror_import_unit_value_id_seq to service_role;

alter table public.raw_un_comtrade_mirror_imports enable row level security;
alter table public.fact_mirror_import_unit_value enable row level security;

drop policy if exists "service manage raw mirror import rows" on public.raw_un_comtrade_mirror_imports;
create policy "service manage raw mirror import rows"
    on public.raw_un_comtrade_mirror_imports
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read mirror import unit value fact" on public.fact_mirror_import_unit_value;
create policy "public read mirror import unit value fact"
    on public.fact_mirror_import_unit_value
    for select
    using (true);

drop policy if exists "service manage mirror import unit value fact" on public.fact_mirror_import_unit_value;
create policy "service manage mirror import unit value fact"
    on public.fact_mirror_import_unit_value
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create or replace view public.vw_coffee_mirror_gap_by_market
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
    where reporter_iso = 'VNM'
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
    where origin_iso = 'VNM'
      and flow = 'Import'
      and commodity_group = 'coffee'
      and analysis_bucket = 'coffee_raw_core'
      and hs6 = '090111'
      and lower(importer_country) not like '%world%'
),
joined as (
    select
        e.period_type,
        e.period_start,
        e.period_label,
        e.partner_country as market_country,
        e.partner_iso as market_iso,
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
    left join import_side m
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
    'Mirror gap compares Vietnam export unit value with partner-reported import unit value; differences can reflect CIF/FOB, freight, insurance, timing, reporting, or classification effects.'::text as interpretation_note
from joined;

create or replace view public.vw_coffee_latest_mirror_gaps
with (security_invoker = true) as
select
    *
from public.vw_coffee_mirror_gap_by_market
where period_start = (
    select max(period_start)
    from public.vw_coffee_mirror_gap_by_market
)
order by abs(mirror_gap_pct) desc nulls last;

create or replace view public.vw_coffee_large_mirror_gaps
with (security_invoker = true) as
select
    *
from public.vw_coffee_mirror_gap_by_market
where mirror_gap_flag in ('large_mirror_gap', 'large_quantity_gap')
order by period_start desc, abs(mirror_gap_pct) desc nulls last;

create or replace view public.vw_coffee_stable_mirror_gap_markets
with (security_invoker = true) as
select
    market_country,
    market_iso,
    count(*) as periods_available,
    avg(mirror_gap_pct) as avg_mirror_gap_pct,
    min(mirror_gap_pct) as min_mirror_gap_pct,
    max(mirror_gap_pct) as max_mirror_gap_pct,
    avg(confidence_score) as avg_confidence_score
from public.vw_coffee_mirror_gap_by_market
where mirror_gap_flag = 'ok'
group by market_country, market_iso
having count(*) >= 3
order by avg_mirror_gap_pct desc;

create or replace view public.vw_coffee_mirror_gap_summary_by_period
with (security_invoker = true) as
select
    period_type,
    period_label,
    min(period_start) as period_start,
    count(*) as total_markets,
    count(*) filter (where partner_import_unit_value_usd_per_ton is not null) as markets_with_import_mirror,
    count(*) filter (where mirror_gap_flag = 'ok') as ok_markets,
    avg(mirror_gap_pct) filter (where mirror_gap_flag = 'ok') as avg_mirror_gap_pct,
    count(*) filter (where mirror_gap_pct > 0 and mirror_gap_flag = 'ok') as markets_positive_gap,
    count(*) filter (where mirror_gap_pct < 0 and mirror_gap_flag = 'ok') as markets_negative_gap,
    max(interpretation_note) as interpretation_note
from public.vw_coffee_mirror_gap_by_market
group by period_type, period_label
order by period_start desc;

grant select on public.vw_coffee_mirror_gap_by_market to anon, authenticated;
grant select on public.vw_coffee_latest_mirror_gaps to anon, authenticated;
grant select on public.vw_coffee_large_mirror_gaps to anon, authenticated;
grant select on public.vw_coffee_stable_mirror_gap_markets to anon, authenticated;
grant select on public.vw_coffee_mirror_gap_summary_by_period to anon, authenticated;
