create table if not exists public.news_sources (
    key text primary key,
    label text not null,
    base_url text not null,
    discover_url text not null,
    discover_mode text not null
        check (discover_mode in ('rss', 'sitemap', 'html', 'browser_html')),
    priority text not null check (priority in ('P0', 'P1', 'P2', 'P3')),
    phase integer not null check (phase between 1 and 4),
    access_state text not null default 'public_ok'
        check (access_state in ('public_ok', 'partial', 'blocked', 'login_required')),
    latest_detected_at timestamptz,
    freshness_checked_at timestamptz,
    active boolean not null default true,
    full_text_capable boolean not null default true,
    browser_required boolean not null default false,
    rate_limit_ms integer not null default 1000 check (rate_limit_ms >= 0),
    max_articles_per_run integer not null default 20 check (max_articles_per_run > 0),
    topic_tags text[] not null default '{}',
    article_url_pattern text,
    config jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.news_articles (
    id uuid primary key default gen_random_uuid(),
    source_key text not null references public.news_sources(key) on delete cascade,
    canonical_url text not null unique,
    slug text not null unique,
    title text not null,
    excerpt text,
    content_html text,
    content_text text,
    thumbnail_url text,
    author text,
    category text,
    topic_tags text[] not null default '{}',
    published_at timestamptz not null,
    fetched_at timestamptz not null default now(),
    content_mode text not null default 'metadata_only'
        check (content_mode in ('full_html', 'readability_text', 'metadata_only')),
    fingerprint text not null,
    status text not null default 'published'
        check (status in ('published', 'draft', 'archived')),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.news_crawl_runs (
    id uuid primary key default gen_random_uuid(),
    source_key text not null references public.news_sources(key) on delete cascade,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    discover_count integer not null default 0,
    inserted_count integer not null default 0,
    updated_count integer not null default 0,
    failed_count integer not null default 0,
    status text not null default 'failed'
        check (status in ('success', 'partial', 'failed')),
    error text,
    metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_news_sources_active_priority
    on public.news_sources (active, phase asc, priority asc);
create index if not exists idx_news_articles_published_at
    on public.news_articles (published_at desc);
create index if not exists idx_news_articles_source_published
    on public.news_articles (source_key, published_at desc);
create index if not exists idx_news_articles_status_published
    on public.news_articles (status, published_at desc);
create index if not exists idx_news_articles_topic_tags
    on public.news_articles using gin (topic_tags);
create index if not exists idx_news_crawl_runs_source_started
    on public.news_crawl_runs (source_key, started_at desc);

create or replace function public.sync_updated_at_column()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

revoke all on function public.sync_updated_at_column() from public;

drop trigger if exists trg_news_sources_updated_at on public.news_sources;
create trigger trg_news_sources_updated_at
before update on public.news_sources
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_news_articles_updated_at on public.news_articles;
create trigger trg_news_articles_updated_at
before update on public.news_articles
for each row
execute function public.sync_updated_at_column();

insert into public.news_sources (
    key,
    label,
    base_url,
    discover_url,
    discover_mode,
    priority,
    phase,
    access_state,
    active,
    full_text_capable,
    browser_required,
    rate_limit_ms,
    max_articles_per_run,
    topic_tags,
    article_url_pattern,
    config
)
values
    ('vietnambiz', 'VietnamBiz', 'https://vietnambiz.vn', 'https://vietnambiz.vn/tin-moi-nhat.rss', 'rss', 'P0', 1, 'public_ok', true, true, false, 1000, 30, array['thi-truong', 'gia-ca', 'nong-san'], 'https://vietnambiz.vn/%', jsonb_build_object('topics', jsonb_build_array('thi-truong', 'gia-ca'))),
    ('congthuong', 'Cong Thuong', 'https://congthuong.vn', 'https://congthuong.vn/news-sitemap.xml', 'sitemap', 'P0', 1, 'public_ok', true, true, false, 1000, 30, array['xuat-khau', 'thi-truong', 'nong-san'], 'https://congthuong.vn/%', jsonb_build_object('topics', jsonb_build_array('xuat-khau', 'thi-truong'))),
    ('nongnghiepmoitruong', 'Nong nghiep va Moi truong', 'https://nongnghiepmoitruong.vn', 'https://nongnghiepmoitruong.vn/nong-nghiep.rss', 'rss', 'P0', 1, 'public_ok', true, true, false, 1000, 30, array['nong-nghiep', 'nha-nong'], 'https://nongnghiepmoitruong.vn/%', jsonb_build_object('topics', jsonb_build_array('nong-nghiep', 'nha-nong'))),
    ('vpsaspice', 'VPSA Spice', 'https://vpsaspice.org', 'https://vpsaspice.org/feed/', 'rss', 'P0', 1, 'public_ok', true, true, false, 1000, 25, array['ho-tieu', 'gia-vi'], 'https://vpsaspice.org/%', jsonb_build_object('topics', jsonb_build_array('ho-tieu', 'gia-vi'))),
    ('vietfood', 'Vietfood', 'https://vietfood.org.vn', 'https://vietfood.org.vn/feed/', 'rss', 'P0', 1, 'public_ok', true, true, false, 1200, 20, array['lua-gao'], 'https://vietfood.org.vn/%', jsonb_build_object('topics', jsonb_build_array('lua-gao'))),
    ('khuyennongvn', 'Khuyen nong Viet Nam', 'https://khuyennongvn.gov.vn', 'https://khuyennongvn.gov.vn/sitemap.xml', 'sitemap', 'P1', 2, 'public_ok', true, true, false, 1200, 20, array['khuyen-nong', 'ky-thuat'], 'https://khuyennongvn.gov.vn/%', jsonb_build_object('topics', jsonb_build_array('khuyen-nong', 'ky-thuat'))),
    ('kinhtenongthon', 'Kinh te Nong thon', 'https://kinhtenongthon.vn', 'https://kinhtenongthon.vn/thi-truong/', 'html', 'P1', 2, 'public_ok', true, true, false, 1500, 20, array['nong-thon', 'thi-truong'], 'https://kinhtenongthon.vn/%', jsonb_build_object('topics', jsonb_build_array('nong-thon', 'thi-truong'))),
    ('vinacas', 'VINACAS', 'https://vinacas.com.vn', 'https://vinacas.com.vn/tin-tuc.htm', 'html', 'P1', 2, 'public_ok', true, true, false, 1500, 20, array['hat-dieu', 'xuat-khau'], 'https://vinacas.com.vn/%', jsonb_build_object('topics', jsonb_build_array('hat-dieu', 'xuat-khau'))),
    ('coa', 'COA Organic', 'https://coa.org.vn', 'https://coa.org.vn/vi/news/rss/Tin-tuc/', 'rss', 'P2', 3, 'public_ok', true, true, false, 1500, 15, array['huu-co'], 'https://coa.org.vn/%', jsonb_build_object('topics', jsonb_build_array('huu-co'))),
    ('vasep', 'VASEP Seafood', 'https://seafood.vasep.com.vn', 'https://seafood.vasep.com.vn/', 'html', 'P2', 3, 'login_required', true, false, false, 1800, 15, array['thuy-san', 'xuat-khau'], 'https://seafood.vasep.com.vn/%', jsonb_build_object('topics', jsonb_build_array('thuy-san', 'xuat-khau')))
on conflict (key) do update
set
    label = excluded.label,
    base_url = excluded.base_url,
    discover_url = excluded.discover_url,
    discover_mode = excluded.discover_mode,
    priority = excluded.priority,
    phase = excluded.phase,
    access_state = excluded.access_state,
    active = excluded.active,
    full_text_capable = excluded.full_text_capable,
    browser_required = excluded.browser_required,
    rate_limit_ms = excluded.rate_limit_ms,
    max_articles_per_run = excluded.max_articles_per_run,
    topic_tags = excluded.topic_tags,
    article_url_pattern = excluded.article_url_pattern,
    config = excluded.config,
    updated_at = now();

grant select on public.news_sources to anon, authenticated;
grant select on public.news_articles to anon, authenticated;
grant all privileges on public.news_sources to service_role;
grant all privileges on public.news_articles to service_role;
grant all privileges on public.news_crawl_runs to service_role;

alter table public.news_sources enable row level security;
alter table public.news_articles enable row level security;
alter table public.news_crawl_runs enable row level security;

drop policy if exists "public read news sources" on public.news_sources;
create policy "public read news sources"
    on public.news_sources
    for select
    using (active = true);

drop policy if exists "service manage news sources" on public.news_sources;
create policy "service manage news sources"
    on public.news_sources
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "public read news articles" on public.news_articles;
create policy "public read news articles"
    on public.news_articles
    for select
    using (status = 'published');

drop policy if exists "service manage news articles" on public.news_articles;
create policy "service manage news articles"
    on public.news_articles
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service manage news crawl runs" on public.news_crawl_runs;
create policy "service manage news crawl runs"
    on public.news_crawl_runs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
