create table if not exists public.raw_un_comtrade_coffee_exports_multi_reporter (
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
    partner2_code text,
    partner2_iso text,
    partner2_desc text,
    flow_code text,
    flow_desc text,
    classification_code text,
    cmd_code text,
    cmd_desc text,
    customs_code text,
    customs_desc text,
    mot_code integer,
    mot_desc text,
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

create table if not exists public.fact_competitor_export_unit_value (
    id bigserial primary key,
    period_type text not null check (period_type in ('A', 'M')),
    period_start date not null,
    period_label text not null,
    reporter_country text not null,
    reporter_iso text not null,
    partner_country text not null,
    partner_iso text,
    flow text not null default 'Export',
    commodity_group text not null default 'coffee',
    analysis_bucket text not null default 'coffee_raw_core',
    hs6 char(6) not null default '090111' check (hs6 ~ '^[0-9]{6}$'),
    hs_description text,
    export_value_usd numeric,
    export_quantity_ton numeric,
    export_unit_value_usd_per_ton numeric,
    tracked_reporter_share_by_value_pct numeric,
    tracked_reporter_share_by_quantity_pct numeric,
    rank_by_value_in_partner_market integer,
    rank_by_unit_value_in_partner_market integer,
    data_quality_flag text not null
        check (
            data_quality_flag in (
                'ok',
                'missing_value',
                'missing_quantity',
                'zero_quantity',
                'missing_or_unknown_quantity_unit',
                'invalid_unit_value'
            )
        ),
    unit_value_flag text not null
        check (
            unit_value_flag in (
                'ok',
                'missing_value',
                'missing_quantity',
                'zero_quantity',
                'missing_or_unknown_quantity_unit',
                'low_volume_for_competitor_benchmark',
                'invalid_unit_value'
            )
        ),
    confidence_score numeric(4, 3) not null check (confidence_score >= 0 and confidence_score <= 1),
    notes text not null,
    source_name text not null,
    source_url text not null,
    fetched_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (
        period_type,
        period_label,
        reporter_iso,
        partner_iso,
        flow,
        hs6,
        source_name
    )
);

create index if not exists idx_raw_competitor_coffee_exports_period_reporter
    on public.raw_un_comtrade_coffee_exports_multi_reporter (freq_code, period, reporter_iso);
create index if not exists idx_raw_competitor_coffee_exports_partner
    on public.raw_un_comtrade_coffee_exports_multi_reporter (partner_iso, period);
create index if not exists idx_raw_competitor_coffee_exports_hs_flow
    on public.raw_un_comtrade_coffee_exports_multi_reporter (cmd_code, flow_code);
create index if not exists idx_raw_competitor_coffee_exports_fetched
    on public.raw_un_comtrade_coffee_exports_multi_reporter (fetched_at desc);

create index if not exists idx_fact_competitor_export_unit_value_period
    on public.fact_competitor_export_unit_value (period_type, period_start desc);
create index if not exists idx_fact_competitor_export_unit_value_reporter
    on public.fact_competitor_export_unit_value (reporter_iso, period_start desc);
create index if not exists idx_fact_competitor_export_unit_value_partner
    on public.fact_competitor_export_unit_value (partner_iso, period_start desc);
create index if not exists idx_fact_competitor_export_unit_value_hs6
    on public.fact_competitor_export_unit_value (hs6, period_type, period_label);
create index if not exists idx_fact_competitor_export_unit_value_flag
    on public.fact_competitor_export_unit_value (unit_value_flag, period_start desc);

drop trigger if exists trg_raw_competitor_coffee_exports_updated_at on public.raw_un_comtrade_coffee_exports_multi_reporter;
create trigger trg_raw_competitor_coffee_exports_updated_at
before update on public.raw_un_comtrade_coffee_exports_multi_reporter
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_fact_competitor_export_unit_value_updated_at on public.fact_competitor_export_unit_value;
create trigger trg_fact_competitor_export_unit_value_updated_at
before update on public.fact_competitor_export_unit_value
for each row
execute function public.sync_updated_at_column();

grant select on public.fact_competitor_export_unit_value to anon, authenticated;
grant all privileges on public.raw_un_comtrade_coffee_exports_multi_reporter to service_role;
grant all privileges on public.fact_competitor_export_unit_value to service_role;
grant usage, select on sequence public.raw_un_comtrade_coffee_exports_multi_reporter_id_seq to service_role;
grant usage, select on sequence public.fact_competitor_export_unit_value_id_seq to service_role;

alter table public.raw_un_comtrade_coffee_exports_multi_reporter enable row level security;
alter table public.fact_competitor_export_unit_value enable row level security;

drop policy if exists "service manage raw competitor coffee export rows" on public.raw_un_comtrade_coffee_exports_multi_reporter;
create policy "service manage raw competitor coffee export rows"
    on public.raw_un_comtrade_coffee_exports_multi_reporter
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read competitor export unit value fact" on public.fact_competitor_export_unit_value;
create policy "public read competitor export unit value fact"
    on public.fact_competitor_export_unit_value
    for select
    using (true);

drop policy if exists "service manage competitor export unit value fact" on public.fact_competitor_export_unit_value;
create policy "service manage competitor export unit value fact"
    on public.fact_competitor_export_unit_value
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create or replace view public.vw_coffee_competitor_benchmark_by_market
with (security_invoker = true) as
with base as (
    select
        period_type,
        period_start,
        period_label,
        partner_country,
        partner_iso,
        reporter_country,
        reporter_iso,
        export_value_usd,
        export_quantity_ton,
        export_unit_value_usd_per_ton,
        unit_value_flag,
        confidence_score
    from public.fact_competitor_export_unit_value
    where hs6 = '090111'
      and commodity_group = 'coffee'
      and analysis_bucket = 'coffee_raw_core'
      and lower(partner_country) not like '%world%'
),
pivoted as (
    select
        period_type,
        min(period_start) as period_start,
        period_label,
        partner_country,
        partner_iso,
        max(case when reporter_iso = 'VNM' then export_unit_value_usd_per_ton end) as vietnam_unit_value_usd_per_ton,
        max(case when reporter_iso = 'BRA' then export_unit_value_usd_per_ton end) as brazil_unit_value_usd_per_ton,
        max(case when reporter_iso = 'IDN' then export_unit_value_usd_per_ton end) as indonesia_unit_value_usd_per_ton,
        max(case when reporter_iso = 'VNM' then export_value_usd end) as vietnam_value_usd,
        max(case when reporter_iso = 'BRA' then export_value_usd end) as brazil_value_usd,
        max(case when reporter_iso = 'IDN' then export_value_usd end) as indonesia_value_usd,
        max(case when reporter_iso = 'VNM' then export_quantity_ton end) as vietnam_quantity_ton,
        max(case when reporter_iso = 'BRA' then export_quantity_ton end) as brazil_quantity_ton,
        max(case when reporter_iso = 'IDN' then export_quantity_ton end) as indonesia_quantity_ton,
        max(case when reporter_iso = 'VNM' then unit_value_flag end) as vietnam_unit_value_flag,
        max(case when reporter_iso = 'BRA' then unit_value_flag end) as brazil_unit_value_flag,
        max(case when reporter_iso = 'IDN' then unit_value_flag end) as indonesia_unit_value_flag,
        min(confidence_score) as min_confidence_score
    from base
    group by period_type, period_label, partner_country, partner_iso
)
select
    *,
    100.0 * (
        vietnam_unit_value_usd_per_ton / nullif(brazil_unit_value_usd_per_ton, 0) - 1
    ) as vietnam_vs_brazil_gap_pct,
    100.0 * (
        vietnam_unit_value_usd_per_ton / nullif(indonesia_unit_value_usd_per_ton, 0) - 1
    ) as vietnam_vs_indonesia_gap_pct,
    case
        when vietnam_unit_value_usd_per_ton is null then 'missing_vietnam'
        when brazil_unit_value_usd_per_ton is null and indonesia_unit_value_usd_per_ton is null then 'missing_competitors'
        when vietnam_unit_value_flag <> 'ok' then 'vietnam_low_quality'
        when coalesce(brazil_unit_value_flag, 'ok') <> 'ok'
          and coalesce(indonesia_unit_value_flag, 'ok') <> 'ok'
          then 'competitor_low_quality'
        else 'ok'
    end as benchmark_quality_flag,
    'Benchmark signal only; export unit values are not transaction prices, invoice prices, FOB contract prices, margins, or profit.'::text as interpretation_note
from pivoted
where vietnam_unit_value_usd_per_ton is not null;

create or replace view public.vw_coffee_vietnam_premium_vs_brazil
with (security_invoker = true) as
select
    period_type,
    period_start,
    period_label,
    partner_country,
    partner_iso,
    vietnam_unit_value_usd_per_ton,
    brazil_unit_value_usd_per_ton,
    vietnam_vs_brazil_gap_pct,
    vietnam_value_usd,
    brazil_value_usd,
    benchmark_quality_flag,
    interpretation_note
from public.vw_coffee_competitor_benchmark_by_market
where brazil_unit_value_usd_per_ton is not null
  and benchmark_quality_flag = 'ok'
order by period_start desc, vietnam_vs_brazil_gap_pct desc;

create or replace view public.vw_coffee_vietnam_discount_vs_brazil
with (security_invoker = true) as
select
    period_type,
    period_start,
    period_label,
    partner_country,
    partner_iso,
    vietnam_unit_value_usd_per_ton,
    brazil_unit_value_usd_per_ton,
    vietnam_vs_brazil_gap_pct,
    vietnam_value_usd,
    brazil_value_usd,
    benchmark_quality_flag,
    interpretation_note
from public.vw_coffee_competitor_benchmark_by_market
where brazil_unit_value_usd_per_ton is not null
  and benchmark_quality_flag = 'ok'
order by period_start desc, vietnam_vs_brazil_gap_pct asc;

create or replace view public.vw_coffee_competitor_benchmark_summary_by_period
with (security_invoker = true) as
select
    period_type,
    period_label,
    min(period_start) as period_start,
    count(distinct partner_iso) as vietnam_markets,
    count(*) filter (where brazil_unit_value_usd_per_ton is not null) as markets_with_brazil,
    count(*) filter (where indonesia_unit_value_usd_per_ton is not null) as markets_with_indonesia,
    count(*) filter (where benchmark_quality_flag = 'ok') as ok_benchmark_markets,
    avg(vietnam_vs_brazil_gap_pct) filter (where benchmark_quality_flag = 'ok') as avg_vietnam_vs_brazil_gap_pct,
    avg(vietnam_vs_indonesia_gap_pct) filter (where benchmark_quality_flag = 'ok') as avg_vietnam_vs_indonesia_gap_pct,
    count(*) filter (where vietnam_vs_brazil_gap_pct > 0 and benchmark_quality_flag = 'ok') as markets_vietnam_premium_vs_brazil,
    count(*) filter (where vietnam_vs_brazil_gap_pct < 0 and benchmark_quality_flag = 'ok') as markets_vietnam_discount_vs_brazil,
    max(interpretation_note) as interpretation_note
from public.vw_coffee_competitor_benchmark_by_market
group by period_type, period_label
order by period_start desc;

grant select on public.vw_coffee_competitor_benchmark_by_market to anon, authenticated;
grant select on public.vw_coffee_vietnam_premium_vs_brazil to anon, authenticated;
grant select on public.vw_coffee_vietnam_discount_vs_brazil to anon, authenticated;
grant select on public.vw_coffee_competitor_benchmark_summary_by_period to anon, authenticated;
