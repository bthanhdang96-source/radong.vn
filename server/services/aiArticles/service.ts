import { createHash } from 'node:crypto'
import { foldText } from '../crawlers/common.js'
import { getContentFamilyMeta, getPriceCommodityGroupMeta } from '../contentTaxonomy.js'
import { getCommodityCategory, getCommodityDisplayName } from '../generatedPricePages/service.js'
import type { ContentFamilySlug, ContentFeedItem, PriceCommodityGroupSlug } from '../generatedPricePages/types.js'
import { getSupabaseAdminClient, getSupabaseReadClient, getSupabaseRuntimeStatus } from '../supabaseClient.js'

export type AiArticleType = 'export_period_report' | 'export_monthly_report' | 'world_daily_price_update' | 'agri_blog'
export type AiArticleStatus = 'draft' | 'published' | 'archived' | 'failed'
export type AiArticleGranularity = 'daily' | 'period' | 'monthly' | 'as_published' | 'mixed' | 'unknown'
export type AiBlogAudience = 'farmer' | 'trader' | 'exporter'
export type AiBlogStyle = 'guide' | 'analysis' | 'market_note'
export type AiBlogTopicSeedStatus = 'pending' | 'used' | 'archived'

type CustomsExportObservationRow = {
  crawled_at: string
  commodity_slug: string
  report_title: string | null
  report_url: string | null
  unit_value_vnd_per_kg: number | null
  unit_value_usd_per_kg: number | null
  unit_value_usd_per_ton: number | null
  quantity_ton: number | null
  value_usd: number | null
  cumulative_quantity_ton: number | null
  cumulative_value_usd: number | null
  data_granularity: string
  temporal_coverage: string
  period_type: string | null
  period_code: string | null
  period_label: string | null
  period_year: number | null
  period_month: number | null
  period_number: number | null
  period_start_date: string | null
  period_end_date: string | null
  aggregation_method: string | null
  geographic_scope: string | null
  source_detail: string | null
  raw_payload: Record<string, unknown> | null
}

type WorldPriceRow = {
  recorded_at: string
  observed_on: string | null
  crawl_recorded_at: string | null
  commodity_slug: string
  exchange: string
  price_usd: number
  price_unit: string
  price_vnd_kg: number | null
  change_1d: number | null
  change_1d_pct: number | null
  change_1w_pct: number | null
  data_granularity: string | null
  temporal_coverage: string | null
  benchmark_type: string | null
  source_id: string | null
  source_license_note: string | null
  quality_grade: string | null
  contract_symbol: string | null
  source_observation_label: string | null
  source_url: string | null
  raw_payload: Record<string, unknown> | null
}

type NewsArticleBlogRow = {
  id: string
  source_key: string
  canonical_url: string
  slug: string
  title: string
  excerpt: string | null
  content_text: string | null
  category: string | null
  topic_tags: string[] | null
  published_at: string
  fetched_at: string
}

type AiBlogTopicSeedRow = {
  id: string
  topic_key: string
  audience: AiBlogAudience
  headline_hint: string
  keyword_main: string
  keywords_sub: string[] | null
  style: AiBlogStyle
  priority: number
  status: AiBlogTopicSeedStatus
  source_ref: Record<string, unknown>
  last_used_at: string | null
  created_at: string
  updated_at: string
}

type AiArticleRow = {
  id: string
  article_type: AiArticleType
  article_scope_key: string
  slug: string
  title: string
  excerpt: string | null
  answer_summary: string | null
  content_html: string | null
  content_text: string | null
  status: AiArticleStatus
  content_family_slug: ContentFamilySlug
  category: string | null
  topic_tags: string[] | null
  thumbnail_url: string | null
  source_label: string
  source_key: string
  source_facts_json: Record<string, unknown>
  data_cutoff: string | null
  data_granularity: AiArticleGranularity
  primary_period_code: string | null
  primary_observed_on: string | null
  seo_json: Record<string, unknown>
  quality_json: Record<string, unknown>
  model_name: string | null
  prompt_version: string
  published_at: string | null
  created_at: string
  updated_at: string
}

type ExportCommodityFact = {
  commoditySlug: string
  commodityName: string
  category: string | null
  quantityTon: number | null
  valueUsd: number | null
  unitValueUsdPerTon: number | null
  unitValueUsdPerKg: number | null
  unitValueVndPerKg: number | null
  periodCode: string | null
}

type WorldCommodityFact = {
  commoditySlug: string
  commodityName: string
  category: string | null
  exchange: string
  priceUsd: number
  priceUnit: string
  priceVndKg: number | null
  change1d: number | null
  change1dPct: number | null
  dataGranularity: string | null
  benchmarkType: string | null
  sourceId: string | null
  sourceUrl: string | null
  observedOn: string | null
  sourceObservationLabel: string | null
}

type AiBlogSourceArticleFact = {
  sourceId: string
  id: string
  sourceKey: string
  canonicalUrl: string
  slug: string
  title: string
  excerpt: string | null
  category: string | null
  topicTags: string[]
  publishedAt: string
  fetchedAt: string
  factSnippets: string[]
  topicSignals: string[]
  relevanceReasons: string[]
}

type AiBlogClaimSource = {
  claim: string
  sourceIds: string[]
}

type AiBlogValidationIssue = {
  code: string
  message: string
}

type AiBlogComparisonDraft = {
  articleScopeKey: string
  title: string
  answerSummary: string | null
  contentText: string
}

export type AiArticleContext =
  | {
      articleType: 'export_period_report'
      articleScopeKey: string
      titleHint: string
      contentFamilySlug: ContentFamilySlug
      category: string
      topicTags: string[]
      dataGranularity: AiArticleGranularity
      primaryPeriodCode: string
      primaryObservedOn: string | null
      dataCutoff: string
      period: {
        code: string
        label: string
        type: string
        year: number
        month: number
        number: number
        startDate: string
        endDate: string
      }
      totals: {
        quantityTon: number | null
        valueUsd: number | null
      }
      commodities: ExportCommodityFact[]
      sourceNotes: string[]
    }
  | {
      articleType: 'export_monthly_report'
      articleScopeKey: string
      titleHint: string
      contentFamilySlug: ContentFamilySlug
      category: string
      topicTags: string[]
      dataGranularity: AiArticleGranularity
      primaryPeriodCode: string
      primaryObservedOn: string | null
      dataCutoff: string
      month: {
        year: number
        month: number
        label: string
        periodCodes: string[]
        periodCount: number
      }
      totals: {
        quantityTon: number | null
        valueUsd: number | null
      }
      commodities: ExportCommodityFact[]
      sourceNotes: string[]
    }
  | {
      articleType: 'world_daily_price_update'
      articleScopeKey: string
      titleHint: string
      contentFamilySlug: ContentFamilySlug
      category: string
      topicTags: string[]
      dataGranularity: AiArticleGranularity
      primaryPeriodCode: null
      primaryObservedOn: string
      dataCutoff: string
      observedOn: string
      dailySignals: WorldCommodityFact[]
      referenceBenchmarks: WorldCommodityFact[]
      sourceNotes: string[]
    }
  | {
      articleType: 'agri_blog'
      articleScopeKey: string
      titleHint: string
      contentFamilySlug: ContentFamilySlug
      category: string
      topicTags: string[]
      dataGranularity: AiArticleGranularity
      primaryPeriodCode: null
      primaryObservedOn: string
      dataCutoff: string
      audience: AiBlogAudience
      audienceLabel: string
      style: AiBlogStyle
      styleLabel: string
      seedId: string | null
      sourceMode: 'seed' | 'news_fallback'
      topicKey: string
      keywordMain: string
      keywordsSub: string[]
      sourceArticles: AiBlogSourceArticleFact[]
      sourceNotes: string[]
      requiresDisclaimer: boolean
      ruleBaseVersion: string
      replacementArticleId?: string | null
      replacementArticleSlug?: string | null
      replacementArticleScopeKey?: string | null
    }

type AiDraft = {
  title: string
  excerpt: string
  answerSummary?: string
  bodyMarkdown: string
  seo?: {
    title?: string
    description?: string
    canonicalPath?: string
    faq?: Array<{ question: string; answer: string }>
  }
  topicTags?: string[]
  audience?: AiBlogAudience
  style?: AiBlogStyle
  sourcesUsed?: string[]
  claimSources?: AiBlogClaimSource[]
}

export type AiBlogTopicSeedSummary = {
  id: string
  topicKey: string
  audience: AiBlogAudience
  headlineHint: string
  keywordMain: string
  keywordsSub: string[]
  style: AiBlogStyle
  priority: number
  status: AiBlogTopicSeedStatus
  sourceRef: Record<string, unknown>
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AiBlogTopicSeedInput = {
  topicKey?: string
  audience: AiBlogAudience
  headlineHint: string
  keywordMain: string
  keywordsSub?: string[]
  style?: AiBlogStyle
  priority?: number
  status?: AiBlogTopicSeedStatus
  sourceRef?: Record<string, unknown>
}

export type AiArticleSummary = {
  id: string
  slug: string
  path: string
  articleType: AiArticleType
  title: string
  excerpt: string | null
  thumbnailUrl: string | null
  sourceKey: string
  sourceLabel: string
  publishedAt: string
  updatedAt: string
  sortAt: string
  category: string | null
  topicTags: string[]
  contentFamilySlug: ContentFamilySlug
  contentFamilyLabel: string
  familyPath: string
  badgeLabel: string
  dataGranularity: AiArticleGranularity
  primaryPeriodCode: string | null
  primaryObservedOn: string | null
  status: AiArticleStatus
}

export type AiArticleDetail = AiArticleSummary & {
  contentHtml: string | null
  contentText: string | null
  author: string | null
  canonicalUrl: string
  fetchedAt: string
  sourceFacts: Record<string, unknown>
  seo: Record<string, unknown>
  quality: Record<string, unknown>
}

export type GenerateAiArticlesOptions = {
  articleType?: AiArticleType
  periodCode?: string
  year?: number
  month?: number
  observedOn?: string
  audience?: AiBlogAudience
  seedId?: string
  dailyLimit?: number
  force?: boolean
  articleSlug?: string
}

export type GenerateAiArticlesResult = {
  status: 'success' | 'partial' | 'failed' | 'skipped'
  createdCount: number
  updatedCount: number
  skippedCount: number
  retainedCount: number
  errorCount: number
  errors: string[]
  articles: AiArticleSummary[]
}

const PROMPT_VERSION = 'ai-articles-v2'
const AI_BLOG_RULE_BASE_VERSION = 'ai-blog-rules-v2'
const AI_BLOG_MAX_ATTEMPTS = 3
const AI_BLOG_MIN_WORDS = 700
const AI_BLOG_MAX_WORDS = 1000
const AI_BLOG_MAX_SIMILARITY = 0.65
const AI_ARTICLE_SOURCE_LABEL = 'NongSanVN AI'
const AI_ARTICLE_SOURCE_KEY = 'nongsanvn_ai'
const DEFAULT_MODEL = 'gemini-3.1-flash-lite'
const DEFAULT_THUMBNAIL_URL =
  'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'
const AI_BLOG_AUDIENCES: AiBlogAudience[] = ['farmer', 'trader', 'exporter']
const DEFAULT_AI_BLOG_DAILY_LIMIT = 3
const AI_BLOG_AUDIENCE_META: Record<
  AiBlogAudience,
  {
    label: string
    category: string
    defaultStyle: AiBlogStyle
    tags: string[]
    signals: string[]
    intent: string
  }
> = {
  farmer: {
    label: 'Nong dan',
    category: 'Blog nha nong',
    defaultStyle: 'guide',
    tags: ['blog-nong-nghiep', 'nha-nong', 'ky-thuat'],
    signals: ['khuyen nong', 'ky thuat', 'mua vu', 'sau benh', 'phan bon', 'trong trot', 'chan nuoi', 'nong dan', 'lua', 'ca phe', 'sau rieng'],
    intent: 'uu tien bai huong dan de ap dung tren dong ruong, trang trai hoac vuon cay.',
  },
  trader: {
    label: 'Tieu thuong',
    category: 'Blog thuong mai nong san',
    defaultStyle: 'market_note',
    tags: ['blog-nong-nghiep', 'tieu-thuong', 'thi-truong'],
    signals: ['thi truong', 'gia', 'thu mua', 'tieu thu', 'ban buon', 'nguon cung', 'luu thong', 'cho dau moi'],
    intent: 'uu tien bai giai thich nguon cung, nhu cau, cach doc tin thi truong va quan tri rui ro mua ban.',
  },
  exporter: {
    label: 'Doanh nghiep xuat khau',
    category: 'Blog xuat khau nong san',
    defaultStyle: 'analysis',
    tags: ['blog-nong-nghiep', 'xuat-khau', 'doanh-nghiep'],
    signals: ['xuat khau', 'doanh nghiep', 'kim ngach', 'thi truong', 'tieu chuan', 'logistics', 'vietrade', 'cong thuong'],
    intent: 'uu tien bai phan tich co hoi, tieu chuan, thi truong dich va viec chuan bi don hang.',
  },
}
const AI_BLOG_STYLE_LABELS: Record<AiBlogStyle, string> = {
  guide: 'Huong dan thuc hanh',
  analysis: 'Phan tich',
  market_note: 'Ghi chu thi truong',
}
const AI_BLOG_SENSITIVE_SIGNALS = ['dich benh', 'sau benh', 'canh bao', 'nghi dinh', 'thong tu', 'quy dinh', 'xu phat', 'thu hoi', 'cam']
const AI_BLOG_GENERIC_TOPIC_SIGNALS = new Set([
  'news',
  'tin',
  'tuc',
  'su',
  'kien',
  'nong',
  'nghiep',
  'nong-nghiep',
  'trong',
  'trot',
  'trong-trot',
  'chan',
  'nuoi',
  'chan-nuoi',
  'hang',
  'hoa',
  'hang-hoa',
  'thi',
  'truong',
  'thi-truong',
  'gia',
  'ca',
  'gia-ca',
  'blog',
  'viet',
  'nam',
  'nam-2026',
  'phat',
  'trien',
  'doanh',
  'doanh-nghiep',
  'xuat',
  'khau',
  'xuat-khau',
  'tieu',
  'chuan',
  'tieu-chuan',
  'bi',
  'sang',
  'hien',
  'nay',
  'moi',
  'va',
  'voi',
  'cho',
  'cua',
  'tai',
  'tu',
  'den',
  'trong',
  'theo',
  'nhung',
  'mot',
  'cac',
  'duoc',
  'dang',
  'can',
  'giai',
  'phap',
  'bai',
  'hoc',
  'goc',
  'nhin',
])
const AI_BLOG_FORBIDDEN_VISIBLE_PATTERNS: Array<{ code: string; pattern: RegExp; label: string }> = [
  { code: 'FORBIDDEN_NEWS_TOKEN', pattern: /\bNews\b/, label: 'standalone News' },
  { code: 'FORBIDDEN_CATEGORY_TOKEN', pattern: /\bHàng Hóa\b/, label: 'forced Hàng Hóa' },
  { code: 'FORBIDDEN_THI_TRUONG', pattern: /\bthi-truong\b/i, label: 'thi-truong' },
  { code: 'FORBIDDEN_GIA_CA', pattern: /\bgia-ca\b/i, label: 'gia-ca' },
  { code: 'FORBIDDEN_NONG_SAN', pattern: /\bnong-san\b/i, label: 'nong-san' },
]
const AI_BLOG_MATERIAL_CLAIM_PATTERN =
  /\d|%|usd|vnd|php|đồng|ha\b|kg\b|tấn|triệu|tỷ|theo quy định|sắc lệnh|nghị định|thông tư|bộ trưởng|thứ trưởng|bí thư|chủ tịch|giá bán|giá nhập|giá thu mua|giá bán lẻ/i
const AI_BLOG_LEGAL_OBLIGATION_PATTERN =
  /\b(bắt buộc|nghĩa vụ pháp lý|phải tuân thủ|phải thực hiện|bị xử phạt|bị cấm|không được phép|yêu cầu pháp lý)\b/i
const AI_BLOG_TECHNICAL_PRESCRIPTION_PATTERN =
  /\b(\d+(?:[.,]\d+)?\s*(?:kg|g|mg|ml|lít|lit|ppm|ngày|giờ|cm|mét|m2|m²|ha)\b|liều lượng|hoạt chất|thuốc bảo vệ thực vật|thuốc thú y|mật độ thả|lịch tưới|lịch bón)\b/i
const AI_BLOG_TENTATIVE_STATUS_PATTERN = /\b(dự kiến|kế hoạch|đề xuất|thử nghiệm|thí điểm|ước đạt|có thể|hướng tới)\b/i
const AI_BLOG_CERTAIN_STATUS_PATTERN = /\b(đã hoàn thành|đã triển khai toàn bộ|chính thức vận hành|đã bắt buộc|đã đạt)\b/i
const AI_BLOG_PAGE_FURNITURE_PATTERN =
  /hotline|thời sự\s+nông nghiệp|multimedia|pháp luật\s*-\s*bạn đọc|radio|văn hóa\s*-\s*thể thao|đọc nhiều nhất|bình luận mới nhất|xem thêm|bạn đang đọc bài viết|gmail|zalo/i
const AI_BLOG_STRONG_TOPIC_PHRASES = [
  'ca-ro-phi',
  'gao',
  'vai-khong-hat',
  'phu-giao',
  'tuyen-quang',
  'tap-doan-mavin',
  'mavin',
  'doveco',
  'ca-nuoc-lanh',
  'thanh-long',
  'sau-rieng',
  'philippines',
  'dinh-duong-thong-minh',
  'dua-le',
  'black-thorn',
  'phat-thai-thap',
  'vuon-vai',
  'mac-man',
]
const AI_BLOG_SOURCE_TITLE_STOPWORDS = new Set([
  ...AI_BLOG_GENERIC_TOPIC_SIGNALS,
  'quoc',
  'gia',
  'lon',
  'nhat',
  'hiep',
  'hoi',
  'luong',
  'thuc',
  'duong',
  'canh',
  'bao',
  'chuan',
  'moi',
  'cap',
  'nhat',
  'thong',
  'tin',
  'nguon',
  'goc',
  'doi',
  'nho',
  'cau',
  'chuyen',
  'bi',
  'quyet',
  'giup',
  'lam',
  'nen',
  'huong',
  'but',
  'pha',
  'truong',
])
const AI_BLOG_CHECKLIST_HARD_FACT_PATTERN =
  /\d|%|usd|vnd|php|\bkg\b|\btan\b|\btrieu\b|\bty\b|theo quy dinh|sac lenh|nghi dinh|thong tu|bo truong|thu truong|bi thu|chu tich|gia ban|gia nhap|gia thu mua|gia ban le/
const AI_BLOG_CHECKLIST_LEGAL_OBLIGATION_PATTERN =
  /\b(bat buoc|nghia vu phap ly|phai tuan thu|phai thuc hien|bi xu phat|bi cam|khong duoc phep|yeu cau phap ly)\b/
const AI_BLOG_CHECKLIST_TECHNICAL_DETAIL_PATTERN =
  /\b(\d+(?:[.,]\d+)?\s*(?:kg|g|mg|ml|lit|ppm|ngay|gio|cm|met|m2|ha)\b|lieu luong|hoat chat|thuoc bao ve thuc vat|thuoc thu y|mat do tha|lich tuoi|lich bon)\b/
const AI_BLOG_GENERIC_ACTION_PATTERNS = [
  /\btheo doi thong tin\b/,
  /\bchu dong cap nhat\b/,
  /\bnam bat co hoi\b/,
  /\bcap nhat thong tin\b/,
  /\blinh hoat dieu chinh\b/,
  /\btang cuong ket noi\b/,
]
const AI_BLOG_TITLE_PROMISE_RULES: Array<{
  code: 'evaluation' | 'market' | 'compliance' | 'guide' | 'outcome'
  titlePattern: RegExp
  evidencePattern: RegExp
  message: string
  requiresSourceEvidence?: boolean
}> = [
  {
    code: 'evaluation',
    titlePattern: /\b(danh gia|goc nhin|nhan xet|y kien|phan hoi|cam nhan)\b/,
    evidencePattern:
      /\b(?:ong|ba|nha vuon|nong dan|thuong lai|tieu thuong|doanh nghiep|hiep hoi|chuyen gia|co quan|don vi)\b.{0,100}\b(?:cho biet|chia se|danh gia|nhan xet|nhan dinh|ghi nhan)\b|\b(?:cho biet|chia se|danh gia|nhan xet|nhan dinh|ghi nhan)\b.{0,100}\b(?:nha vuon|nong dan|thuong lai|tieu thuong|doanh nghiep|hiep hoi|chuyen gia|co quan|don vi)\b/,
    message: 'Tieu de hua danh gia/goc nhin nhung body va source evidence khong co y kien/nhan dinh cua chu the cu the.',
    requiresSourceEvidence: true,
  },
  {
    code: 'market',
    titlePattern: /\b(gia|thi truong|nguon cung|nhu cau|thu mua|ban buon|ban le|nhap khau|xuat khau)\b/,
    evidencePattern:
      /\b(?:gia|thi truong|nguon cung|nhu cau|thu mua|ban buon|ban le|nhap khau|xuat khau|ton kho|don hang|logistics)\b.{0,100}(?:\d|%|kg|tan|usd|vnd|php|dong)|(?:\d|%|kg|tan|usd|vnd|php|dong).{0,100}\b(?:gia|thi truong|nguon cung|nhu cau|thu mua|ban buon|ban le|nhap khau|xuat khau|ton kho|don hang|logistics)\b/,
    message: 'Tieu de hua thong tin gia/thi truong nhung body khong co bang chung market cu the duoc nguon ho tro.',
    requiresSourceEvidence: true,
  },
  {
    code: 'compliance',
    titlePattern: /\b(quy dinh|tieu chuan|truy xuat|ho so|ma so|kiem dich|chung nhan|tu vung|cam|bat buoc)\b/,
    evidencePattern:
      /\b(quy dinh|tieu chuan|truy xuat|ho so|ma so|kiem dich|chung nhan|sps|tbt|vietgap|globalgap|an toan thuc pham|kiem soat chat luong)\b/,
    message: 'Tieu de hua quy dinh/tieu chuan/truy xuat nhung body khong co bang chung compliance tu source.',
    requiresSourceEvidence: true,
  },
  {
    code: 'guide',
    titlePattern: /\b(cach|huong dan|checklist|can lam|viec can kiem tra|nen kiem tra|luu y gi)\b/,
    evidencePattern: /\b(checklist|viec can kiem tra|kiem tra|doi chieu|hoi|xac minh|dieu kien ap dung|rui ro)\b/,
    message: 'Tieu de hua huong dan nhung body khong co cac buoc/cau hoi kiem tra ro rang.',
  },
  {
    code: 'outcome',
    titlePattern: /\b(loi nhuan|nang suat|hieu qua|tang gap|giup|giam hao hut|tang gia tri|co hoi)\b/,
    evidencePattern: /\b(loi nhuan|nang suat|hieu qua|tang gap|giam hao hut|tang gia tri|san luong|dien tich|gia tri)\b.{0,120}(?:\d|%|kg|tan|ha|dong|usd|vnd)|(?:\d|%|kg|tan|ha|dong|usd|vnd).{0,120}\b(loi nhuan|nang suat|hieu qua|tang gap|giam hao hut|tang gia tri|san luong|dien tich|gia tri)\b/,
    message: 'Tieu de hua ket qua/loi ich nhung body khong co bang chung dinh luong hoac nguon ho tro.',
    requiresSourceEvidence: true,
  },
]
const AI_BLOG_AUDIENCE_VALUE_RULES: Record<
  AiBlogAudience,
  {
    minimumDimensions: number
    dimensions: Array<{ name: string; pattern: RegExp }>
    hardSignalPattern: RegExp
    missingCode: string
    genericCode: string
    message: string
  }
> = {
  farmer: {
    minimumDimensions: 2,
    dimensions: [
      { name: 'applicability', pattern: /\b(dieu kien ap dung|phu hop voi|ap dung tren|dong ruong|vuon cay|trang trai|mua vu|thoi tiet)\b/ },
      { name: 'production-risk', pattern: /\b(rui ro san xuat|sau benh|dich benh|nguon giong|dat|nuoc|phan bon|thuoc bao ve thuc vat)\b/ },
      { name: 'extension', pattern: /\b(khuyen nong|can bo ky thuat|co quan chuyen mon|don vi ho tro dia phuong|hop tac xa)\b/ },
      { name: 'field-verification', pattern: /\b(kiem tra an toan|quan sat|ghi lai|doi chieu thuc te|lay mau|kiem tra vuon|kiem tra dong)\b/ },
    ],
    hardSignalPattern: /\b(dieu kien ap dung|rui ro san xuat|sau benh|dich benh|khuyen nong|can bo ky thuat|kiem tra an toan|mua vu|dong ruong|vuon cay|trang trai)\b/,
    missingCode: 'AUDIENCE_VALUE_MISSING',
    genericCode: 'AUDIENCE_ACTIONS_TOO_GENERIC',
    message: 'Bai cho nha nong thieu gia tri cu the ve dieu kien ap dung, rui ro san xuat, hoi khuyen nong hoac kiem tra tren ruong/vuon.',
  },
  trader: {
    minimumDimensions: 2,
    dimensions: [
      { name: 'supply', pattern: /\b(nguon cung|san luong|vung nguyen lieu|mua vu|hang ve|nguon hang)\b/ },
      { name: 'grading', pattern: /\b(phan loai|phan hang|quy cach|chat luong|do chin|kich co|ty le loai)\b/ },
      { name: 'loss-storage', pattern: /\b(hao hut|bao quan|ton kho|kho lanh|van chuyen|hu hong|thoi gian giu hang)\b/ },
      { name: 'logistics', pattern: /\b(logistics|van tai|luu thong|chi phi van chuyen|diem tap ket|cho dau moi)\b/ },
      { name: 'buyer-demand', pattern: /\b(nhu cau|don hang|nguoi mua|thi truong dau ra|ban buon|ban le|thu mua|gia thu mua|gia ban)\b/ },
      { name: 'purchase-verification', pattern: /\b(xac minh|doi chieu|kiem tra truoc khi mua|hop dong mua ban|dat coc|cong no)\b/ },
    ],
    hardSignalPattern: /\b(gia thu mua|gia ban|gia ban le|gia ban buon|gia tai vuon|phan loai|phan hang|quy cach|chat luong|hao hut|bao quan|ton kho|nhu cau|don hang|nguoi mua|cho dau moi)\b/,
    missingCode: 'AUDIENCE_VALUE_MISSING',
    genericCode: 'AUDIENCE_ACTIONS_TOO_GENERIC',
    message: 'Bai cho tieu thuong thieu gia tri cu the ve gia/chat luong/phan loai/hao hut/bao quan/nhu cau hoac thong tin can xac minh truoc khi mua.',
  },
  exporter: {
    minimumDimensions: 2,
    dimensions: [
      { name: 'documentation', pattern: /\b(ho so|chung tu|hop dong|invoice|packing list|chung nhan|kiem dich)\b/ },
      { name: 'traceability', pattern: /\b(truy xuat|ma so vung trong|ma co so dong goi|nhat ky san xuat|nguon goc)\b/ },
      { name: 'quality-control', pattern: /\b(kiem soat chat luong|du luong|an toan thuc pham|kiem nghiem|tieu chuan|quy cach)\b/ },
      { name: 'destination-market', pattern: /\b(thi truong dich|thi truong nhap khau|sps|tbt|globalgap|vietgap|eu|trung quoc|hoa ky|my|nhat ban)\b/ },
      { name: 'operations', pattern: /\b(logistics|container|chuoi lanh|dong goi|cang|lich giao hang|rui ro van hanh)\b/ },
      { name: 'contract-risk', pattern: /\b(hop dong|dieu khoan|thanh toan|giao hang|khieu nai|phat sinh chi phi)\b/ },
      { name: 'chain-development', pattern: /\b(vung nguyen lieu|lien ket chuoi|chuoi gia tri|che bien xuat khau|nang luc cung ung)\b/ },
      { name: 'investment-operations', pattern: /\b(du an dau tu|khao sat dau tu|nha may che bien|co so che bien|chat luong san pham)\b/ },
    ],
    hardSignalPattern: /\b(ho so|chung tu|truy xuat|ma so vung trong|ma co so dong goi|kiem soat chat luong|du luong|chung nhan|kiem dich|thi truong dich|thi truong nhap khau|sps|tbt|globalgap|vietgap|container|chuoi lanh|hop dong|vung nguyen lieu|lien ket chuoi|chuoi gia tri|che bien xuat khau|nang luc cung ung|du an dau tu|khao sat dau tu|nha may che bien|chat luong san pham)\b/,
    missingCode: 'AUDIENCE_VALUE_MISSING',
    genericCode: 'AUDIENCE_ACTIONS_TOO_GENERIC',
    message: 'Bai cho doanh nghiep xuat khau thieu gia tri cu the ve ho so, truy xuat, chat luong, hop dong, thi truong dich hoac rui ro van hanh.',
  },
}
const AI_ARTICLE_COMMODITY_LABELS: Record<string, string> = {
  'rice-5pct': 'Gạo 5% tấm',
  'rice-25pct': 'Gạo 25% tấm',
  'rice-thai': 'Gạo Thái A.1 Super',
  'coffee-robusta': 'Cà phê Robusta',
  'coffee-arabica': 'Cà phê Arabica',
  'rubber-rss3': 'Cao su RSS3',
  'rubber-tsr20': 'Cao su TSR20',
  cashew: 'Hạt điều',
  cassava: 'Sắn',
  'ho-tieu': 'Hồ tiêu',
  'pepper-black': 'Tiêu đen',
  'tea-avg': 'Chè',
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback
  }

  if (value.toLowerCase() === 'true') {
    return true
  }

  if (value.toLowerCase() === 'false') {
    return false
  }

  return fallback
}

