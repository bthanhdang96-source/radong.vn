create table if not exists public.dim_hs_code (
    id bigserial primary key,
    commodity_group text not null,
    commodity_name text not null,
    product_form text not null,
    hs2 char(2) not null check (hs2 ~ '^[0-9]{2}$'),
    hs4 char(4) not null check (hs4 ~ '^[0-9]{4}$'),
    hs6 char(6) not null check (hs6 ~ '^[0-9]{6}$'),
    hs8_vn char(8) check (hs8_vn ~ '^[0-9]{8}$'),
    hs10_vn char(10) check (hs10_vn ~ '^[0-9]{10}$'),
    country_scope char(3) not null default 'INT',
    national_code text,
    national_code_system text,
    partner_market_group text,
    hs_description_en text not null,
    hs_description_vi text,
    analysis_bucket text not null,
    include_in_mvp boolean not null default false,
    data_priority text not null default 'P2'
        check (data_priority in ('P0', 'P1', 'P2')),
    standard_unit text not null default 'ton',
    conversion_to_ton numeric(12, 6) not null default 1 check (conversion_to_ton > 0),
    source_name text not null,
    source_url text not null,
    source_type text not null,
    source_checked_at timestamptz not null,
    hs_version text not null,
    valid_from date,
    valid_to date,
    confidence_score numeric(4, 3) not null check (confidence_score >= 0 and confidence_score <= 1),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (hs4 like hs2 || '%'),
    check (hs6 like hs4 || '%'),
    check (hs8_vn is null or hs8_vn like hs6 || '%'),
    check (hs10_vn is null or hs10_vn like hs6 || '%'),
    unique nulls not distinct (hs6, hs8_vn, hs10_vn, country_scope, national_code, analysis_bucket)
);

create index if not exists idx_dim_hs_code_hs6
    on public.dim_hs_code (hs6);
create index if not exists idx_dim_hs_code_commodity_group
    on public.dim_hs_code (commodity_group);
create index if not exists idx_dim_hs_code_analysis_bucket
    on public.dim_hs_code (analysis_bucket);
create index if not exists idx_dim_hs_code_include_in_mvp
    on public.dim_hs_code (include_in_mvp);
create index if not exists idx_dim_hs_code_country_scope
    on public.dim_hs_code (country_scope);

drop trigger if exists trg_dim_hs_code_updated_at on public.dim_hs_code;
create trigger trg_dim_hs_code_updated_at
before update on public.dim_hs_code
for each row
execute function public.sync_updated_at_column();

grant select on public.dim_hs_code to anon, authenticated;
grant all privileges on public.dim_hs_code to service_role;

alter table public.dim_hs_code enable row level security;

drop policy if exists "public read dim hs code" on public.dim_hs_code;
create policy "public read dim hs code"
    on public.dim_hs_code
    for select
    using (true);

