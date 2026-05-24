import type { NewsSourceConfig, NewsSourceKey } from './types.js'

const P0_RATE_LIMIT_MS = 1000
const P1_RATE_LIMIT_MS = 1500
const P2_RATE_LIMIT_MS = 2500

export const NEWS_SOURCE_REGISTRY: Record<NewsSourceKey, NewsSourceConfig> = {
  vietnambiz: {
    key: 'vietnambiz',
    label: 'VietnamBiz',
    baseUrl: 'https://vietnambiz.vn',
    discoverUrl: 'https://vietnambiz.vn/hang-hoa/nong-san.htm',
    discoverMode: 'html',
    priority: 'P0',
    phase: 1,
    accessState: 'public_ok',
    active: true,
    fullTextCapable: true,
    browserRequired: false,
    rateLimitMs: P0_RATE_LIMIT_MS,
    maxArticlesPerRun: 30,
    articleUrlPattern: /^https:\/\/vietnambiz\.vn\/.+-\d{6,}\.htm$/i,
    listingSelectors: ['h3 a'],
    articleSelectors: ['.vnbiz-content', '.detail-content', 'article'],
    topicTags: ['thi-truong', 'nong-san', 'gia-ca'],
  },
  congthuong: {
    key: 'congthuong',
    label: 'Công Thương',
    baseUrl: 'https://congthuong.vn',
    discoverUrl: 'https://congthuong.vn/thi-truong/nong-san',
    discoverMode: 'html',
    priority: 'P0',
    phase: 1,
    accessState: 'public_ok',
    active: true,
    fullTextCapable: true,
    browserRequired: false,
    rateLimitMs: P0_RATE_LIMIT_MS,
    maxArticlesPerRun: 30,
    articleUrlPattern: /^https:\/\/congthuong\.vn\/[^/]+-\d+\.html$/i,
    listingSelectors: ['h3 a', 'article a'],
    articleSelectors: ['.detail-content', '.article-content', 'article'],
    topicTags: ['cong-thuong', 'xuat-khau', 'nong-san'],
  },
  nongnghiepmoitruong: {
    key: 'nongnghiepmoitruong',
    label: 'Nông nghiệp & Môi trường',
    baseUrl: 'https://nongnghiepmoitruong.vn',
    discoverUrl: 'https://nongnghiepmoitruong.vn/nong-nghiep.rss',
    discoverMode: 'rss',
    priority: 'P0',
    phase: 1,
    accessState: 'public_ok',
    active: true,
    fullTextCapable: true,
    browserRequired: false,
    rateLimitMs: P0_RATE_LIMIT_MS,
    maxArticlesPerRun: 30,
    articleUrlPattern: /^https:\/\/nongnghiepmoitruong\.vn\/.+\.html$/i,
    articleSelectors: ['.detail__content', '.baiviet-content', 'article'],
    topicTags: ['nong-nghiep', 'trong-trot', 'chan-nuoi'],
  },
  vietfood: {
    key: 'vietfood',
    label: 'Vietfood / VFA',
    baseUrl: 'https://vietfood.org.vn',
    discoverUrl: 'https://vietfood.org.vn/feed/',
    discoverMode: 'rss',
    priority: 'P0',
    phase: 1,
    accessState: 'public_ok',
    active: true,
    fullTextCapable: true,
    browserRequired: false,
    rateLimitMs: P0_RATE_LIMIT_MS,
    maxArticlesPerRun: 30,
    articleUrlPattern: /^https:\/\/vietfood\.org\.vn\/.+$/i,
    articleSelectors: [
      '.elementor-widget-theme-post-content .elementor-widget-container',
      '.elementor-location-single .elementor-widget-theme-post-content .elementor-widget-container',
      '.entry-content',
      '.td-post-content',
      'article',
    ],
    topicTags: ['gao', 'lua-gao', 'thi-truong'],
  },
  kinhtenongthon: {
    key: 'kinhtenongthon',
    label: 'Kinh tế Nông thôn',
    baseUrl: 'https://kinhtenongthon.vn',
    discoverUrl: 'https://kinhtenongthon.vn/',
    discoverMode: 'html',
    priority: 'P1',
    phase: 2,
    accessState: 'public_ok',
    active: true,
    fullTextCapable: true,
    browserRequired: false,
    rateLimitMs: P1_RATE_LIMIT_MS,
    maxArticlesPerRun: 25,
    articleUrlPattern: /^https:\/\/kinhtenongthon\.vn\/.+\.html$/i,
    listingSelectors: ['a.box-link', 'h3 a', '.post-title a'],
    articleSelectors: ['.detail-content', '.entry-content', 'article'],
    topicTags: ['nong-thon', 'thi-truong', 'nong-san'],
  },
  coa: {
    key: 'coa',
    label: 'COA Organic',
    baseUrl: 'https://coa.org.vn',
    discoverUrl: 'https://coa.org.vn/vi/news/rss/Tin-tuc/',
    discoverMode: 'rss',
    priority: 'P2',
    phase: 3,
    accessState: 'public_ok',
    active: true,
    fullTextCapable: true,
    browserRequired: false,
    rateLimitMs: P2_RATE_LIMIT_MS,
    maxArticlesPerRun: 15,
    articleUrlPattern: /^https:\/\/coa\.org\.vn\/.+$/i,
    articleSelectors: ['.news-detail', '.entry-content', 'article'],
    topicTags: ['huu-co', 'nong-nghiep', 'chung-nhan'],
  },
  nongsanvn_ai: {
    key: 'nongsanvn_ai',
    label: 'NongSanVN AI',
    baseUrl: 'https://nongsanvn.vn',
    discoverUrl: 'https://nongsanvn.vn',
    discoverMode: 'html',
    priority: 'P2',
    phase: 4,
    accessState: 'public_ok',
    active: false,
    fullTextCapable: true,
    browserRequired: false,
    rateLimitMs: P2_RATE_LIMIT_MS,
    maxArticlesPerRun: 0,
    topicTags: ['ai', 'du-lieu', 'nong-san'],
  },
}

export const NEWS_SOURCE_KEYS = Object.keys(NEWS_SOURCE_REGISTRY) as NewsSourceKey[]
const NEWS_SOURCE_CONFIGS_BY_KEY = NEWS_SOURCE_REGISTRY as Partial<Record<string, NewsSourceConfig>>

export function getNewsSourceConfig(sourceKey: NewsSourceKey) {
  const source = NEWS_SOURCE_CONFIGS_BY_KEY[sourceKey]
  if (!source) {
    throw new Error(`Unknown news source: ${sourceKey}`)
  }

  return source
}

export function isKnownNewsSourceKey(sourceKey: string): sourceKey is NewsSourceKey {
  return Boolean(NEWS_SOURCE_CONFIGS_BY_KEY[sourceKey])
}

export function listNewsSourceConfigs() {
  return NEWS_SOURCE_KEYS.map(sourceKey => NEWS_SOURCE_REGISTRY[sourceKey])
}

export function isNewsSourceVisible(sourceKey: NewsSourceKey) {
  return Boolean(NEWS_SOURCE_CONFIGS_BY_KEY[sourceKey]?.active)
}

export function listVisibleNewsSourceConfigs() {
  return listNewsSourceConfigs().filter(source => isNewsSourceVisible(source.key))
}