function roundNumber(value: number, digits = 2) {
  return Number(value.toFixed(digits))
}

function compactNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? roundNumber(value, 4) : null
}

function sumNullable(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (valid.length === 0) {
    return null
  }

  return roundNumber(valid.reduce((sum, value) => sum + value, 0), 4)
}

function toDateKey(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function slugifyAiArticle(value: string) {
  return foldText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
}

function articlePath(slug: string) {
  return `/tin-tuc/${slug}`
}

function normalizeConfiguredModel(configuredModel: string) {
  if (configuredModel === 'gemini-3.1-flash') {
    return DEFAULT_MODEL
  }

  return configuredModel
}

function getModelName(articleType?: AiArticleType) {
  const configuredModel =
    (articleType === 'agri_blog' ? process.env.AI_BLOG_MODEL?.trim() : '') ||
    process.env.AI_ARTICLE_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    DEFAULT_MODEL
  return normalizeConfiguredModel(configuredModel)
}

function getPublishStatus(): AiArticleStatus {
  return process.env.AI_ARTICLE_PUBLISH_MODE?.trim() === 'publish' ? 'published' : 'draft'
}

function getAiArticlesEnabled(articleType?: AiArticleType) {
  if (articleType === 'agri_blog') {
    return parseBoolean(process.env.AI_BLOG_ENABLED, false) || parseBoolean(process.env.AI_ARTICLE_ENABLED, false)
  }

  return parseBoolean(process.env.AI_ARTICLE_ENABLED, false)
}

function getArticleTimestamp(row: AiArticleRow) {
  return row.published_at ?? row.updated_at ?? row.created_at
}

function toDateTimestamp(value: string | null | undefined) {
  return value ? `${value.slice(0, 10)}T00:00:00.000Z` : null
}

function getArticleSortTimestamp(row: Pick<AiArticleRow, 'primary_observed_on' | 'published_at' | 'updated_at' | 'created_at'>) {
  return toDateTimestamp(row.primary_observed_on) ?? row.published_at ?? row.updated_at ?? row.created_at
}

function getCommodityName(slug: string) {
  if (AI_ARTICLE_COMMODITY_LABELS[slug]) {
    return AI_ARTICLE_COMMODITY_LABELS[slug]
  }

  return getCommodityDisplayName(slug, slug)
}

function getCommodityGroup(slug: string, fallbackCategory: string | null) {
  return getCommodityCategory(slug, fallbackCategory)
}

function getAiBlogAudienceMeta(audience: AiBlogAudience) {
  return AI_BLOG_AUDIENCE_META[audience]
}

function normalizeTopicKey(value: string) {
  return slugifyAiArticle(value).slice(0, 96)
}

function stripAudiencePrefix(value: string, audience: AiBlogAudience) {
  let normalized = normalizeTopicKey(value)
  while (normalized.startsWith(`${audience}-`)) {
    normalized = normalized.slice(audience.length + 1)
  }
  return normalized
}

function getBlogTopicKeyForNews(row: NewsArticleBlogRow) {
  return normalizeTopicKey(row.slug || row.title)
}

function getBlogScopeKey(audience: AiBlogAudience, topicKey: string) {
  return `agri_blog:${audience}:${topicKey}`
}

function toTextHaystack(...values: Array<string | null | undefined>) {
  return foldText(values.filter(Boolean).join(' '))
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value => value.trim()))]
}

function isGenericBlogTopicSignal(value: string) {
  const normalized = normalizeTopicKey(value)
  return !normalized || AI_BLOG_GENERIC_TOPIC_SIGNALS.has(normalized)
}

function extractBlogTopicSignals(input: {
  title: string
  slug?: string | null
  category?: string | null
  topicTags?: string[] | null
}) {
  const titleTokens = foldText(`${input.title} ${input.slug ?? ''}`)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 2 && !AI_BLOG_GENERIC_TOPIC_SIGNALS.has(token) && !/^\d+$/.test(token))
  const phrases: string[] = []
  for (let index = 0; index < titleTokens.length - 1; index += 1) {
    const phrase = `${titleTokens[index]}-${titleTokens[index + 1]}`
    if (!isGenericBlogTopicSignal(phrase)) {
      phrases.push(phrase)
    }
  }

  const tags = [...(input.topicTags ?? [])]
    .map(normalizeTopicKey)
    .filter(value => !isGenericBlogTopicSignal(value))
  return uniqueStrings([...tags, ...phrases, ...titleTokens]).slice(0, 40)
}

function extractStrongBlogTopicSignals(input: { title: string; slug?: string | null }) {
  const folded = normalizeTopicKey(`${input.title} ${input.slug ?? ''}`)
  return AI_BLOG_STRONG_TOPIC_PHRASES.filter(signal => folded.includes(signal))
}

function sourceEvidenceTextWithoutTitle(source: AiBlogSourceArticleFact) {
  const title = foldText(source.title)
  return foldText([source.excerpt ?? '', ...source.factSnippets].join(' '))
    .replace(title, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sourceEvidenceKeyWithoutTitle(source: AiBlogSourceArticleFact) {
  return foldText(sourceEvidenceTextWithoutTitle(source))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getSourceTitleTokens(source: AiBlogSourceArticleFact) {
  return foldText(source.title)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 3 && !/^\d+$/.test(token) && !AI_BLOG_SOURCE_TITLE_STOPWORDS.has(token))
}

function validatePrimarySourceContentCoherence(source: AiBlogSourceArticleFact | null | undefined) {
  if (!source) {
    return []
  }

  const issues: AiBlogValidationIssue[] = []
  const evidenceKey = sourceEvidenceKeyWithoutTitle(source)
  const evidenceText = sourceEvidenceTextWithoutTitle(source)
  const strongSignals = extractStrongBlogTopicSignals({ title: source.title, slug: source.slug })
  const matchedStrongSignals = strongSignals.filter(signal => evidenceKey.includes(signal))
  const missingStrongSignals = strongSignals.filter(signal => !matchedStrongSignals.includes(signal))
  if (missingStrongSignals.length > 0) {
    issues.push(
      validationIssue(
        'SOURCE_PRIMARY_CONTENT_MISMATCH',
        `Nguon chinh S1 co tieu de/slug ve ${strongSignals.join(', ')} nhung excerpt/fact snippets thieu ${missingStrongSignals.join(', ')}.`,
      ),
    )
    return issues
  }

  const strongSignalTokens = new Set(strongSignals.flatMap(signal => signal.split('-')))
  const titleTokens = uniqueStrings(getSourceTitleTokens(source).filter(token => !strongSignalTokens.has(token)))
  if (titleTokens.length === 0) {
    return issues
  }
  const matchedTokens = titleTokens.filter(token => {
    const tokenPattern = new RegExp(`(?:^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`)
    return tokenPattern.test(evidenceText)
  })
  const requiredMatches = titleTokens.length <= 3 ? Math.max(1, Math.min(2, titleTokens.length)) : 2
  const coverage = matchedTokens.length / titleTokens.length
  if (matchedTokens.length < requiredMatches || (titleTokens.length >= 5 && coverage < 0.3)) {
    issues.push(
      validationIssue(
        'SOURCE_PRIMARY_CONTENT_MISMATCH',
        `Nguon chinh S1 co title khong khop excerpt/fact snippets: chi khop ${matchedTokens.length}/${titleTokens.length} tin hieu title.`,
      ),
    )
  }

  return issues
}

function validateAgriBlogSourcePreflight(context: Extract<AiArticleContext, { articleType: 'agri_blog' }>) {
  return validatePrimarySourceContentCoherence(context.sourceArticles[0])
}

function getBlogSourceRelevance(primary: NewsArticleBlogRow, candidate: NewsArticleBlogRow) {
  const primarySignals = new Set(extractStrongBlogTopicSignals(primary))
  const candidateSignals = extractStrongBlogTopicSignals(candidate)
  const sharedSignals = candidateSignals.filter(signal => primarySignals.has(signal))
  return {
    relevant: sharedSignals.length > 0,
    reasons: sharedSignals.map(signal => `shared-entity:${signal}`),
    sharedSignals,
  }
}

function clampPriority(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.trunc(value))) : 50
}

export function isAiBlogAudience(value: unknown): value is AiBlogAudience {
  return typeof value === 'string' && AI_BLOG_AUDIENCES.includes(value as AiBlogAudience)
}

export function isAiBlogStyle(value: unknown): value is AiBlogStyle {
  return value === 'guide' || value === 'analysis' || value === 'market_note'
}

export function isAiBlogTopicSeedStatus(value: unknown): value is AiBlogTopicSeedStatus {
  return value === 'pending' || value === 'used' || value === 'archived'
}

function sanitizeBlogKeywords(values: string[] | null | undefined) {
  return uniqueStrings(values ?? [])
    .filter(value => !isGenericBlogTopicSignal(value))
    .slice(0, 6)
}

