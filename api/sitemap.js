import { sendXml, toAbsoluteUrl } from './_shared.js'

export default async function handler(req, res) {
  const baseUrl = toAbsoluteUrl(req, '')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap-price-pages.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-commodity-price-pages.xml</loc>
  </sitemap>
</sitemapindex>`

  sendXml(res, xml)
}
