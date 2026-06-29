import assert from 'node:assert/strict'
import test from 'node:test'
import {
  __aiArticleTestUtils,
  buildAgriBlogArticleContextsFromInputs,
  buildAgriBlogArticleContextFromNews,
  buildAgriBlogArticleContextFromSeed,
  buildExportMonthlyArticleContextsFromRows,
  buildExportMonthlyArticleContextFromRows,
  buildExportPeriodArticleContextsFromRows,
  buildExportPeriodArticleContextFromRows,
  buildWorldDailyArticleContextsFromRows,
  buildWorldDailyArticleContextFromRows,
  slugifyAiArticle,
  toAiArticleContentFeedItem,
  type AiArticleSummary,
} from '../services/aiArticles/service.js'

type CustomsRows = Parameters<typeof buildExportPeriodArticleContextFromRows>[0]
type WorldRows = Parameters<typeof buildWorldDailyArticleContextFromRows>[0]
type BlogSeedRow = Parameters<typeof buildAgriBlogArticleContextFromSeed>[0]
type BlogNewsRow = Parameters<typeof buildAgriBlogArticleContextFromNews>[1]

function customsRow(overrides: Partial<CustomsRows[number]> = {}): CustomsRows[number] {
  return {
    crawled_at: '2026-05-23T01:00:00.000Z',
    commodity_slug: 'coffee-robusta',
    report_title: 'Customs report',
    report_url: 'https://example.com/customs.pdf',
    unit_value_vnd_per_kg: 102000,
    unit_value_usd_per_kg: 3.95,
    unit_value_usd_per_ton: 3950,
    quantity_ton: 1000,
    value_usd: 3_950_000,
    cumulative_quantity_ton: null,
    cumulative_value_usd: null,
    data_granularity: 'period',
    temporal_coverage: 'report_period',
    period_type: 'customs_semimonthly',
    period_code: '2026-t5-k1',
    period_label: 'Ky 1 thang 5 nam 2026',
    period_year: 2026,
    period_month: 5,
    period_number: 1,
    period_start_date: '2026-05-01',
    period_end_date: '2026-05-15',
    aggregation_method: 'unit_value_from_aggregate_quantity_value',
    geographic_scope: 'national',
    source_detail: 'customs_export_pdf_aggregate',
    raw_payload: {},
    ...overrides,
  }
}

function worldRow(overrides: Partial<WorldRows[number]> = {}): WorldRows[number] {
  return {
    recorded_at: '2026-05-23T01:00:00.000Z',
    observed_on: '2026-05-22',
    crawl_recorded_at: '2026-05-23T01:00:00.000Z',
    commodity_slug: 'coffee-robusta',
    exchange: 'ICO',
    price_usd: 250,
    price_unit: 'usc/lb',
    price_vnd_kg: 142000,
    change_1d: 3,
    change_1d_pct: 1.2,
    change_1w_pct: 2.1,
    data_granularity: 'daily',
    temporal_coverage: 'calendar_day',
    benchmark_type: 'indicator',
    source_id: 'ico_daily',
    source_license_note: 'Public facts only',
    quality_grade: 'Robustas indicator',
    contract_symbol: 'ICO_ROBUSTAS',
    source_observation_label: 'ICO Robustas indicator 2026-05-22',
    source_url: 'https://ico.org/resources/public-market-information/',
    raw_payload: { name: 'Ca phe Robusta', category: 'Ca phe' },
    ...overrides,
  }
}