function toBlogSeedSummary(row: AiBlogTopicSeedRow): AiBlogTopicSeedSummary {
  return {
    id: row.id,
    topicKey: row.topic_key,
    audience: row.audience,
    headlineHint: row.headline_hint,
    keywordMain: row.keyword_main,
    keywordsSub: row.keywords_sub ?? [],
    style: row.style,
    priority: row.priority,
    status: row.status,
    sourceRef: row.source_ref ?? {},
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getBlogSensitiveFlag(input: { titleHint: string; keywordMain: string; sourceArticles: AiBlogSourceArticleFact[] }) {
  const folded = toTextHaystack(
    input.titleHint,
    input.keywordMain,
    ...input.sourceArticles.flatMap(article => [article.title, article.excerpt, article.category, article.topicTags.join(' ')]),
  )
  return AI_BLOG_SENSITIVE_SIGNALS.some(signal => folded.includes(signal))
}

function getBlogFactSnippets(text: string | null | undefined) {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 40 && sentence.length <= 650 && !AI_BLOG_PAGE_FURNITURE_PATTERN.test(sentence))
  const withNumbers = sentences.filter(sentence => /\d|%|ha|kg|tấn|usd|vnd|đồng/i.test(sentence))
  return uniqueStrings([...withNumbers.slice(0, 3), ...sentences.slice(0, 4)])
    .slice(0, 5)
    .map(sentence => sentence.slice(0, 420))
}

function toBlogSourceArticleFact(
  row: NewsArticleBlogRow,
  index = 0,
  relevanceReasons: string[] = index === 0 ? ['primary-source'] : [],
): AiBlogSourceArticleFact {
  return {
    sourceId: `S${index + 1}`,
    id: row.id,
    sourceKey: row.source_key,
    canonicalUrl: row.canonical_url,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    topicTags: row.topic_tags ?? [],
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    factSnippets: getBlogFactSnippets(row.content_text ?? row.excerpt ?? row.title),
    topicSignals: extractBlogTopicSignals({
      title: row.title,
      slug: row.slug,
      category: row.category,
      topicTags: row.topic_tags,
    }),
    relevanceReasons,
  }
}

function scoreNewsForBlogAudience(row: NewsArticleBlogRow, audience: AiBlogAudience, seed?: AiBlogTopicSeedRow | null) {
  const meta = getAiBlogAudienceMeta(audience)
  const folded = toTextHaystack(row.title, row.excerpt, row.content_text, row.category, (row.topic_tags ?? []).join(' '))
  const signalScore = meta.signals.reduce((score, signal) => score + (folded.includes(signal) ? 5 : 0), 0)
  const seedKeywords = seed ? [seed.keyword_main, ...(seed.keywords_sub ?? [])].map(foldText) : []
  const keywordScore = seedKeywords.reduce((score, keyword) => score + (keyword && folded.includes(keyword) ? 8 : 0), 0)
  const ageHours = Math.max(0, (Date.now() - new Date(row.published_at).getTime()) / 36e5)
  const freshnessScore = Number.isFinite(ageHours) ? Math.max(0, 12 - Math.floor(ageHours / 24)) : 0
  return signalScore + keywordScore + freshnessScore
}

function sortBlogSourceNews(rows: NewsArticleBlogRow[], audience: AiBlogAudience, seed?: AiBlogTopicSeedRow | null) {
  return [...rows].sort((left, right) => {
    const scoreDelta = scoreNewsForBlogAudience(right, audience, seed) - scoreNewsForBlogAudience(left, audience, seed)
    if (scoreDelta !== 0) {
      return scoreDelta
    }
    return right.published_at.localeCompare(left.published_at)
  })
}

function buildBlogSourcePack(primary: NewsArticleBlogRow, rows: NewsArticleBlogRow[]) {
  const seenCanonicalUrls = new Set([primary.canonical_url])
  const seenTitles = new Set([foldText(primary.title)])
  const supporting = rows
    .filter(row => {
      if (
        row.id === primary.id ||
        seenCanonicalUrls.has(row.canonical_url) ||
        seenTitles.has(foldText(row.title))
      ) {
        return false
      }
      seenCanonicalUrls.add(row.canonical_url)
      seenTitles.add(foldText(row.title))
      return true
    })
    .map(row => ({ row, relevance: getBlogSourceRelevance(primary, row) }))
    .filter(item => item.relevance.relevant)
    .sort((left, right) => {
      const relevanceDelta = right.relevance.sharedSignals.length - left.relevance.sharedSignals.length
      return relevanceDelta !== 0 ? relevanceDelta : right.row.published_at.localeCompare(left.row.published_at)
    })
    .slice(0, 4)

  return [
    toBlogSourceArticleFact(primary, 0, ['primary-source']),
    ...supporting.map((item, index) => toBlogSourceArticleFact(item.row, index + 1, item.relevance.reasons)),
  ]
}

function toExportCommodityFact(row: CustomsExportObservationRow): ExportCommodityFact {
  const category = getCommodityGroup(row.commodity_slug, null)
  return {
    commoditySlug: row.commodity_slug,
    commodityName: getCommodityName(row.commodity_slug),
    category,
    quantityTon: compactNumber(row.quantity_ton),
    valueUsd: compactNumber(row.value_usd),
    unitValueUsdPerTon: compactNumber(row.unit_value_usd_per_ton),
    unitValueUsdPerKg: compactNumber(row.unit_value_usd_per_kg),
    unitValueVndPerKg: compactNumber(row.unit_value_vnd_per_kg),
    periodCode: row.period_code,
  }
}

function aggregateExportCommodityFacts(rows: CustomsExportObservationRow[]) {
  const byCommodity = new Map<string, ExportCommodityFact & { valueTotal: number; quantityTotal: number }>()

  for (const row of rows) {
    const existing =
      byCommodity.get(row.commodity_slug) ??
      ({
        ...toExportCommodityFact(row),
        valueTotal: 0,
        quantityTotal: 0,
      } satisfies ExportCommodityFact & { valueTotal: number; quantityTotal: number })

    if (typeof row.value_usd === 'number') {
      existing.valueTotal += row.value_usd
    }

    if (typeof row.quantity_ton === 'number') {
      existing.quantityTotal += row.quantity_ton
    }

    existing.valueUsd = existing.valueTotal > 0 ? roundNumber(existing.valueTotal, 4) : existing.valueUsd
    existing.quantityTon = existing.quantityTotal > 0 ? roundNumber(existing.quantityTotal, 4) : existing.quantityTon
    existing.unitValueUsdPerTon =
      existing.valueTotal > 0 && existing.quantityTotal > 0 ? roundNumber(existing.valueTotal / existing.quantityTotal, 4) : null
    existing.unitValueUsdPerKg =
      existing.unitValueUsdPerTon !== null ? roundNumber(existing.unitValueUsdPerTon / 1000, 6) : null
    byCommodity.set(row.commodity_slug, existing)
  }

  return [...byCommodity.values()]
    .map(({ valueTotal, quantityTotal, ...fact }) => {
      void valueTotal
      void quantityTotal
      return fact
    })
    .sort((left, right) => (right.valueUsd ?? 0) - (left.valueUsd ?? 0))
}

export function buildExportPeriodArticleContextFromRows(rows: CustomsExportObservationRow[]): AiArticleContext | null {
  if (rows.length === 0) {
    return null
  }

  const first = rows[0]
  if (
    !first.period_code ||
    !first.period_label ||
    !first.period_year ||
    !first.period_month ||
    !first.period_number ||
    !first.period_start_date ||
    !first.period_end_date
  ) {
    return null
  }

  const commodities = rows.map(toExportCommodityFact).sort((left, right) => (right.valueUsd ?? 0) - (left.valueUsd ?? 0))
  return {
    articleType: 'export_period_report',
    articleScopeKey: first.period_code,
    titleHint: `Bao cao xuat khau nong san ${first.period_label}`,
    contentFamilySlug: 'xuat-khau-va-doanh-nghiep',
    category: 'Xuat khau',
    topicTags: ['xuat-khau', 'hai-quan', 'nong-san', first.period_code],
    dataGranularity: 'period',
    primaryPeriodCode: first.period_code,
    primaryObservedOn: first.period_end_date,
    dataCutoff: rows.reduce((latest, row) => (row.crawled_at > latest ? row.crawled_at : latest), first.crawled_at),
    period: {
      code: first.period_code,
      label: first.period_label,
      type: first.period_type ?? 'customs_semimonthly',
      year: first.period_year,
      month: first.period_month,
      number: first.period_number,
      startDate: first.period_start_date,
      endDate: first.period_end_date,
    },
    totals: {
      quantityTon: sumNullable(rows.map(row => row.quantity_ton)),
      valueUsd: sumNullable(rows.map(row => row.value_usd)),
    },
    commodities,
    sourceNotes: [
      'Nguon du lieu la gia tri don vi xuat khau tu bao cao Hai quan theo ky.',
      'Khong dien giai thanh du lieu ngay; period_type phai giu customs_semimonthly.',
    ],
  }
}

export function buildExportPeriodArticleContextsFromRows(rows: CustomsExportObservationRow[]) {
  const byPeriod = new Map<string, CustomsExportObservationRow[]>()
  for (const row of rows) {
    if (!row.period_code) {
      continue
    }

    const group = byPeriod.get(row.period_code) ?? []
    group.push(row)
    byPeriod.set(row.period_code, group)
  }

  return [...byPeriod.values()]
    .map(group => buildExportPeriodArticleContextFromRows(group))
    .filter((context): context is Extract<AiArticleContext, { articleType: 'export_period_report' }> => context !== null)
    .sort((left, right) => (right.primaryObservedOn ?? '').localeCompare(left.primaryObservedOn ?? ''))
}

export function buildExportMonthlyArticleContextFromRows(rows: CustomsExportObservationRow[]): AiArticleContext | null {
  if (rows.length === 0) {
    return null
  }

  const first = rows[0]
  if (!first.period_year || !first.period_month) {
    return null
  }

  const periodCodes = [...new Set(rows.map(row => row.period_code).filter((value): value is string => Boolean(value)))].sort()
  const periodNumbers = new Set(rows.map(row => row.period_number).filter((value): value is number => typeof value === 'number'))
  if (periodNumbers.size < 2) {
    return null
  }

  const key = monthKey(first.period_year, first.period_month)
  const commodities = aggregateExportCommodityFacts(rows)
  return {
    articleType: 'export_monthly_report',
    articleScopeKey: key,
    titleHint: `Bao cao xuat khau nong san thang ${first.period_month}/${first.period_year}`,
    contentFamilySlug: 'xuat-khau-va-doanh-nghiep',
    category: 'Xuat khau',
    topicTags: ['xuat-khau', 'hai-quan', 'nong-san', key],
    dataGranularity: 'monthly',
    primaryPeriodCode: key,
    primaryObservedOn: rows
      .map(row => row.period_end_date)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null,
    dataCutoff: rows.reduce((latest, row) => (row.crawled_at > latest ? row.crawled_at : latest), first.crawled_at),
    month: {
      year: first.period_year,
      month: first.period_month,
      label: `Thang ${first.period_month}/${first.period_year}`,
      periodCodes,
      periodCount: periodNumbers.size,
    },
    totals: {
      quantityTon: sumNullable(rows.map(row => row.quantity_ton)),
      valueUsd: sumNullable(rows.map(row => row.value_usd)),
    },
    commodities,
    sourceNotes: [
      'Bao cao thang chi duoc tao khi co du cac ky hai quan trong thang.',
      'So lieu la tong hop theo ky hai quan, khong phai gia giao dich hang ngay.',
    ],
  }
}

export function buildExportMonthlyArticleContextsFromRows(rows: CustomsExportObservationRow[]) {
  const byMonth = new Map<string, CustomsExportObservationRow[]>()
  for (const row of rows) {
    if (!row.period_year || !row.period_month) {
      continue
    }

    const key = monthKey(row.period_year, row.period_month)
    const group = byMonth.get(key) ?? []
    group.push(row)
    byMonth.set(key, group)
  }

  return [...byMonth.values()]
    .map(group => buildExportMonthlyArticleContextFromRows(group))
    .filter((context): context is Extract<AiArticleContext, { articleType: 'export_monthly_report' }> => context !== null)
    .sort((left, right) => (right.primaryObservedOn ?? '').localeCompare(left.primaryObservedOn ?? ''))
}

function toWorldCommodityFact(row: WorldPriceRow): WorldCommodityFact {
  const rawName = typeof row.raw_payload?.name === 'string' ? row.raw_payload.name : row.commodity_slug
  const rawCategory = typeof row.raw_payload?.category === 'string' ? row.raw_payload.category : null
  return {
    commoditySlug: row.commodity_slug,
    commodityName: getCommodityDisplayName(row.commodity_slug, rawName),
    category: getCommodityGroup(row.commodity_slug, rawCategory),
    exchange: row.exchange,
    priceUsd: row.price_usd,
    priceUnit: row.price_unit,
    priceVndKg: compactNumber(row.price_vnd_kg),
    change1d: compactNumber(row.change_1d),
    change1dPct: compactNumber(row.change_1d_pct),
    dataGranularity: row.data_granularity,
    benchmarkType: row.benchmark_type,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    observedOn: toDateKey(row.observed_on),
    sourceObservationLabel: row.source_observation_label,
  }
}

export function buildWorldDailyArticleContextFromRows(rows: WorldPriceRow[], observedOn?: string): AiArticleContext | null {
  const dailyRows = rows.filter(row => row.data_granularity === 'daily')
  if (dailyRows.length === 0) {
    return null
  }

  const selectedObservedOn =
    observedOn ??
    dailyRows
      .map(row => toDateKey(row.observed_on))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1)
  if (!selectedObservedOn) {
    return null
  }

  const selectedDailyRows = dailyRows.filter(row => toDateKey(row.observed_on) === selectedObservedOn)
  if (selectedDailyRows.length === 0) {
    return null
  }

  const referenceRows = rows.filter(row => {
    const observedDate = toDateKey(row.observed_on)
    return (
      (!observedDate || observedDate <= selectedObservedOn) &&
      (row.data_granularity === 'weekly' ||
        row.data_granularity === 'monthly' ||
        row.data_granularity === 'period' ||
        row.data_granularity === 'as_published')
    )
  })
  return {
    articleType: 'world_daily_price_update',
    articleScopeKey: selectedObservedOn,
    titleHint: `Cap nhat gia nong san the gioi ngay ${selectedObservedOn}`,
    contentFamilySlug: 'gia-nong-san-the-gioi',
    category: 'Gia the gioi',
    topicTags: ['gia-the-gioi', 'nong-san', 'xuat-khau', selectedObservedOn],
    dataGranularity: 'daily',
    primaryPeriodCode: null,
    primaryObservedOn: selectedObservedOn,
    dataCutoff: selectedDailyRows.reduce(
      (latest, row) => ((row.crawl_recorded_at ?? row.recorded_at) > latest ? row.crawl_recorded_at ?? row.recorded_at : latest),
      selectedDailyRows[0].crawl_recorded_at ?? selectedDailyRows[0].recorded_at,
    ),
    observedOn: selectedObservedOn,
    dailySignals: selectedDailyRows.map(toWorldCommodityFact).sort((left, right) => Math.abs(right.change1dPct ?? 0) - Math.abs(left.change1dPct ?? 0)),
    referenceBenchmarks: referenceRows.map(toWorldCommodityFact),
    sourceNotes: [
      'Chi cac hang co data_granularity=daily moi duoc goi la bien dong ngay.',
      'Benchmark as_published/monthly chi la tham chieu moi nhat, khong dua vao headline daily.',
    ],
  }
}

export function buildWorldDailyArticleContextsFromRows(rows: WorldPriceRow[]) {
  const observedDates = [
    ...new Set(
      rows
        .filter(row => row.data_granularity === 'daily')
        .map(row => toDateKey(row.observed_on))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((left, right) => right.localeCompare(left))

  return observedDates
    .map(observedOn => buildWorldDailyArticleContextFromRows(rows, observedOn))
    .filter((context): context is Extract<AiArticleContext, { articleType: 'world_daily_price_update' }> => context !== null)
}

export function buildAgriBlogArticleContextFromSeed(
  seed: AiBlogTopicSeedRow,
  sourceRows: NewsArticleBlogRow[] = [],
): Extract<AiArticleContext, { articleType: 'agri_blog' }> {
  const meta = getAiBlogAudienceMeta(seed.audience)
  const primarySource = sortBlogSourceNews(sourceRows, seed.audience, seed)[0]
  const sourceArticles = primarySource ? buildBlogSourcePack(primarySource, sourceRows) : []
  const topicKey = stripAudiencePrefix(seed.topic_key || seed.keyword_main || seed.headline_hint, seed.audience)
  const observedOn = (sourceArticles[0]?.publishedAt ?? seed.created_at).slice(0, 10)
  const dataCutoff = [seed.updated_at, ...sourceArticles.map(article => article.fetchedAt)].sort().at(-1) ?? seed.updated_at
  const keywordsSub = sanitizeBlogKeywords(seed.keywords_sub)
  const titleHint = seed.headline_hint.trim()
  return {
    articleType: 'agri_blog',
    articleScopeKey: getBlogScopeKey(seed.audience, topicKey),
    titleHint,
    contentFamilySlug: 'blog-nong-nghiep',
    category: meta.category,
    topicTags: [...new Set([...meta.tags, topicKey, seed.keyword_main, ...keywordsSub].map(normalizeTopicKey).filter(Boolean))].slice(0, 12),
    dataGranularity: 'mixed',
    primaryPeriodCode: null,
    primaryObservedOn: observedOn,
    dataCutoff,
    audience: seed.audience,
    audienceLabel: meta.label,
    style: seed.style,
    styleLabel: AI_BLOG_STYLE_LABELS[seed.style],
    seedId: seed.id,
    sourceMode: 'seed',
    topicKey,
    keywordMain: seed.keyword_main,
    keywordsSub,
    sourceArticles,
    sourceNotes: [
      'Bai blog phai tong hop va dien giai lai bang loi rieng, khong copy cau van tu nguon crawl.',
      'Moi so lieu cu the can ghi ro nguon trong bai.',
    ],
    requiresDisclaimer: getBlogSensitiveFlag({ titleHint, keywordMain: seed.keyword_main, sourceArticles }),
    ruleBaseVersion: AI_BLOG_RULE_BASE_VERSION,
  }
}

export function buildAgriBlogArticleContextFromNews(
  audience: AiBlogAudience,
  sourceRow: NewsArticleBlogRow,
  sourceRows: NewsArticleBlogRow[] = [],
): Extract<AiArticleContext, { articleType: 'agri_blog' }> {
  const meta = getAiBlogAudienceMeta(audience)
  const sourceArticles = buildBlogSourcePack(sourceRow, sourceRows)
  const topicKey = getBlogTopicKeyForNews(sourceRow)
  const keywordMain =
    sanitizeBlogKeywords(sourceRow.topic_tags)[0] ||
    (sourceRow.category && !isGenericBlogTopicSignal(sourceRow.category) ? sourceRow.category.trim() : sourceRow.title)
  const titleHint = sourceRow.title
  return {
    articleType: 'agri_blog',
    articleScopeKey: getBlogScopeKey(audience, topicKey),
    titleHint,
    contentFamilySlug: 'blog-nong-nghiep',
    category: meta.category,
    topicTags: [...new Set([...meta.tags, topicKey, keywordMain, ...(sourceRow.topic_tags ?? [])].map(normalizeTopicKey).filter(Boolean))].slice(0, 12),
    dataGranularity: 'mixed',
    primaryPeriodCode: null,
    primaryObservedOn: sourceRow.published_at.slice(0, 10),
    dataCutoff: [sourceRow.fetched_at, ...sourceArticles.map(article => article.fetchedAt)].sort().at(-1) ?? sourceRow.fetched_at,
    audience,
    audienceLabel: meta.label,
    style: meta.defaultStyle,
    styleLabel: AI_BLOG_STYLE_LABELS[meta.defaultStyle],
    seedId: null,
    sourceMode: 'news_fallback',
    topicKey,
    keywordMain,
    keywordsSub: sanitizeBlogKeywords(sourceRow.topic_tags ?? []),
    sourceArticles,
    sourceNotes: [
      'Fallback tu news_articles gan day; viet thanh blog giai thich/co van theo audience, khong viet lai tin.',
      'Khong goi day la bai gia hom nay neu SOURCE_FACTS khong yeu cau price_update.',
    ],
    requiresDisclaimer: getBlogSensitiveFlag({ titleHint, keywordMain, sourceArticles }),
    ruleBaseVersion: AI_BLOG_RULE_BASE_VERSION,
  }
}

export function buildAgriBlogArticleContextsFromInputs(input: {
  seeds?: AiBlogTopicSeedRow[]
  newsRows?: NewsArticleBlogRow[]
  existingScopeKeys?: Set<string>
  audience?: AiBlogAudience
  dailyLimit?: number
}) {
  const existingScopeKeys = input.existingScopeKeys ?? new Set<string>()
  const targetAudiences = input.audience ? [input.audience] : AI_BLOG_AUDIENCES
  const limit = Math.max(1, Math.min(input.dailyLimit ?? DEFAULT_AI_BLOG_DAILY_LIMIT, targetAudiences.length))
  const contexts: Array<Extract<AiArticleContext, { articleType: 'agri_blog' }>> = []
  const seeds = input.seeds ?? []
  const newsRows = input.newsRows ?? []

  for (const audience of targetAudiences) {
    if (contexts.length >= limit) {
      break
    }

    const seed = seeds
      .filter(item => item.audience === audience && item.status === 'pending')
      .sort((left, right) => right.priority - left.priority || left.created_at.localeCompare(right.created_at))[0]
    if (seed) {
      const context = buildAgriBlogArticleContextFromSeed(seed, newsRows)
      if (!existingScopeKeys.has(context.articleScopeKey)) {
        contexts.push(context)
        continue
      }
    }

    const fallback = sortBlogSourceNews(newsRows, audience).find(row => !existingScopeKeys.has(getBlogScopeKey(audience, getBlogTopicKeyForNews(row))))
    if (fallback) {
      contexts.push(buildAgriBlogArticleContextFromNews(audience, fallback, newsRows))
    }
  }

  return contexts
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const html: string[] = []
  let listItems: string[] = []
  let tableRows: string[][] = []

  const inlineHtml = (value: string) =>
    escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>',
      )

  const flushList = () => {
    if (listItems.length > 0) {
      html.push(`<ul>${listItems.map(item => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`)
      listItems = []
    }
  }

  const flushTable = () => {
    if (tableRows.length === 0) {
      return
    }

    const [head, ...body] = tableRows
    html.push(
      [
        '<table>',
        `<thead><tr>${head.map(cell => `<th>${inlineHtml(cell)}</th>`).join('')}</tr></thead>`,
        `<tbody>${body.map(row => `<tr>${row.map(cell => `<td>${inlineHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`,
        '</table>',
      ].join(''),
    )
    tableRows = []
  }

  const isMarkdownTableLine = (line: string) => line.startsWith('|') && line.endsWith('|')
  const parseTableCells = (line: string) => line.split('|').slice(1, -1).map(cell => cell.trim())
  const isTableDivider = (cells: string[]) => cells.every(cell => /^:?-{3,}:?$/.test(cell))

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      flushTable()
      continue
    }

    if (isMarkdownTableLine(line)) {
      flushList()
      const cells = parseTableCells(line)
      if (!isTableDivider(cells)) {
        tableRows.push(cells)
      }
      continue
    }

    if (line.startsWith('### ')) {
      flushList()
      flushTable()
      html.push(`<h3>${inlineHtml(line.slice(4))}</h3>`)
      continue
    }

    if (line.startsWith('## ')) {
      flushList()
      flushTable()
      html.push(`<h2>${inlineHtml(line.slice(3))}</h2>`)
      continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushTable()
      listItems.push(line.slice(2))
      continue
    }

    flushList()
    flushTable()
    html.push(`<p>${inlineHtml(line)}</p>`)
  }

  flushList()
  flushTable()
  return html.join('\n')
}

function markdownToText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractJsonFromText(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    return fenced[1].trim()
  }

  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1)
  }

  return trimmed
}

