insert into public.commodities (name_vi, name_en, slug, hs_code, category, unit_default)
values
    ('Ca tra', 'Live Pangasius', 'ca-tra', '0301.99', 'seafood', 'kg'),
    ('Cam sanh', 'King Mandarin', 'cam-sanh', '0805.21', 'fruit', 'kg'),
    ('Buoi Nam Roi', 'Nam Roi Pomelo', 'buoi-nam-roi', '0805.40', 'fruit', 'kg')
on conflict (slug) do update
set
    name_vi = excluded.name_vi,
    name_en = excluded.name_en,
    hs_code = excluded.hs_code,
    category = excluded.category,
    unit_default = excluded.unit_default,
    is_active = true;
