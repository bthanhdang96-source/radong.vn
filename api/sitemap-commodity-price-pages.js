import { fetchBackendJson, getAntiScrapeInternalHeaders, sendXml, toAbsoluteUrl } from './_shared.js'

export default async function handler(req, res) {
  try {
    const json = await fetchBackendJson('/api/commodity-price-pages?limit=5000', {
      headers: getAntiScrapeInternalHeaders(),
    })
    const baseUrl = toAbsoluteUrl(req, '')
    const urls = json.items
      .map(
        item => `
  <url>
    <loc>${baseUrl}${item.path}</loc>
    <lastmod>${item.updatedAt}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`,
      )
      .join('')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`

    sendXml(res, xml)
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : 'Failed to render commodity sitemap')
  }
}