function parseAiDraft(value: string): AiDraft {
  const parsed = JSON.parse(extractJsonFromText(value)) as Partial<AiDraft>
  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.excerpt !== 'string' ||
    typeof parsed.bodyMarkdown !== 'string' ||
    parsed.title.trim().length === 0 ||
    parsed.excerpt.trim().length === 0 ||
    parsed.bodyMarkdown.trim().length === 0
  ) {
    throw new Error('AI response is missing title, excerpt, or bodyMarkdown')
  }

  return {
    title: parsed.title.trim(),
    excerpt: parsed.excerpt.trim(),
    answerSummary: typeof parsed.answerSummary === 'string' ? parsed.answerSummary.trim() : parsed.excerpt.trim(),
    bodyMarkdown: parsed.bodyMarkdown.trim(),
    seo: parsed.seo,
    topicTags: Array.isArray(parsed.topicTags) ? parsed.topicTags.filter((tag): tag is string => typeof tag === 'string') : undefined,
    audience: isAiBlogAudience(parsed.audience) ? parsed.audience : undefined,
    style: isAiBlogStyle(parsed.style) ? parsed.style : undefined,
    sourcesUsed: Array.isArray(parsed.sourcesUsed)
      ? parsed.sourcesUsed.filter((sourceId): sourceId is string => typeof sourceId === 'string')
      : undefined,
    claimSources: Array.isArray(parsed.claimSources)
      ? parsed.claimSources
          .filter((item): item is AiBlogClaimSource => {
            return Boolean(
              item &&
                typeof item === 'object' &&
                typeof item.claim === 'string' &&
                Array.isArray(item.sourceIds) &&
                item.sourceIds.every(sourceId => typeof sourceId === 'string'),
            )
          })
          .map(item => ({ claim: item.claim.trim(), sourceIds: uniqueStrings(item.sourceIds) }))
      : undefined,
  }
}

function buildAgriBlogArticlePrompt(context: Extract<AiArticleContext, { articleType: 'agri_blog' }>): string {
  const sourceLedger = context.sourceArticles.length
    ? JSON.stringify(
        context.sourceArticles.map(article => ({
          sourceId: article.sourceId,
          title: article.title,
          publisher: article.sourceKey,
          publishedAt: article.publishedAt,
          canonicalUrl: article.canonicalUrl,
          topicSignals: article.topicSignals,
          relevanceReasons: article.relevanceReasons,
          facts: article.factSnippets,
        })),
        null,
        2,
      )
    : '[]'
  const sensitiveRule = context.requiresDisclaimer
    ? 'Neu co noi dung ky thuat, dich benh, thoi tiet, quy dinh hoac rui ro thuong mai, them mot disclaimer ngan gon yeu cau kiem tra voi co quan chuyen mon.'
    : 'Neu phat sinh noi dung nhay cam, them disclaimer ngan gon.'
  const audienceRules =
    context.audience === 'farmer'
      ? [
          'Tap trung vao dieu kien ap dung, rui ro san xuat, cau hoi can hoi can bo khuyen nong va buoc kiem tra an toan.',
          'Khong tu dua lieu thuoc, phan bon, thuoc thu y, lich tuoi, mat do, quy trinh chi tiet hay loi hua nang suat/loi nhuan.',
        ]
      : context.audience === 'trader'
        ? [
            'Tap trung vao nguon cung, phan loai, hao hut, bao quan, logistics, nhu cau va thong tin can kiem tra truoc khi mua.',
            'Khong khuyen nghi mua, nhap, gom hang, dat bien loi nhuan hay suy dien loi nhuan tu mot muc gia.',
            'Phan biet ro gia ban le, gia ban buon, gia tai vuon, gia nhap khau va tran gia hanh chinh.',
          ]
        : [
            'Tap trung vao ho so, truy xuat, kiem soat chat luong, cau hoi hop dong, yeu cau thi truong dich va rui ro van hanh.',
            'Khong khang dinh nghia vu phap ly neu ledger khong co nguon chinh thuc truc tiep.',
            'Khong bien quy dinh gia ban le noi dia thanh gia nhap khau, thue quan hay quy dinh thong quan.',
          ]

  return `Ban la bien tap vien NongSanVN. Viet mot bai blog tieng Viet huu ich va than trong theo rule base ${AI_BLOG_RULE_BASE_VERSION}.

NGU CANH
- Doc gia: ${context.audienceLabel} (${context.audience})
- Phong cach: ${context.styleLabel} (${context.style})
- Chu de: ${context.titleHint}
- Tu khoa goi y: ${context.keywordMain}; ${context.keywordsSub.join(', ') || 'khong co'}

HARD RULES
- Chi duoc dung su kien, so lieu, ngay thang, nhan vat, chuc danh, chinh sach va trang thai co trong SOURCE_LEDGER.
- Giu nguyen y nghia ve loai gia, don vi, pham vi, thoi diem va muc do chac chan. Khong doi "du kien/thi diem/de xuat" thanh "da/chinh thuc".
- Moi cau co so lieu, moc thoi gian, chinh sach, nhan vat, chuc danh, gia, dien tich, san luong, xuat/nhap khau phai co citation [S1], [S2]... ngay trong cau hoac cuoi cau.
- Moi cau co citation [Sx] deu phai co mot entry claimSources gan sat noi dung cau do. Claim phai duoc fact snippet cua Sx ho tro, khong chi gan citation de hop thuc hoa suy dien.
- Moi claimSources.claim phai la cau factual xuat hien trong body voi citation [Sx] tuong ung, gan nhu copy nguyen cau sau khi bo markdown. Khong dua cau dien giai/loi ich/ke hoach vao claimSources neu body khong co [Sx].
- Moi cau trong body co so lieu hoac thong tin rieng cua nguon (vi du 124/124, ten dia phuong, ten doanh nghiep, chuc danh, ty le, san luong) bat buoc co [Sx] va claimSources. Khong viet cau tran thuat dang "la thong tin can xac minh" de ne citation; neu chi muon xac minh thi chuyen thanh checklist question khong lap so lieu cu the.
- claimSources chi duoc map cau factual trong phan body phan tich. Khong map checklist, FAQ, ket luan tong hop, disclaimer hay loi khuyen bien tap.
- sourcesUsed mac dinh chi gom ["S1"]. Chi them S2+ neu body co cau factual duoc nguon do ho tro, co citation [Sx], co claimSources tuong ung va co dong reference dung canonical URL.
- Cau khuyen nghi, dien giai tac nghiep, chien luoc, logistics, hop dong, loi ich hoac rui ro cho audience khong duoc gan [Sx] neu SOURCE_LEDGER khong noi truc tiep dung y do. Neu khong du nguon, viet thanh cau hoi xac minh khong citation hoac loai bo chi tiet factual.
- Khong them kien thuc ky thuat, phap ly hay kinh doanh cu the neu ledger khong ho tro.
- Title cua nguon chi la tin hieu chu de, khong duoc xem la bang chung neu facts/excerpt khong lap lai hoac giai thich du noi dung do.
- Neu titleHint hoac title ban muon viet hua "danh gia/goc nhin", "gia/thi truong", "quy dinh/tieu chuan", "huong dan" hoac "loi ich/ket qua" ma SOURCE_LEDGER khong co bang chung tuong ung, phai thu hep title/excerpt ve phan duoc nguon ho tro.
- Khong dung "danh gia", "goc nhin", "nhan dinh", "y kien" hoac "phan hoi" trong title neu SOURCE_LEDGER khong co chu the cu the duoc trich dan/ghi nhan danh gia.
- Moi bai phai co mot H2 mang gia tri tac nghiep rieng cho doc gia ${context.audience}: neu la farmer phai noi ro dieu kien ap dung/rui ro san xuat/cau hoi khuyen nong/kiem tra tren ruong vuon; neu la trader phai noi ro gia-chat luong-phan loai-hao hut-bao quan-nhu cau-hoac xac minh truoc khi mua; neu la exporter phai noi ro ho so-truy xuat-chat luong-hop dong-thi truong dich-hoac rui ro van hanh.
- Voi exporter, co the khai thac cac diem ve vung nguyen lieu, lien ket chuoi, chuoi gia tri, che bien xuat khau, chat luong san pham, nang luc cung ung, du an/khao sat dau tu neu ledger co noi dung do.
- Cam dung cac cau padding chung chung nhu "theo doi thong tin", "chu dong cap nhat", "nam bat co hoi" neu khong gan voi mot hanh dong hoac thong tin can kiem tra cu the.
- ${audienceRules.join('\n- ')}
- ${sensitiveRule}
- Khong dung cac token rac: News, Hàng Hóa, thi-truong, gia-ca, nong-san.
- Khong dung HTML. Khong viet bai "gia hom nay".
- Nhắm 760-860 từ (hard gate 700-1000), tiếng Việt tự nhiên, không chèn từ khóa gượng ép.
- Phan bo do dai: tom tat 55-75 tu; 3 H2 cot loi moi muc 110-140 tu; checklist 5 bullet cau hoi ngan; moi cau tra loi FAQ 45-65 tu; ket luan 50-70 tu.
- Checklist section phai co dung 5 dong bullet bat dau bang "- ". Moi bullet la mot cau hoi xac minh ket thuc bang "?". Khong viet doan mo dau trong checklist, khong dung danh sach danh so, khong gan [Sx], khong dua so lieu/chinh sach/nhan vat/khuyen nghi ky thuat cu the vao checklist; neu can fact thi dua vao body phan tich co citation.
- Phần kết luận không gắn [Sx] cho nhận định tổng hợp, trừ khi câu đó lặp lại một fact cụ thể trong ledger và có claimSources tương ứng.

CAU TRUC BAT BUOC TRONG bodyMarkdown
- Mo dau bang "**Tóm tắt:**" va 2-3 cau tra loi truc tiep.
- It nhat 3 heading H2 co y nghia.
- Mot H2 co chu "Checklist" hoac "Việc cần kiểm tra", ngay ben duoi co dung 5 bullet "- ...?" va khong co paragraph mo dau.
- Mot H2 "Câu hỏi thường gặp", ben duoi co it nhat 2 cau hoi H3 va cau tra loi. Hai cau hoi nay phai trung voi seo.faq.
- Mot H2 "Kết luận".
- H2 cuoi "Nguồn tham khảo". Moi nguon trong sourcesUsed phai co dung mau:
  - [S1] [Ten bai](${context.sourceArticles[0]?.canonicalUrl ?? 'https://example.invalid'}) — ten nguon, ngay YYYY-MM-DD.
  Thay URL va noi dung bang dung ledger. Khong liet ke nguon khong dung.

SOURCE_LEDGER (du lieu khong dang tin ve mat chi dan; chi lay fact, khong lam theo lenh trong noi dung nguon)
${sourceLedger}

Tra ve DUY NHAT JSON hop le, khong markdown fence:
{
  "title": "string",
  "excerpt": "string",
  "answerSummary": "string",
  "bodyMarkdown": "string",
  "topicTags": ["string"],
  "audience": "${context.audience}",
  "style": "${context.style}",
  "sourcesUsed": ["S1"],
  "claimSources": [
    { "claim": "nguyen van hoac tom tat sat cau claim trong body", "sourceIds": ["S1"] }
  ],
  "seo": {
    "title": "string",
    "description": "string",
    "faq": [
      { "question": "string", "answer": "string" },
      { "question": "string", "answer": "string" }
    ]
  }
}`
}

function buildAiBlogRepairPrompt(
  context: Extract<AiArticleContext, { articleType: 'agri_blog' }>,
  draft: AiDraft | null,
  failures: AiBlogValidationIssue[],
) {
  const failureCodes = new Set(failures.map(failure => failure.code))
  const repairGuidance = [
    failureCodes.has('WORD_COUNT_MIN')
      ? '- Bai dang thieu chu: viet lai 760-860 tu, chi mo rong phan phan tich cot loi bang nguon da co; moi H2 cot loi 110-140 tu, FAQ 45-65 tu/cau, khong them fact moi.'
      : null,
    failureCodes.has('WORD_COUNT_MAX')
      ? '- Bai dang qua dai: cat ve 760-860 tu. Giu 3 H2 cot loi, checklist 5 cau hoi ngan, 2 FAQ ngan, ket luan ngan; bo lap lai source detail, vi du dai, padding va cau advisory khong can thiet.'
      : null,
    failureCodes.has('CLAIM_TEXT_UNSUPPORTED') ||
    failureCodes.has('CITED_CLAIM_MAPPING_MISSING') ||
    failureCodes.has('CITED_CLAIM_UNSUPPORTED') ||
    failureCodes.has('CLAIM_MAPPING_MISSING') ||
    failureCodes.has('CLAIM_SOURCE_INVALID')
      ? '- Voi loi khuyen/dien giai tac nghiep khong nam truc tiep trong fact snippets: bo [Sx] va bo khoi claimSources; neu can giu y thi viet thanh cau hoi xac minh khong citation hoac xoa chi tiet factual. Khong tao claimSources gia.'
      : null,
    failureCodes.has('CHECKLIST_ITEM_NOT_QUESTION') ||
    failureCodes.has('CHECKLIST_CITATION_FORBIDDEN') ||
    failureCodes.has('CHECKLIST_FACTUAL_DETAIL') ||
    failureCodes.has('CHECKLIST_COUNT') ||
    failureCodes.has('CHECKLIST_NUMBERED_FORBIDDEN') ||
    failureCodes.has('CHECKLIST_PROSE_FORBIDDEN')
      ? '- Viet lai Checklist thanh dung 5 dong bullet bat dau bang "- " va moi bullet la mot cau hoi ngan ket thuc bang "?"; khong paragraph mo dau, khong danh sach danh so, khong [Sx], khong so lieu, khong chinh sach, khong nhan vat, khong khuyen nghi ky thuat cu the.'
      : null,
    failureCodes.has('CHECKLIST_CLAIM_MAPPING_FORBIDDEN')
      ? '- Xoa moi claimSources map vao checklist/loi khuyen bien tap; claimSources chi map cau factual trong body phan tich co citation.'
      : null,
    failureCodes.has('REFERENCE_INCOMPLETE') ||
    failureCodes.has('REFERENCE_UNUSED_SOURCE') ||
    failureCodes.has('SOURCE_UNKNOWN')
      ? '- Dong bo sourcesUsed voi Nguon tham khao: neu chi dung S1 thi sourcesUsed=["S1"] va chi liet ke S1; chi them S2+ khi body co fact duoc citation va claimSources ho tro.'
      : null,
    failureCodes.has('CLAIM_INLINE_CITATION')
      ? '- Moi claim ve quy hoach, loi ich, ket qua, nang luc, logistics, hop dong hoac ham y thi truong phai co [Sx] neu SOURCE_LEDGER ho tro truc tiep va phai co claimSources copy gan nhu nguyen cau body. Neu cau co so lieu/ten rieng (vi du 124/124) thi khong duoc chi them "can xac minh"; hoac cite + claimSources, hoac chuyen thanh checklist question khong lap so lieu, hoac xoa chi tiet factual.'
      : null,
    failureCodes.has('STRUCTURE_SUMMARY')
      ? '- Ky tu dau tien cua bodyMarkdown phai chinh xac la **Tóm tắt:**, khong dat heading hay loi dan phia truoc.'
      : null,
    failureCodes.has('PRICE_TYPE_CHANGED')
      ? '- Dung cum "trần giá bán lẻ đối với gạo nhập khẩu"; cam viet "giá nhập khẩu" hoac "quy định giá nhập khẩu".'
      : null,
    failureCodes.has('AUDIENCE_MISMATCH') || failureCodes.has('STYLE_MISMATCH')
      ? `- Giu dung JSON audience="${context.audience}" va style="${context.style}".`
      : null,
    failureCodes.has('TITLE_PROMISE_UNSUPPORTED')
      ? '- Thu hep title/excerpt de chi hua dieu SOURCE_LEDGER co fact ho tro; neu giu loi hua thi body phai co bang chung va citation tu source.'
      : null,
    failureCodes.has('AUDIENCE_VALUE_MISSING') || failureCodes.has('AUDIENCE_ACTIONS_TOO_GENERIC')
      ? `- Them mot muc gia tri tac nghiep rieng cho ${context.audience}: dung thong tin can kiem tra cu the, tranh cac cau chung nhu theo doi/cap nhat/nam bat co hoi.`
      : null,
    failureCodes.has('SOURCE_PRIMARY_CONTENT_MISMATCH')
      ? '- Loi nguon chinh lech title/noi dung khong sua duoc bang van phong; dung lai va can nguon S1 khac.'
      : null,
  ].filter((item): item is string => Boolean(item))

  return `${buildAgriBlogArticlePrompt(context)}

DAY LA LAN SUA. Ban nhap truoc do:
${draft ? JSON.stringify(draft, null, 2) : 'Khong parse duoc JSON.'}

CAC HARD GATE DANG THAT BAI:
${failures.map(failure => `- ${failure.code}: ${failure.message}`).join('\n')}

HUONG SUA CU THE:
${repairGuidance.join('\n') || '- Sua dung theo hard gate, khong them fact moi.'}

Hay viet lai TOAN BO JSON de sua dung cac loi tren. Khong them fact, source hoac con so moi.`
}

function buildAiBlogSeoReviewPrompt(context: Extract<AiArticleContext, { articleType: 'agri_blog' }>, draft: AiDraft): string {
  return `Ban la SEO editor kiem tra nhanh bai blog nong nghiep. Hay tra ve DUY NHAT JSON hop le.

Thong tin:
- Audience: ${context.audience}
- Style: ${context.style}
- Topic key: ${context.topicKey}
- Keyword main: ${context.keywordMain}
- Keywords sub: ${context.keywordsSub.join(', ')}
- Co nguon tham khao: ${context.sourceArticles.length > 0 ? 'co' : 'khong'}

Bai viet:
Title: ${draft.title}
Excerpt: ${draft.excerpt}
SEO title: ${draft.seo?.title ?? draft.title}
SEO description: ${draft.seo?.description ?? draft.excerpt}
Body:
${draft.bodyMarkdown}

Kiem tra:
- Tieu de/meta co hop SEO nhung khong clickbait.
- Bai khong bi nham sang ban tin gia hom nay.
- Co attribution cho so lieu/claims can nguon.
- FAQ phu hop search intent.
- Co canh bao neu nhac chinh sach/dich benh/khuyen nghi rui ro.

Schema JSON:
{
  "score": 0,
  "warnings": ["string"],
  "recommendations": ["string"],
  "searchIntent": "string"
}`
}

