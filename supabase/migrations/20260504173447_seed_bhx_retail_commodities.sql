insert into public.commodities (name_vi, name_en, slug, category, unit_default, is_active)
values
    ('Ca chua', 'Tomato', 'ca-chua', 'vegetable', 'kg', true),
    ('Hanh tay', 'Onion', 'hanh-tay', 'vegetable', 'kg', true),
    ('Toi', 'Garlic', 'toi', 'vegetable', 'kg', true),
    ('Khoai tay', 'Potato', 'khoai-tay', 'vegetable', 'kg', true),
    ('Bap cai', 'Cabbage', 'bap-cai', 'vegetable', 'kg', true),
    ('Rau muong', 'Water Spinach', 'rau-muong', 'vegetable', 'kg', true),
    ('Cai xanh', 'Leafy Greens', 'cai-xanh', 'vegetable', 'kg', true),
    ('Ot', 'Chili', 'ot', 'vegetable', 'kg', true),
    ('Bi do', 'Pumpkin', 'bi-do', 'vegetable', 'kg', true),
    ('Khoai lang', 'Sweet Potato', 'khoai-lang', 'vegetable', 'kg', true),
    ('Xoai', 'Mango', 'xoai', 'fruit', 'kg', true),
    ('Chuoi', 'Banana', 'chuoi', 'fruit', 'kg', true),
    ('Mit', 'Jackfruit', 'mit', 'fruit', 'kg', true),
    ('Thit heo', 'Pork', 'thit-heo', 'meat', 'kg', true)
on conflict (slug) do update
set
    name_vi = excluded.name_vi,
    name_en = excluded.name_en,
    category = excluded.category,
    unit_default = excluded.unit_default,
    is_active = true;