function blogSeed(overrides: Partial<BlogSeedRow> = {}): BlogSeedRow {
  return {
    id: 'seed-farmer-1',
    topic_key: 'lich-xuong-giong-lua-he-thu',
    audience: 'farmer',
    headline_hint: 'Lich xuong giong lua he thu can luu y gi',
    keyword_main: 'lich xuong giong lua',
    keywords_sub: ['lua he thu', 'quan ly nuoc'],
    style: 'guide',
    priority: 80,
    status: 'pending',
    source_ref: {},
    last_used_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function blogNewsRow(overrides: Partial<BlogNewsRow> = {}): BlogNewsRow {
  return {
    id: 'news-1',
    source_key: 'congthuong',
    canonical_url: 'https://example.com/news-1',
    slug: 'xuat-khau-gao-sang-eu',
    title: 'Doanh nghiep xuat khau gao chuan bi tieu chuan moi',
    excerpt: 'Doanh nghiep can theo doi tieu chuan va logistics trong thang 6.',
    content_text: 'Theo co quan chuc nang, doanh nghiep xuat khau gao can cap nhat tieu chuan va ho so truy xuat nguon goc trong nam 2026.',
    category: 'Xuat khau',
    topic_tags: ['gao', 'xuat-khau', 'tieu-chuan'],
    published_at: '2026-06-10T00:00:00.000Z',
    fetched_at: '2026-06-10T01:00:00.000Z',
    ...overrides,
  }
}

function validBlogDraft(context: ReturnType<typeof buildAgriBlogArticleContextFromSeed>) {
  const filler = Array.from(
    { length: 12 },
    () =>
      'Người đọc nên quan sát điều kiện thực tế, ghi lại câu hỏi còn thiếu và trao đổi với đơn vị hỗ trợ địa phương trước khi thay đổi cách làm.',
  ).join(' ')
  const faq = [
    {
      question: 'Nên bắt đầu kiểm tra thông tin từ đâu?',
      answer: 'Nên bắt đầu từ nguồn chính, sau đó đối chiếu điều kiện thực tế và hỏi đơn vị hỗ trợ tại địa phương.',
    },
    {
      question: 'Khi nào nên tạm hoãn quyết định?',
      answer: 'Nên tạm hoãn khi dữ liệu còn thiếu, điều kiện thực tế chưa rõ hoặc chưa có người có chuyên môn xác nhận.',
    },
  ]
  return {
    title: 'Chuẩn bị thông tin trước khi thay đổi cách làm',
    excerpt: 'Khung kiểm tra thận trọng giúp người đọc đánh giá thông tin và điều kiện thực tế.',
    answerSummary: 'Cần kiểm tra nguồn, điều kiện áp dụng và các rủi ro trước khi hành động.',
    bodyMarkdown: [
      '**Tóm tắt:** Người đọc cần kiểm tra nguồn, điều kiện áp dụng và các rủi ro trước khi hành động. Cách tiếp cận thận trọng giúp tránh quyết định vội vàng.',
      '## Bối cảnh cần hiểu',
      filler,
      '## Checklist việc cần kiểm tra',
      '- Thông tin nào trong nguồn chính đã rõ?',
      '- Điều kiện áp dụng tại thực tế cần kiểm tra thêm là gì?',
      '- Đơn vị hỗ trợ phù hợp nào nên được hỏi trước khi làm?',
      '- Rủi ro nào cần ghi lại để theo dõi sau khi thử?',
      '- Khi nào nên tạm hoãn quyết định để đối chiếu thêm?',
      '## Cách trao đổi với đơn vị hỗ trợ',
      filler,
      '## Câu hỏi thường gặp',
      `### ${faq[0].question}`,
      faq[0].answer,
      `### ${faq[1].question}`,
      faq[1].answer,
      '## Kết luận',
      'Chỉ nên thay đổi cách làm sau khi đã đối chiếu nguồn, đánh giá điều kiện riêng và có phương án theo dõi kết quả.',
      '## Nguồn tham khảo',
      `- [S1] [${context.sourceArticles[0]?.title}](${context.sourceArticles[0]?.canonicalUrl}) — ${context.sourceArticles[0]?.sourceKey}, 2026-06-10.`,
    ].join('\n\n'),
    seo: {
      title: 'Chuẩn bị thông tin trước khi thay đổi cách làm',
      description: 'Khung kiểm tra thận trọng trước khi hành động.',
      faq,
    },
    topicTags: ['lua'],
    audience: context.audience,
    style: context.style,
    sourcesUsed: ['S1'],
    claimSources: [],
  }
}

test('export period context stays period scoped for one customs period', () => {
  const context = buildExportPeriodArticleContextFromRows([
    customsRow(),
    customsRow({ commodity_slug: 'ho-tieu', value_usd: 2_000_000, quantity_ton: 250, unit_value_usd_per_ton: 8000 }),
  ])

  assert.equal(context?.articleType, 'export_period_report')
  assert.equal(context?.dataGranularity, 'period')
  assert.equal(context?.primaryPeriodCode, '2026-t5-k1')
  assert.equal(context?.period.type, 'customs_semimonthly')
  assert.equal(context?.commodities.length, 2)
})

test('export period contexts cover every eligible customs period and sort newest first', () => {
  const contexts = buildExportPeriodArticleContextsFromRows([
    customsRow({
      period_code: '2026-t4-k2',
      period_label: 'Ky 2 thang 4 nam 2026',
      period_month: 4,
      period_number: 2,
      period_start_date: '2026-04-16',
      period_end_date: '2026-04-30',
    }),
    customsRow(),
    customsRow({ commodity_slug: 'ho-tieu' }),
  ])

  assert.deepEqual(contexts.map(context => context.articleScopeKey), ['2026-t5-k1', '2026-t4-k2'])
  assert.deepEqual(contexts.map(context => context.commodities.length), [2, 1])
})

test('export monthly context requires at least two customs periods', () => {
  const onePeriod = buildExportMonthlyArticleContextFromRows([customsRow()])
  assert.equal(onePeriod, null)

  const monthly = buildExportMonthlyArticleContextFromRows([
    customsRow(),
    customsRow({
      period_code: '2026-t5-k2',
      period_label: 'Ky 2 thang 5 nam 2026',
      period_number: 2,
      period_start_date: '2026-05-16',
      period_end_date: '2026-05-31',
      value_usd: 4_100_000,
      quantity_ton: 1000,
    }),
  ])

  assert.equal(monthly?.articleType, 'export_monthly_report')
  assert.equal(monthly?.dataGranularity, 'monthly')
  assert.equal(monthly?.month.periodCount, 2)
  assert.deepEqual(monthly?.month.periodCodes, ['2026-t5-k1', '2026-t5-k2'])
  assert.equal(monthly?.commodities[0]?.valueUsd, 8_050_000)
})

test('export monthly contexts only include complete months and sort by data date', () => {
  const contexts = buildExportMonthlyArticleContextsFromRows([
    customsRow(),
    customsRow({
      period_code: '2026-t4-k1',
      period_label: 'Ky 1 thang 4 nam 2026',
      period_month: 4,
      period_number: 1,
      period_start_date: '2026-04-01',
      period_end_date: '2026-04-15',
    }),
    customsRow({
      period_code: '2026-t4-k2',
      period_label: 'Ky 2 thang 4 nam 2026',
      period_month: 4,
      period_number: 2,
      period_start_date: '2026-04-16',
      period_end_date: '2026-04-30',
    }),
    customsRow({
      period_code: '2026-t3-k1',
      period_label: 'Ky 1 thang 3 nam 2026',
      period_month: 3,
      period_number: 1,
      period_start_date: '2026-03-01',
      period_end_date: '2026-03-15',
    }),
    customsRow({
      period_code: '2026-t3-k2',
      period_label: 'Ky 2 thang 3 nam 2026',
      period_month: 3,
      period_number: 2,
      period_start_date: '2026-03-16',
      period_end_date: '2026-03-31',
    }),
  ])

  assert.deepEqual(contexts.map(context => context.articleScopeKey), ['2026-04', '2026-03'])
  assert.deepEqual(contexts.map(context => context.primaryObservedOn), ['2026-04-30', '2026-03-31'])
})

test('world daily context only promotes daily rows to daily signals', () => {
  const context = buildWorldDailyArticleContextFromRows([
    worldRow(),
    worldRow({
      commodity_slug: 'rice-5pct',
      exchange: 'Thai Rice Exporters Association',
      price_usd: 446,
      price_unit: 'USD/MT',
      change_1d: null,
      change_1d_pct: null,
      data_granularity: 'as_published',
      benchmark_type: 'spot_export_benchmark',
      source_id: 'thai_rice_exporters',
      source_url: 'https://www.thairiceexporters.or.th/price.htm',
      source_observation_label: 'Thai rice FOB 2026-05-20',
      observed_on: '2026-05-20',
    }),
    worldRow({
      commodity_slug: 'shrimp',
      exchange: 'Legacy fallback',
      price_usd: 8.5,
      price_unit: 'USD/kg',
      change_1d: null,
      change_1d_pct: null,
      data_granularity: 'unknown',
      benchmark_type: 'unknown',
      source_id: 'legacy',
      source_url: null,
      source_observation_label: 'Legacy fallback shrimp',
      observed_on: '2026-05-20',
    }),
  ])

  assert.equal(context?.articleType, 'world_daily_price_update')
  assert.equal(context?.dataGranularity, 'daily')
  assert.deepEqual(context?.dailySignals.map(item => item.commoditySlug), ['coffee-robusta'])
  assert.deepEqual(context?.referenceBenchmarks.map(item => item.commoditySlug), ['rice-5pct'])
})

test('world daily contexts cover each observed day with daily signals and exclude future references', () => {
  const contexts = buildWorldDailyArticleContextsFromRows([
    worldRow({ observed_on: '2026-05-22', commodity_slug: 'coffee-robusta' }),
    worldRow({ observed_on: '2026-05-21', commodity_slug: 'pepper-black', exchange: 'IPC', source_id: 'ipc_daily' }),
    worldRow({
      observed_on: '2026-05-22',
      commodity_slug: 'rice-5pct',
      data_granularity: 'as_published',
      change_1d: null,
      change_1d_pct: null,
      source_id: 'thai_rice_exporters',
    }),
    worldRow({
      observed_on: '2026-05-20',
      commodity_slug: 'rice-25pct',
      data_granularity: 'as_published',
      change_1d: null,
      change_1d_pct: null,
      source_id: 'thai_rice_exporters',
    }),
  ])

  assert.deepEqual(contexts.map(context => context.articleScopeKey), ['2026-05-22', '2026-05-21'])
  assert.deepEqual(contexts[1]?.referenceBenchmarks.map(item => item.commoditySlug), ['rice-25pct'])
})

test('agri blog contexts choose pending seed before news fallback and rotate audiences', () => {
  const contexts = buildAgriBlogArticleContextsFromInputs({
    seeds: [blogSeed()],
    newsRows: [
      blogNewsRow({
        id: 'news-farmer',
        slug: 'khuyen-nong-lua-he-thu',
        title: 'Khuyen nong lua he thu can quan ly nuoc',
        category: 'Khuyen nong',
        topic_tags: ['lua', 'ky-thuat'],
      }),
      blogNewsRow({
        id: 'news-trader',
        slug: 'thi-truong-thu-mua-ca-phe',
        title: 'Thi truong thu mua ca phe co tin hieu moi',
        category: 'Thi truong',
        topic_tags: ['ca-phe', 'thu-mua'],
      }),
      blogNewsRow(),
    ],
    dailyLimit: 3,
  })

  assert.deepEqual(contexts.map(context => context.audience), ['farmer', 'trader', 'exporter'])
  assert.equal(contexts[0]?.sourceMode, 'seed')
  assert.equal(contexts[0]?.seedId, 'seed-farmer-1')
  assert.equal(contexts[1]?.sourceMode, 'news_fallback')
  assert.equal(contexts[2]?.sourceMode, 'news_fallback')
  assert.equal(new Set(contexts.map(context => context.audience)).size, 3)
})

test('agri blog contexts avoid existing article_scope_key duplicates', () => {
  const seed = blogSeed()
  const seedContext = buildAgriBlogArticleContextFromSeed(seed, [blogNewsRow()])
  const contexts = buildAgriBlogArticleContextsFromInputs({
    seeds: [seed],
    newsRows: [blogNewsRow()],
    existingScopeKeys: new Set([seedContext.articleScopeKey]),
    audience: 'farmer',
  })

  assert.equal(contexts.length, 1)
  assert.notEqual(contexts[0]?.articleScopeKey, seedContext.articleScopeKey)
  assert.equal(contexts[0]?.sourceMode, 'news_fallback')
})

test('agri blog prompt stays on blog article type instead of daily price context', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const prompt = __aiArticleTestUtils.buildArticlePrompt(context)

  assert.equal(context.articleType, 'agri_blog')
  assert.equal(context.contentFamilySlug, 'blog-nong-nghiep')
  assert.equal('dailySignals' in context, false)
  assert.match(prompt, /rule base ai-blog-rules-v2/)
  assert.match(prompt, /SOURCE_LEDGER/)
  assert.match(prompt, /Khong viet bai "gia hom nay"/)
  assert.match(prompt, /claimSources/)
  assert.match(prompt, /sourcesUsed mac dinh chi gom \["S1"\]/)
  assert.match(prompt, /Checklist bat buoc la cac cau hoi xac minh/)
  assert.match(prompt, /Nhắm 760-860 từ/)
  assert.match(prompt, /Cau khuyen nghi, dien giai tac nghiep/)
})

test('agri blog repair prompt gives checklist and source-reference guidance', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const prompt = __aiArticleTestUtils.buildAiBlogRepairPrompt(context, null, [
    { code: 'CHECKLIST_ITEM_NOT_QUESTION', message: 'bad checklist' },
    { code: 'REFERENCE_INCOMPLETE', message: 'bad references' },
    { code: 'WORD_COUNT_MAX', message: 'too long' },
    { code: 'CITED_CLAIM_UNSUPPORTED', message: 'bad advice citation' },
  ])

  assert.match(prompt, /Checklist thanh 5 bullet cau hoi/)
  assert.match(prompt, /Dong bo sourcesUsed voi Nguon tham khao/)
  assert.match(prompt, /cat ve 760-860 tu/)
  assert.match(prompt, /bo \[Sx\] va bo khoi claimSources/)
})