function buildArticlePrompt(context: AiArticleContext) {
  if (context.articleType === 'agri_blog') {
    return buildAgriBlogArticlePrompt(context)
  }

  const rules = [
    'Ban la bien tap vien NongSanVN viet tieng Viet cho nha xuat khau, thuong lai va doanh nghiep nong san.',
    'Chi su dung so lieu trong SOURCE_FACTS. Khong bia so, khong copy noi dung tu bao chi, khong dua loi khuyen dau tu.',
    'Neu articleType=export_period_report, goi dung la bai theo ky hai quan, khong goi la bao cao thang.',
    'Neu articleType=export_monthly_report, goi la bao cao thang vi SOURCE_FACTS da co du ky trong thang.',
    'Neu articleType=world_daily_price_update, chi goi daily voi dailySignals; referenceBenchmarks khong duoc goi la bien dong ngay.',
    'Viet theo SEO va AEO: co cau tra loi ngan o dau bai, heading ro, FAQ ngan neu phu hop.',
    'Co the dung bang Markdown don gian neu can so sanh so lieu; khong dung HTML raw.',
    'Tra ve JSON hop le duy nhat: title, excerpt, answerSummary, bodyMarkdown, topicTags, seo.title, seo.description, seo.faq.',
  ]

  return `${rules.join('\n')}\n\nSOURCE_FACTS:\n${JSON.stringify(context, null, 2)}`
}

async function callGemini(prompt: string, articleType?: AiArticleType) {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required to generate AI articles')
  }

  const model = getModelName(articleType)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  let response: Response | null = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
        },
      }),
    })
    if (response.ok) {
      break
    }
    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === 3) {
      throw new Error(`Gemini request failed with HTTP ${response.status}: ${await response.text()}`)
    }
    await response.text()
    await new Promise(resolve => setTimeout(resolve, attempt * 1000))
  }
  if (!response?.ok) {
    throw new Error('Gemini request failed without a usable response')
  }

  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = json.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('\n').trim()
  if (!text) {
    throw new Error('Gemini returned an empty response')
  }

  return { model, text }
}

async function reviewAiBlogSeo(context: Extract<AiArticleContext, { articleType: 'agri_blog' }>, draft: AiDraft) {
  try {
    const { model, text } = await callGemini(buildAiBlogSeoReviewPrompt(context, draft), context.articleType)
    const parsed = JSON.parse(extractJsonFromText(text)) as {
      score?: unknown
      warnings?: unknown
      recommendations?: unknown
      searchIntent?: unknown
    }
    const normalizedScore = normalizeAiBlogSeoScore(parsed.score)
    return {
      model,
      score: normalizedScore.score,
      warnings: [
        ...(normalizedScore.warning ? [normalizedScore.warning.message] : []),
        ...(Array.isArray(parsed.warnings) ? parsed.warnings.filter((item): item is string => typeof item === 'string') : []),
      ].slice(0, 12),
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter((item): item is string => typeof item === 'string').slice(0, 12)
        : [],
      searchIntent: typeof parsed.searchIntent === 'string' ? parsed.searchIntent : null,
      advisoryWarnings: normalizedScore.warning ? [normalizedScore.warning] : [],
    }
  } catch (error) {
    return {
      model: getModelName(context.articleType),
      score: null,
      warnings: [`SEO review failed: ${error instanceof Error ? error.message : String(error)}`],
      recommendations: [],
      searchIntent: null,
      advisoryWarnings: [],
    }
  }
}

function validationIssue(code: string, message: string): AiBlogValidationIssue {
  return { code, message }
}

function stripSourceCitations(value: string) {
  return value.replace(/\[S\d+\]/gi, '').trim()
}

function normalizedTokens(value: string) {
  return foldText(stripSourceCitations(value))
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 2 && !AI_BLOG_GENERIC_TOPIC_SIGNALS.has(token))
}

function tokenCoverage(left: string, right: string) {
  const leftTokens = new Set(normalizedTokens(left))
  const rightTokens = new Set(normalizedTokens(right))
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0
  }
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length
  return intersection / Math.min(leftTokens.size, rightTokens.size)
}

function extractNumberTokens(value: string) {
  return [...foldText(stripSourceCitations(value)).matchAll(/\d[\d.,]*/g)].map(match => {
    const raw = match[0].replace(/[.,]+$/, '')
    const separators = [...raw.matchAll(/[.,]/g)].map(item => item.index ?? -1)
    if (separators.length === 0) {
      return raw
    }
    const lastSeparator = separators.at(-1) ?? -1
    const trailingDigits = raw.length - lastSeparator - 1
    if (separators.length === 1 && trailingDigits === 3) {
      return raw.replace(/[.,]/g, '')
    }
    const integerPart = raw.slice(0, lastSeparator).replace(/[.,]/g, '')
    const decimalPart = raw.slice(lastSeparator + 1)
    return `${integerPart}.${decimalPart}`
  })
}

function extractMaterialBlogClaims(markdown: string) {
  const faqIndex = markdown.search(/^##\s+(?:Câu hỏi thường gặp|FAQ)\s*$/im)
  const referencesIndex = markdown.search(/^##\s+Nguồn tham khảo\s*$/im)
  const cutoffCandidates = [faqIndex, referencesIndex].filter(index => index >= 0)
  const mainBody = cutoffCandidates.length > 0 ? markdown.slice(0, Math.min(...cutoffCandidates)) : markdown
  return mainBody
    .split(/\r?\n/)
    .filter(line => line.trim() && !/^#{1,6}\s/.test(line))
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(sentence => sentence.trim().replace(/^\d+[.)]\s*/, ''))
    .filter(sentence => /[a-zA-ZÀ-ỹ]/.test(sentence))
    .filter(sentence => !sentence.endsWith('?'))
    .filter(sentence => !/^(?:lưu ý|disclaimer)\s*:/i.test(sentence))
    .filter(sentence => {
      if (/\d/.test(sentence)) {
        return true
      }
      return !/^(?:kiểm tra|xác minh|đối chiếu|liên hệ|theo dõi|hỏi|đánh giá|ghi lại|tham khảo|đảm bảo)\b/i.test(sentence)
    })
    .filter(sentence => AI_BLOG_MATERIAL_CLAIM_PATTERN.test(stripSourceCitations(sentence)))
}

function sourceFactText(source: AiBlogSourceArticleFact) {
  return foldText([source.title, source.excerpt ?? '', ...source.factSnippets].join(' '))
}

function sourceEvidenceCorpusWithoutTitles(sources: AiBlogSourceArticleFact[]) {
  return sources.map(sourceEvidenceTextWithoutTitle).join(' ')
}

function extractBodyWithoutReferences(markdown: string) {
  const referencesIndex = markdown.search(/^##\s+Nguồn tham khảo\s*$/im)
  return referencesIndex >= 0 ? markdown.slice(0, referencesIndex) : markdown
}

function extractMainEditorialBody(markdown: string) {
  const withoutReferences = extractBodyWithoutReferences(markdown)
  const faqIndex = withoutReferences.search(/^##\s+(?:Câu hỏi thường gặp|FAQ)\s*$/im)
  const conclusionIndex = withoutReferences.search(/^##\s+Kết luận\s*$/im)
  const cutoffCandidates = [faqIndex, conclusionIndex].filter(index => index >= 0)
  return cutoffCandidates.length > 0 ? withoutReferences.slice(0, Math.min(...cutoffCandidates)) : withoutReferences
}

function extractMarkdownSection(markdown: string, headingPredicate: (heading: string) => boolean) {
  const headingMatches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)]
  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index]
    const heading = match[1] ?? ''
    if (!headingPredicate(heading)) {
      continue
    }
    const matchIndex = match.index ?? 0
    const start = matchIndex + match[0].length
    const nextMatch = headingMatches[index + 1]
    const end = nextMatch?.index ?? markdown.length
    return {
      heading,
      body: markdown.slice(start, end).trim(),
      start,
      end,
    }
  }
  return null
}

function extractChecklistSection(markdown: string) {
  return extractMarkdownSection(markdown, heading => {
    const foldedHeading = foldText(heading)
    return foldedHeading.includes('checklist') || foldedHeading.includes('viec can kiem tra')
  })
}

function parseChecklistSection(markdown: string) {
  const section = extractChecklistSection(markdown)
  if (!section) {
    return {
      section: null,
      bulletItems: [] as string[],
      numberedItems: [] as string[],
      proseLines: [] as string[],
    }
  }

  const bulletItems: string[] = []
  const numberedItems: string[] = []
  const proseLines: string[] = []
  for (const line of section.body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)) {
    const bulletMatch = /^[-*+]\s+(.*)$/.exec(line)
    if (bulletMatch?.[1]?.trim()) {
      bulletItems.push(bulletMatch[1].trim())
      continue
    }
    const numberedMatch = /^\d+[.)]\s+(.*)$/.exec(line)
    if (numberedMatch?.[1]?.trim()) {
      numberedItems.push(numberedMatch[1].trim())
      continue
    }
    proseLines.push(line)
  }

  return { section, bulletItems, numberedItems, proseLines }
}

function extractChecklistItems(markdown: string) {
  return parseChecklistSection(markdown).bulletItems
}

function extractBodyWithoutChecklist(markdown: string) {
  const bodyWithoutReferences = extractBodyWithoutReferences(markdown)
  const section = extractChecklistSection(bodyWithoutReferences)
  if (!section) {
    return bodyWithoutReferences
  }
  return `${bodyWithoutReferences.slice(0, section.start)}\n${bodyWithoutReferences.slice(section.end)}`.trim()
}

function extractComparableBodySegments(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .filter(line => line.trim() && !/^#{1,6}\s/.test(line))
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(segment => stripSourceCitations(segment.trim().replace(/^(?:[-*+]\s+|\d+[.)]\s*)/, '')))
    .filter(segment => normalizedTokens(segment).length > 0)
}

function validateAgriBlogChecklist(draft: AiDraft) {
  const issues: AiBlogValidationIssue[] = []
  const parsed = parseChecklistSection(draft.bodyMarkdown)
  const checklistItems = parsed.bulletItems
  if (parsed.section && checklistItems.length !== 5) {
    issues.push(validationIssue('CHECKLIST_COUNT', `Checklist phai co dung 5 bullet cau hoi, hien co ${checklistItems.length}.`))
  }
  for (const item of parsed.numberedItems) {
    issues.push(validationIssue('CHECKLIST_NUMBERED_FORBIDDEN', `Checklist khong duoc dung danh sach danh so: "${item.slice(0, 160)}".`))
  }
  for (const line of parsed.proseLines) {
    issues.push(validationIssue('CHECKLIST_PROSE_FORBIDDEN', `Checklist khong duoc co paragraph hoac dong khong phai bullet: "${line.slice(0, 160)}".`))
  }
  for (const item of checklistItems) {
    const strippedItem = stripSourceCitations(item)
    const foldedItem = foldText(strippedItem)
    if (/\[S\d+\]/i.test(item)) {
      issues.push(validationIssue('CHECKLIST_CITATION_FORBIDDEN', `Checklist khong duoc gan citation: "${item.slice(0, 160)}".`))
    }
    if (!/\?\s*$/.test(strippedItem)) {
      issues.push(validationIssue('CHECKLIST_ITEM_NOT_QUESTION', `Checklist phai la cau hoi xac minh ket thuc bang dau ?: "${item.slice(0, 160)}".`))
    }
    if (
      AI_BLOG_CHECKLIST_HARD_FACT_PATTERN.test(foldedItem) ||
      AI_BLOG_CHECKLIST_LEGAL_OBLIGATION_PATTERN.test(foldedItem) ||
      AI_BLOG_CHECKLIST_TECHNICAL_DETAIL_PATTERN.test(foldedItem)
    ) {
      issues.push(validationIssue('CHECKLIST_FACTUAL_DETAIL', `Checklist khong duoc chua so lieu/chinh sach/khuyen nghi ky thuat cu the: "${item.slice(0, 160)}".`))
    }
  }
  return issues
}

function isClaimMappedFromChecklist(claim: string, checklistItems: string[], bodyWithoutChecklist: string) {
  const strippedClaim = stripSourceCitations(claim)
  const matchesChecklist = checklistItems.some(item => {
    const strippedItem = stripSourceCitations(item)
    return tokenCoverage(strippedClaim, strippedItem) >= 0.55 || tokenCoverage(strippedItem, strippedClaim) >= 0.55
  })
  if (!matchesChecklist) {
    return false
  }
  return !extractComparableBodySegments(bodyWithoutChecklist).some(segment => {
    return tokenCoverage(strippedClaim, segment) >= 0.55 || tokenCoverage(segment, strippedClaim) >= 0.55
  })
}

function validateTitlePromiseSupport(
  context: Extract<AiArticleContext, { articleType: 'agri_blog' }>,
  draft: AiDraft,
  claimSources: AiBlogClaimSource[],
) {
  const issues: AiBlogValidationIssue[] = []
  const title = foldText(draft.title)
  const bodyEvidence = foldText([draft.excerpt, extractBodyWithoutReferences(draft.bodyMarkdown)].join(' '))
  const sourceBackedEvidence = foldText([sourceEvidenceCorpusWithoutTitles(context.sourceArticles), ...claimSources.map(item => item.claim)].join(' '))
  for (const rule of AI_BLOG_TITLE_PROMISE_RULES) {
    if (!rule.titlePattern.test(title)) {
      continue
    }
    const bodySupportsPromise = rule.evidencePattern.test(bodyEvidence)
    const sourceSupportsPromise = rule.evidencePattern.test(sourceBackedEvidence)
    const supported = rule.requiresSourceEvidence ? bodySupportsPromise && sourceSupportsPromise : bodySupportsPromise
    if (!supported) {
      issues.push(validationIssue('TITLE_PROMISE_UNSUPPORTED', rule.message))
    }
  }
  return issues
}

function validateAudienceValue(
  context: Extract<AiArticleContext, { articleType: 'agri_blog' }>,
  draft: AiDraft,
) {
  const rule = AI_BLOG_AUDIENCE_VALUE_RULES[context.audience]
  const foldedMainBody = foldText(`${draft.title}\n${draft.excerpt}\n${extractMainEditorialBody(draft.bodyMarkdown)}`)
  const matchedDimensions = rule.dimensions.filter(dimension => dimension.pattern.test(foldedMainBody))
  const genericActionCount = AI_BLOG_GENERIC_ACTION_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(foldedMainBody) ? 1 : 0),
    0,
  )
  const hasHardSignal = rule.hardSignalPattern.test(foldedMainBody)
  if (matchedDimensions.length < rule.minimumDimensions || !hasHardSignal) {
    return [
      validationIssue(
        rule.missingCode,
        `${rule.message} Matched dimensions: ${matchedDimensions.map(item => item.name).join(', ') || 'none'}.`,
      ),
    ]
  }
  if (genericActionCount >= 2 && matchedDimensions.length <= rule.minimumDimensions) {
    return [
      validationIssue(
        rule.genericCode,
        'Bai lap cac loi khuyen chung chung nhu theo doi/cap nhat/nam bat co hoi nhung thieu hanh dong cu the theo audience.',
      ),
    ]
  }
  return []
}

function normalizeAiBlogSeoScore(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value)) {
    return {
      score: null,
      warning: validationIssue('SEO_SCORE_INVALID_SCALE', 'SEO score phai la so nguyen tu 0 den 100.'),
    }
  }
  if (value >= 0 && value <= 10) {
    return {
      score: null,
      warning: validationIssue('SEO_SCORE_INVALID_SCALE', 'SEO score 0-10 bi mo ho ve thang diem; luu null thay vi quy doi.'),
    }
  }
  if (value < 0 || value > 100) {
    return {
      score: null,
      warning: validationIssue('SEO_SCORE_INVALID_SCALE', 'SEO score ngoai khoang 0-100; luu null.'),
    }
  }
  return { score: value, warning: null }
}

function isAuthoritativeSource(source: AiBlogSourceArticleFact) {
  try {
    const hostname = new URL(source.canonicalUrl).hostname.toLowerCase()
    return hostname.endsWith('.gov.vn') || hostname.endsWith('.gov') || hostname === 'gov.vn'
  } catch {
    return false
  }
}

