import { escapeHtml, fetchBackendJson, toAbsoluteUrl } from '../_shared.js'

function formatDateTime(value) {
  return new Date(value).toLocaleString('vi-VN')
}

function formatCurrency(value) {
  return `${Math.round(value).toLocaleString('vi-VN')} đồng/kg`
}

function formatPercent(value) {
  return `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}%`
}

function toPublicImageUrl(req, value) {
  if (!value) {
    return null
  }

  return value.startsWith('/') ? toAbsoluteUrl(req, value) : value
}

function renderFaqJsonLd(pageUrl, page) {
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

function renderWebPageJsonLd(pageUrl, page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.seo.title,
    description: page.seo.description,
    url: pageUrl,
    dateModified: page.updatedAt,
    datePublished: page.publishedAt || page.updatedAt,
    about: page.renderMode === 'national_article' ? [page.commoditySlug, page.nationalScopeLabel || 'Việt Nam'] : [page.commoditySlug, 'Việt Nam'],
    image: page.thumbnailUrl || undefined,
  }
}

function renderBreadcrumbJsonLd(pageUrl, page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Trang chủ',
        item: pageUrl.replace(page.path, '/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Bảng giá',
        item: pageUrl.replace(page.path, '/bang-gia'),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: page.title,
        item: pageUrl,
      },
    ],
  }
}

function renderItemListJsonLd(pageUrl, page) {
  if (page.renderMode !== 'regional_table' || !Array.isArray(page.regionRows) || page.regionRows.length === 0) {
    return null
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: pageUrl,
    name: `Bảng giá ${page.title}`,
    itemListElement: page.regionRows.map(row => ({
      '@type': 'ListItem',
      position: row.sortRank,
      name: row.locationLabel,
      url: new URL(row.path, pageUrl).toString(),
    })),
  }
}