test('agri blog draft validation returns deterministic hard-gate codes', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    title: 'Cach chuan bi vu lua he thu',
    excerpt: 'Checklist ngan cho nha nong.',
    answerSummary: 'Can kiem tra lich xuong giong, nuoc va sau benh.',
    bodyMarkdown: [
      'Mo bai co so lieu 12% nhung khong co chu thich.',
      '## Viec can lam dau tien',
      '<div>Quan sat dong ruong</div>',
      '## Quan ly nuoc',
      'Giu muc nuoc phu hop.',
      '## Ket luan',
      'Lap checklist truoc khi xuong giong.',
    ].join('\n\n'),
    seo: { title: 'Cach chuan bi vu lua he thu', description: 'Checklist ngan.' },
    topicTags: ['lua'],
    audience: 'farmer',
    style: 'guide',
  })

  assert.equal(quality.valid, false)
  assert.ok(quality.hardFailures.some(failure => failure.code === 'RAW_HTML'))
  assert.ok(quality.hardFailures.some(failure => failure.code === 'WORD_COUNT_MIN'))
  assert.ok(quality.hardFailures.some(failure => failure.code === 'CLAIM_INLINE_CITATION'))
  assert.throws(() => __aiArticleTestUtils.parseAiDraft('{"title":"Thieu body"}'), /missing title, excerpt, or bodyMarkdown/)
})

