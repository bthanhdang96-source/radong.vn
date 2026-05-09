import { makeFingerprint, makeSlug, toPlainExcerpt } from './common.js'
import { listNewsSourceConfigs } from './sourceRegistry.js'
import type { NewsArticleRecord, NewsSourceKey, NewsSourceRecord } from './types.js'

const NOW = new Date()

function offsetHours(hours: number) {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString()
}

function toSourceRecord(): NewsSourceRecord[] {
  return listNewsSourceConfigs().map(source => ({
    key: source.key,
    label: source.label,
    baseUrl: source.baseUrl,
    discoverUrl: source.discoverUrl,
    discoverMode: source.discoverMode,
    priority: source.priority,
    phase: source.phase,
    accessState: source.accessState,
    latestDetectedAt: source.latestDetectedAt ?? null,
    freshnessCheckedAt: source.freshnessCheckedAt ?? null,
    active: source.active,
    fullTextCapable: source.fullTextCapable,
    browserRequired: source.browserRequired,
    rateLimitMs: source.rateLimitMs,
    maxArticlesPerRun: source.maxArticlesPerRun,
    topicTags: source.topicTags,
  }))
}

const FALLBACK_ARTICLE_SEEDS: Array<{
  sourceKey: NewsSourceKey
  sourceLabel: string
  title: string
  category: string
  topicTags: string[]
  canonicalUrl: string
  publishedAt: string
  thumbnailUrl: string
  excerpt: string
  contentHtml: string
}> = [
  {
    sourceKey: 'vietnambiz',
    sourceLabel: 'VietnamBiz',
    title: 'Giá cà phê và hồ tiêu biến động theo nhịp xuất khẩu đầu vụ',
    category: 'Thị trường',
    topicTags: ['nong-san', 'gia-ca', 'xuat-khau'],
    canonicalUrl: 'https://vietnambiz.vn/gia-ca-phe-va-ho-tieu-bien-dong-theo-nhip-xuat-khau-dau-vu.htm',
    publishedAt: offsetHours(4),
    thumbnailUrl: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80',
    excerpt:
      'Giá cà phê nội địa giữ nền cao trong khi hồ tiêu tăng nhẹ nhờ kỳ vọng đơn hàng mới từ châu Âu và Trung Đông.',
    contentHtml:
      '<p>Giá cà phê tại Tây Nguyên tiếp tục neo ở vùng cao khi nguồn hàng vụ mới ra thị trường chậm hơn dự kiến.</p><p>Ở nhóm gia vị, hồ tiêu ghi nhận lực mua tốt từ doanh nghiệp xuất khẩu, giúp mặt bằng giá nhích lên trong ngắn hạn.</p><p>Doanh nghiệp vẫn theo dõi sát biến động tỷ giá và cước vận tải trước khi chốt thêm hợp đồng lớn.</p>',
  },
  {
    sourceKey: 'congthuong',
    sourceLabel: 'Công Thương',
    title: 'Xuất khẩu gạo giữ nhịp, doanh nghiệp tăng dự trữ nguyên liệu',
    category: 'Xuất khẩu',
    topicTags: ['gao', 'xuat-khau', 'thi-truong'],
    canonicalUrl: 'https://congthuong.vn/xuat-khau-gao-giu-nhip-doanh-nghiep-tang-du-tru-nguyen-lieu-999999.html',
    publishedAt: offsetHours(9),
    thumbnailUrl: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=80',
    excerpt:
      'Một số doanh nghiệp gạo tăng tốc gom hàng cho các đơn giao gần, trong bối cảnh giá chào bán vẫn duy trì mức cạnh tranh.',
    contentHtml:
      '<p>Thị trường gạo duy trì trạng thái giao dịch tích cực khi một số đơn hàng châu Á và châu Phi quay lại trong tháng này.</p><p>Doanh nghiệp ưu tiên cân đối tồn kho và chất lượng nguyên liệu để bảo đảm biên lợi nhuận trong bối cảnh chi phí logistics chưa giảm mạnh.</p>',
  },
  {
    sourceKey: 'nongnghiepmoitruong',
    sourceLabel: 'Nông nghiệp & Môi trường',
    title: 'Nhu cầu nông sản chế biến tăng, vùng nguyên liệu được siết chất lượng',
    category: 'Nông nghiệp',
    topicTags: ['nong-nghiep', 'che-bien', 'vung-nguyen-lieu'],
    canonicalUrl: 'https://nongnghiepmoitruong.vn/nhu-cau-nong-san-che-bien-tang-vung-nguyen-lieu-duoc-siet-chat-luong-d123456.html',
    publishedAt: offsetHours(13),
    thumbnailUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80',
    excerpt:
      'Nhiều địa phương tăng kiểm soát chất lượng đầu vào nhằm phục vụ các nhà máy chế biến và chuỗi bán lẻ hiện đại.',
    contentHtml:
      '<p>Việc mở rộng tiêu thụ qua kênh chế biến giúp nông sản có thêm đầu ra ổn định hơn so với giao dịch ngắn hạn.</p><p>Cùng lúc, các vùng nguyên liệu đang được yêu cầu chuẩn hóa nhật ký sản xuất, truy xuất và quy trình sơ chế.</p>',
  },
  {
    sourceKey: 'vpsaspice',
    sourceLabel: 'VPSA Spice',
    title: 'Hồ tiêu Việt Nam hưởng lợi từ đơn hàng gia vị cuối quý',
    category: 'Gia vị',
    topicTags: ['ho-tieu', 'gia-vi', 'xuat-khau'],
    canonicalUrl: 'https://vpsaspice.org/ho-tieu-viet-nam-huong-loi-tu-don-hang-gia-vi-cuoi-quy/',
    publishedAt: offsetHours(18),
    thumbnailUrl: 'https://images.unsplash.com/photo-1459183885421-5cc683b8dbba?auto=format&fit=crop&w=1200&q=80',
    excerpt:
      'Các lô hàng giao ngắn hạn cải thiện thanh khoản thị trường hồ tiêu nội địa trong bối cảnh nguồn cung không quá dư thừa.',
    contentHtml:
      '<p>Hiệp hội ghi nhận doanh nghiệp xuất khẩu tiếp tục ưu tiên các thị trường có vòng quay đơn hàng nhanh.</p><p>Diễn biến giá hồ tiêu trong nước nhìn chung bám sát kỳ vọng về nguồn cung và nhu cầu đầu quý sau.</p>',
  },
  {
    sourceKey: 'vietfood',
    sourceLabel: 'Vietfood / VFA',
    title: 'Doanh nghiệp lúa gạo theo sát nhu cầu mua hàng ở phân khúc chất lượng cao',
    category: 'Lúa gạo',
    topicTags: ['lua-gao', 'thi-truong', 'chat-luong-cao'],
    canonicalUrl: 'https://vietfood.org.vn/doanh-nghiep-lua-gao-theo-sat-nhu-cau-mua-hang-o-phan-khuc-chat-luong-cao/',
    publishedAt: offsetHours(26),
    thumbnailUrl: 'https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&w=1200&q=80',
    excerpt:
      'Phân khúc gạo chất lượng cao tiếp tục nhận được quan tâm trong khi doanh nghiệp trong nước duy trì thận trọng với giá mua nguyên liệu.',
    contentHtml:
      '<p>Nhu cầu mua hàng tập trung ở nhóm sản phẩm có truy xuất và thông số chất lượng ổn định.</p><p>Doanh nghiệp ưu tiên chào bán linh hoạt theo từng thị trường thay vì đẩy mạnh hợp đồng dài với giá cố định.</p>',
  },
]

export const FALLBACK_NEWS_SOURCES = toSourceRecord()

export const FALLBACK_NEWS_ARTICLES: NewsArticleRecord[] = FALLBACK_ARTICLE_SEEDS.map(seed => {
  const slug = makeSlug(seed.title)
  const contentText = seed.contentHtml.replace(/<[^>]+>/g, ' ')

  return {
    sourceKey: seed.sourceKey,
    sourceLabel: seed.sourceLabel,
    canonicalUrl: seed.canonicalUrl,
    slug,
    title: seed.title,
    excerpt: seed.excerpt ?? toPlainExcerpt(contentText),
    contentHtml: seed.contentHtml,
    contentText,
    thumbnailUrl: seed.thumbnailUrl,
    author: null,
    category: seed.category,
    topicTags: seed.topicTags,
    publishedAt: seed.publishedAt,
    fetchedAt: seed.publishedAt,
    contentMode: 'full_html',
    fingerprint: makeFingerprint([seed.canonicalUrl, seed.title, seed.publishedAt]),
    status: 'published',
  }
})
