import { Router } from 'express'
import { setSeoHtmlHeaders } from '../services/httpSecurity.js'
import { getPublicOrigin } from '../services/publicOrigin.js'
import { getGeneratedCommodityPricePageDetail } from '../services/generatedCommodityPricePages/service.js'
import { getGeneratedPricePageDetail } from '../services/generatedPricePages/service.js'
import {
  renderCommodityPricePageHtml,
  renderLocationPricePageHtml,
} from '../services/generatedPricePages/htmlRenderer.js'

const router = Router()

router.get('/gia-nong-san/:commoditySlug/:locationSlug', async (req, res) => {
  try {
    const { commoditySlug, locationSlug } = req.params
    if (locationSlug === 'viet-nam') {
      res.redirect(301, `/gia-nong-san/${commoditySlug}`)
      return
    }

    const page = await getGeneratedPricePageDetail(commoditySlug, locationSlug, {
      allowStale: true,
    })
    if (!page) {
      res.status(404).send('Generated price page not found')
      return
    }

    setSeoHtmlHeaders(res)
    res.status(200).send(renderLocationPricePageHtml(page, getPublicOrigin(req)))
  } catch (error) {
    console.error('[Public Price Pages] Failed to render location price page:', error)
    res.status(500).send('Failed to render generated price page')
  }
})

router.get('/gia-nong-san/:commoditySlug', async (req, res) => {
  try {
    const page = await getGeneratedCommodityPricePageDetail(req.params.commoditySlug, {
      allowStale: true,
    })
    if (!page) {
      res.status(404).send('Generated commodity price page not found')
      return
    }

    setSeoHtmlHeaders(res)
    res.status(200).send(renderCommodityPricePageHtml(page, getPublicOrigin(req)))
  } catch (error) {
    console.error('[Public Price Pages] Failed to render commodity price page:', error)
    res.status(500).send('Failed to render generated commodity price page')
  }
})

export default router