test('agri blog source pack keeps relevant rice sources and rejects unrelated coffee and durian', () => {
  const primary = blogNewsRow({
    id: 'rice-primary',
    slug: 'philippines-tran-gia-ban-le-gao',
    title: 'Philippines áp trần giá bán lẻ gạo nhập khẩu',
    topic_tags: ['gao', 'philippines', 'gia-ban-le'],
  })
  const context = buildAgriBlogArticleContextFromNews('trader', primary, [
    primary,
    blogNewsRow({
      id: 'rice-related',
      canonical_url: 'https://example.com/rice-related',
      slug: 'thi-truong-gao-philippines',
      title: 'Thị trường gạo Philippines cần theo dõi nguồn cung',
      topic_tags: ['gao', 'philippines'],
    }),
    blogNewsRow({
      id: 'coffee',
      canonical_url: 'https://example.com/coffee',
      slug: 'du-bao-ca-phe-viet-nam',
      title: 'Dự báo sản lượng cà phê Việt Nam',
      topic_tags: ['ca-phe'],
    }),
    blogNewsRow({
      id: 'durian',
      canonical_url: 'https://example.com/durian',
      slug: 'ma-so-vung-trong-sau-rieng',
      title: 'Kiểm soát mã số vùng trồng sầu riêng',
      topic_tags: ['sau-rieng'],
    }),
  ])

  assert.deepEqual(context.sourceArticles.map(source => source.id), ['rice-primary', 'rice-related'])
  assert.deepEqual(context.sourceArticles.map(source => source.sourceId), ['S1', 'S2'])
})

test('agri blog preflight rejects primary source title/content mismatch before Gemini', async () => {
  const primary = blogNewsRow({
    id: 'rice-mismatch',
    slug: 'philippines-gia-nhap-khau-gao',
    title: 'Philippines siet quy dinh ve gia nhap khau gao Viet Nam',
    excerpt: 'He thong truy xuat moi duoc gioi thieu cho nhieu san pham nong lam thuy san.',
    content_text:
      'Co quan quan ly cong bo he thong truy xuat nguon goc cho 18.000 san pham nong lam thuy san va yeu cau co so cap nhat ma truy xuat.',
    topic_tags: ['truy-xuat'],
  })
  const context = buildAgriBlogArticleContextFromNews('exporter', primary, [primary])

  const preflight = __aiArticleTestUtils.validateAgriBlogSourcePreflight(context)
  assert.ok(preflight.some(failure => failure.code === 'SOURCE_PRIMARY_CONTENT_MISMATCH'))

  let calls = 0
  const result = await __aiArticleTestUtils.generateAgriBlogDraftWithRetries(
    context,
    [],
    async () => {
      calls += 1
      return { model: 'test-model', text: '{"title":"should not be called"}' }
    },
  )

  assert.equal(result.success, false)
  assert.equal(calls, 0)
  assert.equal(result.attempts[0]?.attempt, 0)
  assert.ok(result.failures.some(failure => failure.code === 'SOURCE_PRIMARY_CONTENT_MISMATCH'))
})

