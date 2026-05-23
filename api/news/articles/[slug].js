import { createClient } from '@supabase/supabase-js'

const FAMILY_META = {
  'tin-gia-nong-san': {
    label: 'Tin giá nông sản',
    path: '/tin-tuc/nhom/tin-gia-nong-san',
  },
  'tin-thi-truong-hang-ngay': {
    label: 'Tin thị trường hằng ngày',
    path: '/tin-tuc/nhom/tin-thi-truong-hang-ngay',
  },
  'xuat-khau-va-doanh-nghiep': {
    label: 'Xuất khẩu & doanh nghiệp',
    path: '/tin-tuc/nhom/xuat-khau-va-doanh-nghiep',
  },
  'chuyen-mon-va-chinh-sach': {
    label: 'Chuyên môn & chính sách',
    path: '/tin-tuc/nhom/chuyen-mon-va-chinh-sach',
  },
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY

  return { url, key }
}

function getArticleTimestamp(row) {
  return row.published_at || row.updated_at || row.created_at
}

function toNewsListItem(row) {
  const family = FAMILY_META[row.content_family_slug] || {
    label: 'Tin tức',
    path: '/tin-tuc',
  }

  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    thumbnailUrl: row.thumbnail_url,
    sourceKey: row.source_key || 'nongsanvn_ai',
    sourceLabel: row.source_label || 'NongSanVN AI',
    publishedAt: getArticleTimestamp(row),
    category: row.category,
    topicTags: row.topic_tags || [],
    contentMode: 'full_html',
    contentFamilySlug: row.content_family_slug,
    contentFamilyLabel: family.label,
    familyPath: family.path,
  }
}

function toNewsDetail(row) {
  return {
    ...toNewsListItem(row),
    canonicalUrl: `/tin-tuc/${row.slug}`,
    contentHtml: row.content_html,
    contentText: row.content_text,
    author: row.source_label || 'NongSanVN AI',
    fetchedAt: row.updated_at || row.created_at,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : ''
  if (!slug) {
    res.status(400).json({ success: false, error: 'Article slug is required' })
    return
  }

  const { url, key } = getSupabaseConfig()
  if (!url || !key) {
    res.status(500).json({ success: false, error: 'Supabase public API is not configured' })
    return
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data: article, error } = await supabase
    .from('ai_generated_articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load article' })
    return
  }

  if (!article) {
    res.status(404).json({ success: false, error: 'Article not found' })
    return
  }

  const { data: relatedRows, error: relatedError } = await supabase
    .from('ai_generated_articles')
    .select('*')
    .eq('status', 'published')
    .eq('content_family_slug', article.content_family_slug)
    .neq('slug', slug)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(4)

  if (relatedError) {
    res.status(500).json({ success: false, error: relatedError.message || 'Failed to load related articles' })
    return
  }

  const related = (relatedRows || []).map(toNewsListItem)
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
  res.status(200).json({
    success: true,
    article: toNewsDetail(article),
    related,
    latestFromSource: related,
  })
}
