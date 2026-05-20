insert into public.commodities (name_vi, name_en, slug, hs_code, category, unit_default, is_active)
values
    ('Thanh long', 'Dragon Fruit', 'thanh-long', null, 'fruit', 'kg', true),
    ('Dua tuoi', 'Fresh Coconut', 'dua-tuoi', null, 'fruit', 'chuc', true)
on conflict (slug) do update
set
    name_vi = excluded.name_vi,
    name_en = excluded.name_en,
    hs_code = excluded.hs_code,
    category = excluded.category,
    unit_default = excluded.unit_default,
    is_active = true;

update public.commodities
set is_active = true
where slug in ('cassava', 'tea-avg');

alter table public.generated_commodity_price_pages
    add column if not exists unit_sections_json jsonb not null default '[]'::jsonb;