test('agri blog preflight accepts coherent primary source title/content', () => {
  const primary = blogNewsRow({
    id: 'rice-coherent',
    slug: 'philippines-tran-gia-ban-le-gao',
    title: 'Philippines ap tran gia ban le voi gao nhap khau Viet Nam',
    excerpt: 'Philippines ap tran gia ban le 50 PHP/kg voi gao nhap khau loai 5% tam trong 30 ngay.',
    content_text:
      'Co quan Philippines ap tran gia ban le 50 PHP/kg doi voi gao nhap khau loai 5% tam trong 30 ngay va nhac toi nguon cung gao Viet Nam.',
    topic_tags: ['gao', 'philippines', 'gia-ban-le'],
  })
  const context = buildAgriBlogArticleContextFromNews('trader', primary, [primary])

  assert.deepEqual(__aiArticleTestUtils.validateAgriBlogSourcePreflight(context), [])
})

test('agri blog preflight accepts marketing-title filler when commodity evidence is coherent', () => {
  const primary = blogNewsRow({
    id: 'melon-coherent',
    slug: 'doi-doi-nho-trong-dua-le',
    title: 'Doi doi nho trong dua le',
    excerpt: 'Mo hinh trong dua le giup ho dan co them huong san xuat phu hop voi dieu kien dia phuong.',
    content_text:
      'Bai viet ghi nhan mo hinh trong dua le, cach ho dan theo doi vuon cay va nhung cau hoi can kiem tra khi mo rong dien tich.',
    topic_tags: ['dua-le'],
  })
  const context = buildAgriBlogArticleContextFromNews('farmer', primary, [primary])

  assert.deepEqual(__aiArticleTestUtils.validateAgriBlogSourcePreflight(context), [])
})

test('agri blog preflight accepts Tuyen Quang title filler when strong entity evidence is coherent', () => {
  const primary = blogNewsRow({
    id: 'tuyen-quang-coherent',
    slug: 'nong-nghiep-va-moi-truong-tuyen-quang-but-pha',
    title: 'Nong nghiep va Moi truong Tuyen Quang but pha',
    excerpt: '6 thang dau nam 2026, nhieu chi tieu san xuat cua nganh nong nghiep Tuyen Quang tang truong kha.',
    content_text:
      'Theo So Nong nghiep va Moi truong tinh Tuyen Quang, tong san luong luong thuc co hat uoc dat hon 158 nghin tan, dien tich dau tuong va cay lac deu tang so voi cung ky.',
    topic_tags: ['tuyen-quang', 'nong-nghiep'],
  })
  const context = buildAgriBlogArticleContextFromNews('farmer', primary, [primary])

  assert.deepEqual(__aiArticleTestUtils.validateAgriBlogSourcePreflight(context), [])
})

test('agri blog fact snippets remove source-site navigation and hotline text', () => {
  const snippets = __aiArticleTestUtils.getBlogFactSnippets(
    'Hotline: 0983.970.780 Thời sự Nông nghiệp Môi trường Multimedia Pháp luật - Bạn đọc. ' +
      'Theo báo cáo, diện tích vùng nguyên liệu đạt 653ha trong kế hoạch năm 2026. ' +
      'Các hộ tham gia được hướng dẫn ghi chép thông tin sản xuất.',
  )

  assert.ok(snippets.some(snippet => snippet.includes('653ha')))
  assert.ok(snippets.every(snippet => !/hotline|multimedia/i.test(snippet)))
})

test('agri blog title promise gate rejects evaluation headline without sourced opinion', () => {
  const context = buildAgriBlogArticleContextFromNews(
    'farmer',
    blogNewsRow({
      id: 'black-thorn',
      slug: 'sau-rieng-black-thorn-vinh-long',
      title: 'Sau rieng Black Thorn duoc trong thu nghiem tai Vinh Long',
      excerpt: 'Giong sau rieng Black Thorn co nguon goc Malaysia va duoc mot so vuon dua vao trong thu nghiem.',
      content_text:
        'Giong sau rieng Black Thorn co nguon goc Malaysia, duoc gioi thieu tai Vinh Long va can theo doi dieu kien dat nuoc khi trong thu nghiem.',
      topic_tags: ['sau-rieng', 'black-thorn'],
    }),
    [],
  )
  const draft = validBlogDraft(context)
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    ...draft,
    title: 'Nha vuon Vinh Long danh gia gi ve sau rieng Black Thorn',
    seo: { ...draft.seo, title: 'Nha vuon Vinh Long danh gia gi ve sau rieng Black Thorn' },
  })

  assert.equal(quality.valid, false)
  assert.ok(quality.hardFailures.some(failure => failure.code === 'TITLE_PROMISE_UNSUPPORTED'))
})