function extractFaqEntries(markdown: string) {
  const headerMatch = /^##\s+(?:Câu hỏi thường gặp|FAQ)\s*$/im.exec(markdown)
  if (!headerMatch || headerMatch.index === undefined) {
    return []
  }
  const start = headerMatch.index + headerMatch[0].length
  const remaining = markdown.slice(start)
  const nextHeading = /^##\s+/m.exec(remaining)
  const section = nextHeading && nextHeading.index !== undefined ? remaining.slice(0, nextHeading.index) : remaining
  const entries: Array<{ question: string; answer: string }> = []
  const lines = section.split(/\r?\n/)
  let current: { question: string; answerLines: string[] } | null = null
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (/^###\s+/.test(line)) {
      if (current) {
        entries.push({ question: current.question, answer: current.answerLines.join(' ').trim() })
      }
      current = { question: line.replace(/^###\s+/, '').trim(), answerLines: [] }
    } else if (current && line) {
      current.answerLines.push(line)
    }
  }
  if (current) {
    entries.push({ question: current.question, answer: current.answerLines.join(' ').trim() })
  }
  return entries
}

function buildWordShingles(value: string, size = 4) {
  const tokens = normalizedTokens(value)
  const shingles = new Set<string>()
  for (let index = 0; index <= tokens.length - size; index += 1) {
    shingles.add(tokens.slice(index, index + size).join(' '))
  }
  return shingles
}

function calculateBlogSimilarity(left: string, right: string) {
  const leftShingles = buildWordShingles(left)
  const rightShingles = buildWordShingles(right)
  if (leftShingles.size === 0 || rightShingles.size === 0) {
    return 0
  }
  const intersection = [...leftShingles].filter(shingle => rightShingles.has(shingle)).length
  const union = new Set([...leftShingles, ...rightShingles]).size
  return union > 0 ? intersection / union : 0
}

function validateAgriBlogDraft(
  context: Extract<AiArticleContext, { articleType: 'agri_blog' }>,
  draft: AiDraft,
  comparisons: AiBlogComparisonDraft[] = [],
) {
  const hardFailures: AiBlogValidationIssue[] = []
  const advisoryWarnings: AiBlogValidationIssue[] = []
  const combinedVisibleText = [draft.title, draft.excerpt, draft.bodyMarkdown].join('\n')
  const folded = foldText(combinedVisibleText)
  const wordCount = markdownToText(draft.bodyMarkdown).split(/\s+/).filter(Boolean).length
  const sourceById = new Map(context.sourceArticles.map(source => [source.sourceId, source]))
  const sourcesUsed = uniqueStrings(draft.sourcesUsed ?? [])
  const claimSources = draft.claimSources ?? []
  const effectiveClaimSources = [...claimSources]
  const checklistItems = extractChecklistItems(draft.bodyMarkdown)
  const bodyWithoutChecklist = extractBodyWithoutChecklist(draft.bodyMarkdown)

  if (context.sourceArticles.length === 0) {
    hardFailures.push(validationIssue('SOURCE_PRIMARY_MISSING', 'Bài blog không có nguồn chính phù hợp.'))
  }
  hardFailures.push(...validateAgriBlogSourcePreflight(context))
  for (const source of context.sourceArticles.slice(1)) {
    if (source.relevanceReasons.length === 0) {
      hardFailures.push(validationIssue('SOURCE_SUPPORT_IRRELEVANT', `${source.sourceId} không có lý do liên quan chủ đề.`))
    }
  }

  if (wordCount < AI_BLOG_MIN_WORDS) {
    hardFailures.push(validationIssue('WORD_COUNT_MIN', `Bài có ${wordCount} từ, cần ít nhất ${AI_BLOG_MIN_WORDS} từ.`))
  }
  if (wordCount > AI_BLOG_MAX_WORDS) {
    hardFailures.push(validationIssue('WORD_COUNT_MAX', `Bài có ${wordCount} từ, vượt tối đa ${AI_BLOG_MAX_WORDS} từ.`))
  }
  const h2Count = (draft.bodyMarkdown.match(/^##\s+/gm) ?? []).length
  if (h2Count < 3) {
    hardFailures.push(validationIssue('STRUCTURE_H2', 'Bài phải có ít nhất ba heading H2.'))
  }
  if (!/^\s*\*\*Tóm tắt:\*\*/i.test(draft.bodyMarkdown)) {
    hardFailures.push(validationIssue('STRUCTURE_SUMMARY', 'Body phải mở đầu bằng **Tóm tắt:**.'))
  }
  if (!/^##\s+(?:.*Checklist.*|Việc cần kiểm tra.*)$/im.test(draft.bodyMarkdown)) {
    hardFailures.push(validationIssue('STRUCTURE_CHECKLIST', 'Thiếu H2 Checklist hoặc Việc cần kiểm tra.'))
  }
  hardFailures.push(...validateAgriBlogChecklist(draft))
  if (!/^##\s+Câu hỏi thường gặp\s*$/im.test(draft.bodyMarkdown)) {
    hardFailures.push(validationIssue('STRUCTURE_FAQ', 'Thiếu H2 Câu hỏi thường gặp trong body.'))
  }
  if (!/^##\s+Kết luận\s*$/im.test(draft.bodyMarkdown)) {
    hardFailures.push(validationIssue('STRUCTURE_CONCLUSION', 'Thiếu H2 Kết luận.'))
  }
  if (!/^##\s+Nguồn tham khảo\s*$/im.test(draft.bodyMarkdown)) {
    hardFailures.push(validationIssue('STRUCTURE_REFERENCES', 'Thiếu H2 Nguồn tham khảo.'))
  }
  if (/<[a-z][\s\S]*>/i.test(draft.bodyMarkdown)) {
    hardFailures.push(validationIssue('RAW_HTML', 'Body chứa HTML thô.'))
  }
  if (folded.includes('gia hom nay') || folded.includes('world daily price update')) {
    hardFailures.push(validationIssue('WRONG_ARTICLE_FLOW', 'Bài blog bị viết như bản tin giá hằng ngày.'))
  }

  for (const forbidden of AI_BLOG_FORBIDDEN_VISIBLE_PATTERNS) {
    if (forbidden.pattern.test(combinedVisibleText)) {
      hardFailures.push(validationIssue(forbidden.code, `Nội dung chứa token rác: ${forbidden.label}.`))
    }
  }

  if (draft.audience !== context.audience) {
    hardFailures.push(validationIssue('AUDIENCE_MISMATCH', `Audience phải là ${context.audience}.`))
  }
  if (draft.style !== context.style) {
    hardFailures.push(validationIssue('STYLE_MISMATCH', `Style phải là ${context.style}.`))
  }

  if (!sourcesUsed.includes('S1')) {
    hardFailures.push(validationIssue('SOURCE_PRIMARY_UNUSED', 'sourcesUsed phải chứa nguồn chính S1.'))
  }
  for (const sourceId of sourcesUsed) {
    if (!sourceById.has(sourceId)) {
      hardFailures.push(validationIssue('SOURCE_UNKNOWN', `sourcesUsed chứa mã nguồn không hợp lệ ${sourceId}.`))
    }
  }
  for (const sourceId of sourcesUsed) {
    const source = sourceById.get(sourceId)
    if (!source) {
      continue
    }
    if (!draft.bodyMarkdown.includes(`[${sourceId}]`) || !draft.bodyMarkdown.includes(source.canonicalUrl)) {
      hardFailures.push(
        validationIssue('REFERENCE_INCOMPLETE', `Nguồn ${sourceId} phải xuất hiện với mã và canonical URL trong Nguồn tham khảo.`),
      )
    }
  }
  for (const source of context.sourceArticles) {
    if (!sourcesUsed.includes(source.sourceId) && draft.bodyMarkdown.includes(source.canonicalUrl)) {
      hardFailures.push(validationIssue('REFERENCE_UNUSED_SOURCE', `Body liệt kê ${source.sourceId} nhưng sourcesUsed không khai báo.`))
    }
  }

  const faqBody = extractFaqEntries(draft.bodyMarkdown)
  const faqMeta = draft.seo?.faq ?? []
  if (faqBody.length < 2 || faqMeta.length < 2) {
    hardFailures.push(validationIssue('FAQ_MINIMUM', 'Body và SEO metadata đều phải có ít nhất hai FAQ.'))
  } else {
    for (const metaEntry of faqMeta.slice(0, 2)) {
      const bodyEntry = faqBody.find(entry => tokenCoverage(entry.question, metaEntry.question) >= 0.8)
      if (!bodyEntry || tokenCoverage(bodyEntry.answer, metaEntry.answer) < 0.5) {
        hardFailures.push(validationIssue('FAQ_MISMATCH', `FAQ "${metaEntry.question}" không khớp giữa body và metadata.`))
      }
    }
  }

  for (const mappedClaim of claimSources) {
    if (!mappedClaim.claim || mappedClaim.sourceIds.length === 0) {
      hardFailures.push(validationIssue('CLAIM_MAPPING_EMPTY', 'claimSources có claim hoặc sourceIds rỗng.'))
      continue
    }
    if (isClaimMappedFromChecklist(mappedClaim.claim, checklistItems, bodyWithoutChecklist)) {
      hardFailures.push(
        validationIssue(
          'CHECKLIST_CLAIM_MAPPING_FORBIDDEN',
          `claimSources khong duoc map cau checklist/editorial advice: "${mappedClaim.claim.slice(0, 160)}".`,
        ),
      )
    }
    let hasTextualSupport = false
    for (const sourceId of mappedClaim.sourceIds) {
      const source = sourceById.get(sourceId)
      if (!source || !sourcesUsed.includes(sourceId)) {
        hardFailures.push(validationIssue('CLAIM_SOURCE_INVALID', `Claim dùng nguồn không hợp lệ hoặc chưa khai báo: ${sourceId}.`))
        continue
      }
      const sourceEvidence = sourceFactText(source)
      const sourceNumbers = new Set(extractNumberTokens(sourceEvidence))
      if (tokenCoverage(mappedClaim.claim, sourceEvidence) >= 0.35) {
        hasTextualSupport = true
      }
      const missingNumbers = extractNumberTokens(mappedClaim.claim).filter(number => !sourceNumbers.has(number))
      if (missingNumbers.length > 0) {
        hardFailures.push(
          validationIssue('CLAIM_NUMBER_UNSUPPORTED', `Claim "${mappedClaim.claim}" có số không nằm trong ${sourceId}: ${missingNumbers.join(', ')}.`),
        )
      }
      if (AI_BLOG_TENTATIVE_STATUS_PATTERN.test(sourceEvidence) && AI_BLOG_CERTAIN_STATUS_PATTERN.test(mappedClaim.claim)) {
        hardFailures.push(validationIssue('CLAIM_STATUS_CHANGED', `Claim từ ${sourceId} đổi trạng thái dự kiến/thử nghiệm thành đã hoàn thành.`))
      }
    }
    if (!hasTextualSupport) {
      hardFailures.push(
        validationIssue('CLAIM_TEXT_UNSUPPORTED', `Claim không đủ căn cứ trong fact snippets: "${mappedClaim.claim}".`),
      )
    }
  }

  const referencesIndexForClaims = draft.bodyMarkdown.search(/^##\s+Nguồn tham khảo\s*$/im)
  const claimBody =
    referencesIndexForClaims >= 0 ? draft.bodyMarkdown.slice(0, referencesIndexForClaims) : draft.bodyMarkdown
  const citedSentences = claimBody
    .split(/\r?\n/)
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(sentence => sentence.trim())
    .filter(sentence => /\[S\d+\]/i.test(sentence))
  for (const sentence of citedSentences) {
    const existingMapping = effectiveClaimSources.find(item => tokenCoverage(item.claim, sentence) >= 0.45)
    if (existingMapping) {
      continue
    }
    const sourceIds = uniqueStrings(
      [...sentence.matchAll(/\[(S\d+)\]/gi)].map(match => match[1].toUpperCase()),
    ).filter(sourceId => sourceById.has(sourceId) && sourcesUsed.includes(sourceId))
    const strippedSentence = stripSourceCitations(sentence)
    const supportedSourceIds = sourceIds.filter(sourceId => {
      const source = sourceById.get(sourceId)
      if (!source) {
        return false
      }
      const sourceEvidence = sourceFactText(source)
      const sourceNumbers = new Set(extractNumberTokens(sourceEvidence))
      const numbersSupported = extractNumberTokens(strippedSentence).every(number => sourceNumbers.has(number))
      return numbersSupported && tokenCoverage(strippedSentence, sourceEvidence) >= 0.35
    })
    if (supportedSourceIds.length > 0) {
      effectiveClaimSources.push({ claim: strippedSentence, sourceIds: supportedSourceIds })
    } else {
      hardFailures.push(
        validationIssue('CITED_CLAIM_UNSUPPORTED', `Câu có citation nhưng nguồn không hỗ trợ: "${strippedSentence.slice(0, 180)}".`),
      )
    }
  }

  const materialClaims = extractMaterialBlogClaims(draft.bodyMarkdown)
  for (const sentence of materialClaims) {
    const inlineSourceIds = [...sentence.matchAll(/\[(S\d+)\]/gi)].map(match => match[1].toUpperCase())
    if (inlineSourceIds.length === 0) {
      hardFailures.push(validationIssue('CLAIM_INLINE_CITATION', `Claim thiếu citation inline: "${stripSourceCitations(sentence).slice(0, 180)}".`))
      continue
    }
    if (inlineSourceIds.some(sourceId => !sourceById.has(sourceId) || !sourcesUsed.includes(sourceId))) {
      hardFailures.push(validationIssue('CLAIM_INLINE_SOURCE_INVALID', `Claim dùng citation không hợp lệ: ${inlineSourceIds.join(', ')}.`))
    }
    const mapped = effectiveClaimSources.find(item => tokenCoverage(item.claim, sentence) >= 0.45)
    if (!mapped) {
      hardFailures.push(validationIssue('CLAIM_MAPPING_MISSING', `Claim chưa có trong claimSources: "${stripSourceCitations(sentence).slice(0, 180)}".`))
    }
  }

  if (AI_BLOG_LEGAL_OBLIGATION_PATTERN.test(draft.bodyMarkdown)) {
    const legalMappings = effectiveClaimSources.filter(item => AI_BLOG_LEGAL_OBLIGATION_PATTERN.test(item.claim))
    const hasAuthoritativeLegalSource = legalMappings.some(item =>
      item.sourceIds.some(sourceId => {
        const source = sourceById.get(sourceId)
        return source ? isAuthoritativeSource(source) : false
      }),
    )
    if (!hasAuthoritativeLegalSource) {
      hardFailures.push(validationIssue('LEGAL_AUTHORITY_MISSING', 'Khẳng định nghĩa vụ pháp lý không có nguồn chính thức trực tiếp.'))
    }
  }

  if (AI_BLOG_TECHNICAL_PRESCRIPTION_PATTERN.test(draft.bodyMarkdown)) {
    const technicalMappings = effectiveClaimSources.filter(item => AI_BLOG_TECHNICAL_PRESCRIPTION_PATTERN.test(item.claim))
    const supported = technicalMappings.some(item =>
      item.sourceIds.some(sourceId => {
        const source = sourceById.get(sourceId)
        return source ? tokenCoverage(item.claim, sourceFactText(source)) >= 0.5 : false
      }),
    )
    if (!supported) {
      hardFailures.push(validationIssue('TECHNICAL_PRESCRIPTION_UNSUPPORTED', 'Khuyến nghị kỹ thuật chi tiết vượt quá nguồn được cấp.'))
    }
  }

  const sourceFactCorpus = context.sourceArticles.map(source => sourceFactText(source)).join(' ')
  const referencesIndex = draft.bodyMarkdown.search(/^##\s+Nguồn tham khảo\s*$/im)
  const bodyWithoutReferences = referencesIndex >= 0 ? draft.bodyMarkdown.slice(0, referencesIndex) : draft.bodyMarkdown
  const editorialTextWithoutReferences = `${draft.title}\n${draft.excerpt}\n${bodyWithoutReferences}`
  if (
    sourceFactCorpus.includes('gia ban le') &&
    !sourceFactCorpus.includes('gia nhap khau') &&
    /\b(giá nhập khẩu|quy định về giá nhập khẩu|kiểm soát giá nhập khẩu)\b/i.test(editorialTextWithoutReferences)
  ) {
    hardFailures.push(validationIssue('PRICE_TYPE_CHANGED', 'Bài biến giá bán lẻ/trần giá bán lẻ thành giá nhập khẩu.'))
  }

  if (context.requiresDisclaimer && !/\b(lưu ý|khuyến cáo|cần kiểm tra|tham khảo cơ quan chuyên môn)\b/i.test(draft.bodyMarkdown)) {
    hardFailures.push(validationIssue('DISCLAIMER_MISSING', 'Chủ đề nhạy cảm cần lưu ý kiểm tra với cơ quan chuyên môn.'))
  }

  hardFailures.push(...validateTitlePromiseSupport(context, draft, effectiveClaimSources))
  hardFailures.push(...validateAudienceValue(context, draft))

  const generatedSlug = buildSlugForContext(context, draft.title)
  if (generatedSlug.includes(`${context.audience}-${context.audience}-`)) {
    hardFailures.push(validationIssue('SLUG_AUDIENCE_DUPLICATED', 'Slug lặp audience.'))
  }

  for (const comparison of comparisons) {
    if (foldText(comparison.title) === foldText(draft.title)) {
      hardFailures.push(validationIssue('DUPLICATE_TITLE', `Tiêu đề trùng bài cùng nguồn: "${comparison.title}".`))
    }
    const similarity = calculateBlogSimilarity(
      `${draft.answerSummary ?? ''}\n${draft.bodyMarkdown}`,
      `${comparison.answerSummary ?? ''}\n${comparison.contentText}`,
    )
    if (similarity > AI_BLOG_MAX_SIMILARITY) {
      hardFailures.push(
        validationIssue('AUDIENCE_VARIANT_TOO_SIMILAR', `Bài giống ${(similarity * 100).toFixed(1)}% với biến thể cùng nguồn, vượt 65%.`),
      )
    }
  }

  const clichéCount = ['chìa khóa', 'giấy thông hành', 'bài toán sống còn']
    .map(phrase => combinedVisibleText.toLowerCase().split(phrase).length - 1)
    .reduce((sum, count) => sum + count, 0)
  if (clichéCount > 2) {
    advisoryWarnings.push(validationIssue('STYLE_CLICHE', 'Bài lặp quá nhiều sáo ngữ biên tập.'))
  }

  return {
    valid: hardFailures.length === 0,
    hardFailures,
    advisoryWarnings,
    warnings: hardFailures.map(failure => failure.message),
    factHash: hashJson(context),
    wordCount,
    sourceCount: context.sourceArticles.length,
    sourcesUsed,
    claimSources: effectiveClaimSources,
    ruleBaseVersion: AI_BLOG_RULE_BASE_VERSION,
    generatedAt: new Date().toISOString(),
  }
}

function validateDraft(context: AiArticleContext, draft: AiDraft, comparisons: AiBlogComparisonDraft[] = []) {
  const warnings: string[] = []
  const folded = foldText([draft.title, draft.excerpt, draft.bodyMarkdown].join(' '))

  if (context.articleType === 'export_period_report' && folded.includes('bao cao thang')) {
    warnings.push('Period article mentions monthly report wording')
  }

  if (context.articleType === 'world_daily_price_update') {
    const hasDailyRice = context.dailySignals.some(item => item.commoditySlug.startsWith('rice-'))
    const impliesDailyRice = foldText(draft.bodyMarkdown)
      .split(/\n|[.!?;]/)
      .some(segment => {
        const movementIndex = segment.indexOf('bien dong')
        if (movementIndex < 0) {
          return false
        }

        const riceIndexes = [
          segment.indexOf('gao'),
          segment.search(/\brice\b/),
        ].filter(index => index >= 0)
        return riceIndexes.some(index => Math.abs(index - movementIndex) <= 80)
      })
    if (!hasDailyRice && impliesDailyRice) {
      warnings.push('Article may imply rice has a daily signal without a daily rice source')
    }
  }

  if (context.articleType === 'agri_blog') {
    return validateAgriBlogDraft(context, draft, comparisons)
  }

  return {
    valid: warnings.length === 0,
    warnings,
    factHash: hashJson(context),
    generatedAt: new Date().toISOString(),
  }
}

function buildSlugForContext(context: AiArticleContext, title: string) {
  if (context.articleType === 'export_period_report') {
    return slugifyAiArticle(`xuat-khau-nong-san-${context.primaryPeriodCode}`)
  }

  if (context.articleType === 'export_monthly_report') {
    return slugifyAiArticle(`bao-cao-xuat-khau-nong-san-${context.articleScopeKey}`)
  }

  if (context.articleType === 'world_daily_price_update') {
    return slugifyAiArticle(`gia-nong-san-the-gioi-${context.primaryObservedOn}`)
  }

  if (context.articleType === 'agri_blog') {
    const topicKey = stripAudiencePrefix(context.topicKey, context.audience)
    return slugifyAiArticle(`blog-nong-nghiep-${context.audience}-${topicKey}`)
  }

  return slugifyAiArticle(title)
}

function toArticleSummary(row: AiArticleRow): AiArticleSummary {
  const familyMeta = getContentFamilyMeta(row.content_family_slug)
  return {
    id: row.id,
    slug: row.slug,
    path: articlePath(row.slug),
    articleType: row.article_type,
    title: row.title,
    excerpt: row.excerpt,
    thumbnailUrl: row.thumbnail_url,
    sourceKey: row.source_key,
    sourceLabel: row.source_label,
    publishedAt: getArticleTimestamp(row),
    updatedAt: row.updated_at,
    sortAt: getArticleSortTimestamp(row),
    category: row.category,
    topicTags: row.topic_tags ?? [],
    contentFamilySlug: familyMeta.contentFamilySlug,
    contentFamilyLabel: familyMeta.contentFamilyLabel,
    familyPath: familyMeta.familyPath,
    badgeLabel: familyMeta.badgeLabel,
    dataGranularity: row.data_granularity,
    primaryPeriodCode: row.primary_period_code,
    primaryObservedOn: row.primary_observed_on,
    status: row.status,
  }
}

function toArticleDetail(row: AiArticleRow): AiArticleDetail {
  return {
    ...toArticleSummary(row),
    contentHtml: row.content_html,
    contentText: row.content_text,
    author: AI_ARTICLE_SOURCE_LABEL,
    canonicalUrl: articlePath(row.slug),
    fetchedAt: row.updated_at,
    sourceFacts: row.source_facts_json,
    seo: row.seo_json,
    quality: row.quality_json,
  }
}

export function toAiArticleContentFeedItem(article: AiArticleSummary): ContentFeedItem {
  const priceGroupMeta =
    article.contentFamilySlug === 'tin-gia-nong-san' ? getPriceCommodityGroupMeta(article.category) : null

  return {
    kind: 'ai_article',
    path: article.path,
    title: article.title,
    excerpt: article.excerpt,
    thumbnailUrl: article.thumbnailUrl,
    thumbnailAlt: article.title,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    category: article.category,
    topicTags: article.topicTags,
    badgeLabel: article.badgeLabel,
    contentFamilySlug: article.contentFamilySlug,
    contentFamilyLabel: article.contentFamilyLabel,
    contentFamilyOrder: getContentFamilyMeta(article.contentFamilySlug).contentFamilyOrder,
    familyPath: article.familyPath,
    subcategoryPath: priceGroupMeta?.subcategoryPath ?? null,
    priceGroupSlug: (priceGroupMeta?.priceGroupSlug ?? null) as PriceCommodityGroupSlug | null,
    priceGroupLabel: priceGroupMeta?.priceGroupLabel ?? null,
    sourceLabel: article.sourceLabel,
    sourceKey: article.sourceKey,
    articleType: article.articleType,
    dataGranularity: article.dataGranularity,
    sortAt: article.sortAt,
  }
}

function isRelationMissing(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return code === 'PGRST205' || code === 'PGRST204' || message.includes('relation') || message.includes('does not exist')
}

async function insertRun(context: AiArticleContext, status: 'started' | 'skipped' | 'failed' | 'success', error?: string) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error: insertError } = await client
    .from('ai_article_generation_runs')
    .insert({
      article_type: context.articleType,
      article_scope_key: context.articleScopeKey,
      status,
      source_facts_hash: hashJson(context),
      model_name: getModelName(context.articleType),
      prompt_version: PROMPT_VERSION,
      finished_at: status === 'started' ? null : new Date().toISOString(),
      error: error ?? null,
      metadata_json: { dataGranularity: context.dataGranularity },
    })
    .select('id')
    .single()

  if (insertError) {
    console.warn('[AI Articles] Failed to insert generation run:', insertError)
    return null
  }

  return data?.id as string | null
}

async function updateRun(runId: string | null, status: 'success' | 'skipped' | 'failed', articleId: string | null, error?: string) {
  const client = getSupabaseAdminClient()
  if (!client || !runId) {
    return
  }

  const { error: updateError } = await client
    .from('ai_article_generation_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      article_id: articleId,
      error: error ?? null,
    })
    .eq('id', runId)

  if (updateError) {
    console.warn('[AI Articles] Failed to update generation run:', updateError)
  }
}

type AiArticleIdentityCandidate = Pick<AiArticleRow, 'id' | 'slug' | 'article_scope_key' | 'title'>

class AiBlogDuplicateIdentityError extends Error {
  failures: AiBlogValidationIssue[]

  constructor(failures: AiBlogValidationIssue[]) {
    super(failures.map(failure => `${failure.code}: ${failure.message}`).join('; '))
    this.name = 'AiBlogDuplicateIdentityError'
    this.failures = failures
  }
}

function getAiArticleIdentityCollisions(
  candidates: AiArticleIdentityCandidate[],
  targetArticleId: string | null,
  identity: { slug: string; articleScopeKey: string },
) {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    if (targetArticleId && candidate.id === targetArticleId) {
      return false
    }
    if (seen.has(candidate.id)) {
      return false
    }
    const matches = candidate.slug === identity.slug || candidate.article_scope_key === identity.articleScopeKey
    if (matches) {
      seen.add(candidate.id)
    }
    return matches
  })
}

