create table if not exists public.ai_generated_articles (
    id uuid primary key default gen_random_uuid(),
    article_type text not null,
    article_scope_key text not null,
    slug text not null unique,
    title text not null,
    excerpt text,
    answer_summary text,
    content_html text,
    content_text text,
    status text not null default 'draft',
    content_family_slug text not null,
    category text,
    topic_tags text[] not null default '{}',
    thumbnail_url text,
    source_label text not null default 'NongSanVN AI',
    source_key text not null default 'nongsanvn_ai',
    source_facts_json jsonb not null default '{}'::jsonb,
    data_cutoff timestamptz,
    data_granularity text not null,
    primary_period_code text,
    primary_observed_on date,
    seo_json jsonb not null default '{}'::jsonb,
    quality_json jsonb not null default '{}'::jsonb,
    model_name text,
    prompt_version text not null default 'ai-articles-v1',
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_ai_generated_articles_type check (
        article_type in ('export_period_report', 'export_monthly_report', 'world_daily_price_update')
    ),
    constraint chk_ai_generated_articles_status check (status in ('draft', 'published', 'archived', 'failed')),
    constraint chk_ai_generated_articles_family check (
        content_family_slug in ('tin-gia-nong-san', 'tin-thi-truong-hang-ngay', 'xuat-khau-va-doanh-nghiep', 'chuyen-mon-va-chinh-sach')
    ),
    constraint chk_ai_generated_articles_granularity check (
        data_granularity in ('daily', 'period', 'monthly', 'as_published', 'mixed', 'unknown')
    ),
    constraint uq_ai_generated_articles_scope unique (article_type, article_scope_key)
);

create table if not exists public.ai_article_generation_runs (
    id uuid primary key default gen_random_uuid(),
    article_type text not null,
    article_scope_key text not null,
    status text not null default 'started',
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    source_facts_hash text,
    model_name text,
    prompt_version text not null default 'ai-articles-v1',
    article_id uuid references public.ai_generated_articles(id) on delete set null,
    error text,
    metadata_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_ai_article_generation_runs_type check (
        article_type in ('export_period_report', 'export_monthly_report', 'world_daily_price_update')
    ),
    constraint chk_ai_article_generation_runs_status check (status in ('started', 'success', 'skipped', 'failed'))
);

create index if not exists idx_ai_generated_articles_status_updated
    on public.ai_generated_articles (status, updated_at desc);

create index if not exists idx_ai_generated_articles_family_published
    on public.ai_generated_articles (content_family_slug, published_at desc);

create index if not exists idx_ai_generated_articles_primary_period
    on public.ai_generated_articles (primary_period_code)
    where primary_period_code is not null;

create index if not exists idx_ai_generated_articles_primary_observed
    on public.ai_generated_articles (primary_observed_on desc)
    where primary_observed_on is not null;

create index if not exists idx_ai_article_generation_runs_scope
    on public.ai_article_generation_runs (article_type, article_scope_key, started_at desc);

drop trigger if exists trg_ai_generated_articles_updated_at on public.ai_generated_articles;
create trigger trg_ai_generated_articles_updated_at
before update on public.ai_generated_articles
for each row
execute function public.sync_updated_at_column();

drop trigger if exists trg_ai_article_generation_runs_updated_at on public.ai_article_generation_runs;
create trigger trg_ai_article_generation_runs_updated_at
before update on public.ai_article_generation_runs
for each row
execute function public.sync_updated_at_column();

alter table public.ai_generated_articles enable row level security;
alter table public.ai_article_generation_runs enable row level security;

drop policy if exists "public read published ai articles" on public.ai_generated_articles;
create policy "public read published ai articles"
    on public.ai_generated_articles
    for select
    using (status = 'published');

drop policy if exists "service manage ai articles" on public.ai_generated_articles;
create policy "service manage ai articles"
    on public.ai_generated_articles
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "service manage ai article runs" on public.ai_article_generation_runs;
create policy "service manage ai article runs"
    on public.ai_article_generation_runs
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

grant select on public.ai_generated_articles to anon, authenticated;
grant all on public.ai_generated_articles to service_role;
grant all on public.ai_article_generation_runs to service_role;