test('agri blog audience value gate rejects generic trader and exporter advice', () => {
  const traderContext = buildAgriBlogArticleContextFromNews(
    'trader',
    blogNewsRow({
      id: 'tuyen-quang-trader',
      slug: 'tuyen-quang-san-xuat-nong-nghiep',
      title: 'Tuyen Quang phat trien san xuat nong nghiep nam 2026',
      excerpt: 'Dia phuong tap trung vung san xuat va ke hoach phat trien nong nghiep.',
      content_text:
        'Tuyen Quang tap trung phat trien san xuat nong nghiep, mo rong vung san xuat va tang cuong lien ket voi hop tac xa trong nam 2026.',
      topic_tags: ['tuyen-quang'],
    }),
    [],
  )
  const exporterContext = buildAgriBlogArticleContextFromNews(
    'exporter',
    blogNewsRow({
      id: 'tuyen-quang-exporter',
      slug: 'tuyen-quang-san-xuat-nong-nghiep',
      title: 'Tuyen Quang phat trien san xuat nong nghiep nam 2026',
      excerpt: 'Dia phuong tap trung vung san xuat va ke hoach phat trien nong nghiep.',
      content_text:
        'Tuyen Quang tap trung phat trien san xuat nong nghiep, mo rong vung san xuat va tang cuong lien ket voi hop tac xa trong nam 2026.',
      topic_tags: ['tuyen-quang'],
    }),
    [],
  )

  const traderQuality = __aiArticleTestUtils.validateAgriBlogDraft(traderContext, validBlogDraft(traderContext))
  const exporterQuality = __aiArticleTestUtils.validateAgriBlogDraft(exporterContext, validBlogDraft(exporterContext))

  assert.equal(traderQuality.valid, false)
  assert.ok(traderQuality.hardFailures.some(failure => failure.code === 'AUDIENCE_VALUE_MISSING'))
  assert.equal(exporterQuality.valid, false)
  assert.ok(exporterQuality.hardFailures.some(failure => failure.code === 'AUDIENCE_VALUE_MISSING'))
})

test('agri blog audience value gate accepts exporter chain-development detail', () => {
  const context = buildAgriBlogArticleContextFromNews(
    'exporter',
    blogNewsRow({
      id: 'chain-exporter',
      slug: 'du-an-lien-ket-chuoi-che-bien-xuat-khau',
      title: 'Du an lien ket chuoi che bien xuat khau nong san',
      excerpt: 'Doanh nghiep khao sat vung nguyen lieu va lien ket chuoi de phuc vu che bien xuat khau.',
      content_text:
        'Nguon tin neu doanh nghiep khao sat vung nguyen lieu, lien ket chuoi, nang luc cung ung, chat luong san pham va co so che bien xuat khau.',
      topic_tags: ['xuat-khau', 'vung-nguyen-lieu', 'lien-ket-chuoi'],
    }),
    [],
  )
  const draft = validBlogDraft(context)
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    ...draft,
    bodyMarkdown: draft.bodyMarkdown.replace(
      'Người đọc nên quan sát điều kiện thực tế, ghi lại câu hỏi còn thiếu và trao đổi với đơn vị hỗ trợ địa phương trước khi thay đổi cách làm.',
      'Nên hỏi: vùng nguyên liệu nào cần xác minh, liên kết chuỗi ra sao, năng lực cung ứng đến đâu, chất lượng sản phẩm được kiểm tra thế nào, cơ sở chế biến xuất khẩu và điều khoản hợp đồng cần đối chiếu gì?',
    ),
  })

  assert.equal(quality.valid, true, JSON.stringify(quality.hardFailures))
})

test('agri blog checklist gate rejects declarative cited advice and checklist claimSources', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const draft = validBlogDraft(context)
  const checklistClaim = 'Thiết lập vùng nguyên liệu 100 ha trước khi ký hợp đồng [S1].'
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    ...draft,
    bodyMarkdown: draft.bodyMarkdown.replace('## Checklist việc cần kiểm tra', `## Checklist việc cần kiểm tra\n\n- ${checklistClaim}`),
    claimSources: [{ claim: checklistClaim, sourceIds: ['S1'] }],
  })

  assert.equal(quality.valid, false)
  assert.ok(quality.hardFailures.some(failure => failure.code === 'CHECKLIST_ITEM_NOT_QUESTION'))
  assert.ok(quality.hardFailures.some(failure => failure.code === 'CHECKLIST_CITATION_FORBIDDEN'))
  assert.ok(quality.hardFailures.some(failure => failure.code === 'CHECKLIST_FACTUAL_DETAIL'))
  assert.ok(quality.hardFailures.some(failure => failure.code === 'CHECKLIST_CLAIM_MAPPING_FORBIDDEN'))
})

test('agri blog checklist gate allows operational verification questions', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const draft = validBlogDraft(context)
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    ...draft,
    bodyMarkdown: draft.bodyMarkdown.replace(
      '- Thông tin nào trong nguồn chính đã rõ?',
      '- Các điều khoản trong hợp đồng và bước truy xuất nguồn gốc nào cần đối chiếu thêm?',
    ),
  })

  assert.equal(quality.valid, true, JSON.stringify(quality.hardFailures))
})

test('agri blog claimSources may map supported body claims that resemble checklist questions', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const draft = validBlogDraft(context)
  const supportedClaim =
    'Theo cơ quan chức năng, doanh nghiệp xuất khẩu gạo cần cập nhật tiêu chuẩn và hồ sơ truy xuất nguồn gốc trong năm 2026 [S1].'
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    ...draft,
    bodyMarkdown: draft.bodyMarkdown
      .replace('- Thông tin nào trong nguồn chính đã rõ?', '- Hồ sơ truy xuất nguồn gốc và tiêu chuẩn nào cần đối chiếu thêm?')
      .replace('## Câu hỏi thường gặp', `${supportedClaim}\n\n## Câu hỏi thường gặp`),
    claimSources: [{ claim: supportedClaim, sourceIds: ['S1'] }],
  })

  assert.equal(quality.valid, true, JSON.stringify(quality.hardFailures))
})