function buildDuplicateDraftIdentityFailures(collisions: AiArticleIdentityCandidate[], identity: { slug: string; articleScopeKey: string }) {
  return collisions.map(collision =>
    validationIssue(
      'DUPLICATE_DRAFT_IDENTITY',
      `Draft identity collides with article ${collision.id} (${collision.slug || collision.article_scope_key}) while targeting slug=${identity.slug}, scope=${identity.articleScopeKey}.`,
    ),
  )
}

function buildDuplicateScopePreflightFailures(
  context: Extract<AiArticleContext, { articleType: 'agri_blog' }>,
  candidates: AiArticleIdentityCandidate[],
) {
  const targetArticleId = context.replacementArticleId ?? null
  const collisions = candidates.filter(candidate => {
    if (targetArticleId && candidate.id === targetArticleId) {
      return false
    }
    return candidate.article_scope_key === context.articleScopeKey
  })
  return buildDuplicateDraftIdentityFailures(collisions, {
    slug: context.replacementArticleSlug ?? '(pending-generated-slug)',
    articleScopeKey: context.articleScopeKey,
  })
}

async function validateAgriBlogDuplicateIdentityPreflight(context: Extract<AiArticleContext, { articleType: 'agri_blog' }>) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return []
  }
  const { data, error } = await client
    .from('ai_generated_articles')
    .select('id, slug, article_scope_key, title')
    .eq('article_type', 'agri_blog')
    .eq('article_scope_key', context.articleScopeKey)
    .limit(10)

  if (error) {
    throw error
  }

  return buildDuplicateScopePreflightFailures(context, (data ?? []) as AiArticleIdentityCandidate[])
}

async function persistGeneratedArticle(context: AiArticleContext, draft: AiDraft, modelName: string, quality: Record<string, unknown>) {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('Supabase admin client is required to persist AI articles')
  }

  const status = context.articleType === 'agri_blog' ? 'draft' : getPublishStatus()
  const slug = buildSlugForContext(context, draft.title)
  const rawTopicTags = [...new Set([...(draft.topicTags ?? []), ...context.topicTags])]
  const topicTags =
    context.articleType === 'agri_blog'
      ? rawTopicTags.map(normalizeTopicKey).filter(value => value && !isGenericBlogTopicSignal(value)).slice(0, 12)
      : rawTopicTags.slice(0, 12)
  const bodyHtml = markdownToHtml(draft.bodyMarkdown)
  const bodyText = markdownToText(draft.bodyMarkdown)
  const publishedAt = status === 'published' ? new Date().toISOString() : null

  const row = {
    article_type: context.articleType,
    article_scope_key: context.articleScopeKey,
    slug,
    title: draft.title,
    excerpt: draft.excerpt,
    answer_summary: draft.answerSummary ?? draft.excerpt,
    content_html: bodyHtml,
    content_text: bodyText,
    status,
    content_family_slug: context.contentFamilySlug,
    category: context.category,
    topic_tags: topicTags,
    thumbnail_url: DEFAULT_THUMBNAIL_URL,
    source_label: AI_ARTICLE_SOURCE_LABEL,
    source_key: AI_ARTICLE_SOURCE_KEY,
    source_facts_json: context,
    data_cutoff: context.dataCutoff,
    data_granularity: context.dataGranularity,
    primary_period_code: context.primaryPeriodCode,
    primary_observed_on: context.primaryObservedOn,
    seo_json: draft.seo ?? {},
    quality_json: quality,
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    published_at: publishedAt,
  }

  const existing = await client
    .from('ai_generated_articles')
    .select('id')
    .eq('article_type', context.articleType)
    .eq('article_scope_key', context.articleScopeKey)
    .maybeSingle()
  if (existing.error) {
    throw existing.error
  }
  const replacementArticleId = context.articleType === 'agri_blog' ? (context.replacementArticleId ?? null) : null
  const targetArticleId = replacementArticleId ?? ((existing.data as Pick<AiArticleRow, 'id'> | null)?.id ?? null)

  if (context.articleType === 'agri_blog') {
    const [slugMatches, scopeMatches] = await Promise.all([
      client
        .from('ai_generated_articles')
        .select('id, slug, article_scope_key, title')
        .eq('article_type', 'agri_blog')
        .eq('slug', slug)
        .limit(10),
      client
        .from('ai_generated_articles')
        .select('id, slug, article_scope_key, title')
        .eq('article_type', 'agri_blog')
        .eq('article_scope_key', context.articleScopeKey)
        .limit(10),
    ])
    if (slugMatches.error) {
      throw slugMatches.error
    }
    if (scopeMatches.error) {
      throw scopeMatches.error
    }
    const collisions = getAiArticleIdentityCollisions(
      [
        ...((slugMatches.data ?? []) as AiArticleIdentityCandidate[]),
        ...((scopeMatches.data ?? []) as AiArticleIdentityCandidate[]),
      ],
      targetArticleId,
      { slug, articleScopeKey: context.articleScopeKey },
    )
    if (collisions.length > 0) {
      throw new AiBlogDuplicateIdentityError(buildDuplicateDraftIdentityFailures(collisions, { slug, articleScopeKey: context.articleScopeKey }))
    }
  }

  if (replacementArticleId) {
    const { data, error } = await client
      .from('ai_generated_articles')
      .update(row)
      .eq('id', replacementArticleId)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return {
      article: toArticleSummary(data as AiArticleRow),
      created: false,
    }
  }

  const { data, error } = await client
    .from('ai_generated_articles')
    .upsert(row, { onConflict: 'article_type,article_scope_key' })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return {
    article: toArticleSummary(data as AiArticleRow),
    created: !existing.data,
  }
}

async function loadExistingArticleRow(context: AiArticleContext) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }
  const { data, error } = await client
    .from('ai_generated_articles')
    .select('*')
    .eq('article_type', context.articleType)
    .eq('article_scope_key', context.articleScopeKey)
    .maybeSingle()
  if (error) {
    throw error
  }
  return data as AiArticleRow | null
}

async function loadArticleRowById(id: string | null | undefined) {
  const client = getSupabaseAdminClient()
  if (!client || !id) {
    return null
  }
  const { data, error } = await client
    .from('ai_generated_articles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    throw error
  }
  return data as AiArticleRow | null
}

async function loadTargetArticleRow(context: AiArticleContext) {
  if (context.articleType === 'agri_blog' && context.replacementArticleId) {
    return loadArticleRowById(context.replacementArticleId)
  }
  return loadExistingArticleRow(context)
}

function getPrimarySourceIdentity(value: Record<string, unknown>) {
  const sourceArticles = Array.isArray(value.sourceArticles) ? value.sourceArticles : []
  const primary = sourceArticles[0]
  if (!primary || typeof primary !== 'object') {
    return null
  }
  const record = primary as Record<string, unknown>
  return {
    id: typeof record.id === 'string' ? record.id : null,
    canonicalUrl: typeof record.canonicalUrl === 'string' ? record.canonicalUrl : null,
  }
}

async function loadBlogComparisonDrafts(context: Extract<AiArticleContext, { articleType: 'agri_blog' }>) {
  const primary = context.sourceArticles[0]
  const client = getSupabaseAdminClient()
  if (!client || !primary) {
    return []
  }
  const { data, error } = await client
    .from('ai_generated_articles')
    .select('id, article_scope_key, title, answer_summary, content_text, source_facts_json')
    .eq('article_type', 'agri_blog')
    .neq('article_scope_key', context.articleScopeKey)
    .limit(200)
  if (error) {
    throw error
  }
  return (data ?? [])
    .filter(row => {
      const identity = getPrimarySourceIdentity((row as { source_facts_json?: Record<string, unknown> }).source_facts_json ?? {})
      return identity?.id === primary.id || identity?.canonicalUrl === primary.canonicalUrl
    })
    .filter(row => String((row as { id?: string }).id ?? '') !== (context.replacementArticleId ?? ''))
    .map(row => ({
      articleScopeKey: String((row as { article_scope_key?: string }).article_scope_key ?? ''),
      title: String((row as { title?: string }).title ?? ''),
      answerSummary:
        typeof (row as { answer_summary?: unknown }).answer_summary === 'string'
          ? (row as { answer_summary: string }).answer_summary
          : null,
      contentText: String((row as { content_text?: string }).content_text ?? ''),
    }))
    .filter(row => row.articleScopeKey && row.title && row.contentText)
}

async function recordFailedBlogRegeneration(
  existing: AiArticleRow,
  context: Extract<AiArticleContext, { articleType: 'agri_blog' }>,
  attempts: Array<{ attempt: number; failures: AiBlogValidationIssue[] }>,
) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return existing
  }
  const hardFailures = attempts.at(-1)?.failures ?? []
  const quality = {
    ...(existing.quality_json ?? {}),
    regeneration: {
      status: 'failed_retained',
      attemptedAt: new Date().toISOString(),
      attemptCount: attempts.length,
      maxAttempts: AI_BLOG_MAX_ATTEMPTS,
      ruleBaseVersion: AI_BLOG_RULE_BASE_VERSION,
      hardFailures,
      sourcePack: context.sourceArticles.map(source => ({
        sourceId: source.sourceId,
        title: source.title,
        canonicalUrl: source.canonicalUrl,
        relevanceReasons: source.relevanceReasons,
      })),
    },
  }
  const { data, error } = await client
    .from('ai_generated_articles')
    .update({ quality_json: quality })
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) {
    console.warn('[AI Articles] Failed to record retained blog regeneration:', error)
    return existing
  }
  return data as AiArticleRow
}

async function generateAgriBlogDraftWithRetries(
  context: Extract<AiArticleContext, { articleType: 'agri_blog' }>,
  comparisons: AiBlogComparisonDraft[],
  generate: typeof callGemini = callGemini,
) {
  let draft: AiDraft | null = null
  let model = getModelName(context.articleType)
  let failures: AiBlogValidationIssue[] = []
  const attempts: Array<{ attempt: number; failures: AiBlogValidationIssue[] }> = []
  const preflightFailures = validateAgriBlogSourcePreflight(context)
  if (preflightFailures.length > 0) {
    return {
      success: false as const,
      draft,
      model,
      failures: preflightFailures,
      attempts: [{ attempt: 0, failures: preflightFailures }],
    }
  }

  for (let attempt = 1; attempt <= AI_BLOG_MAX_ATTEMPTS; attempt += 1) {
    const prompt =
      attempt === 1
        ? buildAgriBlogArticlePrompt(context)
        : buildAiBlogRepairPrompt(context, draft, failures)
    try {
      const generated = await generate(prompt, context.articleType)
      model = generated.model
      draft = parseAiDraft(generated.text)
      const quality = validateAgriBlogDraft(context, draft, comparisons)
      failures = quality.hardFailures
      attempts.push({ attempt, failures })
      if (quality.valid) {
        return { success: true as const, draft, model, quality, attempts }
      }
    } catch (error) {
      failures = [
        validationIssue(
          'MODEL_RESPONSE_INVALID',
          error instanceof Error ? error.message : 'Gemini trả về phản hồi không hợp lệ.',
        ),
      ]
      attempts.push({ attempt, failures })
      draft = null
    }
  }

  return { success: false as const, draft, model, failures, attempts }
}

async function markBlogSeedUsed(seedId: string | null) {
  if (!seedId) {
    return
  }

  const client = getSupabaseAdminClient()
  if (!client) {
    return
  }

  const { error } = await client
    .from('ai_blog_topic_seeds')
    .update({ status: 'used', last_used_at: new Date().toISOString() })
    .eq('id', seedId)
    .eq('status', 'pending')

  if (error && !isRelationMissing(error)) {
    console.warn('[AI Articles] Failed to mark blog seed used:', error)
  }
}

async function generateOne(context: AiArticleContext, force = false) {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('Supabase admin client is required to generate AI articles')
  }

  const existing = await loadTargetArticleRow(context)
  if (!force && existing) {
    return { status: 'skipped' as const, article: toArticleSummary(existing), created: false }
  }

  const runId = await insertRun(context, 'started')
  try {
    if (context.articleType === 'agri_blog') {
      const duplicatePreflightFailures = await validateAgriBlogDuplicateIdentityPreflight(context)
      if (duplicatePreflightFailures.length > 0) {
        const attempts = [{ attempt: 0, failures: duplicatePreflightFailures }]
        const message = duplicatePreflightFailures.map(failure => `${failure.code}: ${failure.message}`).join('; ')
        if (existing) {
          const retained = await recordFailedBlogRegeneration(existing, context, attempts)
          await updateRun(runId, 'failed', retained.id, message)
          return {
            status: 'retained' as const,
            article: toArticleSummary(retained),
            created: false,
            failures: duplicatePreflightFailures,
          }
        }
        await updateRun(runId, 'failed', null, message)
        throw new Error(message)
      }
      const comparisons = await loadBlogComparisonDrafts(context)
      const generated = await generateAgriBlogDraftWithRetries(context, comparisons)
      if (!generated.success) {
        const message = generated.failures.map(failure => `${failure.code}: ${failure.message}`).join('; ')
        if (existing) {
          const retained = await recordFailedBlogRegeneration(existing, context, generated.attempts)
          await updateRun(runId, 'failed', retained.id, message)
          return {
            status: 'retained' as const,
            article: toArticleSummary(retained),
            created: false,
            failures: generated.failures,
          }
        }
        await updateRun(runId, 'failed', null, message)
        throw new Error(message)
      }

      const seoReview = await reviewAiBlogSeo(context, generated.draft)
      const quality = {
        ...generated.quality,
        attemptCount: generated.attempts.length,
        maxAttempts: AI_BLOG_MAX_ATTEMPTS,
        attempts: generated.attempts,
        seoReview,
        advisoryWarnings: [
          ...generated.quality.advisoryWarnings,
          ...(seoReview.advisoryWarnings ?? []),
          ...(seoReview.warnings ?? []).map(message => validationIssue('SEO_ADVISORY', message)),
        ],
        regeneration: {
          status: 'replaced',
          attemptedAt: new Date().toISOString(),
          attemptCount: generated.attempts.length,
          ruleBaseVersion: AI_BLOG_RULE_BASE_VERSION,
        },
      }
      let persisted: Awaited<ReturnType<typeof persistGeneratedArticle>>
      try {
        persisted = await persistGeneratedArticle(context, generated.draft, generated.model, quality)
      } catch (error) {
        if (error instanceof AiBlogDuplicateIdentityError && existing) {
          const attempts = [
            ...generated.attempts,
            { attempt: generated.attempts.length + 1, failures: error.failures },
          ]
          const retained = await recordFailedBlogRegeneration(existing, context, attempts)
          await updateRun(runId, 'failed', retained.id, error.message)
          return {
            status: 'retained' as const,
            article: toArticleSummary(retained),
            created: false,
            failures: error.failures,
          }
        }
        throw error
      }
      await markBlogSeedUsed(context.seedId)
      await updateRun(runId, 'success', persisted.article.id)
      return { status: 'success' as const, article: persisted.article, created: persisted.created }
    }

    const { model, text } = await callGemini(buildArticlePrompt(context), context.articleType)
    const draft = parseAiDraft(text)
    const localQuality = validateDraft(context, draft)
    const quality = {
      ...localQuality,
    }
    const persisted = await persistGeneratedArticle(context, draft, model, quality)
    await updateRun(runId, 'success', persisted.article.id)
    return { status: 'success' as const, article: persisted.article, created: persisted.created }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateRun(runId, 'failed', null, message)
    throw error
  }
}

async function loadCustomsRowsByPeriod(periodCode: string) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('*')
    .eq('period_code', periodCode)
    .order('value_usd', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as CustomsExportObservationRow[]
}

async function loadAllCustomsRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('*')
    .not('period_code', 'is', null)
    .order('period_end_date', { ascending: false })
    .order('value_usd', { ascending: false })
    .limit(5000)

  if (error) {
    throw error
  }

  return (data ?? []) as CustomsExportObservationRow[]
}

async function loadLatestCustomsPeriodCode() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('period_code, period_end_date')
    .not('period_code', 'is', null)
    .order('period_end_date', { ascending: false })
    .limit(1)

  if (error) {
    throw error
  }

  return (data?.[0] as { period_code?: string | null } | undefined)?.period_code ?? null
}

async function loadCustomsRowsByMonth(year: number, month: number) {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('*')
    .eq('period_year', year)
    .eq('period_month', month)
    .order('period_number', { ascending: true })
    .order('value_usd', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as CustomsExportObservationRow[]
}

async function loadLatestCompleteCustomsMonth() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('customs_export_observations_public')
    .select('period_year, period_month, period_number, period_end_date')
    .not('period_year', 'is', null)
    .not('period_month', 'is', null)
    .not('period_number', 'is', null)
    .order('period_end_date', { ascending: false })
    .limit(300)

  if (error) {
    throw error
  }

  const byMonth = new Map<string, { year: number; month: number; periodNumbers: Set<number>; maxEndDate: string }>()
  for (const row of (data ?? []) as Array<{ period_year: number; period_month: number; period_number: number; period_end_date: string }>) {
    const key = monthKey(row.period_year, row.period_month)
    const existing =
      byMonth.get(key) ??
      ({
        year: row.period_year,
        month: row.period_month,
        periodNumbers: new Set<number>(),
        maxEndDate: row.period_end_date,
      } satisfies { year: number; month: number; periodNumbers: Set<number>; maxEndDate: string })
    existing.periodNumbers.add(row.period_number)
    if (row.period_end_date > existing.maxEndDate) {
      existing.maxEndDate = row.period_end_date
    }
    byMonth.set(key, existing)
  }

  return [...byMonth.values()]
    .filter(item => item.periodNumbers.size >= 2)
    .sort((left, right) => right.maxEndDate.localeCompare(left.maxEndDate))[0] ?? null
}

async function loadWorldRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return null
  }

  const { data, error } = await client
    .from('latest_world_prices_public')
    .select(
      [
        'recorded_at',
        'observed_on',
        'crawl_recorded_at',
        'commodity_slug',
        'exchange',
        'price_usd',
        'price_unit',
        'price_vnd_kg',
        'change_1d',
        'change_1d_pct',
        'change_1w_pct',
        'data_granularity',
        'temporal_coverage',
        'benchmark_type',
        'source_id',
        'source_license_note',
        'quality_grade',
        'contract_symbol',
        'source_observation_label',
        'source_url',
        'raw_payload',
      ].join(', '),
    )
    .order('observed_on', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as WorldPriceRow[]
}

function parseAiBlogDailyLimit(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(numeric) ? Math.max(1, Math.min(DEFAULT_AI_BLOG_DAILY_LIMIT, numeric)) : DEFAULT_AI_BLOG_DAILY_LIMIT
}

function sanitizeBlogSeedInput(input: AiBlogTopicSeedInput, mode: 'create' | 'update') {
  const audience = input.audience
  if (input.audience !== undefined && !isAiBlogAudience(audience)) {
    throw new Error('Invalid blog seed audience')
  }

  const headlineHint = input.headlineHint?.trim()
  const keywordMain = input.keywordMain?.trim()
  if (mode === 'create' && (!headlineHint || !keywordMain || !audience)) {
    throw new Error('Blog seed requires audience, headlineHint, and keywordMain')
  }

  const topicKey = normalizeTopicKey(input.topicKey || keywordMain || headlineHint || '')
  if (mode === 'create' && !topicKey) {
    throw new Error('Blog seed requires a topic key')
  }

  if (input.style !== undefined && !isAiBlogStyle(input.style)) {
    throw new Error('Invalid blog seed style')
  }

  if (input.status !== undefined && !isAiBlogTopicSeedStatus(input.status)) {
    throw new Error('Invalid blog seed status')
  }

  return {
    topic_key: topicKey || undefined,
    audience,
    headline_hint: headlineHint || undefined,
    keyword_main: keywordMain || undefined,
    keywords_sub: input.keywordsSub === undefined ? undefined : sanitizeBlogKeywords(input.keywordsSub),
    style: input.style ?? undefined,
    priority: input.priority === undefined ? undefined : clampPriority(input.priority),
    status: input.status ?? undefined,
    source_ref: input.sourceRef ?? undefined,
  }
}

