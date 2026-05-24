alter table public.ai_generated_articles
    drop constraint if exists chk_ai_generated_articles_family;

alter table public.ai_generated_articles
    add constraint chk_ai_generated_articles_family check (
        content_family_slug in (
            'tin-gia-nong-san',
            'gia-nong-san-the-gioi',
            'tin-thi-truong-hang-ngay',
            'xuat-khau-va-doanh-nghiep',
            'chuyen-mon-va-chinh-sach'
        )
    );

update public.ai_generated_articles
set
    content_family_slug = 'gia-nong-san-the-gioi',
    category = coalesce(category, 'Gia the gioi')
where article_type = 'world_daily_price_update'
  and content_family_slug = 'tin-gia-nong-san';