test('Vietnamese decimal and thousands separators normalize for source-number checks', () => {
  assert.deepEqual(__aiArticleTestUtils.extractNumberTokens('tăng 8,9% trên 1.000ha, quả nặng 1,5 đến 2kg'), [
    '8.9',
    '1000',
    '1.5',
    '2',
  ])
})

test('SEO score normalization stores only integer 0-100 scores and rejects ambiguous 0-10 scale', () => {
  assert.deepEqual(__aiArticleTestUtils.normalizeAiBlogSeoScore(86), { score: 86, warning: null })

  const tenPoint = __aiArticleTestUtils.normalizeAiBlogSeoScore(9)
  assert.equal(tenPoint.score, null)
  assert.equal(tenPoint.warning?.code, 'SEO_SCORE_INVALID_SCALE')

  const numericString = __aiArticleTestUtils.normalizeAiBlogSeoScore('86')
  assert.equal(numericString.score, null)
  assert.equal(numericString.warning?.code, 'SEO_SCORE_INVALID_SCALE')

  const decimal = __aiArticleTestUtils.normalizeAiBlogSeoScore(86.5)
  assert.equal(decimal.score, null)
  assert.equal(decimal.warning?.code, 'SEO_SCORE_INVALID_SCALE')
})

test('duplicate draft identity helper ignores target row and flags other slug or scope collisions', () => {
  const collisions = __aiArticleTestUtils.getAiArticleIdentityCollisions(
    [
      { id: 'target-row', slug: 'blog-nong-nghiep-trader-topic', article_scope_key: 'agri_blog:trader:topic', title: 'Target' },
      { id: 'other-slug', slug: 'blog-nong-nghiep-trader-topic', article_scope_key: 'agri_blog:trader:old-topic', title: 'Other slug' },
      { id: 'other-scope', slug: 'blog-nong-nghiep-trader-other', article_scope_key: 'agri_blog:trader:topic', title: 'Other scope' },
      { id: 'unrelated', slug: 'blog-nong-nghiep-farmer-topic', article_scope_key: 'agri_blog:farmer:topic', title: 'Unrelated' },
    ],
    'target-row',
    { slug: 'blog-nong-nghiep-trader-topic', articleScopeKey: 'agri_blog:trader:topic' },
  )

  assert.deepEqual(collisions.map(item => item.id), ['other-slug', 'other-scope'])
})

test('duplicate scope preflight flags legacy draft before generation', () => {
  const baseContext = buildAgriBlogArticleContextFromNews('trader', blogNewsRow({ slug: 'topic', title: 'Topic' }), [])
  const context = {
    ...baseContext,
    articleScopeKey: 'agri_blog:trader:topic',
    replacementArticleId: 'target-row',
    replacementArticleSlug: 'blog-nong-nghiep-trader-topic-old',
  }
  const failures = __aiArticleTestUtils.buildDuplicateScopePreflightFailures(context, [
    { id: 'target-row', slug: 'blog-nong-nghiep-trader-topic-old', article_scope_key: 'agri_blog:trader:old-topic', title: 'Target' },
    { id: 'other-scope', slug: 'blog-nong-nghiep-trader-topic', article_scope_key: 'agri_blog:trader:topic', title: 'Other scope' },
  ])

  assert.deepEqual(failures.map(failure => failure.code), ['DUPLICATE_DRAFT_IDENTITY'])
})

test('valid agri blog passes hard gates with body FAQ and source ledger references', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, validBlogDraft(context))

  assert.equal(quality.valid, true, JSON.stringify(quality.hardFailures))
  assert.equal(quality.hardFailures.length, 0)
  assert.ok(quality.wordCount >= 700)
  assert.ok(quality.wordCount <= 1000)
})

test('numbered-list markers are not treated as factual claims', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const draft = validBlogDraft(context)
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    ...draft,
    bodyMarkdown: draft.bodyMarkdown.replace(
      '## Checklist việc cần kiểm tra',
      '## Checklist việc cần kiểm tra\n\n1.\n\n2.\n\n3.',
    ),
  })

  assert.equal(quality.valid, true, JSON.stringify(quality.hardFailures))
})

test('retail price ceiling cannot be rewritten as an import-price rule', () => {
  const context = buildAgriBlogArticleContextFromNews(
    'trader',
    blogNewsRow({
      title: 'Philippines áp trần giá đối với gạo nhập khẩu',
      content_text: 'Mức giá bán lẻ tối đa là 50 PHP/kg đối với gạo nhập khẩu loại 5% tấm trong 30 ngày.',
      topic_tags: ['gao', 'philippines', 'gia-ban-le'],
    }),
    [],
  )
  const draft = validBlogDraft(buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()]))
  const bodyMarkdown = draft.bodyMarkdown.replace(
    '## Câu hỏi thường gặp',
    'Đây là quy định về giá nhập khẩu tại Philippines [S1].\n\n## Câu hỏi thường gặp',
  )
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    ...draft,
    audience: 'trader',
    style: 'market_note',
    bodyMarkdown: bodyMarkdown.replace('https://example.com/news-1', context.sourceArticles[0]?.canonicalUrl ?? ''),
    claimSources: [{ claim: 'Đây là quy định về giá nhập khẩu tại Philippines.', sourceIds: ['S1'] }],
  })

  assert.equal(quality.valid, false)
  assert.ok(quality.hardFailures.some(failure => failure.code === 'PRICE_TYPE_CHANGED'))
})

