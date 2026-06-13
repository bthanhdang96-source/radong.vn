alter table public.ai_generated_articles
    drop constraint if exists chk_ai_generated_articles_type;

alter table public.ai_generated_articles
    add constraint chk_ai_generated_articles_type check (
        article_type in ('export_period_report', 'export_monthly_report', 'world_daily_price_update', 'agri_blog')
    );

alter table public.ai_article_generation_runs
    drop constraint if exists chk_ai_article_generation_runs_type;

alter table public.ai_article_generation_runs
    add constraint chk_ai_article_generation_runs_type check (
        article_type in ('export_period_report', 'export_monthly_report', 'world_daily_price_update', 'agri_blog')
    );

alter table public.ai_generated_articles
    drop constraint if exists chk_ai_generated_articles_family;

alter table public.ai_generated_articles
    add constraint chk_ai_generated_articles_family check (
        content_family_slug in (
            'tin-gia-nong-san',
            'gia-nong-san-the-gioi',
            'tin-thi-truong-hang-ngay',
            'xuat-khau-va-doanh-nghiep',
            'chuyen-mon-va-chinh-sach',
            'blog-nong-nghiep'
        )
    );

create table if not exists public.ai_blog_topic_seeds (
    id uuid primary key default gen_random_uuid(),
    topic_key text not null,
    audience text not null
        check (audience in ('farmer', 'trader', 'exporter')),
    headline_hint text not null,
    keyword_main text not null,
    keywords_sub text[] not null default '{}',
    style text not null default 'guide'
        check (style in ('guide', 'analysis', 'market_note')),
    priority integer not null default 50
        check (priority between 0 and 100),
    status text not null default 'pending'
        check (status in ('pending', 'used', 'archived')),
    source_ref jsonb not null default '{}'::jsonb,
    last_used_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_ai_blog_topic_seeds_audience_key unique (audience, topic_key)
);

create index if not exists idx_ai_blog_topic_seeds_pending
    on public.ai_blog_topic_seeds (audience, priority desc, created_at asc)
    where status = 'pending';

create index if not exists idx_ai_blog_topic_seeds_status_updated
    on public.ai_blog_topic_seeds (status, updated_at desc);

drop trigger if exists trg_ai_blog_topic_seeds_updated_at on public.ai_blog_topic_seeds;
create trigger trg_ai_blog_topic_seeds_updated_at
before update on public.ai_blog_topic_seeds
for each row
execute function public.sync_updated_at_column();

alter table public.ai_blog_topic_seeds enable row level security;

revoke all on public.ai_blog_topic_seeds from anon, authenticated;
grant all on public.ai_blog_topic_seeds to service_role;

drop policy if exists "service manage ai blog topic seeds" on public.ai_blog_topic_seeds;
create policy "service manage ai blog topic seeds"
    on public.ai_blog_topic_seeds
    for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
