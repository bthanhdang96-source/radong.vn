import { fetchBackendJson } from '../_shared.js'

export default async function handler(req, res) {
  try {
    const url = new URL(req.url ?? '/api/export-registry/entries', 'https://nongsanvn.local')
    const json = await fetchBackendJson(`/api/export-registry/entries${url.search}`)
    res.status(200).json(json)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load export registry entries',
    })
  }
}