test('citation cannot legitimize advice that is absent from source facts', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const draft = validBlogDraft(context)
  const unsupportedClaim = 'Bà con cần dựng nhà kính kín hoàn toàn trước khi bắt đầu [S1].'
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    ...draft,
    bodyMarkdown: draft.bodyMarkdown.replace('## Câu hỏi thường gặp', `${unsupportedClaim}\n\n## Câu hỏi thường gặp`),
    claimSources: [{ claim: unsupportedClaim, sourceIds: ['S1'] }],
  })

  assert.equal(quality.valid, false)
  assert.ok(quality.hardFailures.some(failure => failure.code === 'CLAIM_TEXT_UNSUPPORTED'))
})

test('validator derives a missing claim mapping when inline citation is supported', () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  const draft = validBlogDraft(context)
  const supportedClaim =
    'Theo cơ quan chức năng, doanh nghiệp xuất khẩu gạo cần cập nhật tiêu chuẩn và hồ sơ truy xuất nguồn gốc trong năm 2026 [S1].'
  const quality = __aiArticleTestUtils.validateAgriBlogDraft(context, {
    ...draft,
    bodyMarkdown: draft.bodyMarkdown.replace('## Câu hỏi thường gặp', `${supportedClaim}\n\n## Câu hỏi thường gặp`),
    claimSources: [],
  })

  assert.equal(quality.valid, true, JSON.stringify(quality.hardFailures))
  assert.ok(quality.claimSources.some(item => item.sourceIds.includes('S1')))
})

test('agri blog generation stops after three invalid model responses', async () => {
  const context = buildAgriBlogArticleContextFromSeed(blogSeed(), [blogNewsRow()])
  let calls = 0
  const result = await __aiArticleTestUtils.generateAgriBlogDraftWithRetries(
    context,
    [],
    async () => {
      calls += 1
      return { model: 'test-model', text: '{"title":"missing body"}' }
    },
  )

  assert.equal(result.success, false)
  assert.equal(calls, 3)
  assert.equal(result.attempts.length, 3)
  assert.ok(result.failures.some(failure => failure.code === 'MODEL_RESPONSE_INVALID'))
})

test('AI article feed item keeps news path and taxonomy metadata', () => {
  const item = toAiArticleContentFeedItem({
    id: 'article-1',
    slug: 'gia-nong-san-the-gioi-2026-05-22',
    path: '/tin-tuc/gia-nong-san-the-gioi-2026-05-22',
    articleType: 'world_daily_price_update',
    title: 'Gia nong san the gioi ngay 22/5',
    excerpt: 'Ca phe va ho tieu co tin hieu moi.',
    thumbnailUrl: null,
    sourceKey: 'nongsanvn_ai',
    sourceLabel: 'NongSanVN AI',
    publishedAt: '2026-05-23T02:00:00.000Z',
    updatedAt: '2026-05-23T02:00:00.000Z',
    sortAt: '2026-05-22T00:00:00.000Z',
    category: 'Gia the gioi',
    topicTags: ['gia-the-gioi'],
    contentFamilySlug: 'gia-nong-san-the-gioi',
    contentFamilyLabel: 'Gia nong san the gioi',
    familyPath: '/tin-tuc/nhom/gia-nong-san-the-gioi',
    badgeLabel: 'Gia the gioi',
    dataGranularity: 'daily',
    primaryPeriodCode: null,
    primaryObservedOn: '2026-05-22',
    status: 'published',
  } satisfies AiArticleSummary)

  assert.equal(item.kind, 'ai_article')
  assert.equal(item.path, '/tin-tuc/gia-nong-san-the-gioi-2026-05-22')
  assert.equal(item.contentFamilySlug, 'gia-nong-san-the-gioi')
  assert.equal(item.familyPath, '/tin-tuc/nhom/gia-nong-san-the-gioi')
  assert.equal(item.sortAt, '2026-05-22T00:00:00.000Z')
})

test('agri blog feed item maps into blog content family', () => {
  const item = toAiArticleContentFeedItem({
    id: 'blog-1',
    slug: 'blog-nong-nghiep-farmer-lich-xuong-giong-lua',
    path: '/tin-tuc/blog-nong-nghiep-farmer-lich-xuong-giong-lua',
    articleType: 'agri_blog',
    title: 'Lich xuong giong lua he thu can luu y gi',
    excerpt: 'Checklist ngan cho nha nong.',
    thumbnailUrl: null,
    sourceKey: 'nongsanvn_ai',
    sourceLabel: 'NongSanVN AI',
    publishedAt: '2026-06-10T02:00:00.000Z',
    updatedAt: '2026-06-10T02:00:00.000Z',
    sortAt: '2026-06-10T00:00:00.000Z',
    category: 'Blog nha nong',
    topicTags: ['blog-nong-nghiep', 'nha-nong'],
    contentFamilySlug: 'blog-nong-nghiep',
    contentFamilyLabel: 'Blog nong nghiep',
    familyPath: '/tin-tuc/nhom/blog-nong-nghiep',
    badgeLabel: 'Blog',
    dataGranularity: 'mixed',
    primaryPeriodCode: null,
    primaryObservedOn: '2026-06-10',
    status: 'published',
  } satisfies AiArticleSummary)

  assert.equal(item.kind, 'ai_article')
  assert.equal(item.articleType, 'agri_blog')
  assert.equal(item.contentFamilySlug, 'blog-nong-nghiep')
  assert.equal(item.familyPath, '/tin-tuc/nhom/blog-nong-nghiep')
})

test('AI article slug is stable ASCII', () => {
  assert.equal(slugifyAiArticle('Báo cáo xuất khẩu nông sản kỳ 1 tháng 5/2026'), 'bao-cao-xuat-khau-nong-san-ky-1-thang-5-2026')
})