drop policy if exists "service manage dim hs code" on public.dim_hs_code;
create policy "service manage dim hs code"
    on public.dim_hs_code
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

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
    notes
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
        'official_un', '2026-05-26T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.95,
        'Core coffee benchmark at HS6 level'
    ),
    (
        'coffee', 'Coffee', 'Not roasted not decaffeinated Arabica',
        '09', '0901', '090111', '09011120', null,
        'VNM', '0901.11.20', 'AHTN_VN', null,
        'Coffee; not roasted or decaffeinated (Arabica)',
        'Ca phe chua rang chua khu caffeine - Arabica',
        'coffee_raw_core', true, 'P1', 'ton', 1,
        'Vietnam tariff schedule (Decree 118/2022/ND-CP)',
        'https://files.customs.gov.vn/CustomsCMS/DONG_NAI/2023/1/10/118_2022_ND_CP_30_12_2022.pdf',
        'official_vn', '2026-05-26T00:00:00Z',
        'AHTN2022', date '2023-01-01', null, 0.93,
        'Mapped from Vietnam national 8-digit code to HS6'
    ),
    (
        'coffee', 'Coffee', 'Not roasted not decaffeinated Robusta',
        '09', '0901', '090111', '09011130', null,
        'VNM', '0901.11.30', 'AHTN_VN', null,
        'Coffee; not roasted or decaffeinated (Robusta)',
        'Ca phe chua rang chua khu caffeine - Robusta',
        'coffee_raw_core', true, 'P0', 'ton', 1,
        'Vietnam tariff schedule (Decree 118/2022/ND-CP)',
        'https://files.customs.gov.vn/CustomsCMS/DONG_NAI/2023/1/10/118_2022_ND_CP_30_12_2022.pdf',
        'official_vn', '2026-05-26T00:00:00Z',
        'AHTN2022', date '2023-01-01', null, 0.95,
        'Robusta-specific Vietnam code, core for Vietnam coffee exports'
    ),
    (
        'coffee', 'Coffee', 'Not roasted not decaffeinated other',
        '09', '0901', '090111', '09011190', null,
        'VNM', '0901.11.90', 'AHTN_VN', null,
        'Coffee; not roasted or decaffeinated (other)',
        'Ca phe chua rang chua khu caffeine - loai khac',
        'coffee_raw_core', true, 'P1', 'ton', 1,
        'Vietnam tariff schedule (Decree 118/2022/ND-CP)',
        'https://files.customs.gov.vn/CustomsCMS/DONG_NAI/2023/1/10/118_2022_ND_CP_30_12_2022.pdf',
        'official_vn', '2026-05-26T00:00:00Z',
        'AHTN2022', date '2023-01-01', null, 0.90,
        'Other green coffee subgroup in Vietnam schedule'
    ),
    (
        'coffee', 'Coffee', 'Not roasted decaffeinated',
        '09', '0901', '090112', null, null,
        'INT', null, null, null,
        'Coffee; decaffeinated, not roasted',
        'Ca phe chua rang da khu caffeine',
        'coffee_decaf_raw', false, 'P2', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090112',
        'official_un', '2026-05-26T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.90,
        'Out of MVP scope'
    ),
    (
        'coffee', 'Coffee', 'Roasted not decaffeinated',
        '09', '0901', '090121', null, null,
        'INT', null, null, null,
        'Coffee; roasted, not decaffeinated',
        'Ca phe rang chua khu caffeine',
        'coffee_roasted', false, 'P2', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090121',
        'official_un', '2026-05-26T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.90,
        'Do not aggregate with green coffee for unit value'
    ),
    (
        'coffee', 'Coffee', 'Roasted decaffeinated',
        '09', '0901', '090122', null, null,
        'INT', null, null, null,
        'Coffee; roasted, decaffeinated',
        'Ca phe rang da khu caffeine',
        'coffee_roasted_decaf', false, 'P2', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090122',
        'official_un', '2026-05-26T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.88,
        'Out of MVP scope'
    ),
    (
        'coffee', 'Coffee', 'Coffee husks skins substitutes',
        '09', '0901', '090190', null, null,
        'INT', null, null, null,
        'Coffee; husks and skins, coffee substitutes containing coffee in any proportion',
        'Vo cafe va chat thay the co chua cafe',
        'coffee_byproduct', false, 'P2', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/090190',
        'official_un', '2026-05-26T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.86,
        'Keep separate from raw and instant coffee'
    ),
    (
        'coffee', 'Coffee', 'Coffee extracts instant',
        '21', '2101', '210111', null, null,
        'INT', null, null, null,
        'Extracts, essences and concentrates; of coffee, and preparations with a basis of these extracts, essences or concentrates or with a basis of coffee',
        'Chiet xuat tinh chat co dac tu cafe va che pham nen cafe',
        'coffee_instant', true, 'P1', 'ton', 1,
        'UNSD Classification Detail',
        'https://unstats.un.org/unsd/classifications/Econ/Detail/EN/32/210111',
        'official_un', '2026-05-26T00:00:00Z',
        'HS2017/HS2022', date '2022-01-01', null, 0.92,
        'Processed coffee; never aggregate with raw coffee unit value'
    ),
    (
        'coffee', 'Coffee', 'Partner mapping United States',
        '09', '0901', '090111', null, null,
        'USA', '0901.11.00', 'HTSUS', 'US',
        'Coffee, not roasted, not decaffeinated',
        'Ma doi tac My cho cafe xanh khong khu caffeine',
        'coffee_raw_core', true, 'P1', 'ton', 1,
        'USITC Harmonized Tariff Schedule',
        'https://hts.usitc.gov/search?query=coffee',
        'official_partner', '2026-05-26T00:00:00Z',
        'HTSUS2026', date '2026-01-01', null, 0.85,
        'Partner mapping for U.S. customs tariff line'
    ),
    (
        'coffee', 'Coffee', 'Partner mapping Japan',
        '09', '0901', '090111', null, null,
        'JPN', '0901.11.000', 'JP_TARIFF', 'JP',
        'Coffee, not roasted, not decaffeinated',
        'Ma doi tac Nhat cho cafe xanh khong khu caffeine',
        'coffee_raw_core', true, 'P1', 'ton', 1,
        'Japan Customs tariff schedule',
        'https://www.customs.go.jp/english/tariff/2025_01_01/data/e_09.htm',
        'official_partner', '2026-05-26T00:00:00Z',
        'JP2025', date '2025-01-01', null, 0.90,
        'Partner mapping for Japan tariff statistical code'
    ),
    (
        'coffee', 'Coffee', 'Partner mapping European Union',
        '09', '0901', '090111', null, null,
        'EUR', '09011100', 'CN_TARIC', 'EU',
        'Coffee, not roasted, not decaffeinated',
        'Ma doi tac EU cho cafe xanh khong khu caffeine',
        'coffee_raw_core', true, 'P1', 'ton', 1,
        'EU customs tariff framework (TARIC / CN references)',
        'https://taxation-customs.ec.europa.eu/system/files/2022-04/SectionII_ch6_14_HS2022.pdf',
        'official_partner', '2026-05-26T00:00:00Z',
        'CN2026', date '2026-01-01', null, 0.82,
        'Applies to Germany, Italy, Spain through common EU customs nomenclature'
    ),
    (
        'coffee', 'Coffee', 'Partner mapping Germany',
        '09', '0901', '090111', null, null,
        'DEU', '09011100', 'CN_TARIC', 'EU',
        'Coffee, not roasted, not decaffeinated',
        'Anh xa doi tac Duc theo CN TARIC chung cua EU',
        'coffee_raw_core', true, 'P1', 'ton', 1,
        'EU customs tariff framework (TARIC / CN references)',
        'https://taxation-customs.ec.europa.eu/customs/calculation-customs-duties/customs-tariff/eu-customs-tariff-taric_en',
        'official_partner', '2026-05-26T00:00:00Z',
        'CN2026', date '2026-01-01', null, 0.80,
        'Country-level partner row derived from EU common nomenclature'
    ),
    (
        'coffee', 'Coffee', 'Partner mapping Italy',
        '09', '0901', '090111', null, null,
        'ITA', '09011100', 'CN_TARIC', 'EU',
        'Coffee, not roasted, not decaffeinated',
        'Anh xa doi tac Y theo CN TARIC chung cua EU',
        'coffee_raw_core', true, 'P1', 'ton', 1,
        'EU customs tariff framework (TARIC / CN references)',
        'https://taxation-customs.ec.europa.eu/customs/calculation-customs-duties/customs-tariff/eu-customs-tariff-taric_en',
        'official_partner', '2026-05-26T00:00:00Z',
        'CN2026', date '2026-01-01', null, 0.80,
        'Country-level partner row derived from EU common nomenclature'
    ),
    (
        'coffee', 'Coffee', 'Partner mapping Spain',
        '09', '0901', '090111', null, null,
        'ESP', '09011100', 'CN_TARIC', 'EU',
        'Coffee, not roasted, not decaffeinated',
        'Anh xa doi tac Tay Ban Nha theo CN TARIC chung cua EU',
        'coffee_raw_core', true, 'P1', 'ton', 1,
        'EU customs tariff framework (TARIC / CN references)',
        'https://taxation-customs.ec.europa.eu/customs/calculation-customs-duties/customs-tariff/eu-customs-tariff-taric_en',
        'official_partner', '2026-05-26T00:00:00Z',
        'CN2026', date '2026-01-01', null, 0.80,
        'Country-level partner row derived from EU common nomenclature'
    ),
    (
        'coffee', 'Coffee', 'Partner mapping Russia pending official verification',
        '09', '0901', '090111', null, null,
        'RUS', null, null, 'EAEU',
        'Coffee, not roasted, not decaffeinated',
        'Can xac minh ma quoc gia Nga tu nguon chinh thong',
        'coffee_raw_core', false, 'P2', 'ton', 1,
        'TODO_SOURCE_REQUIRED',
        'https://customs.gov.ru/',
        'todo', '2026-05-26T00:00:00Z',
        'TBD', null, null, 0.40,
        'Official partner national code verification still required'
    )
on conflict (hs6, hs8_vn, hs10_vn, country_scope, national_code, analysis_bucket)
do update
set
    commodity_group = excluded.commodity_group,
    commodity_name = excluded.commodity_name,
    product_form = excluded.product_form,
    hs2 = excluded.hs2,
    hs4 = excluded.hs4,
    hs_description_en = excluded.hs_description_en,
    hs_description_vi = excluded.hs_description_vi,
    include_in_mvp = excluded.include_in_mvp,
    data_priority = excluded.data_priority,
    standard_unit = excluded.standard_unit,
    conversion_to_ton = excluded.conversion_to_ton,
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    source_type = excluded.source_type,
    source_checked_at = excluded.source_checked_at,
    hs_version = excluded.hs_version,
    valid_from = excluded.valid_from,
    valid_to = excluded.valid_to,
    confidence_score = excluded.confidence_score,
    notes = excluded.notes,
    national_code_system = excluded.national_code_system,
    partner_market_group = excluded.partner_market_group,
    updated_at = now();