function renderRelated(title, items) {
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

function renderRegionTable(page) {
  if (page.renderMode !== 'regional_table' || !Array.isArray(page.regionRows) || page.regionRows.length === 0) {
    return ''
  }

  return `
    <section class="table-block">
      <div class="table-head">
        <h2>Bảng giá theo vùng hôm nay</h2>
        <p>Sắp xếp theo mức giá hiện tại giảm dần.</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Khu vực</th>
              <th>Giá hiện tại</th>
              <th>So với hôm qua</th>
              <th>So với 7 ngày</th>
              <th>So với bình quân</th>
              <th>Cập nhật</th>
              <th>Chi tiết</th>
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
                    <td>${row.vsNationalAvgPct === null ? '--' : escapeHtml(formatPercent(row.vsNationalAvgPct))}</td>
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

export default async function handler(req, res) {
  try {
    const { commoditySlug } = req.query
    const json = await fetchBackendJson(`/api/commodity-price-pages/${commoditySlug}?allowStale=true`)
    const page = json.page
    const pageUrl = toAbsoluteUrl(req, page.path)
    const pageImageUrl = toPublicImageUrl(req, page.thumbnailUrl)
    const noindex = page.seo.noindex || page.status === 'stale'
    const jsonLd = [
      renderBreadcrumbJsonLd(pageUrl, page),
      {
        ...renderWebPageJsonLd(pageUrl, page),
        image: pageImageUrl || undefined,
      },
      renderFaqJsonLd(pageUrl, page),
      renderItemListJsonLd(pageUrl, page),
    ].filter(Boolean)

    const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.seo.title)}</title>
    <meta name="description" content="${escapeHtml(page.seo.description)}" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(page.seo.ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(page.seo.ogDescription)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    ${pageImageUrl ? `<meta property="og:image" content="${escapeHtml(pageImageUrl)}" />` : ''}
    ${noindex ? '<meta name="robots" content="noindex,follow" />' : '<meta name="robots" content="index,follow,max-image-preview:large" />'}
    ${jsonLd.map(item => `<script type="application/ld+json">${JSON.stringify(item)}</script>`).join('\n')}
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: radial-gradient(circle at top, #1f3f2b, #08111f 62%); color: #eef4fb; }
      main { max-width: 1220px; margin: 0 auto; padding: 32px 20px 64px; }
      .shell { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 24px; }
      .panel { background: rgba(8, 15, 30, 0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; box-shadow: 0 24px 80px rgba(0,0,0,0.24); padding: 24px; }
      .meta, .crumbs { display: flex; flex-wrap: wrap; gap: 8px; font: 500 13px/1.4 Arial, sans-serif; color: rgba(237,244,250,0.68); }
      .badge { display: inline-flex; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(245,181,79,0.3); background: rgba(245,181,79,0.12); color: #f5d188; }
      h1 { margin: 16px 0; font-size: clamp(2.1rem, 4vw, 3.3rem); line-height: 1.04; }
      .lede { margin: 0; color: rgba(237,244,250,0.88); font: 400 18px/1.8 Arial, sans-serif; }
      .hero { margin: 24px 0 0; overflow: hidden; border-radius: 22px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); }
      .hero img { display: block; width: 100%; max-height: 360px; object-fit: cover; }
      .facts { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin: 24px 0; }
      .facts article, .faq article, .rail-item { border-radius: 18px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.04); padding: 16px; }
      .facts span, .rail-item p, .table-head p { display: block; font: 500 13px/1.5 Arial, sans-serif; color: rgba(237,244,250,0.64); }
      .facts strong { display: block; margin-top: 8px; line-height: 1.45; }
      .body { font: 400 17px/1.85 Georgia, serif; color: rgba(237,244,250,0.88); }
      .body section + section { margin-top: 18px; }
      .body h2, .faq h2, .rail h2, .table-head h2 { font: 700 22px/1.2 Arial, sans-serif; }
      .table-block { margin: 28px 0; }
      .table-wrap { overflow-x: auto; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
      table { width: 100%; border-collapse: collapse; min-width: 760px; }
      th, td { padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left; font: 500 14px/1.5 Arial, sans-serif; }
      th { color: rgba(237,244,250,0.7); }
      a { color: #f5b54f; }
      .cta { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
      .cta a { display: inline-flex; align-items: center; justify-content: center; padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.1); text-decoration: none; font: 600 15px/1 Arial, sans-serif; }
      .rail-list { display: grid; gap: 12px; }
      .rail-item { color: inherit; text-decoration: none; }
      @media (max-width: 960px) { .shell { grid-template-columns: 1fr; } }
      @media (max-width: 720px) { .facts { grid-template-columns: 1fr 1fr; } .cta { flex-direction: column; } }
    </style>
  </head>
  <body>
    <main>
      <div class="shell">
        <div class="panel">
          <nav class="crumbs" aria-label="Breadcrumb">
            <a href="/">Trang chủ</a>
            <span>/</span>
            <a href="/bang-gia">Bảng giá</a>
            <span>/</span>
            <span>${escapeHtml(page.title)}</span>
          </nav>
          <header>
            <div class="meta">
              <span class="badge">${escapeHtml(page.renderMode === 'national_article' ? 'Tin giá hôm nay' : 'Tổng hợp theo vùng')}</span>
              ${page.category ? `<span>${escapeHtml(page.category)}</span>` : ''}
              <span>Cập nhật: ${escapeHtml(formatDateTime(page.updatedAt))}</span>
            </div>
            <h1>${escapeHtml(page.title)}</h1>
            <p class="lede">${escapeHtml(page.answerSummary)}</p>
          </header>
          ${page.thumbnailUrl ? `<figure class="hero"><img src="${escapeHtml(page.thumbnailUrl)}" alt="${escapeHtml(page.thumbnailAlt || page.title)}" /></figure>` : ''}
          <section class="facts">
            <article><span>Giá hiện tại</span><strong>${escapeHtml(formatCurrency(page.headlineLatestPriceVnd))}</strong></article>
            <article><span>So với hôm qua</span><strong>${escapeHtml(formatPercent(page.dayChangePct))}</strong></article>
            <article><span>So với 7 ngày</span><strong>${escapeHtml(formatPercent(page.change7dPct))}</strong></article>
            <article><span>${escapeHtml(page.renderMode === 'national_article' ? 'Phạm vi dữ liệu' : 'Số khu vực')}</span><strong>${escapeHtml(page.renderMode === 'national_article' ? page.nationalScopeLabel || 'Việt Nam' : `${page.locationCount} khu vực`)}</strong></article>
          </section>
          ${renderRegionTable(page)}
          <article class="body">${page.bodyHtml}</article>
          <section class="faq">
            <h2>Câu hỏi thường gặp</h2>
            <div class="rail-list">
              ${page.faq.map(item => `<article><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></article>`).join('')}
            </div>
          </section>
          <section class="cta">
            <a href="/bang-gia">Xem bảng giá tổng hợp</a>
            <a href="/chuoi-gia">Xem chuỗi giá</a>
          </section>
        </div>
        <aside>
          ${renderRelated('Trang theo địa bàn', page.relatedLocationPages)}
          ${renderRelated('Cùng nhóm hàng', page.relatedCommodityPages)}
        </aside>
      </div>
    </main>
  </body>
</html>`

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(html)
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : 'Failed to render generated commodity price page')
  }
}
