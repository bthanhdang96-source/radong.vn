import type {
  GeneratedCommodityPricePageSummary,
  GeneratedCommodityPricePageDetail,
  GeneratedPricePageDetail,
  GeneratedPricePageSummary,
} from './types.js'

type JsonLd = Record<string, unknown>

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN')
}

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString('vi-VN')} dong/kg`
}

function formatPercent(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function absoluteUrl(origin: string, path: string) {
  return new URL(path, origin).toString()
}

function publicImageUrl(origin: string, value: string | null) {
  if (!value) {
    return null
  }

  return value.startsWith('/') ? absoluteUrl(origin, value) : value
}

function renderFaqJsonLd(pageUrl: string, page: GeneratedCommodityPricePageDetail | GeneratedPricePageDetail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
    url: pageUrl,
  }
}

function renderBreadcrumbJsonLd(pageUrl: string, pageTitle: string, pagePath: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Trang chu',
        item: pageUrl.replace(pagePath, '/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Bang gia',
        item: pageUrl.replace(pagePath, '/bang-gia'),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: pageTitle,
        item: pageUrl,
      },
    ],
  }
}

function renderWebPageJsonLd(
  pageUrl: string,
  page: GeneratedCommodityPricePageDetail | GeneratedPricePageDetail,
  imageUrl: string | null,
  about: string[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.seo.title,
    description: page.seo.description,
    url: pageUrl,
    dateModified: page.updatedAt,
    datePublished: page.publishedAt || page.updatedAt,
    about,
    image: imageUrl || undefined,
  }
}

function renderCommodityItemListJsonLd(pageUrl: string, page: GeneratedCommodityPricePageDetail) {
  if (page.renderMode !== 'regional_table' || page.regionRows.length === 0) {
    return null
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: pageUrl,
    name: `Bang gia ${page.title}`,
    itemListElement: page.regionRows.map(row => ({
      '@type': 'ListItem',
      position: row.sortRank,
      name: row.locationLabel,
      url: absoluteUrl(pageUrl, row.path),
    })),
  }
}

function renderJsonLd(items: Array<JsonLd | null>) {
  return items
    .filter((item): item is JsonLd => item !== null)
    .map(item => `<script type="application/ld+json">${JSON.stringify(item)}</script>`)
    .join('\n')
}

function renderRelated(title: string, items: Array<GeneratedPricePageSummary | GeneratedCommodityPricePageSummary> | undefined) {
  if (!items || items.length === 0) {
    return ''
  }

  return `
    <section class="rail">
      <h2>${escapeHtml(title)}</h2>
      <div class="rail-list">
        ${items
          .map(
            item => `
              <a class="rail-item" href="${escapeHtml(item.path)}">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.excerpt)}</p>
              </a>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderRegionTable(page: GeneratedCommodityPricePageDetail) {
  if (page.renderMode !== 'regional_table' || page.regionRows.length === 0) {
    return ''
  }

  return `
    <section class="table-block">
      <div class="table-head">
        <h2>Bang gia theo vung hom nay</h2>
        <p>Sap xep theo muc gia hien tai giam dan.</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Khu vuc</th>
              <th>Gia hien tai</th>
              <th>So voi hom qua</th>
              <th>So voi 7 ngay</th>
              <th>So voi binh quan</th>
              <th>Cap nhat</th>
              <th>Chi tiet</th>
            </tr>
          </thead>
          <tbody>
            ${page.regionRows
              .map(
                row => `
                  <tr>
                    <td>${row.sortRank}</td>
                    <td>${escapeHtml(row.locationLabel)}</td>
                    <td>${escapeHtml(formatCurrency(row.latestPriceVnd))}</td>
                    <td>${escapeHtml(formatPercent(row.dayChangePct))}</td>
                    <td>${escapeHtml(formatPercent(row.change7dPct))}</td>
                    <td>${escapeHtml(formatPercent(row.vsNationalAvgPct))}</td>
                    <td>${escapeHtml(row.latestObservedOn)}</td>
                    <td><a href="${escapeHtml(row.path)}">Xem trang</a></td>
                  </tr>
                `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `
}

function renderShell(options: {
  pageUrl: string
  pagePath: string
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  imageUrl: string | null
  noindex: boolean
  jsonLd: string
  body: string
}) {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <meta name="description" content="${escapeHtml(options.description)}" />
    <link rel="canonical" href="${escapeHtml(options.pageUrl)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(options.ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(options.ogDescription)}" />
    <meta property="og:url" content="${escapeHtml(options.pageUrl)}" />
    ${options.imageUrl ? `<meta property="og:image" content="${escapeHtml(options.imageUrl)}" />` : ''}
    ${options.noindex ? '<meta name="robots" content="noindex,follow" />' : '<meta name="robots" content="index,follow,max-image-preview:large" />'}
    ${options.jsonLd}
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: linear-gradient(180deg, #08111f, #102137); color: #eef4fb; }
      main { max-width: 1220px; margin: 0 auto; padding: 32px 20px 64px; }
      .shell { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; }
      .panel { background: rgba(8, 15, 30, 0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; box-shadow: 0 24px 80px rgba(0,0,0,0.24); padding: 24px; }
      .meta, .crumbs { display: flex; flex-wrap: wrap; gap: 8px; font: 500 13px/1.4 Arial, sans-serif; color: rgba(237,244,250,0.68); }
      .badge { display: inline-flex; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(245,181,79,0.3); background: rgba(245,181,79,0.12); color: #f5d188; }
      h1 { margin: 16px 0; font-size: clamp(2.1rem, 4vw, 3.25rem); line-height: 1.04; }
      .lede { margin: 0; color: rgba(237,244,250,0.88); font: 400 18px/1.8 Arial, sans-serif; }
      .hero { margin: 24px 0 0; overflow: hidden; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); }
      .hero img { display: block; width: 100%; max-height: 360px; object-fit: cover; }
      .facts { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin: 24px 0; }
      .facts article, .faq article, .rail-item { border-radius: 14px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.04); padding: 16px; }
      .facts span, .rail-item p, .table-head p { display: block; font: 500 13px/1.5 Arial, sans-serif; color: rgba(237,244,250,0.64); }
      .facts strong { display: block; margin-top: 8px; line-height: 1.45; }
      .body { font: 400 17px/1.85 Georgia, serif; color: rgba(237,244,250,0.88); }
      .body section + section { margin-top: 18px; }
      .body h2, .faq h2, .rail h2, .table-head h2 { font: 700 22px/1.2 Arial, sans-serif; }
      .table-block { margin: 28px 0; }
      .table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
      table { width: 100%; border-collapse: collapse; min-width: 760px; }
      th, td { padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left; font: 500 14px/1.5 Arial, sans-serif; }
      th { color: rgba(237,244,250,0.7); }
      a { color: #f5b54f; }
      .cta { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
      .cta a { display: inline-flex; align-items: center; justify-content: center; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); text-decoration: none; font: 600 15px/1 Arial, sans-serif; }
      .rail-list { display: grid; gap: 12px; }
      .rail-item { color: inherit; text-decoration: none; }
      @media (max-width: 960px) { .shell { grid-template-columns: 1fr; } }
      @media (max-width: 720px) { .facts { grid-template-columns: 1fr 1fr; } .cta { flex-direction: column; } }
    </style>
  </head>
  <body>
    ${options.body}
  </body>
</html>`
}

export function renderCommodityPricePageHtml(page: GeneratedCommodityPricePageDetail, origin: string) {
  const pageUrl = absoluteUrl(origin, page.path)
  const imageUrl = publicImageUrl(origin, page.thumbnailUrl)
  const noindex = page.seo.noindex === true || page.status === 'stale'
  const about =
    page.renderMode === 'national_article'
      ? [page.commoditySlug, page.nationalScopeLabel || 'Viet Nam']
      : [page.commoditySlug, 'Viet Nam']

  const jsonLd = renderJsonLd([
    renderBreadcrumbJsonLd(pageUrl, page.title, page.path),
    renderWebPageJsonLd(pageUrl, page, imageUrl, about),
    renderFaqJsonLd(pageUrl, page),
    renderCommodityItemListJsonLd(pageUrl, page),
  ])

  const body = `
    <main>
      <div class="shell">
        <div class="panel">
          <nav class="crumbs" aria-label="Breadcrumb">
            <a href="/">Trang chu</a>
            <span>/</span>
            <a href="/bang-gia">Bang gia</a>
            <span>/</span>
            <span>${escapeHtml(page.title)}</span>
          </nav>
          <header>
            <div class="meta">
              <span class="badge">${escapeHtml(page.renderMode === 'national_article' ? 'Tin gia hom nay' : 'Tong hop theo vung')}</span>
              ${page.category ? `<span>${escapeHtml(page.category)}</span>` : ''}
              <span>Cap nhat: ${escapeHtml(formatDateTime(page.updatedAt))}</span>
            </div>
            <h1>${escapeHtml(page.title)}</h1>
            <p class="lede">${escapeHtml(page.answerSummary)}</p>
          </header>
          ${imageUrl ? `<figure class="hero"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(page.thumbnailAlt || page.title)}" /></figure>` : ''}
          <section class="facts">
            <article><span>Gia hien tai</span><strong>${escapeHtml(formatCurrency(page.headlineLatestPriceVnd))}</strong></article>
            <article><span>So voi hom qua</span><strong>${escapeHtml(formatPercent(page.dayChangePct))}</strong></article>
            <article><span>So voi 7 ngay</span><strong>${escapeHtml(formatPercent(page.change7dPct))}</strong></article>
            <article><span>Vung theo doi</span><strong>${escapeHtml(page.locationCount)}</strong></article>
          </section>
          ${renderRegionTable(page)}
          <article class="body">${page.bodyHtml}</article>
          <section class="faq">
            <h2>Cau hoi thuong gap</h2>
            <div class="rail-list">
              ${page.faq.map(item => `<article><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></article>`).join('')}
            </div>
          </section>
          <section class="cta">
            <a href="/bang-gia">Xem bang gia tong hop</a>
            <a href="/chuoi-gia">Xem chuoi gia</a>
          </section>
        </div>
        <aside>
          ${renderRelated('Trang cung nong san', page.relatedLocationPages)}
          ${renderRelated('Nong san lien quan', page.relatedCommodityPages)}
        </aside>
      </div>
    </main>
  `

  return renderShell({
    pageUrl,
    pagePath: page.path,
    title: page.seo.title,
    description: page.seo.description,
    ogTitle: page.seo.ogTitle,
    ogDescription: page.seo.ogDescription,
    imageUrl,
    noindex,
    jsonLd,
    body,
  })
}

export function renderLocationPricePageHtml(page: GeneratedPricePageDetail, origin: string) {
  const pageUrl = absoluteUrl(origin, page.path)
  const imageUrl = publicImageUrl(origin, page.thumbnailUrl)
  const noindex = page.seo.noindex === true || page.status === 'stale'
  const jsonLd = renderJsonLd([
    renderBreadcrumbJsonLd(pageUrl, page.locationLabel, page.path),
    renderWebPageJsonLd(pageUrl, page, imageUrl, [page.commoditySlug, page.locationLabel]),
    renderFaqJsonLd(pageUrl, page),
  ])

  const body = `
    <main>
      <div class="shell">
        <div class="panel">
          <nav class="crumbs" aria-label="Breadcrumb">
            <a href="/">Trang chu</a>
            <span>/</span>
            <a href="/bang-gia">Bang gia</a>
            <span>/</span>
            <span>${escapeHtml(page.locationLabel)}</span>
          </nav>
          <header>
            <div class="meta">
              <span class="badge">Phan tich gia tu dong</span>
              ${page.category ? `<span>${escapeHtml(page.category)}</span>` : ''}
              <span>Cap nhat: ${escapeHtml(formatDateTime(page.updatedAt))}</span>
            </div>
            <h1>${escapeHtml(page.title)}</h1>
            <p class="lede">${escapeHtml(page.answerSummary)}</p>
          </header>
          ${imageUrl ? `<figure class="hero"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(page.thumbnailAlt || page.title)}" /></figure>` : ''}
          <section class="facts">
            <article><span>Gia hien tai</span><strong>${escapeHtml(formatCurrency(page.latestPriceVnd))}</strong></article>
            <article><span>So voi hom qua</span><strong>${escapeHtml(formatPercent(page.dayChangePct))}</strong></article>
            <article><span>So voi 7 ngay</span><strong>${escapeHtml(formatPercent(page.change7dPct))}</strong></article>
            <article><span>Bien do 7 ngay</span><strong>${escapeHtml(formatCurrency(page.minPrice7dVnd))} - ${escapeHtml(formatCurrency(page.maxPrice7dVnd))}</strong></article>
          </section>
          <article class="body">${page.bodyHtml}</article>
          <section class="faq">
            <h2>Cau hoi thuong gap</h2>
            <div class="rail-list">
              ${page.faq.map(item => `<article><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></article>`).join('')}
            </div>
          </section>
          <section class="cta">
            <a href="/gia-nong-san/${escapeHtml(page.commoditySlug)}">Xem bai theo hang hoa</a>
            <a href="/bang-gia">Xem bang gia tong hop</a>
            <a href="/chuoi-gia">Xem chuoi gia</a>
          </section>
        </div>
        <aside>
          ${renderRelated('Cung nong san', page.relatedByCommodity)}
          ${renderRelated('Cung dia ban', page.relatedByLocation)}
        </aside>
      </div>
    </main>
  `

  return renderShell({
    pageUrl,
    pagePath: page.path,
    title: page.seo.title,
    description: page.seo.description,
    ogTitle: page.seo.ogTitle,
    ogDescription: page.seo.ogDescription,
    imageUrl,
    noindex,
    jsonLd,
    body,
  })
}

export const __generatedPricePageHtmlTestUtils = {
  escapeHtml,
}
