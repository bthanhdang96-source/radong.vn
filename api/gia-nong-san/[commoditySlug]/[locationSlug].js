import { escapeHtml, fetchBackendJson, toAbsoluteUrl } from '../../_shared.js'

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
    about: [page.commoditySlug, page.locationLabel],
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
        name: page.locationLabel,
        item: pageUrl,
      },
    ],
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

export default async function handler(req, res) {
  try {
    const { commoditySlug, locationSlug } = req.query
    const json = await fetchBackendJson(`/api/price-pages/${commoditySlug}/${locationSlug}?allowStale=true`)
    const page = json.page
    const pageUrl = toAbsoluteUrl(req, page.path)
    const noindex = page.seo.noindex || page.status === 'stale'
    const jsonLd = [
      renderBreadcrumbJsonLd(pageUrl, page),
      renderWebPageJsonLd(pageUrl, page),
      renderFaqJsonLd(pageUrl, page),
    ]

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
    ${noindex ? '<meta name="robots" content="noindex,follow" />' : '<meta name="robots" content="index,follow,max-image-preview:large" />'}
    ${jsonLd.map(item => `<script type="application/ld+json">${JSON.stringify(item)}</script>`).join('\n')}
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: linear-gradient(180deg, #08111f, #102137); color: #eef4fb; }
      main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 64px; }
      .shell { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 24px; }
      .panel { background: rgba(8, 15, 30, 0.88); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; box-shadow: 0 24px 80px rgba(0,0,0,0.24); padding: 24px; }
      .meta, .crumbs { display: flex; flex-wrap: wrap; gap: 8px; font: 500 13px/1.4 Arial, sans-serif; color: rgba(237,244,250,0.68); }
      .badge { display: inline-flex; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(34,197,94,0.22); background: rgba(34,197,94,0.12); color: #5ee38e; }
      h1 { margin: 16px 0; font-size: clamp(2.1rem, 4vw, 3.25rem); line-height: 1.04; }
      .lede { margin: 0; color: rgba(237,244,250,0.86); font: 400 18px/1.8 Arial, sans-serif; }
      .facts { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin: 24px 0; }
      .facts article, .faq article, .rail-item { border-radius: 18px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.04); padding: 16px; }
      .facts span, .rail-item p { display: block; font: 500 13px/1.5 Arial, sans-serif; color: rgba(237,244,250,0.64); }
      .facts strong { display: block; margin-top: 8px; line-height: 1.45; }
      .body { font: 400 17px/1.85 Georgia, serif; color: rgba(237,244,250,0.88); }
      .body section + section { margin-top: 18px; }
      .body h2, .faq h2, .rail h2 { font: 700 22px/1.2 Arial, sans-serif; }
      a { color: #f5b54f; }
      .cta { display: flex; gap: 12px; margin-top: 20px; }
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
            <span>${escapeHtml(page.locationLabel)}</span>
          </nav>
          <header>
            <div class="meta">
              <span class="badge">Phân tích giá tự động</span>
              ${page.category ? `<span>${escapeHtml(page.category)}</span>` : ''}
              <span>Cập nhật: ${escapeHtml(new Date(page.updatedAt).toLocaleString('vi-VN'))}</span>
            </div>
            <h1>${escapeHtml(page.title)}</h1>
            <p class="lede">${escapeHtml(page.answerSummary)}</p>
          </header>
          <section class="facts">
            <article><span>Giá hiện tại</span><strong>${escapeHtml(Math.round(page.latestPriceVnd).toLocaleString('vi-VN'))} đồng/kg</strong></article>
            <article><span>So với hôm qua</span><strong>${escapeHtml(page.dayChangePct > 0 ? '+' : '')}${escapeHtml(page.dayChangePct.toFixed(2))}%</strong></article>
            <article><span>So với 7 ngày</span><strong>${escapeHtml(page.change7dPct > 0 ? '+' : '')}${escapeHtml(page.change7dPct.toFixed(2))}%</strong></article>
            <article><span>Biên độ 7 ngày</span><strong>${escapeHtml(Math.round(page.minPrice7dVnd).toLocaleString('vi-VN'))} - ${escapeHtml(Math.round(page.maxPrice7dVnd).toLocaleString('vi-VN'))} đồng/kg</strong></article>
          </section>
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
          ${renderRelated('Cùng nông sản', page.relatedByCommodity)}
          ${renderRelated('Cùng địa bàn', page.relatedByLocation)}
        </aside>
      </div>
    </main>
  </body>
</html>`

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(html)
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : 'Failed to render generated price page')
  }
}
