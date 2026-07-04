import test from 'node:test'
import assert from 'node:assert/strict'
import { extractLatestArticleUrl } from '../services/crawlers/congthuongCrawler.js'

test('congthuong discovery extracts article URLs from sitemap loc entries', () => {
  const sitemap = `
    <urlset>
      <url><loc>https://congthuong.vn/gia-ca-phe-hom-nay-29-6-2026-on-dinh-phien-dau-tuan-463119.html</loc></url>
      <url><loc>https://congthuong.vn/tin-khac-463000.html</loc></url>
    </urlset>
  `

  assert.equal(
    extractLatestArticleUrl(sitemap, 'gia-ca-phe-hom-nay'),
    'https://congthuong.vn/gia-ca-phe-hom-nay-29-6-2026-on-dinh-phien-dau-tuan-463119.html',
  )
})

test('congthuong discovery extracts relative article links from topic pages', () => {
  const topicHtml = `
    <article>
      <a href="/gia-heo-hoi-hom-nay-29-6-2026-giam-dong-loat-tai-mien-bac-463120.html">latest</a>
    </article>
  `

  assert.equal(
    extractLatestArticleUrl(topicHtml, 'gia-heo-hoi-hom-nay'),
    'https://congthuong.vn/gia-heo-hoi-hom-nay-29-6-2026-giam-dong-loat-tai-mien-bac-463120.html',
  )
})

test('congthuong discovery ignores offsite and non-matching links', () => {
  const topicHtml = `
    <a href="https://example.com/gia-heo-hoi-hom-nay-29-6-2026.html">offsite</a>
    <a href="/gia-ca-phe-the-gioi-29-6-2026-463111.html">other topic</a>
  `

  assert.equal(extractLatestArticleUrl(topicHtml, 'gia-heo-hoi-hom-nay'), null)
})