export async function listAiBlogTopicSeeds(options: {
  audience?: AiBlogAudience
  status?: AiBlogTopicSeedStatus | 'all'
  limit?: number
} = {}): Promise<AiBlogTopicSeedSummary[]> {
  const client = getSupabaseAdminClient()
  if (!client) {
    return []
  }

  const query = client
    .from('ai_blog_topic_seeds')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200))

  if (options.audience) {
    query.eq('audience', options.audience)
  }

  if (options.status && options.status !== 'all') {
    query.eq('status', options.status)
  }

  const { data, error } = await query
  if (error) {
    if (isRelationMissing(error)) {
      return []
    }
    throw error
  }

  return ((data ?? []) as AiBlogTopicSeedRow[]).map(toBlogSeedSummary)
}

async function getAiBlogTopicSeedById(id: string) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }

  const { data, error } = await client.from('ai_blog_topic_seeds').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (isRelationMissing(error)) {
      return null
    }
    throw error
  }

  return data as AiBlogTopicSeedRow | null
}

export async function createAiBlogTopicSeed(input: AiBlogTopicSeedInput): Promise<AiBlogTopicSeedSummary> {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('Supabase admin client is required to create blog topic seeds')
  }

  const defaultStyle = isAiBlogAudience(input.audience) ? AI_BLOG_AUDIENCE_META[input.audience].defaultStyle : 'guide'
  const row = sanitizeBlogSeedInput({
    ...input,
    status: input.status ?? 'pending',
    style: input.style ?? defaultStyle,
    priority: input.priority ?? 50,
    keywordsSub: input.keywordsSub ?? [],
    sourceRef: input.sourceRef ?? {},
  }, 'create')
  const { data, error } = await client.from('ai_blog_topic_seeds').insert(row).select('*').single()
  if (error) {
    throw error
  }

  return toBlogSeedSummary(data as AiBlogTopicSeedRow)
}

export async function updateAiBlogTopicSeed(id: string, input: Partial<AiBlogTopicSeedInput>): Promise<AiBlogTopicSeedSummary> {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('Supabase admin client is required to update blog topic seeds')
  }

  const row = sanitizeBlogSeedInput(input as AiBlogTopicSeedInput, 'update')
  const patch = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined))
  const { data, error } = await client.from('ai_blog_topic_seeds').update(patch).eq('id', id).select('*').single()
  if (error) {
    throw error
  }

  return toBlogSeedSummary(data as AiBlogTopicSeedRow)
}

export async function deleteAiBlogTopicSeed(id: string) {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('Supabase admin client is required to delete blog topic seeds')
  }

  const { error } = await client.from('ai_blog_topic_seeds').delete().eq('id', id)
  if (error) {
    throw error
  }

  return { id, deleted: true }
}

async function loadPendingBlogSeeds(audience?: AiBlogAudience) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return []
  }

  const query = client
    .from('ai_blog_topic_seeds')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(60)

  if (audience) {
    query.eq('audience', audience)
  }

  const { data, error } = await query
  if (error) {
    if (isRelationMissing(error)) {
      return []
    }
    throw error
  }

  return (data ?? []) as AiBlogTopicSeedRow[]
}

async function loadBlogNewsRows() {
  const client = getSupabaseReadClient()
  if (!client) {
    return []
  }

  const { data, error } = await client
    .from('news_articles')
    .select('id, source_key, canonical_url, slug, title, excerpt, content_text, category, topic_tags, published_at, fetched_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(300)

  if (error) {
    if (isRelationMissing(error)) {
      return []
    }
    throw error
  }

  return (data ?? []) as NewsArticleBlogRow[]
}

function storedBlogSourceToNewsRow(value: unknown): NewsArticleBlogRow | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const source = value as Record<string, unknown>
  if (
    typeof source.id !== 'string' ||
    typeof source.sourceKey !== 'string' ||
    typeof source.canonicalUrl !== 'string' ||
    typeof source.title !== 'string'
  ) {
    return null
  }
  const factSnippets = Array.isArray(source.factSnippets)
    ? source.factSnippets.filter((item): item is string => typeof item === 'string')
    : []
  return {
    id: source.id,
    source_key: source.sourceKey,
    canonical_url: source.canonicalUrl,
    slug: typeof source.slug === 'string' ? source.slug : slugifyAiArticle(source.title),
    title: source.title,
    excerpt: typeof source.excerpt === 'string' ? source.excerpt : null,
    content_text: factSnippets.join('. ') || (typeof source.excerpt === 'string' ? source.excerpt : source.title),
    category: typeof source.category === 'string' ? source.category : null,
    topic_tags: Array.isArray(source.topicTags)
      ? source.topicTags.filter((item): item is string => typeof item === 'string')
      : [],
    published_at:
      typeof source.publishedAt === 'string'
        ? source.publishedAt
        : typeof source.fetchedAt === 'string'
          ? source.fetchedAt
          : new Date().toISOString(),
    fetched_at:
      typeof source.fetchedAt === 'string'
        ? source.fetchedAt
        : typeof source.publishedAt === 'string'
          ? source.publishedAt
          : new Date().toISOString(),
  }
}

async function loadDraftBlogRowBySlug(slug: string) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return null
  }
  const { data, error } = await client
    .from('ai_generated_articles')
    .select('*')
    .eq('article_type', 'agri_blog')
    .eq('slug', slug)
    .eq('status', 'draft')
    .maybeSingle()
  if (error) {
    throw error
  }
  return data as AiArticleRow | null
}

function isCoherentPrimaryBlogCandidate(row: NewsArticleBlogRow) {
  return validatePrimarySourceContentCoherence(toBlogSourceArticleFact(row, 0, ['primary-source'])).length === 0
}

function buildAgriBlogContextFromExistingRow(existing: AiArticleRow, newsRows: NewsArticleBlogRow[]) {
  const stored = existing.source_facts_json ?? {}
  const audience = isAiBlogAudience(stored.audience) ? stored.audience : null
  if (!audience) {
    return null
  }
  const storedSources = Array.isArray(stored.sourceArticles)
    ? stored.sourceArticles.map(storedBlogSourceToNewsRow).filter((item): item is NewsArticleBlogRow => item !== null)
    : []
  const storedPrimary = storedSources[0]
  if (!storedPrimary) {
    return null
  }
  const primaryCandidates = newsRows.filter(row => {
    return (
      row.id === storedPrimary.id ||
      row.canonical_url === storedPrimary.canonical_url ||
      foldText(row.title) === foldText(storedPrimary.title) ||
      row.slug === storedPrimary.slug
    )
  })
  const primary =
    primaryCandidates
      .sort((left, right) => {
        const coherenceDelta = Number(isCoherentPrimaryBlogCandidate(right)) - Number(isCoherentPrimaryBlogCandidate(left))
        if (coherenceDelta !== 0) {
          return coherenceDelta
        }
        const relevanceDelta =
          tokenCoverage(storedPrimary.title, right.content_text ?? right.excerpt ?? right.title) -
          tokenCoverage(storedPrimary.title, left.content_text ?? left.excerpt ?? left.title)
        return relevanceDelta !== 0 ? relevanceDelta : right.fetched_at.localeCompare(left.fetched_at)
      })[0] ?? storedPrimary
  const combinedRows = [
    primary,
    ...newsRows.filter(row => row.id !== primary.id),
    ...storedSources.filter(row => row.id !== primary.id && !newsRows.some(live => live.id === row.id)),
  ]
  const context = buildAgriBlogArticleContextFromNews(audience, primary, combinedRows)
  const style = isAiBlogStyle(stored.style) ? stored.style : getAiBlogAudienceMeta(audience).defaultStyle
  const topicKey = getBlogTopicKeyForNews(primary)
  return {
    ...context,
    articleScopeKey: getBlogScopeKey(audience, topicKey),
    titleHint: typeof stored.titleHint === 'string' && stored.titleHint.trim() ? stored.titleHint.trim() : primary.title,
    style,
    styleLabel: AI_BLOG_STYLE_LABELS[style],
    topicKey,
    seedId: typeof stored.seedId === 'string' ? stored.seedId : null,
    sourceMode: stored.sourceMode === 'seed' ? 'seed' as const : 'news_fallback' as const,
    sourceNotes: [
      'Regenerate existing draft with strict topical source filtering and deterministic validation.',
      'Preserve the target row id and audience while cleaning the public slug and article scope.',
    ],
    replacementArticleId: existing.id,
    replacementArticleSlug: existing.slug,
    replacementArticleScopeKey: existing.article_scope_key,
  } satisfies Extract<AiArticleContext, { articleType: 'agri_blog' }>
}

async function loadExistingAiArticleScopeKeys(articleType: AiArticleType) {
  const client = getSupabaseAdminClient()
  if (!client) {
    return new Set<string>()
  }

  const { data, error } = await client
    .from('ai_generated_articles')
    .select('article_scope_key')
    .eq('article_type', articleType)
    .limit(1000)

  if (error) {
    if (isRelationMissing(error)) {
      return new Set<string>()
    }
    throw error
  }

  return new Set((data ?? []).map(row => String((row as { article_scope_key?: string }).article_scope_key)).filter(Boolean))
}

async function buildAgriBlogContexts(options: GenerateAiArticlesOptions) {
  const audience = options.audience
  const dailyLimit = parseAiBlogDailyLimit(options.dailyLimit ?? process.env.AI_BLOG_DAILY_LIMIT)
  const newsRows = await loadBlogNewsRows()
  const existingScopeKeys = options.force ? new Set<string>() : await loadExistingAiArticleScopeKeys('agri_blog')

  if (options.articleSlug) {
    const existing = await loadDraftBlogRowBySlug(options.articleSlug)
    if (!existing) {
      return []
    }
    const context = buildAgriBlogContextFromExistingRow(existing, newsRows)
    return context ? [context] : []
  }

  if (options.seedId) {
    const seed = await getAiBlogTopicSeedById(options.seedId)
    if (!seed || seed.status !== 'pending') {
      return []
    }
    if (audience && seed.audience !== audience) {
      return []
    }
    const context = buildAgriBlogArticleContextFromSeed(seed, newsRows)
    return existingScopeKeys.has(context.articleScopeKey) ? [] : [context]
  }

  const seeds = await loadPendingBlogSeeds(audience)
  return buildAgriBlogArticleContextsFromInputs({
    seeds,
    newsRows,
    existingScopeKeys,
    audience,
    dailyLimit,
  })
}

export async function buildAiArticleContext(options: GenerateAiArticlesOptions): Promise<AiArticleContext | null> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return null
  }

  if (options.articleType === 'export_period_report') {
    const periodCode = options.periodCode ?? (await loadLatestCustomsPeriodCode())
    if (!periodCode) {
      return null
    }

    const rows = await loadCustomsRowsByPeriod(periodCode)
    return rows ? buildExportPeriodArticleContextFromRows(rows) : null
  }

  if (options.articleType === 'export_monthly_report') {
    const month = options.year && options.month ? { year: options.year, month: options.month } : await loadLatestCompleteCustomsMonth()
    if (!month) {
      return null
    }

    const rows = await loadCustomsRowsByMonth(month.year, month.month)
    return rows ? buildExportMonthlyArticleContextFromRows(rows) : null
  }

  if (options.articleType === 'world_daily_price_update') {
    const rows = await loadWorldRows()
    return rows ? buildWorldDailyArticleContextFromRows(rows, options.observedOn) : null
  }

  if (options.articleType === 'agri_blog') {
    return (await buildAgriBlogContexts(options))[0] ?? null
  }

  return null
}

function hasSpecificContextSelector(options: GenerateAiArticlesOptions) {
  return Boolean(
    options.periodCode ||
      options.observedOn ||
      options.articleSlug ||
      options.seedId ||
      options.audience ||
      (typeof options.year === 'number' && typeof options.month === 'number'),
  )
}

export async function buildAiArticleContexts(options: GenerateAiArticlesOptions = {}): Promise<AiArticleContext[]> {
  const runtime = getSupabaseRuntimeStatus()
  if (!runtime.hasReadConfig) {
    return []
  }

  if (hasSpecificContextSelector(options)) {
    const context = await buildAiArticleContext(options)
    return context ? [context] : []
  }

  if (options.articleType === 'export_period_report') {
    const rows = await loadAllCustomsRows()
    return rows ? buildExportPeriodArticleContextsFromRows(rows) : []
  }

  if (options.articleType === 'export_monthly_report') {
    const rows = await loadAllCustomsRows()
    return rows ? buildExportMonthlyArticleContextsFromRows(rows) : []
  }

  if (options.articleType === 'world_daily_price_update') {
    const rows = await loadWorldRows()
    return rows ? buildWorldDailyArticleContextsFromRows(rows) : []
  }

  if (options.articleType === 'agri_blog') {
    return buildAgriBlogContexts(options)
  }

  const [customsRows, worldRows] = await Promise.all([loadAllCustomsRows(), loadWorldRows()])
  return [
    ...(customsRows ? buildExportPeriodArticleContextsFromRows(customsRows) : []),
    ...(customsRows ? buildExportMonthlyArticleContextsFromRows(customsRows) : []),
    ...(worldRows ? buildWorldDailyArticleContextsFromRows(worldRows) : []),
  ].sort((left, right) => (right.primaryObservedOn ?? '').localeCompare(left.primaryObservedOn ?? ''))
}

async function buildDefaultContexts() {
  return buildAiArticleContexts()
}

export async function generateAiArticles(options: GenerateAiArticlesOptions = {}): Promise<GenerateAiArticlesResult> {
  if (!getAiArticlesEnabled(options.articleType)) {
    return {
      status: 'skipped',
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      retainedCount: 0,
      errorCount: 0,
      errors: [options.articleType === 'agri_blog' ? 'AI_BLOG_ENABLED or AI_ARTICLE_ENABLED is not true' : 'AI_ARTICLE_ENABLED is not true'],
      articles: [],
    }
  }

  const contexts = options.articleType ? await buildAiArticleContexts(options) : await buildDefaultContexts()

  if (contexts.length === 0) {
    return {
      status: 'skipped',
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      retainedCount: 0,
      errorCount: 0,
      errors: ['No eligible article context found'],
      articles: [],
    }
  }

  const articles: AiArticleSummary[] = []
  const errors: string[] = []
  let createdCount = 0
  let updatedCount = 0
  let skippedCount = 0
  let retainedCount = 0

  for (const context of contexts) {
    try {
      const result = await generateOne(context, options.force ?? false)
      articles.push(result.article)
      if (result.status === 'skipped') {
        skippedCount += 1
      } else if (result.status === 'retained') {
        retainedCount += 1
        errors.push(
          `${context.articleType}:${context.articleScopeKey}: retained existing draft after ${AI_BLOG_MAX_ATTEMPTS} failed attempts: ${result.failures
            .map(failure => `${failure.code}: ${failure.message}`)
            .join('; ')}`,
        )
      } else if (result.created) {
        createdCount += 1
      } else {
        updatedCount += 1
      }
    } catch (error) {
      errors.push(`${context.articleType}:${context.articleScopeKey}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const errorCount = errors.length
  return {
    status: errorCount === contexts.length ? 'failed' : errorCount > 0 ? 'partial' : 'success',
    createdCount,
    updatedCount,
    skippedCount,
    retainedCount,
    errorCount,
    errors,
    articles,
  }
}

export async function listAiArticles(
  options: { limit?: number; includeDrafts?: boolean; status?: AiArticleStatus | 'all'; articleType?: AiArticleType } = {},
) {
  const client = options.includeDrafts ? getSupabaseAdminClient() : getSupabaseReadClient()
  if (!client) {
    return []
  }

  const query = client
    .from('ai_generated_articles')
    .select('*')
    .order('primary_observed_on', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 40, 1), 100))

  if (!options.includeDrafts) {
    query.eq('status', 'published')
  } else if (options.status && options.status !== 'all') {
    query.eq('status', options.status)
  }

  if (options.articleType) {
    query.eq('article_type', options.articleType)
  }

  const { data, error } = await query
  if (error) {
    if (isRelationMissing(error)) {
      return []
    }
    throw error
  }

  return ((data ?? []) as AiArticleRow[]).map(toArticleSummary)
}

export async function getAiArticle(slug: string, options: { includeDrafts?: boolean } = {}) {
  const client = options.includeDrafts ? getSupabaseAdminClient() : getSupabaseReadClient()
  if (!client) {
    return null
  }

  const query = client.from('ai_generated_articles').select('*').eq('slug', slug)
  if (!options.includeDrafts) {
    query.eq('status', 'published')
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    if (isRelationMissing(error)) {
      return null
    }
    throw error
  }

  return data ? toArticleDetail(data as AiArticleRow) : null
}

export async function updateAiArticleStatus(slug: string, status: Exclude<AiArticleStatus, 'failed'>) {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error('Supabase admin client is required to update AI articles')
  }

  const existing = await client
    .from('ai_generated_articles')
    .select('published_at')
    .eq('slug', slug)
    .maybeSingle()

  if (existing.error) {
    if (isRelationMissing(existing.error)) {
      return null
    }
    throw existing.error
  }

  if (!existing.data) {
    return null
  }

  const publishedAt =
    status === 'published'
      ? ((existing.data as Pick<AiArticleRow, 'published_at'>).published_at ?? new Date().toISOString())
      : null

  const { data, error } = await client
    .from('ai_generated_articles')
    .update({
      status,
      published_at: publishedAt,
    })
    .eq('slug', slug)
    .select('*')
    .maybeSingle()

  if (error) {
    if (isRelationMissing(error)) {
      return null
    }
    throw error
  }

  return data ? toArticleDetail(data as AiArticleRow) : null
}

export async function getAiArticleAsNewsDetail(slug: string) {
  const article = await getAiArticle(slug)
  if (!article) {
    return null
  }

  const related = (await listAiArticles({ limit: 6 }))
    .filter(item => item.slug !== slug && item.contentFamilySlug === article.contentFamilySlug)
    .slice(0, 4)
    .map(item => ({
      slug: item.slug,
      title: item.title,
      excerpt: item.excerpt,
      thumbnailUrl: item.thumbnailUrl,
      sourceKey: AI_ARTICLE_SOURCE_KEY,
      sourceLabel: item.sourceLabel,
      publishedAt: item.publishedAt,
      category: item.category,
      topicTags: item.topicTags,
      contentMode: 'full_html' as const,
      contentFamilySlug: item.contentFamilySlug,
      contentFamilyLabel: item.contentFamilyLabel,
      familyPath: item.familyPath,
    }))

  return {
    article: {
      id: article.id,
      sourceKey: AI_ARTICLE_SOURCE_KEY,
      canonicalUrl: article.canonicalUrl,
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt,
      contentHtml: article.contentHtml,
      contentText: article.contentText,
      thumbnailUrl: article.thumbnailUrl,
      author: article.author,
      category: article.category,
      topicTags: article.topicTags,
      publishedAt: article.publishedAt,
      fetchedAt: article.fetchedAt,
      contentMode: 'full_html' as const,
      fingerprint: hashJson(article.sourceFacts),
      status: article.status,
      sourceLabel: article.sourceLabel,
      contentFamilySlug: article.contentFamilySlug,
      contentFamilyLabel: article.contentFamilyLabel,
      familyPath: article.familyPath,
    },
    related,
    latestFromSource: related,
  }
}

export const __aiArticleTestUtils = {
  buildArticlePrompt,
  buildAiBlogRepairPrompt,
  buildBlogSourcePack,
  calculateBlogSimilarity,
  extractNumberTokens,
  generateAgriBlogDraftWithRetries,
  getBlogSourceRelevance,
  getBlogFactSnippets,
  getAiArticleIdentityCollisions,
  buildDuplicateScopePreflightFailures,
  normalizeAiBlogSeoScore,
  validateAgriBlogSourcePreflight,
  validateAgriBlogDraft,
  validateDraft,
  parseAiDraft,
}
