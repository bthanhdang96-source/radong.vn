alter table public.price_observations
    add column if not exists dedupe_key text;

update public.price_observations
set dedupe_key = md5(
    lower(
        concat_ws(
            '|',
            source_name,
            commodity_slug,
            price_type,
            coalesce(province_code, country_code, 'na'),
            coalesce(nullif(trim(market_name), ''), nullif(trim(article_title), ''), nullif(trim(source_url), ''), 'na'),
            coalesce(round(price_vnd)::text, 'na'),
            recorded_at::date::text
        )
    )
)
where dedupe_key is null;

create index if not exists idx_po_source_dedupe_time
    on public.price_observations (source_name, dedupe_key, recorded_at desc)
    where dedupe_key is not null;
