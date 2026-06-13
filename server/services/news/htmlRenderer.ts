import type { NewsDetailResponse, NewsListItem } from './types.js'

type JsonLd = Record<string, unknown>

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function absoluteUrl(origin: string, path: string) {
  return new URL(path, origin).toString()
}

function publicImageUrl(origin: string, value: string | null) {
  if (!value) {
    return 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80'
  }

  return value.startsWith('/') ? absoluteUrl(origin, value) : value
}

function sanitizeStoredHtml(value: string | null) {
  if (!value) {
    return ''
  }

  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\sjavascript:/gi, '')
}

function textToHtml(value: string | null) {
  if (!value) {
    return ''
  }

  return value
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n')
}

function renderJsonLd(items: JsonLd[]) {
  return items.map(item => `<script type="application/ld+json">${JSON.stringify(item)}</script>`).join('\n')
}

function renderRelated(items: NewsListItem[]) {
  if (items.length === 0) {
    return ''
  }

  return `
    <aside class="related">
      <h2>Bai lien quan</h2>
      <div class="related-list">
        ${items
          .map(
            item => `
              <a href="${escapeHtml(`/tin-tuc/${item.slug}`)}">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.contentFamilyLabel)}</span>
              </a>
            `,
          )
          .join('')}
      </div>
    </aside>
  `
}

export function renderNewsArticleHtml(payload: NewsDetailResponse, origin: string) {
  const { article, related } = payload
  const path = `/tin-tuc/${article.slug}`
  const pageUrl = absoluteUrl(origin, path)
  const imageUrl = publicImageUrl(origin, article.thumbnailUrl)
  const description = article.excerpt || article.contentText?.slice(0, 155) || article.title
  const bodyHtml = sanitizeStoredHtml(article.contentHtml) || textToHtml(article.contentText)
  const publishedAt = article.publishedAt
  const modifiedAt = article.fetchedAt || article.publishedAt
  const jsonLd = renderJsonLd([
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description,
      image: imageUrl,
      datePublished: publishedAt,
      dateModified: modifiedAt,
      author: {
        '@type': 'Organization',
        name: article.author || article.sourceLabel || 'NongSanVN',
      },
      publisher: {
        '@type': 'Organization',
        name: 'NongSanVN',
      },
      mainEntityOfPage: pageUrl,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Tin tuc',
          item: absoluteUrl(origin, '/'),
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: article.contentFamilyLabel || 'Bai viet',
          item: absoluteUrl(origin, article.familyPath || '/tin-tuc'),
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: article.title,
          item: pageUrl,
        },
      ],
    },
  ])

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(article.title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(article.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="article:published_time" content="${escapeHtml(publishedAt)}">
  <meta property="article:modified_time" content="${escapeHtml(modifiedAt)}">
  ${jsonLd}
  <style>
    :root{color-scheme:light;--ink:#17231d;--muted:#627166;--line:#dfe7e1;--green:#244f36;--bg:#f5f7f2}
    body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    a{color:inherit}
    .page{max-width:1180px;margin:0 auto;padding:28px 18px 56px}
    .crumbs{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:.92rem;margin-bottom:24px}
    .layout{display:grid;grid-template-columns:minmax(0,820px) minmax(260px,1fr);gap:28px;align-items:start}
    header{margin-bottom:22px}
    .meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;color:var(--green);font-weight:700}
    h1{font-size:clamp(2rem,4vw,3.6rem);line-height:1.08;margin:0 0 14px;letter-spacing:0}
    .excerpt{margin:0 0 16px;color:#445247;font-size:1.12rem}
    .byline{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:.94rem}
    .hero{overflow:hidden;border-radius:8px;margin:0 0 24px;background:#e3e8e4}
    .hero img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
    article{background:#fff;border:1px solid var(--line);border-radius:8px;padding:24px}
    article h2,article h3{line-height:1.25;margin:1.6em 0 .5em}
    article p,article ul,article ol,article table{margin:0 0 1.1em}
    article img{max-width:100%;height:auto;border-radius:8px}
    article table{width:100%;border-collapse:collapse}
    article th,article td{border:1px solid var(--line);padding:8px 10px;vertical-align:top}
    .related{background:#fff;border:1px solid var(--line);border-radius:8px;padding:18px;position:sticky;top:18px}
    .related h2{font-size:1.1rem;margin:0 0 12px}
    .related-list{display:grid;gap:10px}
    .related a{display:grid;gap:4px;text-decoration:none;border-top:1px solid #edf0ed;padding-top:10px}
    .related span{color:var(--muted);font-size:.88rem}
    @media (max-width:900px){.layout{grid-template-columns:1fr}article{padding:18px}.related{position:static}}
  </style>
</head>
<body>
  <main class="page">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="/">Tin tuc</a><span>/</span><a href="${escapeHtml(article.familyPath || '/tin-tuc')}">${escapeHtml(article.contentFamilyLabel)}</a><span>/</span><span>Bai viet</span>
    </nav>
    <div class="layout">
      <div>
        <header>
          <div class="meta">
            <span>${escapeHtml(article.contentFamilyLabel)}</span>
            ${article.category ? `<span>${escapeHtml(article.category)}</span>` : ''}
          </div>
          <h1>${escapeHtml(article.title)}</h1>
          <p class="excerpt">${escapeHtml(description)}</p>
          <div class="byline"><span>${escapeHtml(article.author || article.sourceLabel || 'NongSanVN')}</span><time datetime="${escapeHtml(publishedAt)}">${escapeHtml(new Date(publishedAt).toLocaleDateString('vi-VN'))}</time></div>
        </header>
        <div class="hero"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(article.title)}"></div>
        <article>${bodyHtml}</article>
      </div>
      ${renderRelated(related)}
    </div>
  </main>
</body>
</html>`
}
