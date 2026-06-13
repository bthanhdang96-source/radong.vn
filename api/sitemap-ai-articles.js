import { escapeHtml, fetchBackendJson, getAntiScrapeInternalHeaders, sendXml, toAbsoluteUrl } from './_shared.js'

export default async function handler(req, res) {
  try {
    const json = await fetchBackendJson('/api/ai-articles?limit=100', {
      headers: getAntiScrapeInternalHeaders(),
    })
    const urls = json.items
      .filter(item => item.status === 'published')
      .map(
        item => `
  <url>
    <loc>${escapeHtml(toAbsoluteUrl(req, item.path))}</loc>
    <lastmod>${escapeHtml(item.updatedAt || item.publishedAt)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${item.articleType === 'agri_blog' ? '0.65' : '0.6'}</priority>
  </url>`,
      )
      .join('')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`

    sendXml(res, xml)
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : 'Failed to render sitemap')
  }
}
