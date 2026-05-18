insert into public.commodities (name_vi, name_en, slug, hs_code, category, unit_default, is_active)
values
    ('Sầu riêng', 'Durian', 'sau-rieng', '0810.60', 'fruit', 'kg', true)
on conflict (slug) do update
set
    name_vi = excluded.name_vi,
    name_en = excluded.name_en,
    hs_code = excluded.hs_code,
    category = excluded.category,
    unit_default = excluded.unit_default,
    is_active = true;

alter table public.generated_commodity_price_pages
    add column if not exists variety_sections_json jsonb not null default '[]'::jsonb;
